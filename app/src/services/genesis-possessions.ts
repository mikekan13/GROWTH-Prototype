/**
 * Genesis POSSESSIONS stage (2026-10-12). "Things like possessions,
 * inventory etc. are things JEWL should be authoring when making a character
 * too." (Mike). The backstory's prose grants become real objects.
 *
 * CATALOG FIRST + NARRATIVE PAINT
 * ([[ruling-narrative-paint-global-archetype-local-instance-2026-10-12]]):
 * the archetype is a campaign-agnostic Forge item ("Silver Butter Knife");
 * the INSTANCE is a CampaignItem carrying the local name ("Rosemary's
 * keepsake"), the story, and an origin entry in its own history ledger.
 * Stock is pulled free ([[stock-catalog-public-free-2026-08-06]]); a NEW
 * item is never invented here — it goes through propose_forge_blueprint
 * (archetype validator, Kai grades, the Watcher's KRMA via the approval
 * batch) and is granted once published.
 *
 * THREE TIERS (GROWTH-DESIGN-TRUTH §13.5, [[inventory-paperdoll]]):
 *   equipped — held + data.equippedTo = a body-region key DERIVED from her
 *              anatomy (per seed, never a fixed slot list)
 *   carried  — held (holderId), not equipped
 *   owned    — the DEED: an 'owns' edge character → item, never containment
 *              ([[possessions-are-links-not-containment-2026-06-06]]); where
 *              it physically is rides on located_at, separately
 * Weight is real lbs ([[weight-system-stripped-actual-lbs]]).
 * [NEEDS MIKE] whether owned items add to her TKV — NOT added.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createCampaignItem } from './campaign-item';
import { wearableRegions } from '@/lib/body-tree';
import { HUMAN_BASELINE_ANATOMY } from '@/lib/body-damage';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';

export const POSSESSION_TIERS = ['equipped', 'carried', 'owned'] as const;
export type PossessionTier = (typeof POSSESSION_TIERS)[number];

/** The deed edge the possessions panel reads (services/possession.ts). */
export const DEED_RELATIONSHIP = 'owns';

const ITEM_TYPES = ['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'misc'] as const;

export const grantPossessionSchema = z.object({
  characterId: z.string().min(1).max(64),
  item: z.string().min(1).max(200).describe('Forge item archetype: id or EXACT name (this campaign first, then stock — pulled free).'),
  tier: z.enum(POSSESSION_TIERS),
  slot: z.string().max(120).optional().describe('equipped only: a body-region key from her anatomy (e.g. "Body/Torso").'),
  localName: z.string().min(1).max(100).optional().describe('NARRATIVE PAINT: her name for it ("Rosemary\'s keepsake"). May carry proper nouns.'),
  story: z.string().min(1).max(600).describe('NARRATIVE PAINT: this object\'s story with her — whose it was, how she came by it.'),
  look: z.string().min(1).max(240).optional().describe('How THIS one looks, as a noun phrase the portrait paints (colour, marks, how it is worn): "a blue polo with the red, white and blue Chess Pizza logo", "a wool prayer rope wrapped five times around his left wrist". Worn things need it.'),
  concealed: z.boolean().optional().describe('Worn hidden, under the clothes, never seen (a cross under the shirt).'),
  weightLbs: z.number().min(0).max(1_000_000).optional().describe('Real pounds. Required for equipped/carried when the archetype has none.'),
  location: z.string().max(200).optional().describe('owned only: WHERE it sits — a room (Location name/id) or a CONTAINER item (its local name/id: a bookcase, a drawer, a closet). The world is a top-down map; everything has a place.'),
  allowDuplicate: z.boolean().optional().describe('She already holds or owns an instance of this archetype → the grant is refused unless this is true (two mugs are fine; the same laptop twice is not).'),
});

export type GrantPossessionInput = z.infer<typeof grantPossessionSchema>;

export type GrantResult =
  | { ok: true; itemId: string; name: string; archetype: string; tier: PossessionTier; source: 'campaign' | 'stock'; deedId?: string; reused?: boolean; inside?: string }
  | { ok: false; reason: string; blueprintId?: string };

/** The regions of her body a thing can be worn ON or OVER — surface parts
 *  only, never an organ (Mike 2026-10-16: "things go on or over them"). Pure. */
export function regionKeys(sheet: Partial<GrowthCharacter>): string[] {
  const anatomy = (sheet.bodyAnatomy as GrowthWorldItem | undefined) ?? (JSON.parse(JSON.stringify(HUMAN_BASELINE_ANATOMY)) as GrowthWorldItem);
  return wearableRegions(anatomy).map(r => r.key);
}

/** A Location of this campaign by id or (case-insensitive) exact name. */
export async function findCampaignLocation(campaignId: string, ref: string): Promise<{ id: string; name: string } | null> {
  const r = ref.trim();
  if (!r) return null;
  const rows = await prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true } });
  return rows.find(l => l.id === r) ?? rows.find(l => l.name.toLowerCase() === r.toLowerCase()) ?? null;
}

async function resolveArchetype(campaignId: string, ref: string, actor: { id: string; role: string }) {
  const where = { type: 'item', OR: [{ id: ref }, { name: ref }] };
  const local = await prisma.forgeItem.findFirst({
    where: { campaignId, status: { not: 'superseded' }, ...where },
    orderBy: { updatedAt: 'desc' },
  });
  if (local) return { row: local, source: 'campaign' as const };
  const stock = await prisma.forgeItem.findFirst({ where: { isGlobal: true, status: { not: 'superseded' }, ...where }, select: { id: true } });
  if (!stock) return null;
  const { pullFromGlobalCatalog } = await import('./forge');
  const copy = await pullFromGlobalCatalog(stock.id, campaignId, actor.id, actor.role);
  const row = await prisma.forgeItem.findUnique({ where: { id: copy.id } });
  return row ? { row, source: 'stock' as const } : null;
}

export async function grantPossession(
  campaignId: string,
  actor: { id: string; role: string },
  input: unknown,
): Promise<GrantResult> {
  const p = grantPossessionSchema.parse(input);
  const character = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true, data: true, name: true } });
  if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');

  const found = await resolveArchetype(campaignId, p.item.trim(), actor);
  if (!found) {
    return {
      ok: false,
      reason: `No item archetype "${p.item}" in this campaign or the stock catalog (exact name). ` +
        'Draft it with propose_forge_blueprint type "item" — a campaign-agnostic archetype (no proper nouns), with characterId, ' +
        'attachmentStory and localName for her instance — then grant it here once the GM approves it.',
    };
  }
  const { row, source } = found;
  if (row.status === 'draft') {
    return { ok: false, blueprintId: row.id, reason: `"${row.name}" is still a DRAFT awaiting the GM in the Forge — grant it after approval; carry on with the rest.` };
  }

  let forgeData: Record<string, unknown> = {};
  try { forgeData = JSON.parse(row.data) as Record<string, unknown>; } catch { forgeData = {}; }
  const archetypeWeight = typeof forgeData.weightLbs === 'number' ? forgeData.weightLbs : null;
  const weightLbs = p.weightLbs ?? archetypeWeight;
  if (p.tier !== 'owned' && weightLbs == null) {
    throw new ValidationError(`"${row.name}" has no weight — give weightLbs in real pounds for something she wears or carries.`);
  }

  let equippedTo: string | null = null;
  if (p.tier === 'equipped') {
    const sheet = JSON.parse(character.data) as Partial<GrowthCharacter>;
    const keys = regionKeys(sheet);
    if (!p.slot || !keys.includes(p.slot)) {
      throw new ValidationError(`equipped needs slot = one of her body regions: ${keys.join(', ')}`);
    }
    equippedTo = p.slot;
  }
  if (p.tier !== 'owned' && p.location) {
    throw new ValidationError('location is for owned things — what she wears or carries is with her.');
  }
  // WHERE it sits (2026-10-16): a room, or inside a container item.
  let locationId: string | null = null;
  let container: { id: string; name: string } | null = null;
  if (p.location) {
    const loc = await findCampaignLocation(campaignId, p.location);
    if (loc) locationId = loc.id;
    else {
      const { resolvePlace, enclosingLocationId } = await import('./placement');
      const place = await resolvePlace(campaignId, p.location);
      if (!place || place.kind !== 'item') throw new ValidationError(`No Location or container item "${p.location}" in this campaign — seed or create it first.`);
      container = { id: place.id, name: place.name };
      locationId = place.locationId ?? await enclosingLocationId(place.id);
    }
  }

  const name = p.localName?.trim() || row.name;
  // Idempotent: the same archetype under the same name already granted to her.
  const prior = await prisma.campaignItem.findFirst({
    where: { campaignId, sourceForgeItemId: row.id, name, status: 'ACTIVE' },
    select: { id: true, holderId: true },
  });
  if (prior) {
    const deed = await prisma.entityRelationship.findFirst({ where: { sourceId: p.characterId, targetId: prior.id, relationshipType: DEED_RELATIONSHIP }, select: { id: true } });
    if (prior.holderId === p.characterId || deed) {
      return { ok: true, itemId: prior.id, name, archetype: row.name, tier: p.tier, source, deedId: deed?.id, reused: true };
    }
  }
  // Never grant twice (2026-10-16: the rerun gave her two lamps, two baskets,
  // two laptops under different paint): the same ARCHETYPE already hers
  // under another name is refused unless the caller says duplicates are meant.
  if (!p.allowDuplicate) {
    const deedsAll = await prisma.entityRelationship.findMany({ where: { sourceId: p.characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' }, select: { targetId: true } });
    const same = await prisma.campaignItem.findFirst({
      where: { campaignId, sourceForgeItemId: row.id, status: 'ACTIVE', OR: [{ holderId: p.characterId }, { id: { in: deedsAll.map(d => d.targetId) } }] },
      select: { id: true, name: true },
    });
    if (same) {
      return { ok: false, reason: `She already has a "${row.name}" — "${same.name}" (${same.id}). Not granted again. If she truly owns two, pass allowDuplicate: true; to move or re-place it, use move_item.` };
    }
  }

  const itemType = typeof forgeData.itemType === 'string' && (ITEM_TYPES as readonly string[]).includes(forgeData.itemType)
    ? forgeData.itemType as (typeof ITEM_TYPES)[number] : 'misc';
  const data: Record<string, unknown> = {
    condition: 3,
    tags: [],
    ...forgeData,
    ...(weightLbs != null ? { weightLbs } : {}),
    ...(equippedTo ? { equippedTo, equipped: true } : {}),
    ...(p.look ? { look: p.look } : {}),
    ...(p.concealed ? { concealed: true } : {}),
  };
  const item = await createCampaignItem(campaignId, actor.id, actor.role, {
    name,
    type: itemType,
    data,
    holderId: p.tier === 'owned' ? null : p.characterId,
    locationId,
    sourceForgeItemId: row.id,
    story: p.story,
    origin: `genesis: ${source === 'stock' ? 'pulled from stock' : 'campaign archetype'} "${row.name}", painted for ${character.name}`,
  });

  let deedId: string | undefined;
  if (p.tier === 'owned') {
    const deed = await prisma.entityRelationship.create({
      data: {
        campaignId,
        sourceId: p.characterId,
        sourceType: 'CHARACTER',
        targetId: item.id,
        targetType: 'CAMPAIGN_ITEM',
        relationshipType: DEED_RELATIONSHIP,
        strength: 5,
        data: JSON.stringify({ note: 'granted at genesis' }),
      },
    });
    deedId = deed.id;
  }
  if (container || locationId) {
    await prisma.entityRelationship.create({
      data: {
        campaignId,
        sourceId: item.id,
        sourceType: 'CAMPAIGN_ITEM',
        targetId: container ? container.id : locationId!,
        targetType: container ? 'CAMPAIGN_ITEM' : 'LOCATION',
        relationshipType: 'located_at',
        strength: 5,
      },
    });
  }
  return { ok: true, itemId: item.id, name, archetype: row.name, tier: p.tier, source, deedId, ...(container ? { inside: container.name } : {}) };
}

// ── drop_possession (2026-10-16) — JEWL corrects his own grants ──────────
// The rerun's first WORLD cycle granted a phone twice and then blocked,
// having no way to take one back. A drop removes a thing she holds or holds
// the deed to (and its edges); nothing else — never another character's.
export const dropPossessionSchema = z.object({
  characterId: z.string().min(1).max(64),
  item: z.string().min(1).max(200).describe('The CampaignItem: id or her local name for it (exact).'),
  reason: z.string().min(1).max(200).describe('Why it goes ("granted twice", "over budget", "the GM cut it").'),
});
export type DropPossessionInput = z.infer<typeof dropPossessionSchema>;

export async function dropPossession(
  campaignId: string,
  actor: { id: string; role: string },
  input: unknown,
): Promise<{ ok: true; itemId: string; name: string } | { ok: false; reason: string }> {
  const p = dropPossessionSchema.parse(input);
  const character = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true } });
  if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  void actor;
  const deeds = await prisma.entityRelationship.findMany({
    where: { sourceId: p.characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' },
    select: { targetId: true },
  });
  const ref = p.item.trim();
  const item = await prisma.campaignItem.findFirst({
    where: {
      campaignId, status: 'ACTIVE',
      OR: [{ id: ref }, { name: ref }],
      AND: [{ OR: [{ holderId: p.characterId }, { id: { in: deeds.map(d => d.targetId) } }] }],
    },
    select: { id: true, name: true },
  });
  if (!item) return { ok: false, reason: `No "${p.item}" among the things she holds or owns (exact local name or id).` };
  await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: item.id }, { targetId: item.id }] } });
  await prisma.campaignItem.delete({ where: { id: item.id } });
  return { ok: true, itemId: item.id, name: item.name };
}
