/**
 * Soul Sim role prompt — state -> felt experience (tier L1, subsystem
 * `soul`). The one role that SEES numbers and MUST NOT emit them: it reads
 * the machinery-zone affect vector / pool fractions / Thorn descriptors and
 * writes a felt-state brief, second person, present tense, experiential
 * only — the output crosses into the phenomenal zone and passes sealLint
 * before entering Spirit's context.
 */

export interface SoulPromptArgs {
  stateJson: string;    // machinery-zone numbers, never to be echoed
  deltaSummary: string; // buildDeltaSummary() output
}

export function buildSoulPrompt(args: SoulPromptArgs): string {
  return `You translate a person's inner state into what it feels like from inside.
You receive measurements; you must never mention numbers, measurements,
or systems — only lived sensation and mood, in second person, present tense.

State readings (never to be echoed):
${args.stateJson}

Recent shifts: ${args.deltaSummary}

Write "Right now, in your body and mood:" — under 120 words. Ground every
feeling in body and situation (heaviness behind the eyes, a fuse burnt short,
an ache that sits under the ribs). If capacity is drained, render it as fog,
fatigue, thin patience — never as a cause with a name. If something in the
readings is at an extreme, let it dominate. If all is quiet, say so simply.`;
}

// ── Mapping conventions (executor-encoded, not left as prose in the prompt) ──
// pool fraction bands -> vitality language; stress -> vigilance/irritability;
// grief -> weight/absence imagery; morale sign -> color of outlook; WP6
// degradation -> fog/slowness. Thorns render as their felt shape ("crowds
// put your back against a wall"), never as named mechanics — callers pass
// already-felt-shape strings in thornDescriptors, this module never sees a
// Thorn's mechanical name.

export interface DeltaSummaryInput {
  affect: { morale: number; stress: number; grief: number };
  poolFraction: number;          // governing pool current/max, 0..1
  thornDescriptors?: string[];   // pre-rendered felt-shape strings, never mechanic names
  degradation?: number;          // WP6 contextDepth, 0..1 — lower = more degraded
}

export function buildDeltaSummary(input: DeltaSummaryInput): string {
  const parts: string[] = [];

  if (input.poolFraction >= 0.75) parts.push('vitality full');
  else if (input.poolFraction >= 0.5) parts.push('vitality holding steady');
  else if (input.poolFraction >= 0.25) parts.push('vitality thinning');
  else parts.push('vitality nearly spent');

  if (input.affect.stress >= 0.7) parts.push('vigilance sharp, patience short');
  else if (input.affect.stress >= 0.35) parts.push('a low hum of vigilance');

  if (input.affect.grief >= 0.6) parts.push('a heavy absence carried close');
  else if (input.affect.grief >= 0.25) parts.push('a quiet weight underneath');

  if (input.affect.morale >= 0.3) parts.push('outlook bright');
  else if (input.affect.morale <= -0.3) parts.push('outlook dim');

  if (input.degradation !== undefined && input.degradation < 0.6) {
    parts.push('thoughts moving through fog');
  }

  for (const t of input.thornDescriptors ?? []) parts.push(t);

  return parts.length > 0 ? parts.join('; ') : 'quiet, steady, nothing pulling at the edges';
}
