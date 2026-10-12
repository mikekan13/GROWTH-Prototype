/**
 * The genesis brief — the work-session plan a character genesis opens with.
 * Pure. The plan carries the whole backstory (the genome) to JEWL's work
 * cycles, so it is FICTION by the wall (Mike 2026-10-12): it may reach a
 * cloud lane only through route() → toneFilter → assertNoTableContent
 * (runtime.ts dispatchPrompt, source JEWL_WORK_CYCLE).
 */

export interface GenesisPlanInput {
  backstory: string;
  desiredAge?: number;
  selectedSeed?: string;
  physicalDescription?: Record<string, unknown>;
  referencePhotos?: string[];
  styleAesthetics?: string[];
}

export function buildGenesisPlan(input: GenesisPlanInput, name: string, characterId: string): string {
  const appearance = input.physicalDescription && Object.keys(input.physicalDescription).length > 0
    ? JSON.stringify(input.physicalDescription)
    : '(none recorded — derive from the backstory, flag for the Watcher)';

  return [
    `GENESIS BRIEF — ${name} (character [${characterId}])`,
    '',
    '== GENOME (inviolable canon — every stated fact below is chosen) ==',
    `NAME: ${name}`,
    input.desiredAge != null ? `AGE: ${input.desiredAge}` : null,
    input.selectedSeed ? `SEED PREFERENCE: ${input.selectedSeed}` : null,
    `APPEARANCE: ${appearance}`,
    input.referencePhotos?.length
      ? `REFERENCE PHOTOS: ${input.referencePhotos.length} uploaded (identity lock runs separately)`
      : null,
    input.styleAesthetics?.length ? `STYLE: ${input.styleAesthetics.join(', ')}` : null,
    'BACKSTORY:',
    input.backstory.trim(),
    '',
    '== STAGES (work across cycles; the CHARACTER GENESIS law is the method) ==',
    '1 EXPANSION — daya_author_entity: chronology in-world, researched psychology, relationships, voice, believed-sheet gaps',
    '2 LEDGER — daya_seed_memory era by era, sealed experiential language, many small batches',
    '3 MECHANICS — search_catalog first (seed/root/branches); pull stock; forge gaps w/ biography-citing ✎ notes; blocked on the GM batch',
    '4 SHEET — edit_character_sheet once blocks are approved',
    '5 DONE — quiet 2-3 line completion; full dossier awaits review (committing = ratification)',
  ].filter((line): line is string => line !== null).join('\n');
}

/** A prod as the build plan reads it (GenesisProd row fields). */
export interface PlanProd {
  id: string;
  anchorQuote: string;
  question: string;
  status: string;
  answer: string | null;
  jewlFill: string | null;
}

export const SETTLED_HEADER = '== SETTLED (GM answered) ==';
export const OPEN_THREADS_HEADER = '== OPEN THREADS — DO NOT FILL ==';
export const DELEGATED_HEADER = '== DELEGATED (you decide — record your choice) ==';

/**
 * The three sections the GM's prod decisions add to the genesis plan once he
 * presses Build (genesis is a dialogue, Mike 2026-10-12). Pure. ANSWERED →
 * settled canon; LEFT_OPEN (and anything still OPEN) → open threads JEWL must
 * never fill; DELEGATED → JEWL fills and records his choice.
 */
export function buildProdSections(prods: PlanProd[]): string {
  const q = (s: string) => `"${s}"`;
  const settled = prods.filter(p => p.status === 'ANSWERED');
  const open = prods.filter(p => p.status === 'LEFT_OPEN' || p.status === 'OPEN');
  const delegated = prods.filter(p => p.status === 'DELEGATED');
  const none = '- (none)';
  return [
    SETTLED_HEADER,
    'The GM answered these. They are genome-grade canon — build on them exactly.',
    ...(settled.length ? settled.map(p => `- ${q(p.anchorQuote)} → ${p.question} → ${p.answer ?? ''}`) : [none]),
    '',
    OPEN_THREADS_HEADER,
    'These are mysteries to be discovered in play. NEVER invent their answers. Where a memory, the dossier or a draft would touch one, leave it explicitly unknown (say it is unknown) — do not imply an answer.',
    ...(open.length ? open.map(p => `- ${q(p.anchorQuote)} → ${p.question}`) : [none]),
    '',
    DELEGATED_HEADER,
    'The GM handed these to you. Decide each one, and record what you chose with record_delegated_choice({prodId, choice}) BEFORE anything you write relies on it.',
    ...(delegated.length
      ? delegated.map(p => `- [${p.id}] ${q(p.anchorQuote)} → ${p.question} → ${p.jewlFill ? `YOUR CHOICE (recorded): ${p.jewlFill}` : 'not yet recorded'}`)
      : [none]),
  ].join('\n');
}
