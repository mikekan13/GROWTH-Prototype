/**
 * Branch planning — an uncontrolled entity plans its round the way a human
 * player does (Mike 09-05: "think about how a human plays GROWTH — an entity
 * is doing the same thing, they just don't see it as a game").
 *
 * Input: the entity's raw sensory field, its (believed) capabilities, its
 * goals, and its per-pillar action pools. Output: explicit per-pillar
 * intentions — the same structured allocation a player submits.
 *
 * Two paths:
 *  - MODEL (local lane, L1) when DAYA is enabled: one call, strict JSON.
 *  - HEURISTIC fallback (reality default): a hostile in view → attack with the
 *    best usable skill from a Body action; keep a Negate readied if a skill
 *    can; hold the rest in reserve. Used when the lane is off/unavailable or
 *    the model's plan fails validation. Never throws — a being always acts.
 */
import 'server-only';
import type { Intention, IntentionKind, Participant, Pillar } from '../round/types';
import type { SensoryField } from '../senses/field';
import { PILLARS } from '../round/types';
import { skillUsableFromPillar } from '../round/action-economy';
import { chat, DayaTierUnavailableError, DayaWarmingTimeoutError } from '@/daya/model-client';
import { isDayaEnabled } from '@/daya/events';
import { l1Status } from '@/daya/l1-warm';

export interface PlanInput {
  self: Participant;
  field: SensoryField;
  goals: string[];
  /** DayaEntity id for metering, if the participant has one. */
  entityId?: string;
  /** Persona lines from the entity's profile (identity narrative / voice notes) — v0 passthrough. */
  persona?: { identity?: string | null; voice?: string | null };
  seed?: number;
}

export interface PlanResult {
  intentions: Intention[];
  source: 'model' | 'heuristic';
  note?: string;
}

const KINDS: IntentionKind[] = ['attack', 'skill', 'move', 'negate', 'block', 'reserve'];

function makeId(participantId: string, n: number) {
  return `${participantId}-r-${n}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Best skill usable from a pillar (highest level), or null. */
function bestSkillFor(self: Participant, pillar: Pillar) {
  return self.skills.filter(s => skillUsableFromPillar(s, pillar)).sort((a, b) => b.level - a.level)[0] ?? null;
}

export function heuristicPlan(input: PlanInput): PlanResult {
  const { self, field } = input;
  const foes = field.visible.filter(v => v.side !== self.side && !v.downed);
  const target = foes[0] ?? null;
  const out: Intention[] = [];
  let n = 0;
  let negateReadied = false;
  for (const pillar of PILLARS) {
    for (let a = 0; a < self.pools[pillar]; a++) {
      const skill = bestSkillFor(self, pillar);
      if (target && pillar === 'body') {
        out.push({
          id: makeId(self.id, n++), participantId: self.id, pillar, kind: 'attack',
          description: skill ? `attacks ${target.name} with ${skill.name}` : `strikes at ${target.name}`,
          skillName: skill?.name, targetId: target.id, damageType: 'bashing', baseDamage: 2,
          redirectTo: self.heldResist > 0 ? 'held' : undefined,
        });
      } else if (target && !negateReadied && skill) {
        negateReadied = true;
        out.push({
          id: makeId(self.id, n++), participantId: self.id, pillar, kind: 'negate',
          description: `readies to negate ${target.name} with ${skill.name}`, skillName: skill.name, targetId: target.id,
        });
      } else {
        out.push({ id: makeId(self.id, n++), participantId: self.id, pillar, kind: 'reserve', description: 'keeps an action in hand' });
      }
    }
  }
  return { intentions: out, source: 'heuristic' };
}

function planPrompt(input: PlanInput): { system: string; user: string } {
  const { self, field, goals } = input;
  const skills = self.skills.map(s => `${s.name} (lvl ${s.level}; governors ${s.governors.join('/')})`).join('; ') || 'none';
  const system = [
    `You are ${self.name}. This is your life, not a game. You are in a fight or a tense moment and must decide what you do in the next six seconds.`,
    input.persona?.identity ? `Who you are: ${input.persona.identity}` : '',
    input.persona?.voice ? `How you think: ${input.persona.voice}` : '',
    `You can do exactly these actions this round — Body: ${self.pools.body}, Spirit: ${self.pools.spirit}, Soul: ${self.pools.soul}. Each action is one line of intent.`,
    `Your skills: ${skills}. A skill can be used from any pillar one of its governors belongs to.`,
    goals.length ? `What you want: ${goals.join(' | ')}` : 'You have no particular goal beyond getting through this.',
    `Kinds: attack (needs targetId; add damageType bashing|slashing|piercing and baseDamage 1-4), skill (a check; describe it), move, negate (ready a skill to fully avoid a named attacker; skillName required), block (spend an action to interpose your held item against a named attacker), reserve (keep the action in hand).`,
    `Answer ONLY with JSON: {"intentions":[{"pillar":"body|spirit|soul","kind":"...","description":"...","skillName":"...","targetId":"...","damageType":"...","baseDamage":2}], "redirectTo":"held"|null}. Exactly ${self.pools.body} body, ${self.pools.spirit} spirit, ${self.pools.soul} soul entries.`,
  ].filter(Boolean).join('\n');
  const user = `What you perceive:\n${field.text}\n\nPeople here (id → name, side): ${field.visible.map(v => `${v.id} → ${v.name} (${v.side}${v.downed ? ', down' : ''})`).join('; ') || 'no one'}\nYou are on side "${self.side}".`;
  return { system, user };
}

function validateModelPlan(raw: string, input: PlanInput): Intention[] | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  let parsed: { intentions?: unknown; redirectTo?: unknown };
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(parsed.intentions)) return null;
  const { self, field } = input;
  const visibleIds = new Set(field.visible.map(v => v.id));
  const counts: Record<Pillar, number> = { body: 0, spirit: 0, soul: 0 };
  const out: Intention[] = [];
  let n = 0;
  const redirectTo = parsed.redirectTo === 'held' && self.heldResist > 0 ? 'held' : undefined;
  for (const item of parsed.intentions as Array<Record<string, unknown>>) {
    const pillar = item.pillar as Pillar;
    const kind = item.kind as IntentionKind;
    if (!PILLARS.includes(pillar) || !KINDS.includes(kind)) return null;
    if (counts[pillar] >= self.pools[pillar]) continue; // over-allocation: drop extras
    counts[pillar]++;
    const skillName = typeof item.skillName === 'string' && self.skills.some(s => s.name === item.skillName) ? item.skillName : undefined;
    if (skillName && !skillUsableFromPillar(self.skills.find(s => s.name === skillName)!, pillar)) return null;
    const targetId = typeof item.targetId === 'string' && visibleIds.has(item.targetId) ? item.targetId : undefined;
    if ((kind === 'attack' || kind === 'negate') && !targetId) return null;
    if (kind === 'negate' && !skillName) return null;
    const dt = item.damageType;
    out.push({
      id: makeId(self.id, n++), participantId: self.id, pillar, kind,
      description: typeof item.description === 'string' ? item.description.slice(0, 200) : kind,
      skillName, targetId,
      damageType: kind === 'attack' ? (dt === 'slashing' || dt === 'piercing' || dt === 'bashing' ? dt : 'bashing') : undefined,
      baseDamage: kind === 'attack' ? Math.min(4, Math.max(1, Number(item.baseDamage) || 2)) : undefined,
      redirectTo,
    });
  }
  // Fill any unallocated actions with reserve so the count is exact.
  for (const pillar of PILLARS) {
    while (counts[pillar] < self.pools[pillar]) {
      counts[pillar]++;
      out.push({ id: makeId(self.id, n++), participantId: self.id, pillar, kind: 'reserve', description: 'keeps an action in hand', redirectTo });
    }
  }
  return out;
}

export async function planRound(input: PlanInput): Promise<PlanResult> {
  if (!isDayaEnabled()) return { ...heuristicPlan(input), note: 'DAYA disabled — heuristic plan' };
  // A cold serverless lane must never stall the table: probe (5 s, and the
  // probe itself spins the worker up); plan on the model only when it is
  // ready, otherwise the reflex heuristic acts and the GM sees why.
  const lane = await l1Status();
  if (lane !== 'ready') return { ...heuristicPlan(input), note: `local lane ${lane} — heuristic used` };
  try {
    const { system, user } = planPrompt(input);
    const res = await chat({
      tier: 'L1',
      subsystem: 'sim.plan',
      entityId: input.entityId,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      maxTokens: 600,
      temperature: 0.6,
      rationale: 'reality-sim round planning (Unit 1)',
    });
    const intentions = validateModelPlan(res.text, input);
    if (intentions) return { intentions, source: 'model' };
    return { ...heuristicPlan(input), note: 'model plan failed validation — heuristic used' };
  } catch (err) {
    const why = err instanceof DayaTierUnavailableError ? 'local lane unavailable'
      : err instanceof DayaWarmingTimeoutError ? 'local lane warming'
      : (err as Error)?.message ?? 'planner error';
    return { ...heuristicPlan(input), note: `${why} — heuristic used` };
  }
}
