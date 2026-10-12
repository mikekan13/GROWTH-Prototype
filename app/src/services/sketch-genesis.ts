/**
 * SKETCH genesis tier (Mike 2026-10-12, [[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]]
 * "Speed tiers"): a Watcher improvising an NPC mid-session gets a voiceable
 * NPC with a MECHANICALLY VALID sheet in one model call, in the background,
 * while the table keeps going. No JEWL work loop, no prods, no Forge review.
 *
 *   startSketch()  — perms + lawful-input screen + wallet floor check, then
 *                    schedules sketchNpc() and returns at once (202 shape).
 *   sketchNpc()    — ONE routed call (class fiction, lane judgment) →
 *                    repair into canon (sketch-genesis-rules) → price with
 *                    the shared TKV formula → clamp to the campaign wallet →
 *                    write Character (NPC, genesisTier SKETCH) → invest the
 *                    TKV through the existing crystallization debit path →
 *                    wrapCharacterAsDaya (entity + affect + believed sheet) →
 *                    persona/voice → seed memories → DayaEntity ACTIVE →
 *                    canvas placement (best effort) → SSE character_update.
 *   markForDeepening() — the "deepen later" flag the deep pipeline picks up.
 *
 * The Character row is written only once the sheet is valid and priced, so
 * a failed sketch leaves nothing half-made on the roster; the job's status
 * lives in a small in-process map (survives HMR, not a server restart).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { WITHHELD_STRING } from '@/lib/withheld';
import { createDefaultCharacter } from '@/lib/defaults';
import { SEED_CATALOG } from '@/lib/seed-catalog';
import { broadcastEvent } from '@/lib/campaign-stream';
import { routedChatText } from '@/ai/network/chat';
import { requireCampaignGM } from '@/services/campaign-access';
import { assertLawfulInput } from '@/services/lawful-intake';
import { applyCreationGrants } from '@/services/character-grants';
import { getCampaignEconomy } from '@/services/krma/wallet';
import { crystallizeEntity } from '@/services/krma/crystallization';
import { snapCharacterToLocation } from '@/services/canvas-placement';
import { wrapCharacterAsDaya, updateDayaAuthoring, seedEntityMemories, setDayaStatus } from '@/daya/authoring';
import { sealLint, hasHardHit } from '@/daya/seal';
import type { GrowthCharacter } from '@/types/growth';
import {
  SKETCH_LIMITS,
  buildSketchSheet,
  buildSketchSystemPrompt,
  clip,
  extractJson,
  fitToBudget,
  normalizeProposal,
} from './sketch-genesis-rules';

export const SKETCH_MODEL_MAX_TOKENS = 1400;

/** A sketch never fails for a length limit: long seed text is clipped, not refused. */
export const sketchInputSchema = z.object({
  seedText: z.string().trim().min(1, 'Say who to sketch').transform((s) => s.slice(0, SKETCH_LIMITS.seedTextChars)),
  tier: z.literal('SKETCH').default('SKETCH'),
});

export type SketchStatus = 'PENDING' | 'DONE' | 'FAILED';

export interface SketchJob {
  characterId: string;
  campaignId: string;
  status: SketchStatus;
  startedAt: number;
  finishedAt?: number;
  summary?: string;
  error?: string;
  done: Promise<void>;
}

export interface SketchResult {
  characterId: string;
  name: string;
  tkv: number;
  proposedTkv: number;
  clamped: boolean;
  memories: number;
  summary: string;
}

const globalForSketch = globalThis as unknown as { __sketchJobs?: Map<string, SketchJob> };
const JOBS: Map<string, SketchJob> = globalForSketch.__sketchJobs ?? (globalForSketch.__sketchJobs = new Map());
const JOB_TTL_MS = 60 * 60 * 1000;

function pruneJobs(now = Date.now()): void {
  for (const [id, j] of JOBS) if (j.finishedAt && now - j.finishedAt > JOB_TTL_MS) JOBS.delete(id);
}

/** cuid-shaped enough for every consumer (ids are opaque TEXT). */
function newCharacterId(): string {
  return `c${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

type SeedArg = Parameters<typeof applyCreationGrants>[1];

/** The seed to build on: the named one when the campaign (or the stock catalog) has it published, else Human. */
export async function resolveSketchSeed(campaignId: string, wanted: string | null): Promise<SeedArg> {
  const names = wanted && wanted.toLowerCase() !== 'human' ? [wanted, 'Human'] : ['Human'];
  for (const name of names) {
    const row = await prisma.forgeItem.findFirst({ where: { campaignId, type: 'seed', status: 'published', name }, select: { id: true, name: true, data: true } })
      ?? await prisma.forgeItem.findFirst({ where: { isGlobal: true, type: 'seed', status: 'published', name }, select: { id: true, name: true, data: true } });
    if (row) {
      try { return { id: row.id, name: row.name, data: JSON.parse(row.data) as SeedArg['data'] }; } catch { /* malformed seed row: next */ }
    }
  }
  const human = SEED_CATALOG.find((s) => s.name === 'Human')!;
  return { id: 'catalog:Human', name: human.name, data: human as unknown as SeedArg['data'] };
}

function seededBase(name: string, seed: SeedArg): GrowthCharacter {
  return applyCreationGrants(createDefaultCharacter(name), seed, [], []);
}

/** Fluid KRMA in the campaign wallet — the ceiling a sketch is clamped to. */
async function walletBudget(campaignId: string): Promise<number> {
  const economy = await getCampaignEconomy(campaignId);
  return Number(economy.fluid);
}

/** The bare Human sketch's TKV — below this the wallet cannot cover any sketch. */
export async function sketchFloorTkv(campaignId: string): Promise<number> {
  const seed = await resolveSketchSeed(campaignId, null);
  const base = seededBase('Stranger', seed);
  return fitToBudget(base, Number.MAX_SAFE_INTEGER).floorTkv;
}

/**
 * Validate, screen and check the wallet, then run the sketch in the
 * background. Returns at once with the id the Character will have.
 */
export async function startSketch(
  campaignId: string,
  actor: { id: string; role: string; username?: string | null },
  input: unknown,
): Promise<{ characterId: string; status: SketchStatus }> {
  await requireCampaignGM(campaignId, actor);
  const { seedText } = sketchInputSchema.parse(input);
  await assertLawfulInput({ campaignId, userId: actor.id, username: actor.username ?? null, text: seedText, origin: 'SKETCH_NPC' });

  const [budget, floor] = await Promise.all([walletBudget(campaignId), sketchFloorTkv(campaignId)]);
  if (floor > budget) {
    throw new ValidationError(`The campaign wallet holds ${budget} fluid KRMA; even a bare sketch costs ${floor}. Fund the campaign before improvising NPCs.`);
  }

  pruneJobs();
  const characterId = newCharacterId();
  const job: SketchJob = { characterId, campaignId, status: 'PENDING', startedAt: Date.now(), done: Promise.resolve() };
  JOBS.set(characterId, job);
  job.done = new Promise<void>((resolve) => {
    setImmediate(() => {
      sketchNpc({ campaignId, watcherId: actor.id, watcherRole: actor.role, seedText, tier: 'SKETCH', characterId })
        .then((r) => { job.status = 'DONE'; job.summary = r.summary; })
        .catch((err: unknown) => {
          job.status = 'FAILED';
          job.error = err instanceof Error ? err.message : String(err);
          console.warn(`[sketch-genesis] ${characterId} failed: ${job.error}`);
        })
        .finally(() => { job.finishedAt = Date.now(); resolve(); });
    });
  });
  return { characterId, status: 'PENDING' };
}

/** Test/tool seam: resolves when the background sketch has settled. */
export async function awaitSketch(characterId: string): Promise<SketchJob | undefined> {
  const job = JOBS.get(characterId);
  if (job) await job.done;
  return job;
}

/** Status for the Watcher: the live job, else a finished SKETCH row in this campaign. */
export async function getSketchStatus(
  campaignId: string,
  actor: { id: string; role: string },
  characterId: string,
): Promise<{ characterId: string; status: SketchStatus; summary?: string; error?: string }> {
  await requireCampaignGM(campaignId, actor);
  const job = JOBS.get(characterId);
  if (job && job.campaignId === campaignId) {
    return { characterId, status: job.status, ...(job.summary ? { summary: job.summary } : {}), ...(job.error ? { error: job.error } : {}) };
  }
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { campaignId: true, genesisTier: true } });
  if (row && row.campaignId === campaignId && row.genesisTier === 'SKETCH') return { characterId, status: 'DONE' };
  throw new NotFoundError('No such sketch');
}

/** Memories that would break the embodiment seal are dropped, not refused. */
function sealSafeMemories(memories: string[]): { kept: string[]; dropped: number } {
  const kept = memories.filter((m) => !hasHardHit(sealLint(m)));
  return { kept, dropped: memories.length - kept.length };
}

/**
 * The whole sketch, awaited. Callers that must not block (the route, the
 * JEWL tool) go through startSketch().
 */
export async function sketchNpc(opts: {
  campaignId: string;
  watcherId: string;
  watcherRole: string;
  seedText: string;
  tier: 'SKETCH';
  characterId?: string;
}): Promise<SketchResult> {
  const { campaignId, watcherId, watcherRole } = opts;
  const seedText = opts.seedText.slice(0, SKETCH_LIMITS.seedTextChars);
  const campaign = await requireCampaignGM(campaignId, { id: watcherId, role: watcherRole });

  const budget = await walletBudget(campaignId);
  const seedNames = ['Human'];

  // ONE structured call. Class fiction (the Watcher's improvised character);
  // lane judgment — the mechanics must come back right the first time.
  const res = await routedChatText(
    { caller: 'sketch-genesis', lane: 'judgment', contentClass: 'fiction', campaignId },
    {
      system: buildSketchSystemPrompt({ budget, seedNames }),
      user: `The Watcher, at the table: "${seedText}"`,
      maxTokens: SKETCH_MODEL_MAX_TOKENS,
      temperature: 0.5,
    },
  );
  if (res.text.trim() === WITHHELD_STRING) {
    throw new ValidationError('The sketch was withheld by the lawfulness screen.');
  }

  const proposal = normalizeProposal(extractJson(res.text), seedText);
  let seed = await resolveSketchSeed(campaignId, proposal.seedName);
  let base: GrowthCharacter;
  try {
    base = seededBase(proposal.name, seed);
  } catch {
    // A seed whose block conditions refuse a bare sketch: fall back to Human.
    seed = await resolveSketchSeed(campaignId, null);
    base = seededBase(proposal.name, seed);
    proposal.repairs.push(`seed ${proposal.seedName} unusable → Human`);
  }
  const sheet = buildSketchSheet(base, proposal, seedText);
  let fit = fitToBudget(sheet, budget);
  if (!fit.affordable) {
    throw new ValidationError(`The campaign wallet holds ${budget} fluid KRMA; this sketch's bare floor costs ${fit.floorTkv}.`);
  }

  const characterId = opts.characterId ?? newCharacterId();
  const noteClamp = (f: typeof fit) => (f.clamped ? `clamped ${f.proposedTkv} → ${f.tkv} KRMA to fit the wallet` : null);
  const stamp = (f: typeof fit) => {
    const d = f.sheet as unknown as Record<string, unknown>;
    d._sketch = { ...(d._sketch as Record<string, unknown>), tkv: f.tkv, proposedTkv: f.proposedTkv, clamped: f.clamped, sketchedAt: new Date().toISOString() };
    return JSON.stringify(d);
  };

  await prisma.character.create({
    data: {
      id: characterId,
      name: proposal.name,
      entityType: 'NPC',
      status: 'DRAFT',
      userId: campaign.gmUserId,
      campaignId,
      data: stamp(fit),
      genesisTier: 'SKETCH',
    },
  });

  // Price it: the TKV moves campaign → character wallet through the
  // existing crystallization debit (never bypassed). A concurrent spend can
  // shrink the wallet between the read and the debit: re-fit once, retry.
  const invest = (kv: number) => crystallizeEntity(watcherId, watcherRole, campaignId, {
    entityId: characterId, entityType: 'character', entityName: proposal.name, karmicValue: kv, action: 'crystallize',
  });
  try {
    await invest(fit.tkv);
  } catch (first) {
    const again = fitToBudget(sheet, await walletBudget(campaignId));
    if (!again.affordable || again.tkv === fit.tkv) {
      await prisma.character.delete({ where: { id: characterId } }).catch(() => undefined);
      throw first;
    }
    fit = again;
    await prisma.character.update({ where: { id: characterId }, data: { data: stamp(fit) } });
    try {
      await invest(fit.tkv);
    } catch (second) {
      await prisma.character.delete({ where: { id: characterId } }).catch(() => undefined);
      throw second;
    }
  }

  // Wake the being: entity + affect + believed sheet, persona, memories, ACTIVE.
  await wrapCharacterAsDaya(characterId, watcherRole);
  await updateDayaAuthoring(characterId, watcherRole, { identityNarrative: proposal.persona, voiceNotes: proposal.voice });
  const { kept, dropped } = sealSafeMemories(proposal.memories);
  if (dropped > 0) proposal.repairs.push(`${dropped} memor${dropped === 1 ? 'y' : 'ies'} dropped (game vocabulary)`);
  if (kept.length > 0) {
    await seedEntityMemories(characterId, watcherRole, kept.map((content) => ({ content, salience: 0.4, source: 'sketch' })));
  }
  await setDayaStatus(characterId, watcherRole, 'ACTIVE');
  await prisma.character.update({ where: { id: characterId }, data: { status: 'ACTIVE' } });

  // On the canvas beside the scene (the first awake being's place), best effort.
  try {
    const awake = await prisma.dayaEntity.findFirst({ where: { status: 'ACTIVE', characterId: { not: characterId }, character: { campaignId } }, select: { characterId: true } });
    const at = awake ? await prisma.entityRelationship.findFirst({ where: { sourceId: awake.characterId, relationshipType: 'located_at' }, select: { targetId: true } }) : null;
    if (at?.targetId) await snapCharacterToLocation(campaignId, characterId, at.targetId);
  } catch (err) {
    console.warn('[sketch-genesis] canvas placement skipped', err);
  }

  broadcastEvent(campaignId, { kind: 'character_update', characterId, characterName: proposal.name, fields: ['created', 'genesisTier'] });

  const clampNote = noteClamp(fit);
  const summary = [
    `${proposal.name} — ${clip(proposal.persona, 120)}`,
    `${fit.tkv} KRMA`,
    clampNote,
    `${kept.length} memories`,
  ].filter(Boolean).join(' · ');
  console.info(`[sketch-genesis] ${characterId} ${proposal.name}: tkv ${fit.tkv}${fit.clamped ? ` (from ${fit.proposedTkv})` : ''}, ${kept.length} memories, ${res.usage.outputTokens} out tokens, repairs: ${proposal.repairs.join('; ') || 'none'}`);
  return { characterId, name: proposal.name, tkv: fit.tkv, proposedTkv: fit.proposedTkv, clamped: fit.clamped, memories: kept.length, summary };
}

/**
 * "Deepen later" (minimal): flag a sketch for the deep genesis pipeline to
 * pick up in idle cycles. No scheduler yet — the flag is the contract.
 */
export async function markForDeepening(characterId: string, actor: { id: string; role: string }): Promise<{ characterId: string; deepenRequested: true }> {
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { campaignId: true } });
  if (!row || !row.campaignId) throw new NotFoundError('Character not found');
  await requireCampaignGM(row.campaignId, actor);
  await prisma.character.update({ where: { id: characterId }, data: { deepenRequested: true } });
  return { characterId, deepenRequested: true };
}

/** Test seam: forget every job. */
export function __resetSketchJobs(): void {
  JOBS.clear();
}
