/**
 * completeCharacter (2026-10-12) — finish a character that is already BORN.
 *
 * Violet was born before the completion stages existed: no age/birthCycle,
 * no possessions, no NPC/location seeds, no world facts, no GRO.vines, a
 * duplicate root link and an empty creation view. This opens a short genesis
 * work session that runs ONLY the stages she still lacks
 * (services/genesis-stages.ts detects them), in order, then she is Born again
 * (idempotent wake). It is also the sketch tier's "deepen later" hook
 * (sketch-genesis.markForDeepening).
 *
 * Before opening: duplicate block links are removed and the creation view is
 * mirrored from the links (no model call). Prior prod decisions — above all
 * the threads the GM LEFT OPEN — ride into the new plan so they stay unfilled.
 * Watcher/ADMIN only (campaign GM of record).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { requireCampaignGM } from './campaign-access';
import { openWorkSession } from './daya-work-session';
import { buildGenesisPlan, buildProdSections, type PlanProd } from './character-genesis-plan';
import { dedupeBlockLinks, syncCreationFromBlockLinks } from './genesis-sheet-sync';
import { GENESIS_POST_SHEET_STAGES, detectMissingStages, isGateStage, type GenesisPostSheetStage } from './genesis-stages';

export const COMPLETION_HEADER = '== COMPLETION — this character is already BORN ==';

/** The plan a completion session carries. Pure. */
export function buildCompletionPlan(brief: string, prods: PlanProd[], stages: GenesisPostSheetStage[]): string {
  return [
    brief.trim(),
    ...(prods.length ? ['', buildProdSections(prods)] : []),
    '',
    COMPLETION_HEADER,
    `Run ONLY these stages, in order: ${stages.join(' → ')}. Each stage's cycle tells you its law and tools.`,
    'Her genome, memories, blocks and sheet already stand — never redo or redraft them. Build only what these stages add.',
  ].join('\n');
}

/** Is this character born (genesis finished, a sketch, or awake)? Pure. */
export function isBorn(c: { genesisTier: string | null; dayaStatus: string | null; finishedGenesis: boolean }): boolean {
  return c.finishedGenesis || c.genesisTier === 'SKETCH' || c.dayaStatus === 'ACTIVE';
}

export type GenesisMode = 'coax' | 'sail';

/** Recursive genesis (2026-10-16): the genesis this one was spawned from. */
export interface SpawnedFrom {
  characterId: string;
  name: string;
  sessionId: string | null;
}

export interface CompleteOptions {
  mode?: GenesisMode;
  /** Skip the player gates (APPEARANCE / PORTRAIT) — a spawned NPC's look is
   *  nobody's to approve at the designer; the walk would hold forever. */
  skipGates?: boolean;
  spawnedFrom?: SpawnedFrom;
  /** Re-open these stages even when their evidence or stamp says done (the
   *  2026-10-16 simulation-level rerun of a born character's WORLD). Their
   *  stamps are cleared; built things are KEPT and built on. */
  reopen?: GenesisPostSheetStage[];
}

/** The goal suffix a spawned genesis carries. Pure. NEVER brackets the parent
 *  id — `[id]` in a goal is how a character's own sessions are found. */
export function spawnedGoalSuffix(from: SpawnedFrom): string {
  return ` (spawned from ${from.name}'s genesis · parent ${from.characterId})`;
}

export async function completeCharacter(characterId: string, actor: { id: string; role: string }, opts: CompleteOptions = {}) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, campaignId: true, genesisTier: true, data: true, daya: { select: { status: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!character.campaignId) throw new ValidationError('Character has no campaign — completion runs inside a campaign world.');
  const campaignId = character.campaignId;
  await requireCampaignGM(campaignId, actor);

  const inFlight = await prisma.dayaWorkSession.findFirst({
    where: { campaignId, status: { in: ['active', 'blocked'] }, goal: { contains: `[${characterId}]` } },
    select: { id: true },
  });
  if (inFlight) throw new ConflictError('Genesis is already running for this character — see its progress on the character page.');

  const lastDone = await prisma.dayaWorkSession.findFirst({
    where: { campaignId, status: 'done', goal: { startsWith: 'Character genesis' }, AND: [{ goal: { contains: `[${characterId}]` } }] },
    orderBy: { startedAt: 'desc' },
    select: { id: true, plan: true },
  });
  if (!isBorn({ genesisTier: character.genesisTier, dayaStatus: character.daya?.status ?? null, finishedGenesis: !!lastDone })) {
    throw new ValidationError('This character is not born yet — submit her genesis first.');
  }

  const { removed } = await dedupeBlockLinks(characterId);
  // Repairs the creation view and the seed's numbers (Fate Die, Frequency
  // pool) where a born sheet disagrees with her seed; the sync logs them.
  const { corrections } = await syncCreationFromBlockLinks(characterId);

  if (opts.reopen?.length) {
    const row = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
    const sheet = JSON.parse(row?.data ?? '{}') as { _genesisStages?: Record<string, string> };
    for (const s of opts.reopen) delete sheet._genesisStages?.[s];
    await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(sheet) } });
  }
  const missing = await detectMissingStages(characterId);
  for (const s of opts.reopen ?? []) missing.add(s);
  const stages = GENESIS_POST_SHEET_STAGES.filter(s => missing.has(s) && !(opts.skipGates && isGateStage(s)));
  if (!stages.length) return { opened: false as const, sessionId: null, stages, removedDuplicateLinks: removed.length, seedCorrections: corrections };

  const prods: PlanProd[] = lastDone
    ? await prisma.genesisProd.findMany({
      where: { sessionId: lastDone.id },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
      select: { id: true, anchorQuote: true, question: true, status: true, answer: true, jewlFill: true },
    })
    : [];
  let brief = lastDone?.plan ?? '';
  if (!brief) {
    let sheet: { backstory?: { backstory?: string; notes?: string }; identity?: { age?: number } } = {};
    try { sheet = JSON.parse(character.data); } catch { sheet = {}; }
    const story = sheet.backstory?.backstory || sheet.backstory?.notes || '(no backstory recorded — work from her sheet and memories)';
    brief = buildGenesisPlan({ backstory: story, desiredAge: sheet.identity?.age }, character.name, characterId);
  }

  const spawnLine = opts.spawnedFrom
    ? `SPAWNED GENESIS: ${character.name} is a person ${opts.spawnedFrom.name}'s genesis seeded. Keep her consistent with what ${opts.spawnedFrom.name}'s story already says of her; the people SHE names are seeds only (no further genesis).\n`
    : '';
  const session = await openWorkSession({
    campaignId,
    goal: `Character genesis: ${character.name} [${characterId}] — complete the born character: ${stages.join(' → ')}.${opts.spawnedFrom ? spawnedGoalSuffix(opts.spawnedFrom) : ''}`,
    plan: spawnLine + buildCompletionPlan(brief, prods, stages),
    createdBy: actor.id,
    stage: stages[0],
    continueUnattended: true,
    mode: opts.mode ?? 'coax',
  });
  const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
  kickWorkLoop();
  return { opened: true as const, sessionId: session.id, stages, removedDuplicateLinks: removed.length, seedCorrections: corrections };
}
