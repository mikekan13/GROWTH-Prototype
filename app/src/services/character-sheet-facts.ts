/**
 * Character sheet facts (2026-10-12 sheet audit) — the read side of what
 * genesis made: CharacterBlockLink rows joined to their ForgeItem archetypes
 * (with narrative paint), the canonical age, TKV, the memory-ledger count and
 * the GRO.vines (Goal rows). Read-only; campaign members may read it.
 *
 * Pure shaping lives in lib/character-sheet-facts.ts (client-safe).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { requireCampaignMember } from '@/services/campaign-access';
import { calculateCharacterTKV } from '@/lib/kv-calculator';
import {
  shapeBlockLinks,
  computeDisplayAge,
  type CharacterSheetFacts,
  type CharacterVineView,
  type RawBlockLinkRow,
} from '@/lib/character-sheet-facts';
import { isAdminRole } from '@/lib/permissions';
import type { GrowthCharacter } from '@/types/growth';

function firstOpenOpportunity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as Array<{ description?: string; status?: string }>;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const open = arr.find(o => o?.status === 'OPEN') ?? arr[arr.length - 1];
    return typeof open?.description === 'string' ? open.description : null;
  } catch {
    return null;
  }
}

/** Gate: the character's owner, or a member/GM of its campaign, or ADMIN. */
async function assertCanRead(
  character: { userId: string; campaignId: string | null },
  user: { id: string; role: string },
) {
  if (character.userId === user.id) return;
  if (character.campaignId) {
    await requireCampaignMember(character.campaignId, user);
    return;
  }
  if (!isAdminRole(user.role)) throw new ForbiddenError('You cannot view this character');
}

export async function getCharacterSheetFacts(
  characterId: string,
  user: { id: string; role: string },
): Promise<CharacterSheetFacts> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true, campaignId: true, data: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  await assertCanRead(character, user);

  let sheet: Record<string, unknown> = {};
  try { sheet = JSON.parse(character.data) as Record<string, unknown>; } catch { /* empty sheet */ }

  const [links, campaign, goals, memoryAgg] = await Promise.all([
    prisma.characterBlockLink.findMany({
      where: { characterId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, forgeItemId: true, localName: true, story: true, history: true, createdAt: true },
    }),
    character.campaignId
      ? prisma.campaign.findUnique({ where: { id: character.campaignId }, select: { currentCycle: true } })
      : Promise.resolve(null),
    prisma.goal.findMany({ where: { characterId }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
    prisma.dayaMemoryEntry.aggregate({
      where: { entity: { characterId } },
      _count: { _all: true },
      _max: { realTime: true },
    }),
  ]);

  // CharacterBlockLink has no Prisma relation to ForgeItem — join by id.
  const forgeIds = [...new Set(links.map(l => l.forgeItemId))];
  const forgeRows = forgeIds.length
    ? await prisma.forgeItem.findMany({
        where: { id: { in: forgeIds } },
        select: { id: true, type: true, name: true, status: true, data: true, karmicValue: true },
      })
    : [];
  const forgeById = new Map(forgeRows.map(f => [f.id, f]));
  const raw: RawBlockLinkRow[] = links.map(l => ({ ...l, forgeItem: forgeById.get(l.forgeItemId) ?? null }));

  // Genesis never writes `tkv` on the sheet — compute it when absent.
  const hasSheetTkv = sheet.tkv !== undefined && sheet.tkv !== null && Number.isFinite(Number(sheet.tkv));
  let tkv = hasSheetTkv ? Number(sheet.tkv) : 0;
  if (!hasSheetTkv && sheet.attributes) {
    try { tkv = calculateCharacterTKV(sheet as unknown as GrowthCharacter).total; } catch { tkv = 0; }
  }

  const vines: CharacterVineView[] = goals.map(g => {
    const gr = g as unknown as Record<string, unknown>;
    return {
      id: g.id,
      goal: g.description,
      resistance: g.resistancePlan ?? g.resistancePrompt ?? null,
      opportunity: firstOpenOpportunity(g.opportunities),
      status: g.status,
      authoredBy: typeof gr.authoredBy === 'string' ? gr.authoredBy : null,
    };
  });
  // Legacy sheet grovines — only when no Goal rows exist.
  if (vines.length === 0 && Array.isArray(sheet.grovines)) {
    for (const [i, v] of (sheet.grovines as Array<Record<string, unknown>>).entries()) {
      if (!v || typeof v.goal !== 'string' || !v.goal.trim()) continue;
      vines.push({
        id: typeof v.id === 'string' ? v.id : `sheet-${i}`,
        goal: v.goal,
        resistance: typeof v.resistance === 'string' ? v.resistance : null,
        opportunity: typeof v.opportunity === 'string' ? v.opportunity : null,
        status: typeof v.status === 'string' ? v.status : 'active',
        authoredBy: typeof v.authoredBy === 'string' ? v.authoredBy : null,
      });
    }
  }

  return {
    blocks: shapeBlockLinks(raw),
    age: computeDisplayAge(sheet as Parameters<typeof computeDisplayAge>[0], campaign?.currentCycle ?? null),
    tkv,
    memories: {
      count: memoryAgg._count?._all ?? 0,
      lastAt: memoryAgg._max?.realTime ? new Date(memoryAgg._max.realTime).toISOString() : null,
    },
    vines,
  };
}
