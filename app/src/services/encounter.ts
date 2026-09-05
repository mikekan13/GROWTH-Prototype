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
 * dice from lib/dice, damage through services/damage (body cascade + Facing
 * Death trigger), the record into the campaign event stream + SSE, the
 * campaign clock forward one round, and a perception memory into every
 * participating DayaEntity's ledger (the sim's product for an entity IS its
 * memory ledger — ruling 7).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { skilledCheck, unskilledCheck } from '@/lib/dice';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import { applyDamageToCharacter } from '@/services/damage';
import { advanceClock, getClock } from '@/services/time';
import { writeMemoryEntry } from '@/daya/memory';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';
import { buildSlots, slotInputsFor } from '@/sim/round/slots';
import { orderSlots } from '@/sim/round/ordering';
import { resolveRound, type CheckFn, type DamageFn } from '@/sim/round/resolve';
import type { Intention, IntentionKind, Participant, Pillar, RoundResult } from '@/sim/round/types';
import { buildSensoryField } from '@/sim/senses/field';
import { planRound } from '@/sim/planning/branch-plan';
import { emptyState, parseState, participantFromCharacter, type EncounterState } from '@/sim/encounter/state';

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

export const intentionInputSchema = z.object({
  pillar: z.enum(['body', 'spirit', 'soul']),
  kind: z.enum(kinds),
  description: z.string().min(1).max(200),
  skillName: z.string().max(80).optional(),
  targetId: z.string().optional(),
  damageType: z.enum(['piercing', 'slashing', 'bashing', 'heat', 'cold', 'decay', 'energy']).optional(),
  baseDamage: z.number().int().min(1).max(20).optional(),
  effort: z.number().int().min(0).max(50).optional(),
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

function parseSheet(raw: string): GrowthCharacter | null {
  try { return JSON.parse(raw) as GrowthCharacter; } catch { return null; }
}

/** v0: the first ACTIVE held item with a baseResist (a shield, a stick, a pot lid). */
async function heldInterposable(characterId: string): Promise<{ name: string; baseResist: number } | null> {
  const items = await prisma.campaignItem.findMany({
    where: { holderId: characterId, status: 'ACTIVE' },
    select: { name: true, data: true },
    take: 50,
  });
  for (const it of items) {
    try {
      const d = JSON.parse(it.data) as { baseResist?: number; isBodyPart?: boolean };
      if (!d.isBodyPart && typeof d.baseResist === 'number' && d.baseResist > 0) {
        return { name: it.name, baseResist: d.baseResist };
      }
    } catch { /* skip */ }
  }
  return null;
}

function serialize(state: EncounterState): string {
  return JSON.stringify(state);
}

function summarizeRound(result: RoundResult, participants: Participant[]): string {
  const name = (id: string | null) => participants.find(p => p.id === id)?.name ?? id ?? '';
  const lines = result.log
    .filter(l => l.kind !== 'order')
    .map(l => l.text);
  const down = result.downed.map(name);
  return [`Round ${result.round}:`, ...lines, down.length ? `Down: ${down.join(', ')}` : ''].filter(Boolean).join('\n');
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function listEncounters(campaignId: string) {
  return prisma.encounter.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, round: true, createdAt: true },
  });
}

export async function getEncounter(encounterId: string) {
  const enc = await loadEncounter(encounterId);
  return { id: enc.id, campaignId: enc.campaignId, name: enc.name, status: enc.status, round: enc.round, state: parseState(enc.state) };
}

export async function createEncounter(campaignId: string, actor: EncounterActor, input: z.infer<typeof createEncounterSchema>) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  requireGm(actor, campaign);

  const ids = input.participants.map(p => p.characterId);
  const chars = await prisma.character.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, entityType: true, campaignId: true, data: true },
  });
  if (chars.length !== ids.length) throw new ValidationError('One or more participants not found');
  for (const c of chars) {
    if (c.campaignId && c.campaignId !== campaignId) throw new ValidationError(`${c.name} is not in this campaign`);
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
  return getEncounter(enc.id);
}

export async function setEncounterStatus(encounterId: string, actor: EncounterActor, status: 'ACTIVE' | 'PAUSED' | 'RESOLVED') {
  const enc = await loadEncounter(encounterId);
  requireGm(actor, enc.campaign);
  await prisma.encounter.update({ where: { id: encounterId }, data: { status } });
  if (status === 'ACTIVE' && enc.status !== 'ACTIVE') {
    await postGameEvent(enc.campaignId, actor, 'encounter_begin', `Encounter begins: ${enc.name}. Six seconds at a time.`);
  }
  if (status === 'RESOLVED') {
    await postGameEvent(enc.campaignId, actor, 'encounter_end', `Encounter resolved: ${enc.name}.`);
  }
  return getEncounter(encounterId);
}

/**
 * Declare a participant's intentions for the next round — the ACT-step
 * override. The character's owner or the GM may declare. Replaces any
 * previous declaration for that participant this round.
 */
export async function declareIntentions(encounterId: string, actor: EncounterActor, input: z.infer<typeof declareIntentionsSchema>) {
  const enc = await loadEncounter(encounterId);
  if (enc.status !== 'ACTIVE') throw new ValidationError('Encounter is not active');
  const state = parseState(enc.state);
  const participant = state.participants.find(p => p.id === input.participantId);
  if (!participant) throw new NotFoundError('Participant not in this encounter');

  const isGm = canManageCampaign(actor.userId, actor.role, enc.campaign);
  if (!isGm) {
    const owned = await prisma.character.findFirst({ where: { id: participant.id, userId: actor.userId }, select: { id: true } });
    if (!owned) throw new ForbiddenError('You can only declare for your own character');
  }

  // Validate the explicit per-pillar allocation (canon: players allocate actions per pillar).
  const counts: Record<Pillar, number> = { body: 0, spirit: 0, soul: 0 };
  const ids = new Set(state.participants.map(p => p.id));
  const out: Intention[] = [];
  input.intentions.forEach((i, n) => {
    counts[i.pillar]++;
    if (counts[i.pillar] > participant.pools[i.pillar]) {
      throw new ValidationError(`Too many ${i.pillar} actions: ${participant.name} has ${participant.pools[i.pillar]}`);
    }
    if (i.skillName && !participant.skills.some(s => s.name === i.skillName)) {
      throw new ValidationError(`${participant.name} has no skill "${i.skillName}"`);
    }
    if (i.targetId && !ids.has(i.targetId)) throw new ValidationError('Target is not in this encounter');
    if ((i.kind === 'attack' || i.kind === 'negate') && !i.targetId) throw new ValidationError(`${i.kind} needs a target`);
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
      effort: i.effort,
      piercingTargetPath: i.piercingTargetPath,
      redirectTo: i.redirectTo,
    });
  });

  state.intentions = state.intentions.filter(i => i.participantId !== participant.id).concat(out);
  state.lastPlan[participant.id] = { source: isGm && participant.control !== 'player' ? 'gm' : 'player' };
  await prisma.encounter.update({ where: { id: encounterId }, data: { state: serialize(state) } });
  return getEncounter(encounterId);
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

  // ── Stage 1: senses + intention. Each branch plans unless overridden. ──
  const lastLog = state.rounds.at(-1)?.log ?? [];
  const declared = new Set(state.intentions.map(i => i.participantId));
  const fields = new Map<string, ReturnType<typeof buildSensoryField>>();
  for (const p of living) {
    const field = buildSensoryField({ self: p, participants: state.participants, round, lastRoundLog: lastLog, sceneNarration: round === 1 ? state.sceneNarration : null });
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

  // ── Stage 3: resolve with real dice + real bodies. ──
  const sheets = new Map<string, GrowthCharacter | null>();
  for (const p of living) {
    const row = await prisma.character.findUnique({ where: { id: p.id }, select: { data: true } });
    sheets.set(p.id, row ? parseSheet(row.data) : null);
  }
  const check: CheckFn = ({ participant, skillName, effort, dr }) => {
    const skill = skillName ? participant.skills.find(s => s.name === skillName) : undefined;
    const r = skill
      ? skilledCheck({ skillLevel: skill.level, fateDie: participant.fateDie, effort, dr })
      : unskilledCheck({ fateDie: participant.fateDie, effort, dr });
    return { total: r.total, success: r.success, margin: r.margin, dr, isSkilled: r.isSkilled, skillDie: r.skillDie.die, fateDie: r.fateDie.die, effort };
  };
  const applyDamage: DamageFn = async ({ targetId, damageType, amount, piercingTargetPath, note }) => {
    const res = await applyDamageToCharacter(actor.userId, actor.role, { characterId: targetId, damageType, amount, piercingTargetPath, note });
    const parts = res.events.map(e => `${e.partPath.at(-1)} ${e.conditionBefore}→${e.conditionAfter}`).join(', ');
    const worn = res.wornDamage.length ? ` (armor absorbed: ${res.wornDamage.map(w => w.name).join(', ')})` : '';
    return {
      summary: (parts || 'no part crossed a threshold') + worn,
      vitalDestroyed: isVitalDestroyed(res.bodyAnatomy, res.events),
      frequencyOut: false,
      detail: { events: res.events },
    };
  };
  const result = await resolveRound(round, ordered, state.participants, state.intentions, { check, applyDamage });

  // ── Stage 4: Willpower — reconcile + record as canon. ──
  for (const id of result.downed) {
    const p = state.participants.find(x => x.id === id);
    if (p) p.downed = true;
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
  // its body could sense (its field) plus what it witnessed. No confabulation:
  // this is the sim's product for the entity.
  let cycle = 0;
  try { cycle = (await getClock(enc.campaignId)).currentCycle; } catch { /* default 0 */ }
  const witnessed = result.log.filter(l => l.kind !== 'order').map(l => l.text).join(' ');
  for (const p of state.participants) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: p.id }, select: { id: true } });
    if (!entity) continue;
    const field = fields.get(p.id);
    const hitMe = result.log.some(l => l.kind === 'damage' && l.targetId === p.id);
    const wentDown = result.downed.includes(p.id);
    await writeMemoryEntry({
      entityId: entity.id,
      narrativeCycle: cycle,
      source: 'perception',
      content: `${field?.text ?? `Round ${round}.`}\n${witnessed}`.slice(0, 4000),
      valence: wentDown ? -0.9 : hitMe ? -0.5 : 0,
      arousal: wentDown ? 0.95 : hitMe ? 0.8 : 0.6,
      salience: wentDown ? 0.95 : hitMe ? 0.8 : 0.5,
      entityRefs: state.participants.filter(x => x.id !== p.id).map(x => x.id),
      classification: { encounterId, round, kind: 'encounter_round' },
    });
  }

  return getEncounter(encounterId);
}
