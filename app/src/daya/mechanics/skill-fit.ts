/**
 * Skill-specificity semantic DR fit — persona harness mechanics coupling.
 *
 * A narrower, on-target skill beats a broad one at the same nominal level
 * (Mountain Climbing 5 on a mountain beats Athletics 5): this is an
 * LLM-native judgment call, not a table lookup. Flow:
 *
 *  1. selectCandidateSkills() — code-only prefilter: which of the entity's
 *     skills plausibly apply to the declared intent at all (keyword overlap).
 *     Empty result = untrained; the caller takes the unskilled-check path
 *     (the adjudicator already handles that at full DR).
 *  2. judgeSkillFit() — a small/haiku-class judge call (subsystem
 *     `skill_fit`, tier C) rates the single best-matching candidate's fit
 *     0..1 against the task. This is machinery-zone: the judge's reasoning
 *     never reaches the entity (Ruling 13) — only the resulting DR number
 *     does, through the ordinary roll math.
 *  3. drAdjust = round( (fit - 0.5) * SPECIFICITY_SWING ) — high fit LOWERS
 *     effective DR (easier), poor fit RAISES it. Applied by the caller
 *     (resolve.ts) as `dr - drAdjust`.
 *
 * Routed like the Adjudicator (tier C, direct `chat()`, not routeAndChat) —
 * this is an infra/machinery call, not entity-voiced cognition, so WP6's
 * difficulty-gated consult matrix doesn't apply. It still crosses the
 * sanitization boundary (WP6) before leaving for C, same discipline as
 * anything else headed to the cloud.
 */
import 'server-only';
import { chat, type DayaClientOverrides } from '../model-client';
import { stripAndForward, assertClean } from '../sanitize';
import { ROUTER_TUNING } from '../router';
import { stemmedJaccard } from '../recall';

/** How strongly fit swings effective DR — TUNABLE. fit=1 -> -SWING/2 to DR (easier); fit=0 -> +SWING/2 (harder). */
export const SPECIFICITY_SWING = 6;

/** Below this stemmed-Jaccard score against the intent, a skill isn't considered a plausible candidate at all. */
const CANDIDATE_KEYWORD_FLOOR = 0.05;
const MAX_CANDIDATES = 6;

export interface SkillCandidate {
  name: string;
  level: number;
  governors: string[];
}

export interface SkillFitResult {
  /** null when untrained (no plausible candidate) — caller takes the unskilled path. */
  skill: string | null;
  level: number;
  fit: number; // 0..1; 0 when untrained
  reason: string;
  drAdjust: number; // round((fit-0.5)*SPECIFICITY_SWING); 0 when untrained
  governors: string[];
}

const UNTRAINED_RESULT: SkillFitResult = { skill: null, level: 0, fit: 0, reason: 'no applicable skill', drAdjust: 0, governors: [] };

/**
 * Code-only prefilter (WP8 spec step 1) — no model call. Scores every skill
 * against the intent via the same stemmed-keyword Jaccard recall.ts already
 * uses for relevance, keeps anything above the floor, sorts best-first, caps
 * at MAX_CANDIDATES so the judge prompt stays small.
 */
export function selectCandidateSkills(intent: string, skills: SkillCandidate[]): SkillCandidate[] {
  const scored = skills
    .map((s) => ({ skill: s, score: stemmedJaccard(intent, s.name) }))
    .filter((s) => s.score >= CANDIDATE_KEYWORD_FLOOR)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CANDIDATES).map((s) => s.skill);
}

interface ParsedFit {
  skill: string;
  fit: number;
  reason: string;
}

function parseFitJson(raw: string): ParsedFit | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.skill !== 'string' || typeof parsed.fit !== 'number') return null;
    return {
      skill: parsed.skill,
      fit: Math.min(1, Math.max(0, parsed.fit)),
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch {
    return null;
  }
}

function buildJudgePrompt(): string {
  return `You judge how well ONE skill fits a declared physical/social task, for a
tabletop-style resolution engine. Narrower, more on-target skills fit BETTER
than broad ones even at the same nominal level (e.g. "Mountain Climbing" beats
"Athletics" on an actual mountain; "Athletics" beats an unrelated skill).
Pick the SINGLE best-matching skill from the list and rate its fit 0..1 (1 =
exactly on-target, 0.5 = generically applicable, 0 = barely relevant).
Output ONLY JSON: {"skill","fit","reason"}. "reason" is a short internal note
— it is never shown to anyone, so be plain and mechanical.`;
}

/** Deterministic fallback when the judge is unavailable/unparseable/blocked —
 * picks the highest-prefiltered candidate at a neutral fit (no DR adjustment),
 * never blocking resolution on a judge hiccup. */
function fallbackNeutral(candidates: SkillCandidate[]): SkillFitResult {
  if (candidates.length === 0) return UNTRAINED_RESULT;
  const best = candidates[0];
  return { skill: best.name, level: best.level, fit: 0.5, reason: 'judge unavailable — neutral fallback', drAdjust: 0, governors: best.governors };
}

/**
 * Judges the best-fitting skill for a declared task among prefiltered
 * candidates. Never throws — any failure (network, parse, sanitize hard-fail)
 * degrades to fallbackNeutral rather than blocking a check from resolving.
 */
export async function judgeSkillFit(
  taskDescription: string,
  candidates: SkillCandidate[],
  overrides: DayaClientOverrides = {},
  entityId?: string,
): Promise<SkillFitResult> {
  if (candidates.length === 0) return UNTRAINED_RESULT;

  const listing = candidates.map((c) => `${c.name} (level ${c.level}, governs ${c.governors.join('/')})`).join('\n');
  const messages = [
    { role: 'system' as const, content: buildJudgePrompt() },
    { role: 'user' as const, content: `Task: ${taskDescription}\n\nCandidate skills:\n${listing}` },
  ];

  try {
    // Sanitization boundary (WP6): no known identifiers to tokenize here
    // (this call carries only skill names + task text, not character/place
    // names), but the hard-fail sweep still runs for defense in depth.
    const stripped = messages.map((m) => ({ ...m, content: stripAndForward(m.content, []).text }));
    const cleanliness = assertClean(stripped.map((m) => m.content).join('\n'), []);
    if (!cleanliness.clean) {
      console.warn('[daya/skill-fit] assert-clean hard-fail — falling back to neutral fit');
      return fallbackNeutral(candidates);
    }

    const result = await chat(
      {
        tier: 'C',
        subsystem: 'skill_fit',
        entityId,
        messages: stripped,
        maxTokens: 200,
        temperature: 0,
        model: ROUTER_TUNING.cModelHaiku,
        sanitized: true,
      },
      overrides,
    );

    const parsed = parseFitJson(result.text);
    if (!parsed) return fallbackNeutral(candidates);

    const matched = candidates.find((c) => c.name.toLowerCase() === parsed.skill.toLowerCase()) ?? candidates[0];
    const drAdjust = Math.round((parsed.fit - 0.5) * SPECIFICITY_SWING);
    return { skill: matched.name, level: matched.level, fit: parsed.fit, reason: parsed.reason, drAdjust, governors: matched.governors };
  } catch (err) {
    console.error('[daya/skill-fit] judge call failed (falling back to neutral fit):', err);
    return fallbackNeutral(candidates);
  }
}
