/**
 * The prompt text one DAYA work cycle hands JEWL (work-loop.ts). Pure.
 *
 * It carries the session's plan verbatim — for a character genesis that is
 * the whole backstory (character-genesis-plan.ts). The text is dispatched as
 * source JEWL_WORK_CYCLE, class FICTION (content-class.ts), so on a cloud
 * lane it crosses only through route() → toneFilter → assertNoTableContent.
 */
import { buildProdSections } from '@/services/character-genesis-plan';
import { ARCHETYPE_LAW } from '@/services/block-archetype';
import {
  GENESIS_POST_SHEET_STAGES,
  isPostSheetStage,
  type GenesisPostSheetStage,
  type GmWorldMessage,
} from '@/lib/genesis-stages';

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

// ── Catalog-first only when there IS a catalog (perf pass 2026-10-12) ───
// Measured: 20 of 21 search_catalog calls in a deep genesis returned nothing
// (the stock catalog held one Human seed) — ~40 s of searches for nothing.

/** The block kinds a genesis build drafts or pulls. */
export const GENESIS_CATALOG_KINDS = ['seed', 'root', 'branch', 'skill', 'nectar', 'thorn', 'blossom', 'item'] as const;
/** At or below this many stock rows across those kinds the catalog is
 *  "near-empty": searching it is a waste of rounds. */
export const CATALOG_NEAR_EMPTY = 5;

export interface CycleCatalog {
  counts: Record<string, number>;
  total: number;
  entries?: Array<{ type: string; name: string }>;
}

/** The CATALOG line for a genesis build cycle, and whether search_catalog
 *  is withheld. Pure. */
export function catalogGuidance(cat: CycleCatalog): { line: string; excludedTools?: string[] } {
  const kinds = GENESIS_CATALOG_KINDS;
  const relevant = kinds.reduce((n, k) => n + (cat.counts[k] ?? 0), 0);
  if (relevant <= CATALOG_NEAR_EMPTY) {
    const have = (cat.entries ?? []).filter(e => (kinds as readonly string[]).includes(e.type));
    const listed = have.length
      ? ` It holds only: ${have.map(e => `${e.type} "${e.name}"`).join(', ')} — pull_from_catalog one of those by exact name where it fits.`
      : '';
    return {
      line: `CATALOG: the stock catalog is empty for ${kinds.filter(k => !(cat.counts[k] ?? 0)).join('/') || 'these kinds'}` +
        ` (${relevant} stock row${relevant === 1 ? '' : 's'} in all).${listed} Do NOT search it — search_catalog is withheld this stage. ` +
        'Any block in CAMPAIGN BLOCKS below that fits the archetype: attach_block it with her story. ' +
        'Draft only the true gaps with propose_forge_blueprint — GENERIC, per the ARCHETYPE LAW (anchor grades to the locked formulas, not to stock).',
      excludedTools: ['search_catalog'],
    };
  }
  const empty = kinds.filter(k => !(cat.counts[k] ?? 0));
  return {
    line: 'CATALOG: stock exists (' + kinds.filter(k => cat.counts[k]).map(k => `${k} ${cat.counts[k]}`).join(', ') + ').' +
      (empty.length ? ` Empty for ${empty.join('/')} — draft those directly, never search them.` : '') +
      ' Search ONCE: a single search_catalog call with queries:[{query, type}, …] covering every block this build needs — never one call per block.' +
      ' Where stock or a CAMPAIGN BLOCK fits the archetype, attach_block it with her story — draft only the true gaps.',
  };
}

// ── Blocks are campaign-agnostic archetypes (Mike 2026-10-12) ───────────

/** What a genesis build cycle knows about drafting. */
export interface CycleDrafting {
  /** This campaign's live character-layer blocks (reuse before drafting). */
  campaignBlocks?: Array<{ type: string; name: string }>;
  /** Shapes already rejected for this session (validator / GM redraft). */
  rejected?: string[];
  /** GM feedback on single drafts still awaiting a redraft — carried verbatim. */
  feedback?: string[];
}

/** The ARCHETYPE section of a genesis build cycle. Pure. */
export function draftingGuidance(d: CycleDrafting): string {
  const blocks = d.campaignBlocks ?? [];
  return [
    ...(d.feedback?.length
      ? [`GM FEEDBACK — the GM sent these drafts back; redraft each one (and only these) per his note:\n${d.feedback.map(f => `- ${f}`).join('\n')}`]
      : []),
    ARCHETYPE_LAW,
    'REUSE FIRST, EVEN WHEN DRAFTING: before drafting a block, check whether an existing stock or campaign block already fits the archetype — if one does, attach_block it with her bearer-specific story instead of drafting a duplicate. ' +
      'Every block you DO draft carries characterId + attachmentStory (her specifics; proper nouns allowed there and only there).',
    blocks.length
      ? `CAMPAIGN BLOCKS (attach_block before drafting): ${blocks.map(b => `${b.type} "${b.name}"`).join(', ')}`
      : 'CAMPAIGN BLOCKS: none yet.',
    ...(d.rejected?.length
      ? [`REJECTED SHAPES — do not repeat or near-repeat them:\n${d.rejected.map(r => `- ${r}`).join('\n')}`]
      : []),
  ].join('\n');
}

// ── A question is a prod at ANY genesis stage (Mike 2026-10-12) ─────────
// "Never should I have to go to the logs to answer a question jewl has."

/** Stage-only tools a genesis build cycle still offers. */
export const BUILD_STAGE_TOOLS = ['raise_prod'] as const;

/** The question law every genesis build cycle carries. */
export function genesisQuestionLaw(sessionId: string): string {
  return [
    'QUESTIONS FOR THE GM (law at every genesis stage):',
    `- If you need the GM's word, call raise_prod({sessionId: "${sessionId}", anchorQuote, question, why, kind}) — anchor it to the seed or draft text that raised it. ` +
      'The session waits on his answer and resumes on its own the moment he decides; you need not block it yourself.',
    '- NEVER write a question to the GM into your report, a progress note, a blocked reason or free text — he would have to dig through the Log for it.',
    '- If a ruling is not strictly needed, do not block: make the YOU-DECIDE-style assumption, build on it, and state it in your progress note as "assumed: …" so the GM can overturn it.',
    '- At most 5 prods while one wait is open; only creative/authorial facts the GM alone can settle.',
  ].join('\n');
}

// ── Completion stages: after the sheet, before Born (Mike 2026-10-12) ───
// AGE → POSSESSIONS → SEEDS → WORLD_FACTS → VINES. Each stage's cycle offers
// ONLY its own tools; "done" walks to the next missing stage (daya-work-session).

/** Tools every completion stage keeps. */
export const COMPLETION_COMMON_TOOLS = ['update_work_session', 'raise_prod', 'record_delegated_choice'] as const;

/** The tools of each completion stage. */
export const COMPLETION_STAGE_TOOLS: Record<GenesisPostSheetStage, readonly string[]> = {
  AGE: ['set_starting_age'],
  POSSESSIONS: ['read_life_budget', 'search_catalog', 'pull_from_catalog', 'grant_possession', 'propose_forge_blueprint', 'list_forge_drafts', 'read_forge_item', 'read_location', 'establish_currency', 'grant_cash', 'set_income'],
  SEEDS: ['seed_npc', 'seed_location', 'read_location'],
  WORLD_FACTS: ['establish_world_facts', 'read_location'],
  VINES: ['author_vine_goal'],
};

/** The law of each completion stage — carried verbatim in its cycles. */
export const COMPLETION_STAGE_LAW: Record<GenesisPostSheetStage, string> = {
  AGE: [
    'STAGE: AGE — age is ADDITIVE (canon r-2026-08-19-01).',
    '- Her starting age = the sum of the years she spent in each root and branch. The seed adds 0. Her current age then runs on the campaign clock from her birthCycle; her fatedAge is the seed\'s lifespan.',
    '- The brief\'s AGE is canon. If her blocks\' years do not sum to it, assign HER years per block from her chronology (set_starting_age years[]) — an archetype\'s default years are not hers, and her years never change the archetype.',
    '- A root covers at most 25 years. Call set_starting_age (it refuses a sum that misses the AGE), then finish the stage.',
  ].join('\n'),
  POSSESSIONS: [
    'STAGE: POSSESSIONS — her story\'s prose grants become real things.',
    '- Read the backstory and settled answers for what she HAS: what she wears, what she carries, what she owns (keepsakes, the tools of her work, the things that name her life). Only what the story grants or her life plainly implies — no loot, no gear lists.',
    '- CATALOG FIRST: where a stock or campaign item archetype fits, grant_possession it by exact name with HER paint (localName + story). Stock is free.',
    '- Nothing fits → propose_forge_blueprint type "item": the ARCHETYPE stays campaign-agnostic ("Silver Butter Knife" — no proper nouns, no bearer), with characterId + attachmentStory + localName for her instance. The chain grades it; the Watcher\'s approval spends the KRMA. Grant it once published; while drafts wait, set status=blocked on the Forge.',
    '- Tiers: equipped = worn on a region of HER body (slot = a region key the tool lists), carried = on her person, owned = the deed only (her home\'s contents she owns, a car, a box in storage — not on her). Weight in real pounds.',
    '- HER LIFE BUDGET (ruled 2026-10-16): read_life_budget first. Σ accumulated wealth over her roots and branches is the KRMA you have to build her material reality — stock blueprints are free, but every INSTANCE you grant is the Watcher\'s KRMA crystallized as that object, and it spends the budget at its KV. Named block grants are already priced in the block and do not spend it.',
    '- WEALTH THAT IS NOT A THING: cash and income live on the sheet, never as items. A currency is a campaign object (establish_currency — anchor its rate on what objects cost in THIS time and place; many currencies may exist). When her things are placed, exchange what remains of the budget — or what her life plainly leaves her holding — into cash with grant_cash, and set_income from her current branch. Over budget = cut or re-rate, and say so in the progress note.',
  ].join('\n'),
  SEEDS: [
    'STAGE: SEEDS — the people and places of her story become seeds for the Watcher.',
    '- Every PERSON the backstory or the settled answers NAME → seed_npc: who they are to her, valence (-1..+1), what the story says of them, the open thread between them. Never create a person the story does not name. No sheets, no portraits.',
    '- OPEN THREADS ARE NEVER FILLED: a thread the GM LEFT OPEN rides as openThreadProdId alone. Never write an answer, a hint or a guess for it anywhere.',
    '- Her home (and her hometown or workplace, where named) → seed_location. Draw it from the GM WORLD MESSAGES below and the backstory and cite the message ids you used; be as specific as those sources, no further. Places are not forged. owned only if she holds the deed.',
  ].join('\n'),
  WORLD_FACTS: [
    'STAGE: WORLD FACTS — the substrate play will touch first.',
    '- establish_world_facts for her home as the GM described it (what is where, surfaces, objects, their states, sounds), and the standing facts about the people and places you seeded. Dotted stable subjectKeys ("violet_apartment.desk.laptop"), concrete, present tense; batch a place per call.',
    '- Facts come only from the sources: the GM WORLD MESSAGES below, the backstory, the settled answers. Never state a fact that answers an OPEN THREAD.',
  ].join('\n'),
  VINES: [
    'STAGE: VINES — choose the GOALS of her GRO.vines.',
    '- A GRO.vine is a three-author contract: the Goal is the entity\'s, the Resistance is the Watcher\'s, the Opportunity is the godhead\'s. You write the GOAL only — never resistance, never opportunity.',
    '- What she wants, in her own terms, as her history makes her want it — up to her seed\'s slots (the tool says how many). Fewer is fine. An open thread never becomes a goal\'s answer.',
    '- These are AI-chosen, as simulation is: a Trailblazer seated in her overwrites them.',
  ].join('\n'),
};

/** What the completion stage cycles carry beyond the session. */
export interface CompletionContext {
  /** The GM's typed world messages (SEEDS / WORLD_FACTS). */
  worldMessages?: GmWorldMessage[];
  /** Stock item archetypes in the catalog (POSSESSIONS). */
  stockItems?: number;
}

/** One completion-stage cycle's text. Pure. */
export function buildCompletionStageText(
  session: WorkCycleSession & { stage: GenesisPostSheetStage },
  recentNotes: string[],
  ctx: CompletionContext,
  extras: string[],
): string {
  const stage = session.stage;
  const order = GENESIS_POST_SHEET_STAGES.map(s => (s === stage ? `[${s}]` : s)).join(' → ');
  const world = (stage === 'SEEDS' || stage === 'WORLD_FACTS')
    ? (ctx.worldMessages?.length
      ? `GM WORLD MESSAGES (what the GM typed about the world — sources; cite ids):\n${ctx.worldMessages.map(m => `[${m.id}] (${m.at}) ${m.text}`).join('\n\n')}`
      : 'GM WORLD MESSAGES: none — the backstory and settled answers are your only sources.')
    : null;
  const catalog = stage === 'POSSESSIONS' && ctx.stockItems != null
    ? (ctx.stockItems > 0
      ? `CATALOG: ${ctx.stockItems} stock item archetype${ctx.stockItems === 1 ? '' : 's'}. Search ONCE (one search_catalog call with queries:[…] for every thing she has), then grant.`
      : 'CATALOG: the stock catalog holds no items — do not search it; reuse campaign items, draft the true gaps.')
    : null;
  return [
    `[SYSTEM] Work cycle ${session.cycleCount + 1} — work session ${session.id}. GENESIS STAGE: ${stage} (${order} → Born).`,
    `GOAL: ${session.goal}`,
    COMPLETION_STAGE_LAW[stage],
    `FINISH: when this stage is complete, call update_work_session({sessionId: "${session.id}", progressNote, status: "done"}) — the system moves genesis to the next stage (Born after the last). One progress line per cycle; quiet, never an inventory.`,
    ...extras,
    ...(catalog ? [catalog] : []),
    ...(world ? [world] : []),
    recentNotes.length ? `YOUR RECENT PROGRESS NOTES:\n${recentNotes.map(n => `- ${n}`).join('\n')}` : 'No progress notes in this stage yet.',
    `THE BRIEF (her genome and the GM's decisions):\n${session.plan ?? '(no brief recorded)'}`,
  ].join('\n\n');
}

/**
 * What one cycle sends (work-loop.ts). Pure. PRODDING → the prod text and
 * ONLY the prod tools; otherwise the normal cycle, with the GM's prod
 * decisions appended to a genesis plan (SETTLED / OPEN THREADS / DELEGATED).
 * A genesis build cycle given a catalog snapshot carries the CATALOG line
 * (and withholds search_catalog when the catalog is near-empty). A genesis
 * build cycle also keeps raise_prod and carries the question law.
 */
export function planWorkCycle(
  session: WorkCycleSession & { stage?: string | null },
  prods: CycleProd[],
  treasuryLine: string,
  recentNotes: string[],
  catalog?: CycleCatalog | null,
  drafting?: CycleDrafting | null,
  completion?: CompletionContext | null,
): { text: string; allowedTools?: string[]; excludedTools?: string[]; stageTools?: string[] } {
  if (session.stage === 'PRODDING') {
    return { text: buildProdCycleText(session, prods), allowedTools: [...PROD_STAGE_TOOLS] };
  }
  const genesis = session.goal.startsWith('Character genesis');
  const plan = prods.length && session.plan
    ? `${session.plan}\n\n${buildProdSections(prods)}`
    : session.plan;
  if (genesis && isPostSheetStage(session.stage)) {
    const stage = session.stage;
    const extras = [
      ...(stage === 'POSSESSIONS' && drafting ? [draftingGuidance(drafting)] : []),
      genesisQuestionLaw(session.id),
    ];
    return {
      text: buildCompletionStageText({ ...session, plan, stage }, recentNotes, {
        ...completion,
        ...(stage === 'POSSESSIONS' && catalog ? { stockItems: catalog.counts.item ?? 0 } : {}),
      }, extras),
      allowedTools: [...COMPLETION_COMMON_TOOLS, ...COMPLETION_STAGE_TOOLS[stage]]
        .filter(t => !(t === 'search_catalog' && stage === 'POSSESSIONS' && catalog && !(catalog.counts.item ?? 0))),
    };
  }
  const guide = catalog ? catalogGuidance(catalog) : null;
  const treasury = [treasuryLine, guide?.line, drafting ? draftingGuidance(drafting) : null,
    genesis ? genesisQuestionLaw(session.id) : null]
    .filter(Boolean).join('\n');
  return {
    text: buildWorkCycleText({ ...session, plan }, treasury, recentNotes),
    ...(guide?.excludedTools ? { excludedTools: guide.excludedTools } : {}),
    ...(genesis ? { stageTools: [...BUILD_STAGE_TOOLS] } : {}),
  };
}
