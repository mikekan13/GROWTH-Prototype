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
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { kickWorkLoop } from '@/ai/copilot/work-loop';
import { openWorkSession } from './daya-work-session';
import { buildGenesisPlan } from './character-genesis-plan';

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

  // One gestation at a time per character — a second submit is refused
  // (409) instead of silently answering 200 (Mike 2026-10-11). The loop is
  // still nudged so an idle active session picks back up.
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
    throw new ConflictError(
      existing.status === 'blocked'
        ? 'Genesis is already running for this character and is waiting on you — see its progress on the character page.'
        : 'Genesis is already running for this character — see its progress on the character page.',
    );
  }

  const name = input.characterName?.trim() || character.name;
  // The plan carries the backstory: fiction, crossing only through the wall.
  const plan = buildGenesisPlan(input, name, character.id);

  const session = await openWorkSession({
    campaignId,
    goal: `Character genesis: ${name} [${character.id}] — gestate the person from their genome, then translate the biography into mechanics (catalog-first).`,
    plan,
    createdBy: opts.actorId,
    // Genesis is a dialogue (Mike 2026-10-12): JEWL prods the GM first; only
    // the GM's Build moves the session on to gestation.
    stage: 'PRODDING',
  });
  kickWorkLoop();

  return { sessionId: session.id, status: session.status, alreadyRunning: false };
}
