/**
 * Death-save service (T27) — the Facing Death roll, per r-2026-07-11-01.
 *
 * THE ROLL (both doors): character's Fate Die vs Tara's (Lady Death's)
 * CHOSEN die. Tara picks from the full ladder like skills — 1, 2, 3
 * (static values), d4, d6, d8, d12, d20 — by her own reasoning, and she
 * may choose NOT to reap at all (no roll; the character survives the
 * trigger). bodyResist plays NO role in death saves (combat damage
 * absorption only). Ties: FD >= Tara's result = survive (engine `>= DR`
 * convention, pending Mike confirm).
 *
 * DOORS:
 *  - COMBAT (r-2026-06-11-05): Frequency current <= 0 OR a vital body part
 *    destroyed. ONE roll, binary (r-2026-06-11-02). Success restores
 *    1 Frequency (if that door tripped) and one condition step on the
 *    destroyed vital. Tara may still attach a trigger-related Thorn —
 *    that's her/GM authorship, surfaced via the dispatcher, never
 *    auto-generated here.
 *  - FATED_AGE (r-2026-06-09-01): yearly at/past fatedAge. Fail → an
 *    escalating age-Thorn (authored by Tara/GM — we count and surface,
 *    never write thorn content). THIRD fail = the Death Engine fires.
 *
 * Tara's chooser: at ordinary tables the GM enacts her choice for now;
 * the Lady Death agent takes over with the day-1 Godhead agent system
 * (r-2026-06-11-06). The event still routes to her for the fiction beat.
 *
 * TIES + MERCY (r-2026-07-11-02): ties go to Lady Death — survive only on
 * strictly greater. Her post-roll authority is ONE-WAY: after a failed
 * roll she may still spare (the pending-split confirmation dialog IS her
 * mercy window — sparePendingDeath clears it); after a survived roll she
 * cannot reap. Survival is final.
 *
 * MODIFIERS (r-2026-06-09-01: "Nectars/Thorns may augment or change the
 * roll"): the save runs through the same trait-modifier engine as skill
 * checks — a trait's rollModifiers fire here when they match
 * `skillName: 'Death Save'` (authoring convention: skillNamePattern
 * 'death save'), and unconstrained always-on modifiers apply too, per the
 * engine's standard matching rules. Modifiers apply to the CHARACTER'S
 * roll; Tara's side is her choice. Applied sources are surfaced on the
 * outcome and event so the table sees "+2 from Grave-Warded" (exploits
 * must be easy to track). Die-upgrade/reroll effects aren't expressible
 * in the current RollModifier vocabulary — the GM adjudicates those (or
 * Tara prices them into her choice) until the modifier engine grows.
 * Item-borne effects join automatically once items feed the same engine.
 *
 * Failure marks `pendingDeathSplit` on the character — the split itself
 * only executes through the GM-confirmed death route (INV-57: the
 * confirmation is a canvas dialog; nothing destructive is automatic).
 */
import 'server-only';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { broadcast } from '@/lib/campaign-stream';
import { emit as emitGodHeadEvent } from '@/services/godhead-dispatcher';
import { gatherTraitModifiers, type TraitModifierResult } from '@/services/trait-modifiers';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';
import type { DeathSaveEvent } from '@/types/campaign-events';

export const TARA_CHOICES = ['1', '2', '3', 'd4', 'd6', 'd8', 'd12', 'd20', 'NO_REAP'] as const;
export type TaraChoice = (typeof TARA_CHOICES)[number];

export const rollDeathSaveSchema = z.object({
  door: z.enum(['COMBAT', 'FATED_AGE']),
  taraChoice: z.enum(TARA_CHOICES),
  /** What tripped the door — recorded on the event log. */
  trigger: z.string().max(200).optional(),
});

export interface DeathSaveOutcome {
  door: 'COMBAT' | 'FATED_AGE';
  taraChoice: TaraChoice;
  /** Character's Fate Die roll (absent when Tara does not reap). */
  fateRoll?: number;
  fateDie?: string;
  /** Trait modifiers applied to the character's total (Nectars/Thorns/Blossoms). */
  modifiers?: TraitModifierResult;
  /** fateRoll + modifier total — the number that faces Tara. */
  characterTotal?: number;
  /** Tara's result: static value, her die roll, or absent on NO_REAP. */
  taraResult?: number;
  survived: boolean;
  /** COMBAT success restorations that were applied. */
  restored?: { frequency?: boolean; vitalPart?: string };
  /** FATED_AGE: failure count after this roll (3rd = death). */
  fatedAgeFailures?: number;
  /** True when this outcome marked the character for the death split. */
  pendingDeathSplit: boolean;
}

type Rng = (sides: number) => number;
const defaultRng: Rng = (sides) => randomInt(1, sides + 1);

function parseSides(die: string): number {
  const n = parseInt(die.replace(/^d/i, ''), 10);
  if (!Number.isFinite(n) || n < 2) throw new ValidationError(`Bad die: ${die}`);
  return n;
}

/** Walk the anatomy for destroyed vital parts. Returns partNames. */
function destroyedVitals(anatomy: GrowthWorldItem | undefined): string[] {
  const found: string[] = [];
  function walk(node: GrowthWorldItem | undefined) {
    if (!node) return;
    if (node.isBodyPart && node.isVital && (node.condition ?? 3) === 0 && node.partName) {
      found.push(node.partName);
    }
    for (const child of node.contains ?? []) walk(child);
  }
  walk(anatomy);
  return found;
}

/** Restore ONE destroyed vital part by one condition step. Returns its name. */
function restoreOneVital(anatomy: GrowthWorldItem | undefined): string | undefined {
  if (!anatomy) return undefined;
  let restored: string | undefined;
  function walk(node: GrowthWorldItem | undefined) {
    if (!node || restored) return;
    if (node.isBodyPart && node.isVital && (node.condition ?? 3) === 0) {
      node.condition = 1;
      restored = node.partName;
      return;
    }
    for (const child of node.contains ?? []) walk(child);
  }
  walk(anatomy);
  return restored;
}

export interface DeathSaveState {
  atDeathsDoor: boolean;
  triggers: string[];
  fateDie: string;
  fatedAgeFailures: number;
  pendingDeathSplit: boolean;
}

export async function getDeathSaveState(
  characterId: string,
  viewerUserId: string,
  viewerRole: string,
): Promise<DeathSaveState> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(viewerUserId, viewerRole, character)) {
    throw new ForbiddenError('GM only');
  }
  const data = JSON.parse(character.data) as GrowthCharacter & {
    pendingDeathSplit?: unknown;
    fatedAgeFailures?: number;
  };
  const triggers: string[] = [];
  const freqCurrent = data.attributes?.frequency?.current ?? 0;
  if (freqCurrent <= 0) triggers.push('frequency_zero');
  for (const part of destroyedVitals(data.bodyAnatomy as GrowthWorldItem | undefined)) {
    triggers.push(`vital_destroyed:${part}`);
  }
  return {
    atDeathsDoor: triggers.length > 0,
    triggers,
    fateDie: data.creation?.seed?.baseFateDie ?? 'd4',
    fatedAgeFailures: data.fatedAgeFailures ?? 0,
    pendingDeathSplit: !!data.pendingDeathSplit,
  };
}

/**
 * Resolve one death save. GM-triggered (the GM enacts Tara's choice for
 * now — see header). `opts.rng` is injectable for deterministic tests.
 */
export async function rollDeathSave(
  characterId: string,
  input: z.infer<typeof rollDeathSaveSchema>,
  actorUserId: string,
  actorRole: string,
  opts: { rng?: Rng } = {},
): Promise<DeathSaveOutcome> {
  const validated = rollDeathSaveSchema.parse(input);
  const rng = opts.rng ?? defaultRng;

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) resolves a death save');
  }
  if (character.status === 'GHOST') {
    throw new ValidationError('Character is already a ghost');
  }

  const data = JSON.parse(character.data) as GrowthCharacter & {
    pendingDeathSplit?: unknown;
    fatedAgeFailures?: number;
  };

  // Validate the door actually tripped (COMBAT only — FATED_AGE timing is
  // the harvest/aging flow's responsibility; the GM call is trusted there).
  const freqCurrent = data.attributes?.frequency?.current ?? 0;
  const vitals = destroyedVitals(data.bodyAnatomy as GrowthWorldItem | undefined);
  if (validated.door === 'COMBAT' && freqCurrent > 0 && vitals.length === 0) {
    throw new ValidationError('No death trigger: Frequency > 0 and no destroyed vital part');
  }

  const fateDie = data.creation?.seed?.baseFateDie ?? 'd4';
  const outcome: DeathSaveOutcome = {
    door: validated.door,
    taraChoice: validated.taraChoice,
    survived: true,
    pendingDeathSplit: false,
  };

  if (validated.taraChoice === 'NO_REAP') {
    // Death declines. No roll, no restoration — the trigger simply passes
    // (the character stays where they are; healing is the table's business).
    outcome.survived = true;
  } else {
    const fateRoll = rng(parseSides(fateDie));
    // Nectars/Thorns/Blossoms augment the roll — same engine as skill checks.
    const modifiers = gatherTraitModifiers(data, { skillName: 'Death Save' });
    const characterTotal = fateRoll + modifiers.totalFlat;
    const taraResult = /^\d+$/.test(validated.taraChoice)
      ? parseInt(validated.taraChoice, 10)
      : rng(parseSides(validated.taraChoice));
    outcome.fateRoll = fateRoll;
    outcome.fateDie = fateDie;
    if (modifiers.sources.length > 0) outcome.modifiers = modifiers;
    outcome.characterTotal = characterTotal;
    outcome.taraResult = taraResult;
    // Ties go to Lady Death (r-2026-07-11-02) — survive only on STRICTLY greater.
    outcome.survived = characterTotal > taraResult;
  }

  if (outcome.survived) {
    // Survival is FINAL (r-2026-07-11-02): Tara cannot reap a survived roll.
    // Clear any stale pending split so no reap path remains open.
    delete data.pendingDeathSplit;
    if (validated.door === 'COMBAT' && validated.taraChoice !== 'NO_REAP') {
      // r-2026-06-11-05 restorations — only on a WON roll.
      const restored: { frequency?: boolean; vitalPart?: string } = {};
      if (freqCurrent <= 0 && data.attributes?.frequency) {
        data.attributes.frequency.current = 1;
        restored.frequency = true;
      }
      const vital = restoreOneVital(data.bodyAnatomy as GrowthWorldItem | undefined);
      if (vital) restored.vitalPart = vital;
      if (restored.frequency || restored.vitalPart) outcome.restored = restored;
    }
  } else if (validated.door === 'FATED_AGE') {
    const failures = (data.fatedAgeFailures ?? 0) + 1;
    data.fatedAgeFailures = failures;
    outcome.fatedAgeFailures = failures;
    if (failures >= 3) {
      // Third fail after fated age = death (r-2026-06-09-01).
      data.pendingDeathSplit = {
        door: validated.door,
        trigger: validated.trigger ?? 'fated_age_third_fail',
        rolledAt: new Date().toISOString(),
        fateRoll: outcome.fateRoll,
        taraChoice: validated.taraChoice,
        taraResult: outcome.taraResult,
      };
      outcome.pendingDeathSplit = true;
    }
  } else {
    data.pendingDeathSplit = {
      door: validated.door,
      trigger: validated.trigger ?? (freqCurrent <= 0 ? 'frequency_zero' : `vital_destroyed:${vitals[0]}`),
      rolledAt: new Date().toISOString(),
      fateRoll: outcome.fateRoll,
      taraChoice: validated.taraChoice,
      taraResult: outcome.taraResult,
    };
    outcome.pendingDeathSplit = true;
  }

  await prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(data) },
  });

  // Event log + live GM surface.
  if (character.campaignId) {
    const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { username: true } });
    await prisma.campaignEvent.create({
      data: {
        campaignId: character.campaignId,
        type: 'death_save',
        actor: 'gm',
        actorUserId,
        actorName: actor?.username ?? 'GM',
        characterId,
        characterName: character.name,
        payload: JSON.stringify({ characterId, ...outcome }),
      },
    }).catch(() => null);
    broadcastDeathSave(character.campaignId, {
      kind: 'death_save',
      phase: 'RESOLVED',
      characterId,
      characterName: character.name,
      door: validated.door,
      trigger: validated.trigger,
      taraChoice: validated.taraChoice,
      fateRoll: outcome.fateRoll,
      modifierTotal: outcome.modifiers?.totalFlat,
      modifierSources: outcome.modifiers?.sources.map(s => `${s.flat >= 0 ? '+' : ''}${s.flat} ${s.traitName}`),
      characterTotal: outcome.characterTotal,
      taraResult: outcome.taraResult,
      survived: outcome.survived,
    });
  }

  // Route the beat to Lady Death — she authors Thorns / narrates the brush
  // with death. Fire-and-forget (same pattern as character.died).
  void emitGodHeadEvent('death_save.resolved', {
    characterId,
    campaignId: character.campaignId,
    ...outcome,
  });

  return outcome;
}

/**
 * Tara spares a failed save (r-2026-07-11-02 mercy direction): clears the
 * pending death split — the character lives, staying wherever the trigger
 * left them. Only valid while a split is pending.
 */
export async function sparePendingDeath(
  characterId: string,
  actorUserId: string,
  actorRole: string,
): Promise<void> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) enacts Tara\'s mercy');
  }
  const data = JSON.parse(character.data) as GrowthCharacter & { pendingDeathSplit?: unknown };
  if (!data.pendingDeathSplit) {
    throw new ValidationError('No pending death to spare');
  }
  delete data.pendingDeathSplit;
  await prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(data) },
  });
  if (character.campaignId) {
    const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { username: true } });
    await prisma.campaignEvent.create({
      data: {
        campaignId: character.campaignId,
        type: 'death_save',
        actor: 'gm',
        actorUserId,
        actorName: actor?.username ?? 'GM',
        characterId,
        characterName: character.name,
        payload: JSON.stringify({ characterId, spared: true }),
      },
    }).catch(() => null);
    broadcastDeathSave(character.campaignId, {
      kind: 'death_save',
      phase: 'RESOLVED',
      characterId,
      characterName: character.name,
      door: 'COMBAT',
      trigger: 'spared_by_lady_death',
      taraChoice: 'NO_REAP',
      survived: true,
    });
  }
  void emitGodHeadEvent('death_save.resolved', {
    characterId,
    campaignId: character.campaignId,
    spared: true,
  });
}

/** Broadcast a death-save lifecycle event to the campaign stream. */
export function broadcastDeathSave(campaignId: string, event: DeathSaveEvent): void {
  broadcast(campaignId, {
    id: `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    data: event,
  } as never);
}
