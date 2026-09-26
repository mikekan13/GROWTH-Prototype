/**
 * Bridge — when a continuity jump is established, the simulation renders
 * everything that would lead up to it (Mike 2026-09-26, ruling point 13:
 * "if a continuity jump is established the simulation must render
 * everything that would lead up to it" — and: "the NPCs would all simulate
 * so the simulation writes it. This is stuff we already covered with time
 * advancing").
 *
 * The Watcher cuts from the stairwell to the inn bar. Once he confirms, the
 * sim owes the record the interval: how the being got there, how long it
 * took, what happened on the way. This runs at RENDER DISTANCE — the jump is
 * off-table, so the interval is simulated at SUMMARY fidelity (one forecast
 * pass over the whole interval, a handful of steps) and recorded in full:
 *   - one parent canon event (kind `continuity`) + one child per step (kind
 *     `bridge`), sourceType `sim`, ranked below the Watcher's declaration
 *     and fluid like everything else — correctable via correctCanon;
 *   - the campaign clock advances by the elapsed time;
 *   - every awake being that made the trip lives it through its own mirror
 *     and remembers it (truthRef → the parent, chain → every step).
 * Any stretch the Watcher later narrates INTO can be expanded to full
 * fidelity (a being loop per step) — that upgrade is not built yet.
 *
 * Nothing here invents outside the sim: the forecast is the sim's Wisdom
 * faculty (REALITY-SIM-DESIGN §prediction engine) applied to the gap.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { chat, DayaTierUnavailableError, DayaWarmingTimeoutError } from '@/daya/model-client';
import { perceive } from '@/daya/perceive';
import { writeMemoryEntry } from '@/daya/memory';
import { classifyDomains } from '@/daya/domains';
import { recordCanonEvent } from '@/services/canon';
import { advanceClock } from '@/services/time';
import { currentCycleOf } from '@/services/history';

export interface BridgeStep {
  /** Diegetic, numberless, third person — what a witness would perceive. */
  narration: string;
  /** Minutes after the interval began. */
  minutesFromStart: number;
  /** Names of the travelling beings this step involves (empty = the world moving on its own). */
  involves: string[];
}

export interface BridgePlan {
  elapsedMinutes: number;
  steps: BridgeStep[];
}

export interface BridgeResult {
  parentEventId: string;
  stepEventIds: string[];
  elapsedMinutes: number;
  memories: number;
  /** false when the forecast model was unavailable and a minimal deterministic bridge was written instead. */
  forecast: boolean;
}

/** [PLACEHOLDER] summary-fidelity bounds — steps per jump and how far a jump may run before it is a scene of its own. */
export const BRIDGE_TUNING = { maxSteps: 6, maxElapsedMinutes: 24 * 60, defaultElapsedMinutes: 20 } as const;

/** Pure: shape-check and bound a forecast the model returned. */
export function parseBridgePlan(text: string, travellers: string[]): BridgePlan | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Partial<BridgePlan>;
  try { j = JSON.parse(m[0]) as Partial<BridgePlan>; } catch { return null; }
  const steps = (Array.isArray(j.steps) ? j.steps : [])
    .filter((s) => s && typeof s.narration === 'string' && s.narration.trim().length > 0)
    .slice(0, BRIDGE_TUNING.maxSteps)
    .map((s, i) => ({
      narration: s.narration.trim().slice(0, 400),
      minutesFromStart: Math.max(0, Math.round(Number.isFinite(Number(s.minutesFromStart)) && s.minutesFromStart !== null && s.minutesFromStart !== undefined ? Number(s.minutesFromStart) : i)),
      involves: (Array.isArray(s.involves) ? s.involves : []).map(String).filter((n) => travellers.includes(n)),
    }))
    .sort((a, b) => a.minutesFromStart - b.minutesFromStart);
  if (steps.length === 0) return null;
  const elapsed = Math.min(BRIDGE_TUNING.maxElapsedMinutes, Math.max(1, Math.round(Number(j.elapsedMinutes) || steps.at(-1)!.minutesFromStart || BRIDGE_TUNING.defaultElapsedMinutes)));
  return { elapsedMinutes: elapsed, steps };
}

/** Pure: the trip as one being would have lived it (its own steps first-person-able, the rest as the world). */
export function tripProseFor(plan: BridgePlan, name: string): string {
  return plan.steps
    .filter((s) => s.involves.length === 0 || s.involves.includes(name))
    .map((s) => s.narration)
    .join(' ');
}

/** When the forecast is unavailable the record still gets no gap: a minimal deterministic bridge. */
export function fallbackPlan(travellers: string[], fromName: string | null, toName: string): BridgePlan {
  const who = travellers.join(' and ') || 'They';
  return {
    elapsedMinutes: BRIDGE_TUNING.defaultElapsedMinutes,
    steps: [
      { narration: `${who} leave${travellers.length === 1 ? 's' : ''} ${fromName ?? 'where they were'}.`, minutesFromStart: 0, involves: travellers },
      { narration: `${who} make${travellers.length === 1 ? 's' : ''} the way to ${toName}.`, minutesFromStart: Math.round(BRIDGE_TUNING.defaultElapsedMinutes / 2), involves: travellers },
      { narration: `${who} arrive${travellers.length === 1 ? 's' : ''} at ${toName}.`, minutesFromStart: BRIDGE_TUNING.defaultElapsedMinutes, involves: travellers },
    ],
  };
}

async function placeSummary(locationId: string | null): Promise<{ name: string | null; description: string }> {
  if (!locationId) return { name: null, description: '' };
  const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { name: true, data: true } });
  if (!loc) return { name: null, description: '' };
  let description = '';
  try { description = String((JSON.parse(loc.data) as { description?: string }).description ?? '').slice(0, 300); } catch { /* none */ }
  return { name: loc.name, description };
}

/** The sim's forecast of the interval. Never throws; null when the model is unavailable. */
async function forecastInterval(args: {
  campaignId: string;
  travellers: Array<{ id: string; name: string }>;
  from: { name: string | null; description: string };
  to: { name: string | null; description: string };
  destinationNarration: string;
}): Promise<BridgePlan | null> {
  const recent = await prisma.canonEvent.findMany({ where: { campaignId: args.campaignId }, orderBy: { createdAt: 'desc' }, take: 8, select: { kind: true, narration: true } });
  const names = args.travellers.map((t) => t.name);
  try {
    const res = await chat({
      tier: 'C', subsystem: 'bridge',
      messages: [
        { role: 'system', content: `You are the simulation of a GROWTH campaign, rendering the interval between two moments the Watcher (GM) cut across. The record must have no gap: forecast, plainly and plausibly, what would lead from where the travellers were to where the Watcher now has them — leaving, the way there, arriving — in at most ${BRIDGE_TUNING.maxSteps} steps. Stay inside the world as recorded; invent no new named people or places; keep it ordinary and physical. Each step is diegetic narration a witness would perceive, third person, present tense, no numbers in the prose. Respond with ONLY JSON: {"elapsedMinutes": number, "steps": [{"narration": string, "minutesFromStart": number, "involves": string[] (names from the travellers list, or [] for the world moving on its own)}]}.` },
        { role: 'user', content: `TRAVELLERS: ${names.join(', ')}\n\nWHERE THEY WERE: ${args.from.name ?? 'nowhere in particular'}${args.from.description ? ` — ${args.from.description}` : ''}\n\nWHERE THE WATCHER NOW HAS THEM: ${args.to.name ?? 'the narrated place'}${args.to.description ? ` — ${args.to.description}` : ''}\n\nTHE RECORD, MOST RECENT LAST:\n${recent.reverse().map((r) => `- [${r.kind}] ${r.narration.slice(0, 200)}`).join('\n') || '(nothing yet)'}\n\nTHE WATCHER'S NEW NARRATION (the moment being cut TO — do not restate it, lead up to it):\n${args.destinationNarration}` },
      ],
      maxTokens: 900, temperature: 0.3,
    });
    return parseBridgePlan(res.text, names);
  } catch (err) {
    if (!(err instanceof DayaTierUnavailableError) && !(err instanceof DayaWarmingTimeoutError)) console.warn('[bridge] forecast failed; deterministic bridge used', err);
    return null;
  }
}

/**
 * Render the interval for a confirmed jump. Call AFTER the travellers have
 * been moved (so the perception composes their new surroundings) and BEFORE
 * the Watcher's narration is written as canon (so the record reads in order).
 */
export async function bridgeContinuity(args: {
  campaignId: string;
  actor: { userId: string; role: string };
  reconciliationId: string;
  travellers: Array<{ id: string; name: string; fromLocationId: string | null }>;
  toLocationId: string | null;
  destinationNarration: string;
}): Promise<BridgeResult | null> {
  if (args.travellers.length === 0) return null;
  const from = await placeSummary(args.travellers[0].fromLocationId);
  const to = await placeSummary(args.toLocationId);
  const names = args.travellers.map((t) => t.name);
  const forecast = await forecastInterval({ campaignId: args.campaignId, travellers: args.travellers, from, to, destinationNarration: args.destinationNarration });
  const plan = forecast ?? fallbackPlan(names, from.name, to.name ?? 'the narrated place');

  // Canon: parent + steps, timestamped across the interval, below the Watcher's declaration.
  const startCycle = await currentCycleOf(args.campaignId);
  const hours = plan.elapsedMinutes / 60;
  let endCycle = startCycle;
  try {
    const clock = await advanceClock(args.campaignId, args.actor.userId, args.actor.role, { amount: Math.max(hours, 1 / 60), unit: 'hour', note: `Continuity bridge (reconciliation ${args.reconciliationId}): ${plan.elapsedMinutes} minutes pass between ${from.name ?? 'where they were'} and ${to.name ?? 'the narrated place'}` });
    endCycle = (clock as { currentCycle?: number }).currentCycle ?? (await currentCycleOf(args.campaignId));
  } catch (err) {
    console.warn('[bridge] clock advance failed; bridge recorded at the current cycle', err);
  }
  const span = Math.max(0, endCycle - startCycle);
  const parent = await recordCanonEvent({
    campaignId: args.campaignId, cycle: startCycle, seq: 0, kind: 'continuity',
    locationId: args.travellers[0].fromLocationId, narration: `Between ${from.name ?? 'where they were'} and ${to.name ?? 'the narrated place'}: ${describeMinutes(plan.elapsedMinutes)} pass.`,
    detail: { reconciliationId: args.reconciliationId, elapsedMinutes: plan.elapsedMinutes, lod: 'summary', forecast: !!forecast, travellers: names },
    sourceType: 'sim', sourceId: args.reconciliationId,
  });
  const stepIds: string[] = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    const at = plan.elapsedMinutes > 0 ? startCycle + span * (s.minutesFromStart / plan.elapsedMinutes) : startCycle;
    const involved = args.travellers.filter((t) => s.involves.includes(t.name));
    const row = await recordCanonEvent({
      campaignId: args.campaignId, cycle: at, seq: i + 1, kind: 'bridge', parentId: parent.id,
      locationId: i === plan.steps.length - 1 ? args.toLocationId : args.travellers[0].fromLocationId,
      actorId: involved[0]?.id ?? null, narration: s.narration,
      detail: { minutesFromStart: s.minutesFromStart, involves: s.involves, lod: 'summary' },
      sourceType: 'sim', sourceId: args.reconciliationId, domains: classifyDomains(s.narration).all,
    });
    stepIds.push(row.id);
  }

  // The travellers live it — through their own mirrors, at summary fidelity.
  let memories = 0;
  for (const t of args.travellers) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: t.id }, select: { id: true } });
    if (!entity) continue;
    const prose = tripProseFor(plan, t.name);
    if (!prose) continue;
    try {
      const p = await perceive(t.id, args.campaignId, prose, 'perception');
      await writeMemoryEntry({
        entityId: entity.id, narrativeCycle: endCycle, source: 'perception', content: p.prose,
        valence: 0, arousal: 0.3, salience: 0.45,
        classification: { kind: 'bridge', lod: 'summary', canonEventId: parent.id, mirror: { fidelityLevel: p.fidelityLevel, distortions: p.distortions, locationId: p.locationId, truthLines: p.truthLines, observer: p.observer } },
        truthRef: parent.id,
        chain: { truthRefs: [parent.id, ...stepIds], locationId: args.toLocationId, entities: args.travellers.filter((o) => o.id !== t.id).map((o) => o.id) },
      });
      memories++;
    } catch (err) { console.warn('[bridge] traveller memory failed', t.name, err); }
  }
  console.log(`[bridge] ${args.reconciliationId}: ${plan.steps.length} steps over ${plan.elapsedMinutes} min, ${memories} memories, forecast=${!!forecast}`);
  return { parentEventId: parent.id, stepEventIds: stepIds, elapsedMinutes: plan.elapsedMinutes, memories, forecast: !!forecast };
}

export function describeMinutes(min: number): string {
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` and ${m} minutes` : ''}`;
}
