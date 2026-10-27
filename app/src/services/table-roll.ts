/**
 * Rolls at the table (Mike 2026-10-26, ruling-rolls-are-cards-and-popups): an ACTIVE check — a deliberate
 * inspection, search, listen-closely, or an attempt the Watcher frames as uncertain — becomes a real GROWTH check:
 * the popup (the owner's choices) and the card (the readout, per viewer).
 *
 * REUSES the check machinery that already exists: services/skill-check.initiateSkillCheck (SD rolled + pending
 * check + the wager prompt), the wager route (FD, total vs DR, Effort deducted, trainable on failure) and
 * services/check-resolved (the hook after a check resolves). A roll is a pending check whose `purpose` is
 * { kind: 'roll' }; nothing new is persisted but the result — a `roll` CampaignEvent carrying the whole card and a
 * per-viewer visibility map (lib/roll-card cuts it per reader).
 *
 *   owner   the Trailblazer who owns the character, else the Watcher.
 *   choice  Trailblazer: the popup, timeout -> the AI chooses, the card says so. Watcher's beings: campaign setting
 *           rollEffort 'ai' (default: resolves at once, DR suggested by the sim) | 'manual' (the popup, with a DR field).
 *   AI      aiEffort (lib/active-check) — a deterministic heuristic over the pools; no model call.
 *   DR      canon has NO difficulty ladder: the sim only SUGGESTS (INSPECT_TUNING.defaultDr) and says so on the card.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { rollDie } from '@/lib/dice';
import { parseDie } from '@/lib/dice-utils';
import { getCampaignAISettings } from '@/ai/campaign-ai';
import { DEFAULT_ROLL_TIMEOUT_SEC } from '@/ai/types';
import { removePendingCheck, getPendingCheck, type PendingCheck, type RollPurpose } from '@/lib/pending-checks';
import { broadcastEvent } from '@/lib/campaign-stream';
import { detectActiveCheck, namedSkill, governorFor, aiEffort, type ActiveCheck } from '@/lib/active-check';
import { rollForViewer } from '@/lib/roll-card';
import { INSPECT_TUNING } from '@/sim/perception/inspect';
import { createCampaignEvent } from '@/services/campaign-event';
import { initiateSkillCheck } from '@/services/skill-check';
import { gatherTraitModifiers } from '@/services/trait-modifiers';
import { markAttributeTrainable, markSkillTrainable } from '@/services/advancement';
import { afterCheckResolved, type CheckOutcome } from '@/services/check-resolved';
import type { GrowthCharacter } from '@/types/growth';
import type { RollPayload, RollSeen, TerminalEvent } from '@/types/terminal';

/** A Watcher answering by hand has longer than a player's popup (the sim never rushes the table's Watcher). */
export const WATCHER_ROLL_TIMEOUT_SEC = 300;

/** The same act is not rolled twice within this window (the beat path and a replay can both see it). */
const DEDUPE_MS = 60_000;
const g = globalThis as typeof globalThis & { __tableRollSeen?: Map<string, number> };
const seen = (g.__tableRollSeen ??= new Map<string, number>());

function parseSheet(raw: string | null | undefined): GrowthCharacter | null {
  try { return raw ? (JSON.parse(raw) as GrowthCharacter) : null; } catch { return null; }
}

export interface StartedRoll {
  rollId: string;
  checkId: string;
  ownerRole: 'trailblazer' | 'watcher';
  /** 'popup' = the owner was asked; 'ai' = the sim chose at once and the card is written. */
  via: 'popup' | 'ai';
}

/**
 * Start a roll for ONE act of a character, if the act is an ACTIVE check. Returns null when it is not (or was just
 * rolled). `forceKind` lets a caller that already knows (JEWL's pre-read `check`) frame it. Never throws on a
 * non-check; a real failure propagates so the caller can log it.
 */
export async function startTableRoll(
  campaignId: string,
  gm: { id: string; username: string },
  input: { characterId: string; text: string; cycle?: number; forceKind?: ActiveCheck['kind'] },
): Promise<StartedRoll | null> {
  const check = detectActiveCheck(input.text) ?? (input.forceKind ? { kind: input.forceKind, perceptual: input.forceKind !== 'attempt', match: input.forceKind } : null);
  if (!check) return null;

  const key = `${campaignId}:${input.characterId}:${input.text.trim().toLowerCase()}`;
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > DEDUPE_MS) seen.delete(k);
  if (seen.has(key)) return null;
  seen.set(key, now);

  const [campaign, ch] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true, currentCycle: true } }),
    prisma.character.findUnique({ where: { id: input.characterId }, select: { id: true, name: true, userId: true, entityType: true, data: true, campaignId: true } }),
  ]);
  if (!campaign || !ch || ch.campaignId !== campaignId) return null;
  const sheet = parseSheet(ch.data);
  const skills = Array.isArray(sheet?.skills) ? sheet!.skills : [];
  const skill = namedSkill(input.text, skills);
  const governor = skill ? (skill.governors?.[0] ?? 'willpower') : governorFor(input.text, check);

  const played = ch.entityType === 'PLAYER_CHARACTER' && !!ch.userId && ch.userId !== campaign.gmUserId;
  const ownerRole: RollPurpose['ownerRole'] = played ? 'trailblazer' : 'watcher';
  const ownerUserId = played ? ch.userId! : campaign.gmUserId;
  const settings = await getCampaignAISettings(campaignId);
  const aiDecides = !played && settings.rollEffort !== 'manual';
  const timeoutSec = played ? Math.max(10, settings.rollTimeoutSec ?? DEFAULT_ROLL_TIMEOUT_SEC) : WATCHER_ROLL_TIMEOUT_SEC;
  const dr = INSPECT_TUNING.defaultDr; // the sim's SUGGESTION — canon has no obstacle ladder [NEEDS MIKE]

  const rollId = crypto.randomUUID();
  const purpose: RollPurpose = {
    kind: 'roll', rollId, event: input.text.trim(), actorId: ch.id, actorName: ch.name, governor, ownerRole, drBy: 'sim',
    cycle: input.cycle ?? campaign.currentCycle ?? undefined,
  };
  const started = await initiateSkillCheck(campaignId, gm, {
    characterId: ch.id,
    ...(skill ? { skillName: skill.name } : { attributeName: governor }),
    dr, revealDR: false,
  }, {
    purpose, ownerUserId, timeoutMs: timeoutSec * 1000, noPrompt: aiDecides,
    tableRoll: { event: purpose.event, actorName: ch.name, ownerRole, timeoutSec, ...(ownerRole === 'watcher' ? { dr } : {}) },
  });
  if (aiDecides) {
    await resolveRollByAi(started.checkId, 'ai');
    return { rollId, checkId: started.checkId, ownerRole, via: 'ai' };
  }
  return { rollId, checkId: started.checkId, ownerRole, via: 'popup' };
}

/** The AI chooses the Effort for a stored check and resolves it (setting 'ai', or a popup nobody answered in time). */
export async function resolveRollByAi(checkId: string, chosenBy: 'ai' | 'ai-timeout'): Promise<void> {
  const pending = getPendingCheck(checkId);
  if (!pending || pending.purpose?.kind !== 'roll') return;
  const claimed = removePendingCheck(checkId);
  if (!claimed) return;
  const row = await prisma.character.findUnique({ where: { id: claimed.characterId }, select: { data: true } });
  const sheet = parseSheet(row?.data);
  const attrs = (sheet?.attributes ?? {}) as unknown as Record<string, { current?: number } | undefined>;
  const pools = claimed.availableGovernors.map((gv) => ({ name: gv.name, current: Math.max(0, attrs[gv.name]?.current ?? gv.current) }));
  const fdMax = parseDie(claimed.fateDie);
  const ceiling = Math.max(0, fdMax + claimed.skillLevel - claimed.sdResult - 1);
  const wagers = aiEffort({ sd: claimed.sdResult, fdMax, dr: claimed.dr, pools, ceiling });
  await resolveCheckWithWagers(claimed, wagers, chosenBy);
}

/**
 * Resolve a CLAIMED check with chosen wagers exactly as the wager route does (FD rolled server-side, trait flat,
 * total vs DR, Effort deducted from the governor pools, a failure marks the tested thing trainable), then the hook
 * writes the card. The wager route stays the Trailblazer's/Watcher's by-hand path; this is the AI's.
 */
export async function resolveCheckWithWagers(pending: PendingCheck, wagers: Array<{ governor: string; amount: number }>, chosenBy: 'ai' | 'ai-timeout'): Promise<void> {
  const totalEffort = wagers.reduce((s, w) => s + w.amount, 0);
  const fdResult = rollDie(parseDie(pending.fateDie));
  let traitFlat = 0;
  const row = await prisma.character.findUnique({ where: { id: pending.characterId } });
  const sheet = parseSheet(row?.data);
  if (sheet) {
    try {
      const primary = wagers.find((w) => w.amount > 0)?.governor ?? pending.availableGovernors[0]?.name ?? pending.attributeName;
      traitFlat = gatherTraitModifiers(sheet, { skillName: pending.skillName, governorAttribute: primary }).totalFlat;
    } catch { traitFlat = 0; }
  }
  const total = pending.sdResult + fdResult + totalEffort + traitFlat;
  const success = total >= pending.dr;
  const margin = total - pending.dr;
  if (row && sheet) {
    for (const w of wagers) {
      if (w.amount <= 0) continue;
      const attr = (sheet.attributes as unknown as Record<string, { current?: number } | undefined>)[w.governor];
      if (attr && typeof attr === 'object' && typeof attr.current === 'number') attr.current = Math.max(0, attr.current - w.amount);
    }
    if (!success) {
      if (pending.isSkilled && pending.skillName) markSkillTrainable(sheet, pending.skillName);
      else markAttributeTrainable(sheet, pending.attributeName);
    }
    await prisma.character.update({ where: { id: pending.characterId }, data: { data: JSON.stringify(sheet) } });
    broadcastEvent(pending.campaignId, { kind: 'character_update', characterId: pending.characterId, characterName: pending.characterName, fields: ['attributes', 'skills'] });
  }
  const effortBy: Record<string, number> = {};
  for (const w of wagers) if (w.amount > 0) effortBy[w.governor.toLowerCase()] = (effortBy[w.governor.toLowerCase()] ?? 0) + w.amount;
  await afterCheckResolved(pending, { total, success, margin, effortBy, fdResult, traitFlat, chosenBy });
}

type PendingForCard = Pick<PendingCheck, 'id' | 'campaignId' | 'purpose' | 'isSkilled'> & Partial<Pick<PendingCheck, 'skillName' | 'attributeName' | 'sdDie' | 'sdResult' | 'fateDie' | 'dr' | 'difficultyHint' | 'skillLevel' | 'characterId'>>;

/** The beings that perceived the act and how much: sight -> the readout, hearing only -> the sentence; not reached -> nothing. */
export async function rollVisibility(campaignId: string, actorId: string, event: string): Promise<Record<string, RollSeen>> {
  try {
    const { tableParticipantIds } = await import('@/services/table-speak');
    const ids = (await tableParticipantIds(campaignId)).filter((id) => id !== actorId);
    if (!ids.length) return {};
    const { judgeCanonReach } = await import('@/services/perception-reach');
    const j = await judgeCanonReach(campaignId, { kind: 'action', text: event, sourceId: actorId }, ids);
    const out: Record<string, RollSeen> = {};
    for (const id of ids) {
      const v = j.verdicts.get(id);
      if (!v || !v.reaches || !v.noticed) continue;
      out[id] = v.via.includes('sight') ? 'full' : 'event';
    }
    return out;
  } catch (err) {
    console.warn('[table-roll] visibility unjudged; only the actor and the Watcher see the card', err);
    return {};
  }
}

/** Write the roll CARD (a `roll` CampaignEvent) and push each reader their own cut. Called after a roll-purpose check resolves. */
export async function writeRollCard(campaignId: string, pending: PendingForCard, outcome: CheckOutcome): Promise<void> {
  const purpose = pending.purpose;
  if (!purpose || purpose.kind !== 'roll') return;
  const effort = Object.values(outcome.effortBy).reduce((s, n) => s + n, 0);
  const payload: RollPayload = {
    kind: 'roll', rollId: purpose.rollId, event: purpose.event, actorId: purpose.actorId, actorName: purpose.actorName,
    ...(pending.skillName ? { skillName: pending.skillName } : {}), isSkilled: pending.isSkilled, governor: purpose.governor,
    ...(pending.sdDie && pending.sdResult !== undefined ? { sd: { die: pending.sdDie, value: pending.sdResult } } : {}),
    ...(pending.difficultyHint ? { hint: pending.difficultyHint } : {}),
    ...(pending.fateDie && outcome.fdResult !== undefined ? { fd: { die: pending.fateDie, value: outcome.fdResult } } : {}),
    effort,
    ...(effort ? { effortAttribute: Object.entries(outcome.effortBy).map(([k, v]) => `${v} ${k}`).join(' + ') } : {}),
    ...(outcome.traitFlat ? { traitFlat: outcome.traitFlat } : {}),
    total: outcome.total, dr: pending.dr, drBy: purpose.drBy, success: outcome.success, margin: outcome.margin,
    chosenBy: outcome.chosenBy ?? (purpose.ownerRole === 'trailblazer' ? 'player' : 'watcher'),
    ...(purpose.cycle !== undefined ? { cycle: purpose.cycle } : {}),
    visibility: await rollVisibility(campaignId, purpose.actorId, purpose.event),
  };
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) return;
  const ev = await createCampaignEvent({
    campaignId, type: 'roll', actor: 'system', actorUserId: campaign.gmUserId, actorName: 'System',
    characterId: purpose.actorId, characterName: purpose.actorName, payload,
  });
  await pushRollCard(campaignId, campaign.gmUserId, {
    id: ev.id, timestamp: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : String(ev.createdAt), sessionId: ev.sessionId ?? undefined, payload,
  });
}

/** Each reader gets only their own cut, targeted (never a campaign-wide broadcast of the numbers). */
async function pushRollCard(campaignId: string, gmUserId: string, ev: { id: string; timestamp: string; sessionId?: string; payload: RollPayload }): Promise<void> {
  const envelope = (payload: RollPayload): TerminalEvent => ({
    id: `ev-${ev.id}`, type: 'roll', timestamp: ev.timestamp, campaignId, actor: 'system', actorUserId: gmUserId, actorName: 'System',
    characterId: payload.actorId, characterName: payload.actorName, sessionId: ev.sessionId, payload,
  });
  const full = rollForViewer(ev.payload, { kind: 'watcher' });
  if (full) broadcastEvent(campaignId, { kind: 'terminal_event', event: envelope(full) }, gmUserId);
  const ids = [ev.payload.actorId, ...Object.keys(ev.payload.visibility ?? {})];
  const rows = await prisma.character.findMany({ where: { id: { in: ids }, campaignId }, select: { id: true, userId: true, entityType: true } });
  for (const r of rows) {
    if (!r.userId || r.userId === gmUserId || r.entityType !== 'PLAYER_CHARACTER') continue;
    const cut = rollForViewer(ev.payload, { kind: 'character', characterId: r.id });
    if (!cut) continue;
    broadcastEvent(campaignId, { kind: 'terminal_event', event: envelope(cut) }, r.userId);
    broadcastEvent(campaignId, { kind: 'perceived_feed_stale', characterId: r.id }, r.userId);
  }
}
