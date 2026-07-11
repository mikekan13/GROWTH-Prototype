/**
 * Inventory service (T26) — the 3-tier modular inventory.
 *
 *   EQUIPPED    — CampaignItem held by the character with `equippedTo` set to
 *                 a body-region key derived from the character's bodyAnatomy
 *                 tree (INV-55: regions are DERIVED, never a slot enum).
 *   CARRIED     — CampaignItem with holderId = character, not equipped.
 *   POSSESSIONS — EntityRelationship 'owns' links (INV-62: links, not
 *                 location) — served by services/possession.ts.
 *
 * Equip state lives ON the item instance (data.equippedTo) — single source
 * of truth. The damage path assembles worn layers from equipped items at
 * routing time (see services/damage.ts); armor condition changes persist
 * back to the item rows.
 *
 * Encumbrance: total lbs of everything held (equipped + carried) vs
 * Clout × 10 (INV-48: weight is actual lbs).
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter, canViewCharacter } from '@/lib/permissions';
import { deriveRegions, findPartByKey, type BodyRegion } from '@/lib/body-tree';
import { HUMAN_BASELINE_ANATOMY } from '@/lib/body-damage';
import type { WornLayer } from '@/lib/body-damage';
import { getCarryCapacityLbs, getItemWeightLbs, ARMOR_LAYER_RULES } from '@/types/material';
import { listCharacterPossessions } from '@/services/possession';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';

export interface InventoryItemView {
  id: string;
  name: string;
  type: string;
  status: string;
  weightLbs: number;
  equippedTo: string | null;
  data: GrowthWorldItem;
}

export type EncumbranceStatus = 'Fine' | 'Near Limit' | 'Encumbered' | 'Overloaded';

export interface EncumbranceView {
  totalLbs: number;
  capacityLbs: number;
  status: EncumbranceStatus;
}

export interface InventoryTiers {
  regions: BodyRegion[];
  equipped: InventoryItemView[];
  carried: InventoryItemView[];
  possessions: Awaited<ReturnType<typeof listCharacterPossessions>>;
  encumbrance: EncumbranceView;
}

export const equipItemSchema = z.object({
  itemId: z.string().min(1),
  /** Derived region key, e.g. 'Body/Torso'. */
  partKey: z.string().min(1),
});

export const unequipItemSchema = z.object({ itemId: z.string().min(1) });

function parseItem(row: { id: string; name: string; type: string; status: string; data: string }): InventoryItemView {
  let data: GrowthWorldItem;
  try {
    data = JSON.parse(row.data) as GrowthWorldItem;
  } catch {
    data = {} as GrowthWorldItem;
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    weightLbs: getItemWeightLbs(data as { weightLbs?: number; weightLevel?: number }),
    equippedTo: (data as { equippedTo?: string }).equippedTo ?? null,
    data,
  };
}

export function encumbranceStatus(totalLbs: number, capacityLbs: number): EncumbranceStatus {
  if (capacityLbs <= 0) return totalLbs > 0 ? 'Overloaded' : 'Fine';
  const ratio = totalLbs / capacityLbs;
  if (ratio <= 0.85) return 'Fine';
  if (ratio <= 1.0) return 'Near Limit';
  if (ratio <= 1.25) return 'Encumbered';
  return 'Overloaded';
}

function getAnatomy(charData: GrowthCharacter): GrowthWorldItem {
  return (
    (charData.bodyAnatomy as GrowthWorldItem | undefined) ??
    (JSON.parse(JSON.stringify(HUMAN_BASELINE_ANATOMY)) as GrowthWorldItem)
  );
}

async function loadCharacterOrThrow(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  return character;
}

export async function listInventory(
  characterId: string,
  viewerUserId: string,
  viewerRole: string,
): Promise<InventoryTiers> {
  const character = await loadCharacterOrThrow(characterId);
  if (!canViewCharacter(viewerUserId, viewerRole, character)) {
    throw new ForbiddenError('Not allowed to view this character');
  }
  const charData = JSON.parse(character.data) as GrowthCharacter;
  const regions = deriveRegions(getAnatomy(charData));

  const rows = await prisma.campaignItem.findMany({
    where: { holderId: characterId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });
  const items = rows.map(parseItem);

  // Items equipped to regions that no longer exist (body part destroyed or
  // anatomy changed) fall back to carried — visible, never lost.
  const regionKeys = new Set(regions.map(r => r.key));
  const equipped = items.filter(i => i.equippedTo && regionKeys.has(i.equippedTo));
  const carried = items.filter(i => !i.equippedTo || !regionKeys.has(i.equippedTo));

  const totalLbs = items.reduce((sum, i) => sum + i.weightLbs, 0);
  const clout = charData.attributes?.clout?.level ?? 0;
  const capacityLbs = getCarryCapacityLbs(clout);

  return {
    regions,
    equipped,
    carried,
    possessions: await listCharacterPossessions(characterId, viewerUserId, viewerRole),
    encumbrance: { totalLbs, capacityLbs, status: encumbranceStatus(totalLbs, capacityLbs) },
  };
}

/** Layer caps per armor category on one region (INV-52 — system-level rule). */
function assertLayerCap(existingOnPart: InventoryItemView[], incoming: GrowthWorldItem) {
  const category = (incoming as { armorCategory?: string }).armorCategory;
  if (!category) return; // non-armor items (weapons, tools) don't stack-cap
  const ruleKey =
    category === 'Clothing' ? 'clothing' : category === 'Light' ? 'lightArmor' : category === 'Heavy' ? 'heavyArmor' : null;
  if (!ruleKey) return;
  const cap = ARMOR_LAYER_RULES[ruleKey].maxLayers;
  const already = existingOnPart.filter(
    i => (i.data as { armorCategory?: string }).armorCategory === category,
  ).length;
  if (already >= cap) {
    throw new ValidationError(
      `Layer cap: at most ${cap} ${category} layer(s) per body region`,
    );
  }
}

export async function equipItem(
  characterId: string,
  input: z.infer<typeof equipItemSchema>,
  actorUserId: string,
  actorRole: string,
): Promise<InventoryItemView> {
  const { itemId, partKey } = equipItemSchema.parse(input);
  const character = await loadCharacterOrThrow(characterId);
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Not allowed to edit this character');
  }

  const row = await prisma.campaignItem.findUnique({ where: { id: itemId } });
  if (!row || row.status !== 'ACTIVE') throw new NotFoundError('Item not found');
  if (row.holderId !== characterId) {
    throw new ValidationError('Character does not hold this item');
  }

  const charData = JSON.parse(character.data) as GrowthCharacter;
  const anatomy = getAnatomy(charData);
  const part = findPartByKey(anatomy, partKey);
  if (!part) throw new ValidationError(`No body region '${partKey}' on this character`);
  if ((part.condition ?? 3) === 0) {
    throw new ValidationError(`'${partKey}' is destroyed — nothing can be equipped to it`);
  }

  const itemData = JSON.parse(row.data) as GrowthWorldItem;

  const siblings = await prisma.campaignItem.findMany({
    where: { holderId: characterId, status: 'ACTIVE', NOT: { id: itemId } },
  });
  const onSamePart = siblings
    .map(parseItem)
    .filter(i => i.equippedTo === partKey);
  assertLayerCap(onSamePart, itemData);

  const nextData = { ...itemData, equippedTo: partKey, equipped: true };
  const updated = await prisma.campaignItem.update({
    where: { id: itemId },
    data: { data: JSON.stringify(nextData) },
  });
  return parseItem(updated);
}

export async function unequipItem(
  characterId: string,
  input: z.infer<typeof unequipItemSchema>,
  actorUserId: string,
  actorRole: string,
): Promise<InventoryItemView> {
  const { itemId } = unequipItemSchema.parse(input);
  const character = await loadCharacterOrThrow(characterId);
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Not allowed to edit this character');
  }
  const row = await prisma.campaignItem.findUnique({ where: { id: itemId } });
  if (!row) throw new NotFoundError('Item not found');
  if (row.holderId !== characterId) {
    throw new ValidationError('Character does not hold this item');
  }
  const itemData = JSON.parse(row.data) as GrowthWorldItem & { equippedTo?: string };
  delete itemData.equippedTo;
  itemData.equipped = false;
  const updated = await prisma.campaignItem.update({
    where: { id: itemId },
    data: { data: JSON.stringify(itemData) },
  });
  return parseItem(updated);
}

/**
 * Assemble worn layers for damage routing: equipped ARMOR on this
 * character, grouped by region key, ordered outermost first
 * (Heavy → Light → Clothing per the canon layered-armor structure).
 * Non-armor equipment (weapons, tools) is equipped but is NOT a damage
 * layer — the layered system is armor-only (Damage_Type_Interactions.md).
 */
export async function buildWornLayers(characterId: string): Promise<Record<string, WornLayer[]>> {
  const rows = await prisma.campaignItem.findMany({
    where: { holderId: characterId, status: 'ACTIVE' },
  });
  const OUTER_ORDER: Record<string, number> = { Heavy: 0, Light: 1, Clothing: 2 };
  const byPart: Record<string, WornLayer[]> = {};
  for (const row of rows) {
    const item = parseItem(row);
    if (!item.equippedTo) continue;
    const d = item.data as {
      baseResist?: number;
      armorCategory?: 'Clothing' | 'Light' | 'Heavy';
      materialClass?: 'Soft' | 'Hard';
      condition?: number;
    };
    if (!d.armorCategory) continue; // only armor absorbs
    (byPart[item.equippedTo] ??= []).push({
      itemId: item.id,
      name: item.name,
      baseResist: d.baseResist ?? 0,
      armorCategory: d.armorCategory,
      // Data-default when the item lacks a materialClass: clothing is Soft,
      // Light/Heavy armor is Hard. Forge-authored items should set it.
      materialClass: d.materialClass ?? (d.armorCategory === 'Clothing' ? 'Soft' : 'Hard'),
      condition: d.condition ?? 3,
    });
  }
  for (const key of Object.keys(byPart)) {
    byPart[key].sort(
      (a, b) => (OUTER_ORDER[a.armorCategory ?? ''] ?? 3) - (OUTER_ORDER[b.armorCategory ?? ''] ?? 3),
    );
  }
  return byPart;
}
