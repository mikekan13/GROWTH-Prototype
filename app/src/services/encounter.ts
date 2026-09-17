/**
 * Encounter service — Unit 1 of the reality simulation: one round through the
 * engine (REALITY-SIM-DESIGN-2026-09-02.md §6).
 *
 * Lifecycle: create (PLANNED) → activate → [declare intentions → run round]* →
 * resolve. Every participant is a DAYA-style branch: a PC's branch plans for
 * it when the player hasn't declared; a declaration overrides the ACT step.
 * The GM may declare for anyone (his override, like a player's).
 *
 * The round runner wires the pure engine (src/sim/round/*) to the real world:
 * dice from lib/dice with Effort ALWAYS spent from the action-pillar governor
 * (canon §5), damage through BOTH canon paths — the body cascade
 * (services/damage: part conditions, vital → Facing Death) and the Affinity
 * Cycle attribute pool (services/character-attribute: natural target,
 * overflow → Frequency, Frequency crossing 0 → Facing Death) — the record
 * into the campaign event stream + SSE, the campaign clock forward one round,
 * and a perception memory into every participating DayaEntity's ledger (the
 * sim's product for an entity IS its memory ledger — ruling 7).
 *
 * v0 ASSUMPTION [QUESTION for Mike]: how the two damage paths couple is not
 * written anywhere. v0 sends the amount that got past the declared defenses
 * (negate/block/redirect) to BOTH the body cascade and the natural attribute
 * pool. If body-part absorption should also shield the pool, this is the one
 * line to change (see applyDamage below).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { skilledCheck, unskilledCheck } from '@/lib/dice';
import { spendAttribute, type AttributeName } from '@/lib/character-actions';
import { NATURAL_TARGET } from '@/lib/damage-targeting';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import { applyDamageToCharacter } from '@/services/damage';
import { applyAttributeDamage } from '@/services/character-attribute';
import { advanceClock, getClock } from '@/services/time';
import { writeMemoryEntry } from '@/daya/memory';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';
import { buildSlots, slotInputsFor } from '@/sim/round/slots';
import { orderSlots } from '@/sim/round/ordering';
import { resolveRound, type CheckFn, type DamageFn } from '@/sim/round/resolve';
import { effortCap, eligibleEffortAttributes, skillUsableFromPillar } from '@/sim/round/action-economy';
import type { Governor, Intention, IntentionKind, Participant, Pillar, RoundResult } from '@/sim/round/types';
import { buildSensoryField } from '@/sim/senses/field';
import { planRound } from '@/sim/planning/branch-plan';
import { emptyState, parseState, participantFromCharacter, refreshParticipant, type EncounterState, type HeldItem } from '@/sim/encounter/state';

export interface EncounterActor {
  userId: string;
  username: string;
  role: string;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

export const createEncounterSchema = z.object({
  name: z.string().min(1).max(120),
  sceneNarration: z.string().max(4000).optional(),
  participants: z.array(z.object({
    characterId: z.string().min(1),
    side: z.string().min(1).max(40),
  })).min(1).max(40),
});

const kinds: [IntentionKind, ...IntentionKind[]] = ['attack', 'skill', 'move', 'negate', 'block', 'reserve', 'hold'];
const governors: [Governor, ...Governor[]] = ['clout', 'celerity', 'constitution', 'flow', 'focus', 'willpower', 'wisdom', 'wit'];

export const intentionInputSchema = z.object({
  pillar: z.enum(['body', 'spirit', 'soul']),
  kind: z.enum(kinds),
  description: z.string().min(1).max(200),
  skillName: z.string().max(80).optional(),
  targetId: z.string().optional(),
  damageType: z.enum(['piercing', 'slashing', 'bashing', 'heat', 'cold', 'decay', 'energy']).optional(),
  baseDamage: z.number().int().min(1).max(20).optional(),
  /** Situational DR (GM's call in v0). */
  dr: z.number().int().min(1).max(60).optional(),
  effort: z.number().int().min(0).max(50).optional(),
  effortAttribute: z.enum(governors).optional(),
  piercingTargetPath: z.array(z.string()).optional(),
  redirectTo: z.string().max(60).optional(),
});

export const declareIntentionsSchema = z.object({
  participantId: z.string().min(1),
  intentions: z.array(intentionInputSchema).max(60),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadEncounter(encounterId: string) {
  const enc = await prisma.encounter.findUnique({
    where: { id: encounterId },
    include: { campaign: { select: { id: true, gmUserId: true } } },
  });
  if (!enc) throw new NotFoundError('Encounter not found');
  return enc;
}

function requireGm(actor: EncounterActor, campaign: { gmUserId: string }) {
  if (!canManageCampaign(actor.userId, actor.role, campaign)) {
    throw new ForbiddenError('GM/ADMIN only');
  }
}

/** A campaign's GM/ADMIN or any member may read encounters (the table record is shared). */
async function requireCampaignAccess(campaignId: string, actor: EncounterActor) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (canManageCampaign(actor.userId, actor.role, campaign)) return { campaign, isGm: true };
  const member = await prisma.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId: actor.userId } }, select: { id: true } });
  if (!member) throw new ForbiddenError('Not a member of this campaign');
  return { campaign, isGm: false };
}

function parseSheet(raw: string): GrowthCharacter | null {
  try { return JSON.parse(raw) as GrowthCharacter; } catch { return null; }
}

/** v0: the first ACTIVE held item with a baseResist (a shield, a stick, a pot lid). */
async function heldInterposable(characterId: string): Promise<HeldItem | null> {
  const items = await prisma.campaignItem.findMany({
    where: { holderId: characterId, status: 'ACTIVE' },
    select: { id: true, name: true, data: true },
    take: 50,
  });
  for (const it of items) {
    try {
      const d = JSON.parse(it.data) as { baseResist?: number; isBodyPart?: boolean; condition?: number };
      if (!d.isBodyPart && typeof d.baseResist === 'number' && d.baseResist > 0 && (d.condition ?? 3) > 0) {
        return { id: it.id, name: it.name, baseResist: d.baseResist, condition: d.condition ?? 3 };
      }
    } catch { /* skip */ }
  }
  return null;
}

/** Persist a held item's worn condition (canon tiers); Destroyed also flips the row's status. */
async function persistItemWear(itemId: string | null, condition: number, destroyed: boolean): Promise<void> {
  if (!itemId) return;
  const it = await prisma.campaignItem.findUnique({ where: { id: itemId }, select: { data: true } });
  if (!it) return;
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(it.data) as Record<string, unknown>; } catch { /* keep {} */ }
  d.condition = condition;
  await prisma.campaignItem.update({ where: { id: itemId }, data: { data: JSON.stringify(d), ...(destroyed ? { status: 'DESTROYED' } : {}) } });
}

/** v0 sense flags from anatomy: an eye/ear part with condition > 0 means the sense works; no anatomy = human default. */
function senseFlags(sheet: GrowthCharacter | null): { canSee: boolean; canHear: boolean } {
  const root = sheet?.bodyAnatomy as GrowthWorldItem | undefined;
  if (!root) return { canSee: true, canHear: true };
  const found = { eye: false, ear: false, anyEye: false, anyEar: false };
  const walk = (n: GrowthWorldItem) => {
    const name = (n.partName ?? '').toLowerCase();
    const ok = (n.condition ?? 3) > 0;
    if (/eye/.test(name)) { found.anyEye = true; if (ok) found.eye = true; }
    if (/ear/.test(name)) { found.anyEar = true; if (ok) found.ear = true; }
    for (const c of n.contains ?? []) walk(c);
  };
  walk(root);
  return { canSee: found.anyEye ? found.eye : true, canHear: found.anyEar ? found.ear : true };
}

function serialize(state: EncounterState): string {
  return JSON.stringify(state);
}

function summarizeRound(result: RoundResult, participants: Participant[]): string {
  const name = (id: string | null) => participants.find(p => p.id === id)?.name ?? id ?? '';
  const lines = result.log.filter(l => l.kind !== 'order').map(l => l.text);
  const down = result.downed.map(name);
  return [`Round ${result.round}:`, ...lines, down.length ? `Down: ${down.join(', ')}` : ''].filter(Boolean).join('\n');
}

export interface EncounterView {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  round: number;
  state: EncounterState;
}

/**
 * Canon (Turn_Structure): intentions are declared in secret. The GM sees
 * everything; a member sees the shared record (participants, rounds) plus
 * only the intentions and plan notes of characters they own.
 */
async function viewFor(enc: { id: string; campaignId: string; name: string; status: string; round: number; state: string }, actor: EncounterActor, isGm: boolean): Promise<EncounterView> {
  const state = parseState(enc.state);
  if (!isGm) {
    const owned = await prisma.character.findMany({ where: { userId: actor.userId, id: { in: state.participants.map(p => p.id) } }, select: { id: true } });
    const mine = new Set(owned.map(c => c.id));
    state.intentions = state.intentions.filter(i => mine.has(i.participantId));
    state.lastPlan = Object.fromEntries(Object.entries(state.lastPlan).filter(([id]) => mine.has(id)));
  }
  return { id: enc.id, campaignId: enc.campaignId, name: enc.name, status: enc.status, round: enc.round, state };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function listEncounters(campaignId: string, actor: EncounterActor) {
  await requireCampaignAccess(campaignId, actor);
  return prisma.encounter.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, round: true, createdAt: true },
  });
}

export async function getEncounter(encounterId: string, actor: EncounterActor): Promise<EncounterView> {
  const enc = await loadEncounter(encounterId);
  const { isGm } = await requireCampaignAccess(enc.campaignId, actor);
  return viewFor(enc, actor, isGm);
}

export async function createEncounter(campaignId: string, actor: EncounterActor, input: z.infer<typeof createEncounterSchema>) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  requireGm(actor, campaign);

  const ids = input.participants.map(p => p.characterId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('A character can only be in the encounter once');
  const chars = await prisma.character.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, entityType: true, campaignId: true, data: true },
  });
  if (chars.length !== ids.length) throw new ValidationError('One or more participants not found');
  for (const c of chars) {
    if (!c.campaignId) throw new ValidationError(`${c.name} belongs to no campaign — only campaign characters can take damage here`);
    if (c.campaignId !== campaignId) throw new ValidationError(`${c.name} is not in this campaign`);
  }

  const state = emptyState(input.sceneNarration ?? null);
  for (const p of input.participants) {
    const c = chars.find(x => x.id === p.characterId)!;
    state.participants.push(participantFromCharacter({
      id: c.id, name: c.name, entityType: c.entityType, sheet: parseSheet(c.data), side: p.side,
      held: await heldInterposable(c.id),
    }));
  }

  const enc = await prisma.encounter.create({
    data: { campaignId, name: input.name, status: 'PLANNED', round: 0, state: serialize(state), createdBy: actor.userId },
  });
  return getEncounter(enc.id, actor);
}

export async function setEncounterStatus(encounterId: string, actor: EncounterActor, status: 'ACTIVE' | 'PAUSED' | 'RESOLVED') {
  const enc = await loadEncounter(encounterId);
  requireGm(actor, enc.campaign);
  if (enc.status === 'RESOLVED') throw new ValidationError('A resolved encounter cannot be reopened');
  await prisma.encounter.update({ where: { id: encounterId }, data: { status } });
  if (status === 'ACTIVE' && enc.status !== 'ACTIVE') {
    await postGameEvent(enc.campaignId, actor, 'encounter_begin', `Encounter begins: ${enc.name}. Six seconds at a time.`);
  }
  if (status === 'RESOLVED') {
    await postGameEvent(enc.campaignId, actor, 'encounter_end', `Encounter resolved: ${enc.name}.`);
  }
  return getEncounter(encounterId, actor);
}

/**
 * Declare a participant's intentions for the next round — the ACT-step
 * override. The character's owner or the GM may declare. Replaces any
 * previous declaration for that participant this round.
 *
 * Validation = the written rules: explicit per-pillar allocation within the
 * pools; a skill only from a pillar one of its governors belongs to
 * (cross-pillar non-transferable); attacks are Body or Spirit unless a skill
 * carries them; a negate IS a skill check; Effort from a governor of the
 * action's pillar, ≤ its current pool, ≤ FD max + skill level, none while
 * Muted (Focus at 0).
 */
export async function declareIntentions(encounterId: string, actor: EncounterActor, input: z.infer<typeof declareIntentionsSchema>) {
  const enc = await loadEncounter(encounterId);
  const { isGm } = await requireCampaignAccess(enc.campaignId, actor); // outsiders learn nothing, not even participant ids
  if (enc.status !== 'ACTIVE') throw new ValidationError('Encounter is not active');
  const state = parseState(enc.state);
  const participant = state.participants.find(p => p.id === input.participantId);
  if (!participant) throw new NotFoundError('Participant not in this encounter');
  if (participant.downed) throw new ValidationError(`${participant.name} is down`);

  const owned = await prisma.character.findFirst({ where: { id: participant.id, userId: actor.userId }, select: { id: true, data: true } });
  if (!isGm && !owned) throw new ForbiddenError('You can only declare for your own character');

  // Fresh pools for Effort validation (damage/effort earlier this encounter may have moved them).
  const row = owned ?? await prisma.character.findUnique({ where: { id: participant.id }, select: { id: true, data: true } });
  const fresh = row ? refreshParticipant(participant, parseSheet(row.data)) : participant;
  const muted = (fresh.attrs.focus?.current ?? 0) <= 0;

  const counts: Record<Pillar, number> = { body: 0, spirit: 0, soul: 0 };
  const ids = new Set(state.participants.map(p => p.id));
  const out: Intention[] = [];
  input.intentions.forEach((i, n) => {
    counts[i.pillar]++;
    if (counts[i.pillar] > participant.pools[i.pillar]) {
      throw new ValidationError(`Too many ${i.pillar} actions: ${participant.name} has ${participant.pools[i.pillar]}`);
    }
    const skill = i.skillName ? participant.skills.find(s => s.name === i.skillName) : undefined;
    if (i.skillName && !skill) throw new ValidationError(`${participant.name} has no skill "${i.skillName}"`);
    if (skill && !skillUsableFromPillar(skill, i.pillar)) {
      throw new ValidationError(`${i.skillName} has no ${i.pillar} governor — it can't be used from a ${i.pillar} action`);
    }
    if (i.kind === 'attack' && !skill && i.pillar === 'soul') {
      throw new ValidationError('An unskilled attack is a Body or Spirit action');
    }
    if (i.kind === 'negate' && !skill) throw new ValidationError('A negate is a skill check — pick a skill');
    if (i.targetId && !ids.has(i.targetId)) throw new ValidationError('Target is not in this encounter');
    if (i.targetId === participant.id) throw new ValidationError('Cannot target yourself');
    if ((i.kind === 'attack' || i.kind === 'negate') && !i.targetId) throw new ValidationError(`${i.kind} needs a target`);
    if (i.kind === 'block' && participant.heldResist <= 0) throw new ValidationError(`${participant.name} holds nothing to block with`);
    // v0: the only interposition is the held item (a named body part would be a piercing path the sim doesn't route yet).
    if (i.redirectTo !== undefined && i.redirectTo !== 'held') throw new ValidationError('redirectTo must be "held" in this version');
    if (i.piercingTargetPath && i.damageType !== 'piercing') throw new ValidationError('Only piercing damage designates a path');

    // Effort — canon §5.
    let effort = i.effort ?? 0;
    let effortAttribute: Governor | undefined;
    if (effort > 0) {
      if (muted) throw new ValidationError(`${participant.name} is Muted (Focus at 0) — no Effort can be added`);
      const eligible = eligibleEffortAttributes(i.pillar, skill ?? null);
      effortAttribute = i.effortAttribute ?? eligible[0];
      if (!eligible.includes(effortAttribute)) {
        throw new ValidationError(`Effort for a ${i.pillar} action must come from ${eligible.join('/')}, not ${effortAttribute}`);
      }
      const cap = effortCap(participant.fateDie, skill ? skill.level : null);
      if (effort > cap) throw new ValidationError(`Effort ${effort} exceeds the cap ${cap} (Fate Die max${skill ? ' + skill level' : ''})`);
      const available = fresh.attrs[effortAttribute]?.current ?? 0;
      if (effort > available) throw new ValidationError(`${participant.name} has only ${available} ${effortAttribute} to wager`);
    } else {
      effort = 0;
    }

    out.push({
      id: `${participant.id}-d-${enc.round + 1}-${n}`,
      participantId: participant.id,
      pillar: i.pillar,
      kind: i.kind,
      description: i.description,
      skillName: i.skillName,
      targetId: i.targetId,
      damageType: i.damageType,
      baseDamage: i.baseDamage,
      dr: isGm ? i.dr : undefined, // only the GM sets difficulty
      effort: effort || undefined,
      effortAttribute,
      piercingTargetPath: i.piercingTargetPath,
      redirectTo: i.redirectTo,
    });
  });

  state.intentions = state.intentions.filter(i => i.participantId !== participant.id).concat(out);
  // A declaration for a PC by its owner is the player's; anything else (GM for an NPC, GM overriding a PC) is the GM's override.
  state.lastPlan[participant.id] = { source: participant.control === 'player' && owned && !isGm ? 'player' : isGm ? 'gm' : 'player' };
  await prisma.encounter.update({ where: { id: encounterId }, data: { state: serialize(state) } });
  return getEncounter(encounterId, actor);
}

/**
 * GM ruling on a Facing Death outcome (Tara's roll is enacted elsewhere):
 * stand a participant back up, or put one down by fiat.
 */
export async function setParticipantDowned(encounterId: string, actor: EncounterActor, participantId: string, downed: boolean) {
  const enc = await loadEncounter(encounterId);
  requireGm(actor, enc.campaign);
  const state = parseState(enc.state);
  const p = state.participants.find(x => x.id === participantId);
  if (!p) throw new NotFoundError('Participant not in this encounter');
  p.downed = downed;
  if (!downed) state.intentions = state.intentions.filter(i => i.participantId !== participantId);
  await prisma.encounter.update({ where: { id: encounterId }, data: { state: serialize(state) } });
  await postGameEvent(enc.campaignId, actor, downed ? 'encounter_down' : 'encounter_up', downed ? `${p.name} is down.` : `${p.name} is back on their feet.`);
  return getEncounter(encounterId, actor);
}

// ── The round ───────────────────────────────────────────────────────────────

async function postGameEvent(campaignId: string, actor: EncounterActor, eventType: string, description: string) {
  const payload: TerminalPayload = { kind: 'game_event', eventType, description };
  const event = await createCampaignEvent({
    campaignId, type: 'game_event', actor: 'system', actorUserId: actor.userId, actorName: 'Simulation', payload,
  });
  const terminalEvent: TerminalEvent = {
    id: `ev-${event.id}`,
    type: 'game_event',
    timestamp: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
    campaignId,
    actor: 'system',
    actorUserId: actor.userId,
    actorName: 'Simulation',
    sessionId: event.sessionId || undefined,
    payload,
  };
  broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });
}

function isVitalDestroyed(anatomy: GrowthWorldItem, events: Array<{ partPath: string[]; conditionBefore: number; conditionAfter: number }>): boolean {
  const find = (root: GrowthWorldItem, path: string[]): GrowthWorldItem | null => {
    let node: GrowthWorldItem | undefined = root;
    if (!node.partName || node.partName !== path[0]) return null;
    for (const seg of path.slice(1)) {
      node = (node.contains ?? []).find(c => c.partName === seg);
      if (!node) return null;
    }
    return node ?? null;
  };
  return events.some(ev => ev.conditionAfter === 0 && ev.conditionBefore !== 0 && find(anatomy, ev.partPath)?.isVital === true);
}

/**
 * Spend Effort from a governor pool RIGHT NOW (read → spend → persist), so a
 * later attribute-damage write in the same round never clobbers it. Returns
 * what was actually spent (clamped to the pool; 0 while Muted).
 */
async function spendEffortNow(characterId: string, attribute: Governor, amount: number): Promise<{ spent: number; note?: string }> {
  if (amount <= 0) return { spent: 0 };
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  const sheet = row ? parseSheet(row.data) : null;
  if (!sheet?.attributes) return { spent: 0, note: 'no attribute pools on sheet' };
  if ((sheet.attributes.focus?.current ?? 0) <= 0) return { spent: 0, note: 'Muted — Focus at 0' };
  const available = sheet.attributes[attribute]?.current ?? 0;
  const spent = Math.min(amount, Math.max(0, available));
  if (spent <= 0) return { spent: 0, note: `${attribute} pool empty` };
  const next = spendAttribute(sheet, attribute as AttributeName, spent).character;
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(next) } });
  return { spent, note: spent < amount ? `pool short — wagered ${spent} of ${amount}` : undefined };
}

/**
 * Run ONE round: plan for every undeclared living participant (its branch),
 * slice the six seconds into slots, order them by the speed layers, resolve
 * in order with consequences landing per slot, then record: event stream,
 * clock +1 round, and a perception memory for every participant's DayaEntity.
 */
export async function runRound(encounterId: string, actor: EncounterActor) {
  const enc = await loadEncounter(encounterId);
  requireGm(actor, enc.campaign);
  if (enc.status !== 'ACTIVE') throw new ValidationError('Encounter is not active');
  const state = parseState(enc.state);
  const round = enc.round + 1;
  const living = state.participants.filter(p => !p.downed);
  if (living.length === 0) throw new ValidationError('No living participants');

  // Fresh attribute pools for everyone (Effort spend / damage moved them).
  for (let i = 0; i < state.participants.length; i++) {
    const row = await prisma.character.findUnique({ where: { id: state.participants[i].id }, select: { data: true } });
    state.participants[i] = refreshParticipant(state.participants[i], row ? parseSheet(row.data) : null);
  }

  // ── Stage 1: senses + intention. Each branch plans unless overridden. ──
  const lastLog = state.rounds.at(-1)?.log ?? [];
  const declared = new Set(state.intentions.map(i => i.participantId));
  const fields = new Map<string, ReturnType<typeof buildSensoryField>>();
  const sheets = new Map<string, GrowthCharacter | null>();
  for (const p of state.participants) {
    const row = await prisma.character.findUnique({ where: { id: p.id }, select: { data: true } });
    sheets.set(p.id, row ? parseSheet(row.data) : null);
  }
  for (const p of state.participants.filter(x => !x.downed)) {
    const field = buildSensoryField({ self: p, participants: state.participants, round, lastRoundLog: lastLog, sceneNarration: round === 1 ? state.sceneNarration : null, body: senseFlags(sheets.get(p.id) ?? null) });
    fields.set(p.id, field);
    if (declared.has(p.id)) continue;
    const goals = await prisma.goal.findMany({ where: { characterId: p.id, status: 'ACTIVE' }, select: { description: true }, orderBy: { priority: 'desc' }, take: 5 });
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: p.id }, select: { id: true, personaProfile: true } });
    let persona: { identity?: string | null; voice?: string | null } | undefined;
    if (entity?.personaProfile) {
      try {
        const pp = JSON.parse(entity.personaProfile) as { identityNarrative?: string; voiceNotes?: string };
        persona = { identity: pp.identityNarrative ?? null, voice: pp.voiceNotes ?? null };
      } catch { /* ignore */ }
    }
    const plan = await planRound({ self: p, field, goals: goals.map(g => g.description), entityId: entity?.id, persona });
    state.intentions.push(...plan.intentions);
    state.lastPlan[p.id] = { source: plan.source, note: plan.note };
  }

  // ── Stage 2: order (layers 1–4; layer 5 hook unused in v0). ──
  const slots = buildSlots(slotInputsFor(state.participants, state.intentions));
  const ordered = await orderSlots(slots, state.participants, state.intentions);

  // ── Stage 3: resolve with real dice, real Effort, real bodies + pools. ──
  const check: CheckFn = async ({ participant, skillName, effort, effortAttribute, dr }) => {
    const skill = skillName ? participant.skills.find(s => s.name === skillName) : undefined;
    let spent = 0;
    let effortNote: string | undefined;
    if (effort > 0 && effortAttribute) {
      const r = await spendEffortNow(participant.id, effortAttribute, effort);
      spent = r.spent;
      effortNote = r.note;
    }
    const r = skill
      ? skilledCheck({ skillLevel: skill.level, fateDie: participant.fateDie, effort: spent, dr })
      : unskilledCheck({ fateDie: participant.fateDie, effort: spent, dr });
    return { total: r.total, success: r.success, margin: r.margin, dr, isSkilled: r.isSkilled, skillDie: r.skillDie.die, fateDie: r.fateDie.die, effort: spent, effortAttribute, effortNote };
  };
  const applyDamage: DamageFn = async ({ targetId, damageType, amount, piercingTargetPath, note }) => {
    // Path 1 — body composition cascade (parts, armor layers, vital → Facing Death).
    const body = await applyDamageToCharacter(actor.userId, actor.role, { characterId: targetId, damageType, amount, piercingTargetPath, note });
    const parts = body.events.map(e => `${e.partPath.at(-1)} ${e.conditionBefore}→${e.conditionAfter}`).join(', ');
    const worn = body.wornDamage.length ? ` (armor: ${body.wornDamage.map(w => w.name).join(', ')})` : '';
    // Path 2 — Affinity Cycle attribute pool (natural target; overflow → Frequency).
    // v0 ASSUMPTION: the same amount hits the pool (see file header).
    const target = NATURAL_TARGET[damageType];
    const pool = await applyAttributeDamage(actor.userId, actor.role, { characterId: targetId, amount, targetAttribute: target, damageType, note });
    const freqAfter = pool.characterData.attributes?.frequency?.current ?? 0;
    const freqBefore = state.participants.find(p => p.id === targetId)?.attrs.frequency.current ?? 0;
    const crossed = freqBefore > 0 && freqAfter <= 0;
    const noPools = pool.changes.some(ch => /^Unknown attribute/.test(ch));
    const poolNote = noPools ? `${target} pool: none on this sheet` : pool.changes.length ? pool.changes.join('; ') : `${target} −${amount}`;
    const sheetNote = !noPools && freqBefore <= 0 && !crossed ? ' [no Frequency on this sheet — cannot fall further]' : '';
    // Keep the in-memory snapshot honest for later hits this round.
    const p = state.participants.find(x => x.id === targetId);
    if (p) p.attrs = { ...p.attrs, [target]: { ...p.attrs[target], current: pool.characterData.attributes?.[target]?.current ?? 0 }, frequency: { ...p.attrs.frequency, current: freqAfter } };
    const hurtParts = body.events.filter(e => e.brokeTier).map(e => e.partPath.at(-1)).filter(Boolean);
    const targetName = state.participants.find(x => x.id === targetId)?.name ?? 'they';
    return {
      summary: `${parts || 'no part crossed a threshold'}${worn}; ${poolNote}${sheetNote}`,
      narration: hurtParts.length ? `${targetName} is hurt — ${hurtParts.join(', ')}` : `${targetName} takes the hit`,
      vitalDestroyed: isVitalDestroyed(body.bodyAnatomy, body.events),
      frequencyOut: crossed,
      detail: { events: body.events, pool: pool.changes, frequencyAfter: freqAfter },
    };
  };
  const wearHeld = async ({ itemId, condition, destroyed }: { targetId: string; itemId: string | null; condition: number; destroyed: boolean }) => {
    await persistItemWear(itemId, condition, destroyed);
  };
  const result = await resolveRound(round, ordered, state.participants, state.intentions, { check, applyDamage, wearHeld });

  // ── Stage 4: Willpower — reconcile + record as canon. ──
  for (const id of result.downed) {
    const p = state.participants.find(x => x.id === id);
    if (p) p.downed = true;
  }
  for (let i = 0; i < state.participants.length; i++) {
    const row = await prisma.character.findUnique({ where: { id: state.participants[i].id }, select: { data: true } });
    state.participants[i] = refreshParticipant(state.participants[i], row ? parseSheet(row.data) : null);
  }
  state.rounds.push(result);
  state.intentions = [];
  await prisma.encounter.update({ where: { id: encounterId }, data: { round, state: serialize(state) } });

  const summary = summarizeRound(result, state.participants);
  await postGameEvent(enc.campaignId, actor, 'encounter_round', `${enc.name} — ${summary}`);
  try {
    await advanceClock(enc.campaignId, actor.userId, actor.role, { amount: 1, unit: 'round', note: `${enc.name} round ${round}` });
  } catch { /* clock advance is best-effort in v0 */ }

  // Every participant's ledger receives the round as lived experience — what
  // its body could sense (its field) plus what it WITNESSED, in diegetic
  // terms (narration, never the sim's numbers), and only up to the slot it
  // went down in. Beings already down before the round perceive nothing.
  // No confabulation: this is the sim's product for the entity.
  let cycle = 0;
  try { cycle = (await getClock(enc.campaignId)).currentCycle; } catch { /* default 0 */ }
  for (const p of state.participants) {
    const field = fields.get(p.id);
    if (!field) continue; // was down before the round began
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: p.id }, select: { id: true } });
    if (!entity) continue;
    const downSlot = result.log.find(l => l.kind === 'downed' && l.targetId === p.id)?.slot;
    const flags = senseFlags(sheets.get(p.id) ?? null);
    const witnessed = result.log
      .filter(l => l.narration && (downSlot === undefined || l.slot <= downSlot))
      .filter(() => flags.canSee || flags.canHear)
      .map(l => l.narration as string)
      .join('. ');
    const hitMe = result.log.some(l => l.kind === 'damage' && l.targetId === p.id);
    const wentDown = result.downed.includes(p.id);
    await writeMemoryEntry({
      entityId: entity.id,
      narrativeCycle: cycle,
      source: 'perception',
      content: `${field.text}\n${witnessed || 'Nothing else reaches you.'}`.slice(0, 4000),
      valence: wentDown ? -0.9 : hitMe ? -0.5 : 0,
      arousal: wentDown ? 0.95 : hitMe ? 0.8 : 0.6,
      salience: wentDown ? 0.95 : hitMe ? 0.8 : 0.5,
      entityRefs: state.participants.filter(x => x.id !== p.id).map(x => x.id),
      classification: { encounterId, round, kind: 'encounter_round' },
    });
  }

  return getEncounter(encounterId, actor);
}
