/**
 * ACTIVE INSPECTION — the pure core (perception unit 11, Mike 2026-10-09).
 *
 * Rulings: "Those are just unskilled and skilled checks." With a skill → a
 * standard skilled check; no skill → a standard unskilled check, blind effort
 * from Wisdom. "Margin over DR sets how far aspects climb; failure = no gain,
 * a bad failure can leave a wrong impression (F0 'wrong')." A skill reveals
 * the aspects in its own domains deeply and can FLAG adjacent facts ("it's a
 * relic") without revealing them. Wit effort draws on related knowledge —
 * only where the perceiver has some familiarity with the domain. Raw Wisdom
 * cannot reach a domain with zero exposure.
 *
 * Who picks the skill (Q11): the player names it, or the GM does, or the
 * system picks it (domain match) — the service decides; this file only parses
 * the player's words and plans the familiarity writes. Pure, no I/O.
 */
import { aspectDomains, type HeadDomainKey } from './aspects';

/**
 * TUNING NUMBERS — placeholders until a live run (same status as
 * FAMILIARITY_TUNING). Each inspect step is FAMILIARITY_TUNING.step.inspect.
 */
export const INSPECT_TUNING = {
  /** DR when neither the chip nor the GM sets one. */
  defaultDr: 10,
  /** Every this-many points of margin over DR = one more inspect step. */
  marginPerStep: 3,
  maxSteps: 4,
  /** A strong skilled result (margin ≥ this) flags adjacent-domain aspects at F1. */
  relicMargin: 6,
  /** The F1 floor the flag lifts an unknown adjacent aspect to (scoreToFidelity(0.2) = 1). */
  relicScore: 0.2,
  /** A bad failure (margin ≤ this) leaves a WRONG impression on one unknown aspect in reach. */
  wrongMargin: -6,
  /** "Some" familiarity with a domain (the being's best score on any aspect tagged with it). */
  exposureMin: 0.05,
} as const;

// ── The player's words ────────────────────────────────────────────────────

export interface InspectIntentText {
  /** What they inspect, as said ("the sword", "Ruth's ring"). */
  target: string;
  /** The skill they named ("with my swordsmanship"), or null — the GM / system picks. */
  skill: string | null;
}

const VERB = /\b(?:inspect|examine|scrutini[sz]e|appraise|study|look\s+(?:closely\s+)?(?:at|over)|take\s+a\s+(?:close|closer|good)\s+look\s+at|check\s+out)\b/i;
const LEAD = /^(?:i|i'd|i'll|i\s+want\s+to|i\s+would\s+like\s+to|let\s+me|can\s+i)\b/i;

/**
 * "I inspect the sword", "I examine the map using my Cartography skill",
 * "I want to use my swordsmanship skill to inspect this sword". First person
 * only (a GM's narration "she inspects…" is not a player's intent). Pure.
 */
export function detectInspectIntent(text: string): InspectIntentText | null {
  const t = text.trim().replace(/^\*+|\*+$/g, '').replace(/^::|::$/g, '').trim();
  if (!t || t.length > 300 || !LEAD.test(t)) return null;
  // "use my X (skill) to inspect Y"
  const useFirst = t.match(/\buse\s+(?:my\s+)?(.+?)(?:\s+skill)?\s+to\s+(?:inspect|examine|scrutini[sz]e|appraise|study|look\s+(?:closely\s+)?(?:at|over))\s+(.+?)[.!?]*$/i);
  if (useFirst) return { target: cleanTarget(useFirst[2]), skill: cleanSkill(useFirst[1]) };
  const m = t.match(VERB);
  if (!m || m.index === undefined) return null;
  const rest = t.slice(m.index + m[0].length).trim();
  const withSkill = rest.match(/^(.+?)\s+(?:with|using)\s+(?:my\s+)?(.+?)(?:\s+skill)?[.!?]*$/i);
  const target = cleanTarget(withSkill ? withSkill[1] : rest);
  if (!target) return null;
  return { target, skill: withSkill ? cleanSkill(withSkill[2]) : null };
}

function cleanTarget(s: string): string {
  return s.replace(/[.!?]+$/, '').replace(/^(?:the|this|that|a|an|my|his|her|their)\s+/i, '').trim();
}
function cleanSkill(s: string): string | null {
  const k = s.replace(/[.!?]+$/, '').replace(/\s+skill$/i, '').trim();
  return k && !/^(?:eyes|hands|senses)$/i.test(k) ? k : null;
}

// ── The plan ──────────────────────────────────────────────────────────────

export interface InspectAspect { key: string; domains: HeadDomainKey[] }

export interface InspectPlanInput {
  /** The subject's aspects with their domain tags (aspectDomains). */
  aspects: InspectAspect[];
  /** Head domains the chosen skill reaches (relevance ≥ cut-off); [] for an unskilled check. */
  skillDomains: readonly string[];
  /** The perceiver's familiarity per head domain (exposureByDomain). */
  exposure: Partial<Record<string, number>>;
  /** The perceiver's current score (faded) per aspect of THIS subject; absent = never met. */
  current: Record<string, number>;
}

export interface InspectOutcomeIn {
  success: boolean;
  margin: number;
  skilled: boolean;
  /** Effort wagered from Wit (0 when the check did not allow it). */
  witEffort: number;
}

export type InspectWrite =
  | { aspectKind: string; op: 'grow'; times: number; why: 'skill' | 'wisdom' | 'wit' }
  | { aspectKind: string; op: 'flag'; score: number }
  | { aspectKind: string; op: 'wrong' };

/** Inspect steps for a margin over DR: 1 at DR, +1 per marginPerStep, capped. Pure. */
export function inspectSteps(margin: number): number {
  return Math.max(1, Math.min(INSPECT_TUNING.maxSteps, 1 + Math.floor(Math.max(0, margin) / INSPECT_TUNING.marginPerStep)));
}

const exposed = (a: InspectAspect, exposure: InspectPlanInput['exposure']) => a.domains.some((d) => (exposure[d] ?? 0) >= INSPECT_TUNING.exposureMin);

/**
 * What one inspection writes to the inspector's familiarity. Pure.
 * - Skilled success: aspects in the skill's domains grow `inspectSteps(margin)` inspect steps;
 *   other aspects: Wit effort → one step where the domain has some exposure, else a strong
 *   result (margin ≥ relicMargin) flags them at F1 (never higher, never lowering).
 * - Unskilled success (raw Wisdom): aspects with some exposure in their domains grow; a domain
 *   with zero exposure gets nothing (Wit, if it was wagered, adds nothing beyond that).
 * - Failure: nothing; a bad failure (margin ≤ wrongMargin) marks ONE unknown aspect in reach
 *   as a wrong impression.
 */
export function planInspection(input: InspectPlanInput, out: InspectOutcomeIn): InspectWrite[] {
  const skillSet = new Set(input.skillDomains);
  const inReach = (a: InspectAspect) => (out.skilled ? a.domains.some((d) => skillSet.has(d)) : exposed(a, input.exposure));
  if (!out.success) {
    if (out.margin > INSPECT_TUNING.wrongMargin) return [];
    const target = input.aspects.find((a) => a.key !== 'identity' && inReach(a) && (input.current[a.key] ?? 0) < INSPECT_TUNING.relicScore);
    return target ? [{ aspectKind: target.key, op: 'wrong' }] : [];
  }
  const steps = inspectSteps(out.margin);
  const writes: InspectWrite[] = [];
  for (const a of input.aspects) {
    if (inReach(a)) {
      writes.push({ aspectKind: a.key, op: 'grow', times: steps, why: out.skilled ? 'skill' : 'wisdom' });
    } else if (out.skilled && out.witEffort > 0 && exposed(a, input.exposure)) {
      writes.push({ aspectKind: a.key, op: 'grow', times: 1, why: 'wit' });
    } else if (out.skilled && out.margin >= INSPECT_TUNING.relicMargin && (input.current[a.key] ?? 0) < INSPECT_TUNING.relicScore) {
      writes.push({ aspectKind: a.key, op: 'flag', score: INSPECT_TUNING.relicScore });
    }
  }
  return writes;
}

/**
 * "Exposure to a domain" = the being's aggregate familiarity with that domain (Mike Q4): here the best
 * (faded) score it holds on any aspect tagged with the domain, across everything it knows. Pure.
 */
export function exposureByDomain(rows: Array<{ aspectKind: string; score: number }>): Partial<Record<HeadDomainKey, number>> {
  const out: Partial<Record<HeadDomainKey, number>> = {};
  for (const r of rows) {
    for (const d of aspectDomains(r.aspectKind)) out[d] = Math.max(out[d] ?? 0, r.score);
  }
  return out;
}
