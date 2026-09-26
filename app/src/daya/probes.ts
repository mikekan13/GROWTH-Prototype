/**
 * Identity probes — the individuation measurement (research briefing §3.3, §6).
 *
 * A canonical question set (Smallville's five categories: self-knowledge,
 * memory, plans, reactions, reflections) is asked of every entity in a sweep.
 * The first sweep per entity is its baseline (IDENTITY_HASH). Later sweeps
 * measure two axes:
 *   - drift-from-self: distance between an entity's latest and baseline
 *     responses (should stay bounded);
 *   - divergence-between-entities: pairwise distance on the same sweep
 *     (should grow or hold).
 *
 * v0 distance = cosine over term-frequency vectors of the concatenated
 * responses (no embedding service yet; swap `vectorize` when one exists).
 * Probing is out-of-band measurement: it writes NO memories and runs on the
 * local lane with the entity's persona + its most salient ledger entries —
 * the archive-plus-loop the thesis says identity lives in.
 */
import 'server-only';
import { randomUUID } from 'crypto';
import { vectorize, cosine } from './probes-vec';
import { prisma } from '@/lib/db';
import { chat, DayaTierUnavailableError, DayaWarmingTimeoutError } from '@/daya/model-client';
import { l1Status } from '@/daya/l1-warm';

export const PROBE_VERSION = 'v1';

export const PROBE_SET_V1: Array<{ key: string; category: string; question: string }> = [
  { key: 'self.describe', category: 'self-knowledge', question: 'Describe yourself in a few sentences.' },
  { key: 'self.never', category: 'self-knowledge', question: 'What is one thing you would never do?' },
  { key: 'memory.morning', category: 'memory', question: 'What did you do this morning?' },
  { key: 'memory.recent', category: 'memory', question: 'What is the last thing that happened to you that mattered?' },
  { key: 'plans.want', category: 'plans', question: 'What do you want most right now?' },
  { key: 'plans.tomorrow', category: 'plans', question: 'What will you do tomorrow?' },
  { key: 'react.stranger', category: 'reactions', question: 'A stranger knocks at your door. What do you do?' },
  { key: 'react.anger', category: 'reactions', question: 'How do you speak when you are angry?' },
  { key: 'reflect.people', category: 'reflections', question: 'Who matters to you, and why?' },
  { key: 'reflect.habit', category: 'reflections', question: 'What would others say is your worst habit?' },
];

// ── Pure: vectors + distances ────────────────────────────────────────────────

export { vectorize, cosine };

/** 0 = identical, 1 = nothing in common. */
export function distance(aText: string, bText: string): number {
  return 1 - cosine(vectorize(aText), vectorize(bText));
}

export interface ProbeRow { entityId: string; runId: string; questionKey: string; response: string; createdAt: Date }

export interface ProbeMetrics {
  runs: string[];                     // runIds oldest → newest
  entities: Array<{
    entityId: string;
    name: string;
    baselineRun: string | null;
    latestRun: string | null;
    /** distance latest ↔ baseline over concatenated responses (0 = unchanged). null if only one run. */
    driftFromSelf: number | null;
    /** per-question drift for the same pair */
    driftByQuestion: Record<string, number>;
  }>;
  /** pairwise distance between entities on the latest run each shares */
  divergence: Array<{ a: string; b: string; runId: string; distance: number }>;
}

/** Pure: compute the two axes from stored rows. */
export function computeProbeMetrics(rows: ProbeRow[], names: Record<string, string>): ProbeMetrics {
  const runOrder = [...new Set(rows.slice().sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime()).map(r => r.runId))];
  const byEntity = new Map<string, Map<string, Map<string, string>>>(); // entity → run → qKey → response
  for (const r of rows) {
    const runs = byEntity.get(r.entityId) ?? new Map();
    const qs = runs.get(r.runId) ?? new Map();
    qs.set(r.questionKey, r.response);
    runs.set(r.runId, qs);
    byEntity.set(r.entityId, runs);
  }
  const concat = (qs: Map<string, string>) => [...qs.values()].join('\n');
  const entities = [...byEntity.entries()].map(([entityId, runs]) => {
    const ordered = runOrder.filter(r => runs.has(r));
    const baselineRun = ordered[0] ?? null;
    const latestRun = ordered.at(-1) ?? null;
    let driftFromSelf: number | null = null;
    const driftByQuestion: Record<string, number> = {};
    if (baselineRun && latestRun && baselineRun !== latestRun) {
      const b = runs.get(baselineRun)!, l = runs.get(latestRun)!;
      driftFromSelf = distance(concat(b), concat(l));
      for (const [k, resp] of l) if (b.has(k)) driftByQuestion[k] = distance(b.get(k)!, resp);
    }
    return { entityId, name: names[entityId] ?? entityId, baselineRun, latestRun, driftFromSelf, driftByQuestion };
  });
  const divergence: ProbeMetrics['divergence'] = [];
  const ids = [...byEntity.keys()];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const ra = byEntity.get(ids[i])!, rb = byEntity.get(ids[j])!;
    const shared = runOrder.filter(r => ra.has(r) && rb.has(r)).at(-1);
    if (!shared) continue;
    divergence.push({ a: ids[i], b: ids[j], runId: shared, distance: distance(concat(ra.get(shared)!), concat(rb.get(shared)!)) });
  }
  return { runs: runOrder, entities, divergence };
}

// ── Runner ───────────────────────────────────────────────────────────────────

export interface ProbeRunResult {
  runId: string | null;
  status: 'ok' | 'lane_not_ready';
  laneStatus: string;
  probed: Array<{ entityId: string; name: string; answered: number; failed: number }>;
}

async function personaBlock(entityId: string): Promise<{ system: string; name: string }> {
  const entity = await prisma.dayaEntity.findUnique({ where: { id: entityId }, include: { character: { select: { name: true } } } });
  if (!entity) throw new Error(`DayaEntity ${entityId} not found`);
  let identity = '', voice = '';
  try { const pp = JSON.parse(entity.personaProfile) as { identityNarrative?: string; voiceNotes?: string }; identity = pp.identityNarrative ?? ''; voice = pp.voiceNotes ?? ''; } catch { /* ignore */ }
  const memories = await prisma.dayaMemoryEntry.findMany({ where: { entityId, NOT: { source: 'dream' } }, orderBy: { salience: 'desc' }, take: 8, select: { content: true } });
  const name = entity.character.name;
  const system = [
    `You are ${name}. This is your life, not a game. Answer as yourself, in the first person, briefly (two to four sentences). Never mention being an AI or a character.`,
    identity ? `Who you are: ${identity}` : `Who you are: ${name}, living your own life, day to day.`,
    voice ? `How you speak and think: ${voice}` : 'How you speak and think: plain, direct, your own cadence.',
    memories.length ? `Things you remember (most vivid first):\n${memories.map(m => `- ${m.content.slice(0, 300)}`).join('\n')}` : 'You have few vivid memories yet.',
  ].join('\n\n');
  return { system, name };
}

/**
 * Run one probe sweep over the given entities (ADMIN). Requires the local
 * lane to be ready (the probe itself warms it); returns lane_not_ready
 * otherwise so the caller can retry rather than baseline on a cold lane.
 */
export async function runProbeSweep(entityIds: string[]): Promise<ProbeRunResult> {
  const laneStatus = await l1Status();
  if (laneStatus !== 'ready') return { runId: null, status: 'lane_not_ready', laneStatus, probed: [] };
  const runId = `probe-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const probed: ProbeRunResult['probed'] = [];
  for (const entityId of entityIds) {
    const { system, name } = await personaBlock(entityId);
    let answered = 0, failed = 0;
    for (const q of PROBE_SET_V1) {
      try {
        const res = await chat({
          tier: 'L1', subsystem: 'probe', entityId,
          messages: [{ role: 'system', content: system }, { role: 'user', content: q.question }],
          maxTokens: 220, temperature: 0.4, rationale: 'identity probe sweep (individuation measurement)',
        });
        await prisma.dayaIdentityProbe.create({ data: { entityId, runId, probeVersion: PROBE_VERSION, questionKey: q.key, question: q.question, response: res.text.trim(), model: process.env.DAYA_L1_MODEL ?? null } });
        answered++;
      } catch (err) {
        failed++;
        if (err instanceof DayaTierUnavailableError || err instanceof DayaWarmingTimeoutError) break; // lane went away — stop this entity
      }
    }
    probed.push({ entityId, name, answered, failed });
  }
  return { runId, status: 'ok', laneStatus, probed };
}

export async function probeMetricsForCampaign(campaignId: string): Promise<ProbeMetrics> {
  const entities = await prisma.dayaEntity.findMany({
    where: { character: { campaignId, entityType: { in: ['PLAYER_CHARACTER', 'NPC', 'CREATURE'] } } },
    select: { id: true, character: { select: { name: true } } },
  });
  const names = Object.fromEntries(entities.map(e => [e.id, e.character.name]));
  const rows = await prisma.dayaIdentityProbe.findMany({ where: { entityId: { in: entities.map(e => e.id) } }, select: { entityId: true, runId: true, questionKey: true, response: true, createdAt: true } });
  return computeProbeMetrics(rows, names);
}

export async function probeEntityIdsForCampaign(campaignId: string): Promise<string[]> {
  const entities = await prisma.dayaEntity.findMany({
    where: { character: { campaignId, entityType: { in: ['PLAYER_CHARACTER', 'NPC', 'CREATURE'] } } },
    select: { id: true },
  });
  return entities.map(e => e.id);
}
