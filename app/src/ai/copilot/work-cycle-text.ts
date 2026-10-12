/**
 * The prompt text one DAYA work cycle hands JEWL (work-loop.ts). Pure.
 *
 * It carries the session's plan verbatim — for a character genesis that is
 * the whole backstory (character-genesis-plan.ts). The text is dispatched as
 * source JEWL_WORK_CYCLE, class FICTION (content-class.ts), so on a cloud
 * lane it crosses only through route() → toneFilter → assertNoTableContent.
 */
import { buildProdSections } from '@/services/character-genesis-plan';

export interface WorkCycleSession {
  id: string;
  goal: string;
  plan: string | null;
  cycleCount: number;
}

export function buildWorkCycleText(session: WorkCycleSession, treasuryLine: string, recentNotes: string[]): string {
  return [
    `[SYSTEM] Work cycle ${session.cycleCount + 1} — work session ${session.id}.`,
    `GOAL: ${session.goal}`,
    session.plan ? `YOUR PLAN: ${session.plan}` : 'YOUR PLAN: (none recorded — set one via update_work_session if useful)',
    ...(treasuryLine ? [treasuryLine] : []),
    recentNotes.length
      ? `YOUR RECENT PROGRESS NOTES:\n${recentNotes.map(n => `- ${n}`).join('\n')}`
      : 'No progress notes yet — this is the first working cycle.',
    'Continue THIS job now: do the next concrete piece of work with your tools, then record ONE progress line via update_work_session. ' +
      'Check the recent conversation — if the GM said anything since your last cycle, let it steer you. ' +
      'If you are waiting on the GM (Forge approvals, an unanswered load-bearing question), set status=blocked with the reason and stop. ' +
      'When the job is genuinely COMPLETE, set status=done and tell the GM in 2-3 lines what stands ready — never an inventory; one Forge pointer if drafts wait.',
  ].join('\n');
}

// ── Genesis is a dialogue (Mike 2026-10-12) ─────────────────────────────
// [[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]]: a genesis opens
// in stage PRODDING. Its cycles have ONE job — read the seed, raise prods to
// the GM, end the round. Only the GM's Build moves the session on.

/** The only tools a PRODDING cycle may call (runtime enforces it). */
export const PROD_STAGE_TOOLS = ['raise_prod', 'end_prod_round'] as const;

/** A prod as a cycle reads it (GenesisProd row fields). */
export interface CycleProd {
  id: string;
  round: number;
  order: number;
  anchorQuote: string;
  question: string;
  why: string;
  kind: string;
  status: string;
  answer: string | null;
  jewlFill: string | null;
}

/** The law of the prod stage — carried verbatim in every PRODDING cycle. */
export const PROD_LAW = [
  'THE LAW OF THIS STAGE:',
  '- The GM is the storyteller. You are the production crew, NOT a co-author. The story stays the GM\'s and the players\'.',
  '- ASK about creative / authorial gaps: who, why, what happened, what it means.',
  '- DO NOT ask about mechanical or derivative matters — stats, KV, the consequences of facts already settled, catalog lookups. You will handle those yourself in the build.',
  '- Prefer gaps that are load-bearing — for the mechanics, or for the campaign\'s first sessions. Let the rest lie.',
  '- Never propose answers inside a question. Ask; do not suggest (no "was it X or Y?", no "perhaps…").',
  '- Anchor every prod: anchorQuote = the seed passage that raised it (≤300 chars, quoted exactly); why = one line on what hinges on it.',
  '- kind: CREATIVE for an authorial gap. MECHANICAL_CHECK only when a mechanic hinges on a creative fact only the GM can settle — it is still a creative question, never a stat question.',
  '- No building in this stage: no memories, no entity authoring, no drafts, no sheet. Only raise_prod and end_prod_round.',
].join('\n');

function prodLine(p: CycleProd): string {
  const outcome = p.status === 'ANSWERED' ? `ANSWERED: ${p.answer ?? ''}`
    : p.status === 'LEFT_OPEN' ? 'LEFT OPEN by the GM — a mystery for play; never ask it again, never fill it'
      : p.status === 'DELEGATED' ? 'DELEGATED to you — you will decide it during the build'
        : 'OPEN — awaiting the GM';
  return `- r${p.round}.${p.order} [${p.kind}] ${p.question}\n  anchor: "${p.anchorQuote}"\n  → ${outcome}`;
}

export function buildProdCycleText(session: WorkCycleSession, prods: CycleProd[]): string {
  return [
    `[SYSTEM] Work cycle ${session.cycleCount + 1} — work session ${session.id}. STAGE: PRODDING — genesis is a dialogue.`,
    `GOAL: ${session.goal}`,
    'THIS STAGE HAS ONE JOB: read the seed below and raise PRODS to the GM — the load-bearing gaps you need him to settle before you build. Then end the round.',
    PROD_LAW,
    `HOW: call raise_prod({sessionId: "${session.id}", anchorQuote, question, why, kind}) — at most 5 this round, the most load-bearing first. ` +
      `Then call end_prod_round({sessionId: "${session.id}", note}). If nothing load-bearing is left to ask, call end_prod_round without raising any — the GM will press Build. ` +
      'You cannot leave this stage yourself; only the GM\'s Build moves genesis on to gestation.',
    prods.length
      ? `PRODS SO FAR (do not re-ask; follow up only where an answer opens a new load-bearing gap):\n${prods.map(prodLine).join('\n')}`
      : 'PRODS SO FAR: none — this is the first round.',
    'THE SEED (the GM\'s brief — the stage list inside it applies only AFTER Build):',
    session.plan ?? '(no brief recorded)',
  ].join('\n\n');
}

/**
 * What one cycle sends (work-loop.ts). Pure. PRODDING → the prod text and
 * ONLY the prod tools; otherwise the normal cycle, with the GM's prod
 * decisions appended to a genesis plan (SETTLED / OPEN THREADS / DELEGATED).
 */
export function planWorkCycle(
  session: WorkCycleSession & { stage?: string | null },
  prods: CycleProd[],
  treasuryLine: string,
  recentNotes: string[],
): { text: string; allowedTools?: string[] } {
  if (session.stage === 'PRODDING') {
    return { text: buildProdCycleText(session, prods), allowedTools: [...PROD_STAGE_TOOLS] };
  }
  const plan = prods.length && session.plan
    ? `${session.plan}\n\n${buildProdSections(prods)}`
    : session.plan;
  return { text: buildWorkCycleText({ ...session, plan }, treasuryLine, recentNotes) };
}
