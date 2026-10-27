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
import { sampleTidbits, clip, type TidbitPool } from './tidbits-shape';

export const tidbitsQuerySchema = z.object({
  viewer: z.string().min(1).max(64),
});
export type TidbitsQuery = z.infer<typeof tidbitsQuerySchema>;

export interface TidbitsResult { tidbits: string[]; fallback: boolean }

interface Caller { id: string; role: string }

const TAKE = 40;

async function watcherPool(campaignId: string): Promise<TidbitPool> {
  const [facts, chars, locations, items, canon, memories] = await Promise.all([
    prisma.worldFact.findMany({ where: { campaignId, supersededById: null }, select: { fact: true }, take: TAKE }),
    prisma.character.findMany({ where: { campaignId }, select: { name: true, entityType: true, status: true }, take: TAKE }),
    prisma.location.findMany({ where: { campaignId, status: { not: 'HIDDEN' } }, select: { name: true, type: true }, take: TAKE }),
    prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { name: true, holderId: true }, take: TAKE }),
    prisma.canonEvent.findMany({ where: { campaignId }, select: { narration: true }, orderBy: { cycle: 'desc' }, take: TAKE }),
    prisma.dayaMemoryEntry.findMany({
      where: { noticed: true, entity: { character: { campaignId } } },
      select: { content: true, entity: { select: { character: { select: { name: true } } } } },
      orderBy: { salience: 'desc' },
      take: TAKE,
    }),
  ]);
  const holderIds = items.map((i) => i.holderId).filter((x): x is string => !!x);
  const holders = new Map((await prisma.character.findMany({ where: { id: { in: holderIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return {
    facts: facts.map((f) => clip(f.fact)),
    memories: memories.map((m) => `${m.entity.character.name} remembers: ${clip(m.content)}`),
    beings: chars.map((c) => `${c.name} — ${c.entityType.toLowerCase().replace(/_/g, ' ')}, ${c.status.toLowerCase()}.`),
    places: locations.map((l) => `${l.name} is a ${l.type.replace(/_/g, ' ')}.`),
    things: items.map((i) => (i.holderId && holders.get(i.holderId) ? `${holders.get(i.holderId)} holds ${i.name}.` : `${i.name} is out in the world.`)),
    history: canon.map((e) => clip(e.narration)),
  };
}

async function characterPool(campaignId: string, characterId: string): Promise<TidbitPool> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
  const [memories, held, canon] = await Promise.all([
    entity
      ? prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id, noticed: true }, select: { content: true }, orderBy: { salience: 'desc' }, take: TAKE })
      : Promise.resolve([] as Array<{ content: string }>),
    prisma.campaignItem.findMany({ where: { campaignId, holderId: characterId, status: 'ACTIVE' }, select: { name: true }, take: TAKE }),
    prisma.canonEvent.findMany({ where: { campaignId, OR: [{ actorId: characterId }, { targetId: characterId }], locationId: { not: null } }, select: { locationId: true }, take: 200 }),
  ]);
  const fam = entity
    ? await prisma.familiarity.findMany({ where: { campaignId, perceiverId: entity.id, score: { gt: 0.15 } }, select: { subjectId: true }, take: 200 })
    : [];
  // Names of what it knows and where it has been — resolved only from ids this character's own rows point to.
  const subjectIds = [...new Set(fam.map((f) => f.subjectId))];
  const placeIds = [...new Set(canon.map((c) => c.locationId).filter((x): x is string => !!x))];
  const [subjChars, subjItems, subjLocs, places] = await Promise.all([
    prisma.character.findMany({ where: { id: { in: subjectIds }, campaignId }, select: { id: true, name: true } }),
    prisma.campaignItem.findMany({ where: { id: { in: subjectIds }, campaignId }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { id: { in: subjectIds }, campaignId }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { id: { in: placeIds }, campaignId }, select: { name: true } }),
  ]);
  const known = new Map<string, string>([...subjChars, ...subjItems, ...subjLocs].map((x) => [x.id, x.name]));
  const names = [...new Set(subjectIds.map((id) => known.get(id)).filter((n): n is string => !!n))];
  return {
    memories: memories.map((m) => clip(m.content)),
    things: held.map((i) => `You carry ${i.name}.`),
    beings: names.map((n) => `You know ${n}.`),
    places: places.map((p) => `You have been to ${p.name}.`),
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
  } else {
    const character = await prisma.character.findUnique({ where: { id: query.viewer }, select: { id: true, userId: true, campaignId: true } });
    if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
    if (!canPostAsCharacter(caller.id, caller.role, campaign, character)) throw new ForbiddenError('You may only look through your own character');
    pool = await characterPool(campaignId, character.id);
  }
  return sampleTidbits(pool, random);
}
