/**
 * Body Interface role prompts — intent <-> world (tier L1 short-context,
 * subsystem `body`). Two directions:
 *
 *  Outward: Spirit's plain-language `Do:` intent -> structured JSON for the
 *  Adjudicator. Machinery-zone output (JSON, not prose) — never itself
 *  judges outcomes, that's the Adjudicator's job.
 *
 *  Inward: an adjudication's experienceEvent -> sensation prose. This
 *  crosses into the phenomenal zone and must pass sealLint before reaching
 *  Spirit.
 */

// ── Outward: intent -> structured JSON ─────────────────────────────────────

export type EffortContext = 'casual' | 'deliberate' | 'straining';

export interface BodyOutwardFact {
  subjectKey: string;
  fact: string;
}

export interface BodyOutwardPromptArgs {
  intent: string; // Spirit's plain-language Do: content
  facts: BodyOutwardFact[];
}

export function buildBodyOutwardPrompt(args: BodyOutwardPromptArgs): string {
  const factsBlock = args.facts.length > 0
    ? args.facts.map((f) => `${f.subjectKey}: ${f.fact}`).join('\n')
    : '(no established facts yet)';

  return `Turn a person's intended action into a precise physical description.
Input: what they mean to do, and the established facts of the place.
Output ONLY JSON: {"intent","subjectKeys","effortContext"}.
The intent must be physically specific (what body part, what object, what
direction), third person, one action only. Choose subjectKeys strictly from
the provided facts; if the action targets something with no established fact,
keep it in "intent" and leave it out of subjectKeys.

Intended action: ${args.intent}

Established facts:
${factsBlock}`;
}

export interface BodyOutwardResult {
  intent: string;
  subjectKeys: string[];
  effortContext: EffortContext;
}

function isEffortContext(v: unknown): v is EffortContext {
  return v === 'casual' || v === 'deliberate' || v === 'straining';
}

/** Defensive parse — returns null on any shape mismatch, never throws.
 * Callers fall back to a conservative default (casual, no subjectKeys). */
export function parseBodyOutwardResponse(raw: string): BodyOutwardResult | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.intent !== 'string' || parsed.intent.trim().length === 0) return null;
    const subjectKeys = Array.isArray(parsed.subjectKeys)
      ? parsed.subjectKeys.filter((s): s is string => typeof s === 'string')
      : [];
    const effortContext = isEffortContext(parsed.effortContext) ? parsed.effortContext : 'casual';
    return { intent: parsed.intent, subjectKeys, effortContext };
  } catch {
    return null;
  }
}

// ── Inward: outcome -> sensation prose ─────────────────────────────────────

export type OutcomeBand = 'cleanly' | 'barely' | 'not-quite' | 'badly';

/** Maps a roll's success + margin (total - dr) into the felt outcome-band
 * word the inward prompt anchors to. When there's no roll (no check), the
 * caller derives a band from the experienceEvent's own valence instead. */
export function outcomeBandFor(success: boolean, margin: number): OutcomeBand {
  if (success) return margin >= 4 ? 'cleanly' : 'barely';
  return margin <= -4 ? 'badly' : 'not-quite';
}

export interface BodyInwardPromptArgs {
  outcomeBand: OutcomeBand;
  experienceContent: string;
}

export function buildBodyInwardPrompt(args: BodyInwardPromptArgs): string {
  return `Turn an event outcome into what a person feels and perceives, second person,
present tense, under 60 words. Senses first (weight, sound, temperature,
balance), then the immediate emotional edge. Never explain causes in system
terms; the world simply behaves. Outcome went: ${args.outcomeBand}.
Event: ${args.experienceContent}`;
}
