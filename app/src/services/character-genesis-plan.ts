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
