/**
 * Character genesis — the "submit to JEWL" leg of the birth process
 * ([[character-genesis-pipeline-2026-08-08]]).
 *
 * The backstory + appearance the human wrote is the GENOME (inviolable
 * canon). Submitting opens a DAYA work session where JEWL gestates the
 * person — exhaustive expansion (chronology, psychology, relationships,
 * voice, believed-sheet gaps), the episodic memory ledger (sealed,
 * experiential), then catalog-first mechanical translation (pull stock
 * seed/root/branches; forge the gaps graded against anchors). The staged
 * method lives in prompt v3's CHARACTER GENESIS law; this service just
 * assembles the brief and opens the session.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { kickWorkLoop } from '@/ai/copilot/work-loop';
import { openWorkSession } from './daya-work-session';

const genesisInputSchema = z.object({
  backstory: z.string().min(40, 'Backstory is too short to gestate — the genome needs at least a few sentences.'),
  characterName: z.string().max(200).optional(),
  desiredAge: z.number().int().min(0).max(100000).optional(),
  selectedSeed: z.string().max(200).optional(),
  physicalDescription: z.record(z.string(), z.unknown()).optional(),
  referencePhotos: z.array(z.string()).max(20).optional(),
  styleColors: z.record(z.string(), z.string()).optional(),
  styleAesthetics: z.array(z.string()).max(20).optional(),
});

export type GenesisInput = z.infer<typeof genesisInputSchema>;

export async function submitCharacterGenesis(opts: {
  characterId: string;
  input: unknown;
  actorId: string;
  actorRole: string;
}) {
  const input = genesisInputSchema.parse(opts.input);

  const character = await prisma.character.findUnique({
    where: { id: opts.characterId },
    select: { id: true, name: true, campaignId: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!character.campaignId) {
    throw new ValidationError('Character has no campaign — genesis runs inside a campaign world.');
  }
  const campaignId = character.campaignId;

  // One gestation at a time per character — resume, don't duplicate.
  const existing = await prisma.dayaWorkSession.findFirst({
    where: {
      campaignId,
      status: { in: ['active', 'blocked'] },
      goal: { contains: `[${character.id}]` },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    kickWorkLoop();
    return { sessionId: existing.id, status: existing.status, alreadyRunning: true };
  }

  const name = input.characterName?.trim() || character.name;
  const appearance = input.physicalDescription && Object.keys(input.physicalDescription).length > 0
    ? JSON.stringify(input.physicalDescription)
    : '(none recorded — derive from the backstory, flag for the Watcher)';

  const plan = [
    `GENESIS BRIEF — ${name} (character [${character.id}])`,
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

  const session = await openWorkSession({
    campaignId,
    goal: `Character genesis: ${name} [${character.id}] — gestate the person from their genome, then translate the biography into mechanics (catalog-first).`,
    plan,
    createdBy: opts.actorId,
  });
  kickWorkLoop();

  return { sessionId: session.id, status: session.status, alreadyRunning: false };
}
