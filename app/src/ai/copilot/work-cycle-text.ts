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
  /** 'coax' (default) asks first; 'sail' builds without asking (2026-10-16). */
  mode?: string | null;
  /** Start of the PREVIOUS cycle (the row as read before this cycle touches it). */
  lastCycleAt?: Date | string | null;
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
  /** The genesis stage it was raised in (null = PRODDING / legacy). */
  stage?: string | null;
  /** When it was raised — a check-in newer than the last cycle proves the pass was shown. */
  createdAt?: Date | string | null;
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

/** Stage-only tools a genesis build cycle still offers. Age is a SUM
 *  (2026-10-16): her years per block are set while the sheet is written. */
export const BUILD_STAGE_TOOLS = ['raise_prod', 'set_starting_age'] as const;

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

// ── Completion stages: after the sheet, before Born (Mike 2026-10-12/16) ──
// AGE (repair) → APPEARANCE (gate) → WORLD → MEMORIES → VINES → PORTRAIT
// (gate). Each stage's cycle offers ONLY its own tools; "done" walks to the
// next missing stage (daya-work-session). Gates never reach the model.

/** Tools every completion stage keeps. */
export const COMPLETION_COMMON_TOOLS = ['update_work_session', 'raise_prod', 'record_delegated_choice'] as const;

/** The tools of each completion stage. */
export const COMPLETION_STAGE_TOOLS: Record<GenesisPostSheetStage, readonly string[]> = {
  AGE: ['set_starting_age'],
  APPEARANCE: [],
  WORLD: [
    'read_life_budget', 'stock_goods', 'stock_kit', 'search_catalog', 'pull_from_catalog', 'grant_possession', 'drop_possession', 'move_item', 'move_items', 'organize_place', 'propose_forge_blueprint', 'list_forge_drafts', 'read_forge_item',
    'seed_location', 'create_location', 'read_location', 'seed_npc', 'establish_world_facts',
    'establish_currency', 'grant_cash', 'set_income',
  ],
  MEMORIES: ['daya_seed_memory', 'daya_ledger_read', 'read_location'],
  VINES: ['author_vine_goal'],
  PORTRAIT: [],
};

/** The law of each completion stage — carried verbatim in its cycles. */
export const COMPLETION_STAGE_LAW: Record<GenesisPostSheetStage, string> = {
  AGE: [
    'STAGE: AGE — age is ADDITIVE (canon r-2026-08-19-01).',
    '- Her starting age = the sum of the years she spent in each root and branch. The seed adds 0. Her current age then runs on the campaign clock from her birthCycle; her fatedAge is the seed\'s lifespan.',
    '- The brief\'s AGE is canon. If her blocks\' years do not sum to it, assign HER years per block from her chronology (set_starting_age years[]) — an archetype\'s default years are not hers, and her years never change the archetype.',
    '- A root covers at most 25 years. Call set_starting_age (it refuses a sum that misses the AGE), then finish the stage.',
  ].join('\n'),
  APPEARANCE: 'STAGE: APPEARANCE — a person approves her face and body at the designer. Not yours to do; the session waits.',
  WORLD: [
    'STAGE: WORLD — her physical world: the things she owns, the place she lives, the people she names, the facts about it. (Her look is approved: build the life of THIS person.)',
    '- HER LIFE BUDGET (ruled 2026-10-16): read_life_budget first. Σ accumulated wealth over her roots and branches is the KRMA you have to build her material reality — stock blueprints are free, but every INSTANCE you grant is the Watcher\'s KRMA crystallized as that object, and it spends the budget at its KV. Named block grants are already priced in the block and do not spend it.',
    '- HER HOME first: seed_location for where she lives (and her hometown or workplace, where named) from the GM WORLD MESSAGES below and the backstory — cite the message ids; as specific as the sources, no further. Places are not forged. owned only if she holds the deed. THEN ITS ROOMS: create_location with parentLocation = the home, one per room (kitchen, bedroom, bathroom, the main room of a studio…).',
    '- THE WORLD IS A TOP-DOWN MAP (ruled 2026-10-16). Every thing sits somewhere: in a ROOM, or INSIDE another thing — a bookcase holds books, a drawer holds the junk, a closet holds the wardrobe, a bag holds what she carries out. Anything can hold things. A pile of objects "at the apartment" is wrong. Place the furniture and containers in their rooms first (grant_possession location = the room), then the contents INTO them (location = the container\'s local name), then what is loose on surfaces. move_item re-places anything already granted.',
    '- THEN HER THINGS, room by room: what she wears, carries and owns — keepsakes, the tools of her work, the furniture, the kitchen, the wardrobe, the drawer of junk. What the story grants or her life plainly implies at her means; no loot, no gear lists. CATALOG FIRST: grant_possession by exact archetype name with HER paint (localName + story). Nothing fits → propose_forge_blueprint type "item" (campaign-agnostic archetype + her paint); the Watcher\'s approval spends the KRMA; grant it once published, and while drafts wait set status=blocked on the Forge.',
    '- SIMULATION LEVEL (Mike 2026-10-16: "when I said extensive I meant simulation level extensive"): her home holds what a real person in her life actually has — the pantry and the fridge with real food at real freshness, oils and half-used spices, every pan and fork, the medicine cabinet, toiletries, towels, bedding, cleaning things, mail and papers, the junk drawer down to the rubber bands. TWO WAYS, by what matters (ruled 2026-10-16): CRYSTALLIZE what matters — what she wears, carries, uses, what has a story, what is valuable — with stock_goods (ONE call per room). Every HOLDER’s ordinary contents (the fridge, the pantry, the junk drawer, the medicine cabinet) are a KIT: stock_kit = a KV budget + ONE priced line of truth ("milk, six eggs, leftover pad thai, ketchup — 1.2 KV"); a kit is drawn into real things only when they are observed in play. EVERYTHING IS A CONTAINER — the sink holds the dish, the closet the coats, a coat pocket a receipt — so put things INSIDE the things that hold them; only what stands in the room is at the top of the map.',
    '- KV IS THE PRICE (ruled 2026-10-16): item KV is decimal — an onion 0.02, a candle 0.1, a couch 2, a phone 10. A new everyday archetype must be under 1 KV (give its value); a new thing worth 1 KV or more is forged first. CAPACITY: a thing only fits where it realistically could ("I can’t put a whale in my apartment") — give volumeCuFt for things and capacityCuFt / capacityLbs for new holders; an over-full holder refuses with the reason. The LIFE COVERAGE line in the brief counts crystallized things AND kit lines; the stage is not done while a gap remains.',
    '- THE WARDROBE IS A KIT (ruled 2026-10-16: "she doesn’t need a full wardrobe… she needs a kit"): stock her closet or dresser with stock_goods, then give it ONE wardrobe kit with stock_kit — a KV budget at her means and ONE priced line of truth ("everyday clothes for a frugal writer in autumn: jeans, sweaters, two good dresses, worn boots — 3 KV"). Do NOT itemize dozens of garments. Crystallize only the pieces that matter (the coat with a story, what she has on right now). Her first outfit is the dealer’s choice drawn FROM that kit at dress time — drawing from her own kit is not inventing. No wardrobe kit and no garments means the stage is not done.',
    '- Tiers: equipped = worn on a region of HER body (slot = a region key the tool lists), carried = on her person, owned = the deed (located_at says where it sits). Weight in real pounds.',
    '- HER PEOPLE: every PERSON the backstory or the settled answers NAME → seed_npc: who they are to her, valence (-1..+1), what the story says of them, the open thread between them. Never a person the story does not name. No sheets, no portraits — each is an entity and gets their own genesis later.',
    '- OPEN THREADS ARE NEVER FILLED: a thread the GM LEFT OPEN rides as openThreadProdId alone. Never write an answer, a hint or a guess for it anywhere.',
    '- THE FACTS: establish_world_facts for her home as it now stands (what is where, surfaces, the objects you placed, their states, sounds) and the standing facts about her people and places. Dotted stable subjectKeys ("violet_apartment.desk.laptop"), concrete, present tense; batch a place per call. Only from the sources; never a fact that answers an OPEN THREAD.',
    '- WEALTH THAT IS NOT A THING: cash and income live on the sheet, never as items. A currency is a campaign object (establish_currency — anchor its rate on what objects cost in THIS time and place; many may exist). When her things are placed, exchange what remains of the budget — or what her life plainly leaves her holding — into cash with grant_cash, and set_income from her current branch. Over budget = cut or re-rate, and say so in the progress note.',
    '- Ask, do not assume, where the choice is creative: the Watcher or the Trailblazer drives; you add the scale (raise_prod for what only they can say).',
    '- Read the brief before every grant: a thing listed under THINGS exists — never grant it again; drop_possession takes back one you granted twice or cannot afford. Cash and income already on the sheet are listed too — set_income once per job.',
  ].join('\n'),
  MEMORIES: [
    'STAGE: MEMORIES — one memory for every thing built: each item she owns, each mark on her face and body, each place, each person.',
    '- daya_seed_memory in batches: first-person lived experience in HER register, no game vocabulary. Three weights — fleeting (one line: "bought at the corner store, nothing to it"), held (how it came to her, 2–4 sentences), chain (a thread across years, cross-linked to a person or place). Salience follows the weight.',
    '- Each memory carries its KEY as `source` exactly as the brief prints it ([genesis:item:<id>], [genesis:mark:<face|body>:<n>], [genesis:place:<id>], [genesis:person:<id>]) so the brief can tick it off; name the thing in the content too so the memory survives losing it. Memory belongs to the PERSON; the object keeps its own history.',
    '- Marks (scars, tattoos, piercings, birthmarks, body mods, makeup) come from her approved look: how each came to be — invent from her life unless the brief or the settled answers say; never answer an OPEN THREAD.',
  ].join('\n'),
  VINES: [
    'STAGE: VINES — choose the GOALS of her GRO.vines, now that the whole person and her whole life stand.',
    '- A GRO.vine is a three-author contract: the Goal is the entity\'s, the Resistance is the Watcher\'s, the Opportunity is the godhead\'s. You write the GOAL only — never resistance, never opportunity.',
    '- What she wants, in her own terms, as her history, her world and her memories make her want it — up to her seed\'s slots (the tool says how many). Fewer is fine. An open thread never becomes a goal\'s answer.',
    '- These are AI-chosen, as simulation is: a Trailblazer seated in her overwrites them.',
  ].join('\n'),
  PORTRAIT: 'STAGE: PORTRAIT — her portrait is painted from her face, body, clothes and world, and approved at the designer. Not yours to do; the session waits.',
};

// ── A CONVERSATION THE LENGTH OF THE BUILD (Mike 2026-10-16) ─────────────
// "He hasn't asked for my input one time" — then: "a shotgun of questions
// at the beginning before a process that seems like it could have many
// questions in the middle of it… things can come up during the generation
// of an entire life that a couple questions in the beginning don't really
// answer… a player should know their character… a GM needs to know how a
// character fits into his story." So, in COAX mode, a stage runs in PASSES:
//   opening  — the one to three things he cannot start without (ask-only)
//   pass     — build ONE pass (a few tool rounds), then raise ONE check-in
//              ("here is the kitchen — keep / change / cut?") and stop; the
//              session holds until whoever owns the answer has answered
//   check-in — a cycle that built without showing its pass gets no build
//              tool next time until the check-in is raised
// Enforced by withheld tools and a per-cycle tool cap, not by prose alone.
// SAIL mode skips all of it ("fill in the rest").

/** What the opening of a stage may ask — the few things he cannot start without. */
export const STAGE_ASK_LAW: Partial<Record<GenesisPostSheetStage, string>> = {
  WORLD: [
    'OPENING — before the first pass, ask ONLY what you cannot start without (1–3 prods, raise_prod, anchored to the brief). Usually: where she lives and what it is like (your best guess as the question); what she lives on. Everything else is asked pass by pass as you build. Address each prod to whoever owns the answer — the player for her own life, the GM for how she fits the story, another player when the thing is theirs.',
    'Then stop. The session waits for the answers; the first pass builds on them. Do NOT grant, seed, or establish anything this cycle.',
  ].join('\n'),
  MEMORIES: [
    'OPENING — before the first pass, ask ONLY what you cannot start without (1–3 prods): the first mark or keepsake you would remember — "shall I decide how it came to be, or will you tell me?" — and whether any memory should be a chain across years. The rest is asked pass by pass.',
    'Then stop. The session waits; the first pass writes on their answers ("you decide" = invent from her life).',
  ].join('\n'),
  VINES: [
    'OPENING — propose her FIRST goal as a question, never as a fact: "Does she want X? Yes / no / tell me what she wants instead." (1–2 prods.) The next goals come one per pass.',
    'Then stop. The session waits; you write only the goals they accepted or handed to you.',
  ].join('\n'),
};

/** The build-cycle law in COAX: one pass, then a check-in, then stop. */
export const PASS_LAW = [
  'THIS CYCLE IS ONE PASS. Name it in your progress note (e.g. "pass: kitchen", "pass: her people", "pass: the tattoo"). Build only that pass — a room\'s things, one person, one or two memories, one goal — with the few tool rounds you have.',
  'THEN SHOW IT: raise exactly ONE check-in prod (raise_prod, kind CREATIVE) that lists what you just built in plain words and asks keep / change / cut — addressed to whoever owns the answer (the player for her own life; the GM for how it fits the story; the other player when the thing is theirs — say so in the prod). Then stop; the session holds until they answer.',
  'Never two passes in a cycle. Never build without the check-in — a cycle that does gets no build tools next time.',
].join('\n');

/** The ask-only cycle after a pass that was not shown. */
export const CHECK_IN_LAW =
  'CHECK-IN DUE: your last cycle built a pass and did not show it. Raise ONE prod now that lists what you built and asks keep / change / cut (addressed to whoever owns the answer), and stop. No build tools until they answer.';

/** Tool rounds a COAX pass gets (the runtime cap is 12). */
export const PASS_TOOL_ITERATIONS = 5;

/** Tools an ask cycle offers: questions and reads, no build. */
export const STAGE_ASK_TOOLS: Partial<Record<GenesisPostSheetStage, readonly string[]>> = {
  WORLD: ['raise_prod', 'update_work_session', 'read_life_budget', 'read_location', 'read_forge_item', 'search_catalog'],
  MEMORIES: ['raise_prod', 'update_work_session', 'daya_ledger_read', 'read_location'],
  VINES: ['raise_prod', 'update_work_session'],
};

/** The line a build cycle carries when the table told JEWL to fill in the rest. */
export const SAIL_LAW =
  'SAIL MODE: the table told you to fill in the rest — build this stage without asking. Make the choices a person who knows her would make, keep them modest and consistent with the brief, and list every assumption in your progress note as "assumed: …" so it can be overturned in play.';

/** Has a question round been raised in this stage? Pure. */
export function stageAsked(prods: CycleProd[], stage: string): boolean {
  return prods.some(p => p.stage === stage);
}

/** Was a check-in (any prod of the stage) raised since the previous cycle began? Pure. */
export function checkedInSince(prods: CycleProd[], stage: string, lastCycleAt: Date | string | null | undefined): boolean {
  const since = lastCycleAt ? new Date(lastCycleAt).getTime() : 0;
  return prods.some(p => p.stage === stage && (p.createdAt ? new Date(p.createdAt).getTime() : 0) >= since);
}

/** The ask cycle's text. Pure. */
export function buildAskCycleText(
  session: WorkCycleSession & { stage: GenesisPostSheetStage },
  recentNotes: string[],
  ctx: CompletionContext,
): string {
  const stage = session.stage;
  const law = ctx.checkIn ? CHECK_IN_LAW : STAGE_ASK_LAW[stage] ?? '';
  return [
    `[SYSTEM] Work cycle ${session.cycleCount + 1} — work session ${session.id}. GENESIS STAGE: ${stage} — ${ctx.checkIn ? 'CHECK-IN' : 'QUESTION ROUND'} (genesis is a dialogue).`,
    `GOAL: ${session.goal}`,
    law,
    `HOW: raise_prod({sessionId: "${session.id}", anchorQuote, question, why, kind}) — anchor each to a line of the brief below; "kind" CREATIVE for taste, MECHANICAL_CHECK for budget/rules. At most 5. No report, no "done": the system holds the session until they answer.`,
    ...(ctx.stageBrief ? [ctx.stageBrief] : []),
    recentNotes.length ? `YOUR RECENT PROGRESS NOTES:\n${recentNotes.map(n => `- ${n}`).join('\n')}` : 'No progress notes in this stage yet.',
    `THE BRIEF (her genome and the GM's decisions):\n${session.plan ?? '(no brief recorded)'}`,
  ].join('\n\n');
}

/** What the completion stage cycles carry beyond the session. */
export interface CompletionContext {
  /** The GM's typed world messages (WORLD). */
  worldMessages?: GmWorldMessage[];
  /** Stock item archetypes in the catalog (WORLD). */
  stockItems?: number;
  /** The stage's brief: her world so far (WORLD) / what was built and what
   *  already carries a memory (MEMORIES). services/genesis-brief-context. */
  stageBrief?: string | null;
  /** This ask cycle is a check-in for an unshown pass (not the opening). */
  checkIn?: boolean;
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
  const world = stage === 'WORLD'
    ? (ctx.worldMessages?.length
      ? `GM WORLD MESSAGES (what the GM typed about the world — sources; cite ids):\n${ctx.worldMessages.map(m => `[${m.id}] (${m.at}) ${m.text}`).join('\n\n')}`
      : 'GM WORLD MESSAGES: none — the backstory and settled answers are your only sources.')
    : null;
  const catalog = stage === 'WORLD' && ctx.stockItems != null
    ? (ctx.stockItems > 0
      ? `CATALOG: ${ctx.stockItems} stock item archetype${ctx.stockItems === 1 ? '' : 's'}. Search ONCE (one search_catalog call with queries:[…] for every thing she has), then grant.`
      : 'CATALOG: the stock catalog holds no items — do not search it; reuse campaign items, draft the true gaps.')
    : null;
  return [
    `[SYSTEM] Work cycle ${session.cycleCount + 1} — work session ${session.id}. GENESIS STAGE: ${stage} (${order} → Born).`,
    `GOAL: ${session.goal}`,
    COMPLETION_STAGE_LAW[stage],
    ...(ctx.stageBrief ? [ctx.stageBrief] : []),
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
): { text: string; allowedTools?: string[]; excludedTools?: string[]; stageTools?: string[]; maxToolIterations?: number } {
  if (session.stage === 'PRODDING') {
    return { text: buildProdCycleText(session, prods), allowedTools: [...PROD_STAGE_TOOLS] };
  }
  const genesis = session.goal.startsWith('Character genesis');
  const plan = prods.length && session.plan
    ? `${session.plan}\n\n${buildProdSections(prods)}`
    : session.plan;
  if (genesis && isPostSheetStage(session.stage)) {
    const stage = session.stage;
    // A conversation the length of the build (2026-10-16): in COAX a stage
    // opens with the few questions he cannot start without, then runs in
    // passes — build one, show it, wait. A pass not shown costs him the
    // build tools until he raises the check-in. SAIL skips all of it.
    const sailing = session.mode === 'sail';
    const conversational = !sailing && !!STAGE_ASK_LAW[stage];
    if (conversational && !stageAsked(prods, stage)) {
      return {
        text: buildAskCycleText({ ...session, plan, stage }, recentNotes, { ...completion }),
        allowedTools: [...(STAGE_ASK_TOOLS[stage] ?? ['raise_prod', 'update_work_session'])],
      };
    }
    if (conversational && session.cycleCount > 0 && !checkedInSince(prods, stage, session.lastCycleAt)) {
      return {
        text: buildAskCycleText({ ...session, plan, stage }, recentNotes, { ...completion, checkIn: true }),
        allowedTools: [...(STAGE_ASK_TOOLS[stage] ?? ['raise_prod', 'update_work_session'])],
      };
    }
    const extras = [
      ...(sailing ? [SAIL_LAW] : []),
      ...(conversational ? [PASS_LAW] : []),
      ...(stage === 'WORLD' && drafting ? [draftingGuidance(drafting)] : []),
      genesisQuestionLaw(session.id),
    ];
    return {
      text: buildCompletionStageText({ ...session, plan, stage }, recentNotes, {
        ...completion,
        ...(stage === 'WORLD' && catalog ? { stockItems: catalog.counts.item ?? 0 } : {}),
      }, extras),
      allowedTools: [...COMPLETION_COMMON_TOOLS, ...COMPLETION_STAGE_TOOLS[stage]]
        .filter(t => !(t === 'search_catalog' && stage === 'WORLD' && catalog && !(catalog.counts.item ?? 0))),
      ...(conversational ? { maxToolIterations: PASS_TOOL_ITERATIONS } : {}),
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
