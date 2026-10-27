import 'server-only';
/**
 * Tidbits for the session-start ticker (Mike 2026-10-26, ruling-session-start-glitch-loading-screen): short lines
 * about the campaign, drawn from DATA only, for whoever is watching.
 *
 *   Watcher        anything in the campaign — world facts, what beings remember, places, held things, canon history.
 *   a character    ONLY that character's own knowledge — its memories (noticed ones), what it is familiar with,
 *                  what it carries, the places its history has put it in. Never another being's private memory
 *                  (the perception wall, ruling-feed-per-viewer-perception).
 *
 * `viewer` is the literal 'watcher' or a character id. A Trailblazer may ask only for their own character;
 * the campaign's Watcher/ADMIN may ask for either (view-as). Sampling and shaping are pure and tested
 * (tidbits-shape.ts); this file reads the rows.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign, canViewCampaign, canPostAsCharacter } from '@/lib/permissions';
import { sampleTidbits, shapeTidbit, type TidbitPool } from './tidbits-shape';

export const tidbitsQuerySchema = z.object({
  viewer: z.string().min(1).max(64),
});
export type TidbitsQuery = z.infer<typeof tidbitsQuerySchema>;

export interface TidbitsResult { tidbits: string[]; fallback: boolean }

interface Caller { id: string; role: string }

const TAKE = 60;
/** Fewer than this many shaped lines → draw more rows (never relax the shaping rules). */
const MIN_LINES = 8;
const TAKE_MORE = 600;

const poolSize = (p: TidbitPool): number => Object.values(p).reduce((n, g) => n + (g?.length ?? 0), 0);

type Shaped = string | null;
const lines = (xs: Shaped[]): string[] => xs.filter((x): x is string => !!x);

/** The prose field of a JSON `data` blob (location / item descriptions), or ''. */
function proseOf(raw: string | null | undefined, key = 'description'): string {
  if (!raw) return '';
  try { const v = (JSON.parse(raw) as Record<string, unknown>)[key]; return typeof v === 'string' ? v : ''; } catch { return ''; }
}

/** An item's own ledger ([{kind, at, text}]) as prose lines. */
function ledgerTexts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return (JSON.parse(raw) as Array<{ text?: string }>).map((h) => h.text ?? '').filter(Boolean); } catch { return []; }
}

async function watcherPool(campaignId: string, TAKE = 60): Promise<TidbitPool> {
  const [facts, locations, items, canon, memories, intentions, wallet] = await Promise.all([
    prisma.worldFact.findMany({ where: { campaignId, supersededById: null }, select: { fact: true }, take: TAKE }),
    prisma.location.findMany({ where: { campaignId, status: { not: 'HIDDEN' } }, select: { data: true }, take: TAKE }),
    prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { story: true, history: true }, take: TAKE }),
    prisma.canonEvent.findMany({ where: { campaignId }, select: { narration: true }, orderBy: { cycle: 'desc' }, take: TAKE }),
    prisma.dayaMemoryEntry.findMany({
      where: { noticed: true, entity: { character: { campaignId } } },
      select: { content: true, entity: { select: { character: { select: { name: true } } } } },
      orderBy: { salience: 'desc' },
      take: TAKE,
    }),
    prisma.dayaIntention.findMany({
      where: { status: 'PENDING', entity: { character: { campaignId } } },
      select: { description: true, trigger: true, cadence: true, dueCycle: true, entity: { select: { character: { select: { name: true } } } } },
      take: TAKE,
    }),
    prisma.wallet.findFirst({ where: { walletType: 'CAMPAIGN', campaignId }, select: { balance: true } }),
  ]);
  const balance = wallet ? Number(wallet.balance) : 0;
  return {
    facts: lines([
      ...facts.map((f) => shapeTidbit({ kind: 'fact', text: f.fact })),
      ...locations.map((l) => shapeTidbit({ kind: 'fact', text: proseOf(l.data) })),
      ...items.map((i) => shapeTidbit({ kind: 'fact', text: i.story ?? '' })),
    ]),
    history: lines([
      ...canon.map((e) => shapeTidbit({ kind: 'history', text: e.narration })),
      ...items.flatMap((i) => ledgerTexts(i.history).map((t) => shapeTidbit({ kind: 'history', text: t }))),
    ]),
    intentions: lines(intentions.map((i) => shapeTidbit({ kind: 'intention', description: i.description, trigger: i.trigger, cadence: i.cadence, dueCycle: i.dueCycle, owner: i.entity.character.name }))),
    economy: balance > 0 ? [`The campaign holds ${balance.toLocaleString('en-US')} KRMA.`] : [],
    memories: lines(memories.map((m) => shapeTidbit({ kind: 'memory', text: m.content, owner: m.entity.character.name }))),
  };
}

async function characterPool(campaignId: string, characterId: string, TAKE = 60): Promise<TidbitPool> {
  const [entity, me] = await Promise.all([
    prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } }),
    prisma.character.findUnique({ where: { id: characterId }, select: { name: true } }),
  ]);
  const owner = me?.name ?? 'Someone';
  const [memories, intentions, held] = await Promise.all([
    entity
      ? prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id, noticed: true }, select: { content: true }, orderBy: { salience: 'desc' }, take: TAKE })
      : Promise.resolve([] as Array<{ content: string }>),
    entity
      ? prisma.dayaIntention.findMany({ where: { entityId: entity.id, status: 'PENDING' }, select: { description: true, trigger: true, cadence: true, dueCycle: true }, take: TAKE })
      : Promise.resolve([] as Array<{ description: string; trigger: string | null; cadence: string | null; dueCycle: number | null }>),
    prisma.campaignItem.findMany({ where: { campaignId, holderId: characterId, status: 'ACTIVE' }, select: { story: true }, take: TAKE }),
  ]);
  const fam = entity
    ? await prisma.familiarity.findMany({ where: { campaignId, perceiverId: entity.id, score: { gt: 0.15 } }, select: { subjectId: true, score: true }, take: 200 })
    : [];
  // Names of what it knows — resolved only from ids this character's own rows point to; the best score per subject.
  const best = new Map<string, number>();
  for (const f of fam) best.set(f.subjectId, Math.max(best.get(f.subjectId) ?? 0, f.score));
  const ids = [...best.keys()];
  const [chars, items, locs] = await Promise.all([
    prisma.character.findMany({ where: { id: { in: ids }, campaignId }, select: { id: true, name: true } }),
    prisma.campaignItem.findMany({ where: { id: { in: ids }, campaignId }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { id: { in: ids }, campaignId }, select: { id: true, name: true } }),
  ]);
  const known = [...chars, ...items, ...locs].filter((x) => x.id !== characterId);
  return {
    memories: lines(memories.map((m) => shapeTidbit({ kind: 'memory', text: m.content, owner }))),
    intentions: lines(intentions.map((i) => shapeTidbit({ kind: 'intention', description: i.description, trigger: i.trigger, cadence: i.cadence, dueCycle: i.dueCycle, owner }))),
    familiarity: lines(known.map((k) => shapeTidbit({ kind: 'familiarity', subject: k.name, score: best.get(k.id) ?? 0, owner, second: true }))),
    facts: lines(held.map((i) => shapeTidbit({ kind: 'fact', text: i.story ?? '' }))),
  };
}

/** Tidbits for one viewer. Throws ForbiddenError when the caller may not look through that viewer's eyes. */
export async function getTidbits(caller: Caller, campaignId: string, query: TidbitsQuery, random: () => number = Math.random): Promise<TidbitsResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  const member = await prisma.campaignMember.findFirst({ where: { campaignId, userId: caller.id }, select: { id: true } });
  if (!canViewCampaign(caller.id, caller.role, campaign, !!member)) throw new ForbiddenError('Not a member of this campaign');

  let pool: TidbitPool;
  if (query.viewer === 'watcher') {
    if (!canManageCampaign(caller.id, caller.role, campaign)) throw new ForbiddenError('Only the Watcher sees the whole campaign');
    pool = await watcherPool(campaignId);
    if (poolSize(pool) < MIN_LINES) pool = await watcherPool(campaignId, TAKE_MORE);
  } else {
    const character = await prisma.character.findUnique({ where: { id: query.viewer }, select: { id: true, userId: true, campaignId: true } });
    if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
    if (!canPostAsCharacter(caller.id, caller.role, campaign, character)) throw new ForbiddenError('You may only look through your own character');
    pool = await characterPool(campaignId, character.id);
    if (poolSize(pool) < MIN_LINES) pool = await characterPool(campaignId, character.id, TAKE_MORE);
  }
  return sampleTidbits(pool, random);
}
