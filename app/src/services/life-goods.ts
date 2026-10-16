/**
 * LIFE GOODS — simulation-level material life (Mike 2026-10-16: "She have any
 * food or ingredients in that apartment? When I said extensive I meant
 * simulation level extensive.").
 *
 * Two pieces:
 *  1. `stockGoods` — ONE call places many ordinary things (a whole room, a
 *     wardrobe, a pantry): each good is a real CampaignItem she owns, placed
 *     in a room or inside a container, with quantity for consumables.
 *     MUNDANE GOODS (floor tier, 0 KV — canon: "Material KV < 1 = floor")
 *     get a campaign archetype created on the spot (tag `mundane`), because a
 *     0-KV onion crystallizes no KRMA and so has nothing for the Watcher to
 *     approve. Anything with KV goes through the Forge as before. Nothing
 *     comes in pairs: one item per boot, glove, sock.
 *  2. `lifeCoverage` — the checklist of a lived-in life (wardrobe by kind,
 *     pantry, fridge, spices, cookware, dishes, toiletries, towels, medicine,
 *     bedding, cleaning, papers, the junk drawer) scored against her things;
 *     every gap is named in the WORLD brief.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { createCampaignItem } from './campaign-item';
import { DEED_RELATIONSHIP } from './genesis-possessions';

const ITEM_TYPES = ['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'misc'] as const;

export const goodSchema = z.object({
  archetype: z.string().min(1).max(100).describe('Campaign-agnostic name, singular, no proper nouns: "Cotton T-Shirt", "Dry Spaghetti", "Toothbrush", "Wool Sock".'),
  localName: z.string().max(100).optional().describe('Her name for this one ("the grey shirt with the hole").'),
  qty: z.number().int().min(1).max(500).optional().describe('Consumables and loose sets only (6 eggs, 40 index cards). Garments are one item each — never pairs.'),
  into: z.string().min(1).max(200).describe('Where it is: a room (Location), or ANY thing — every item is a container (the sink holds a dish, the fridge the eggs, a coat pocket a receipt). Name the holder by its local name; holders in the same call are placed first.'),
  itemType: z.enum(ITEM_TYPES).optional(),
  weightLbs: z.number().min(0).max(2000).describe('Real pounds for ONE (or for the whole qty for loose consumables).'),
  primaryMaterial: z.string().min(1).max(60).describe('Cotton, Steel, Paper, Foodstuffs, Polymer, Glass, Ceramic, Wool, Leather…'),
  condition: z.number().int().min(0).max(4).optional().describe('4 new … 1 worn out (default 3).'),
  state: z.string().max(160).optional().describe('Present-tense state ("half full", "expires Thursday", "folded").'),
  story: z.string().max(300).optional().describe('One line, only when it has one. Most goods do not.'),
  worn: z.boolean().optional().describe('She has it on right now (sets it as carried + equipped later at dress time).'),
});
export type Good = z.infer<typeof goodSchema>;

export const stockGoodsSchema = z.object({
  characterId: z.string().min(1).max(64),
  goods: z.array(goodSchema).min(1).max(120),
});

export interface StockResult { created: number; archetypesCreated: number; failed: Array<{ archetype: string; reason: string }>; containers: string[] }

async function findOrMakeArchetype(campaignId: string, g: Good, actorId: string): Promise<{ id: string; data: Record<string, unknown> } | { error: string }> {
  const name = g.archetype.trim();
  const local = await prisma.forgeItem.findFirst({ where: { campaignId, type: 'item', name, status: { not: 'superseded' } }, select: { id: true, data: true, status: true } });
  if (local) {
    if (local.status === 'draft') return { error: `"${name}" is a Forge draft awaiting the Watcher` };
    return { id: local.id, data: safe(local.data) };
  }
  const stock = await prisma.forgeItem.findFirst({ where: { isGlobal: true, type: 'item', name, status: 'published' }, select: { id: true } });
  if (stock) {
    const { pullFromGlobalCatalog } = await import('./forge');
    const copy = await pullFromGlobalCatalog(stock.id, campaignId, actorId, 'GODHEAD');
    const row = await prisma.forgeItem.findUnique({ where: { id: copy.id }, select: { id: true, data: true } });
    return row ? { id: row.id, data: safe(row.data) } : { error: 'pull failed' };
  }
  // Mundane floor-tier archetype: 0 KV, created on the spot (see header).
  const data = {
    description: `${name}.`,
    itemType: g.itemType ?? (g.qty ? 'consumable' : 'misc'),
    primaryMaterial: g.primaryMaterial,
    materialClass: /steel|iron|glass|ceramic|wood|stone|aluminum|metal|polymer|plastic/i.test(g.primaryMaterial) ? 'Hard' : 'Soft',
    weightLbs: g.qty && g.qty > 1 ? Math.round((g.weightLbs / g.qty) * 1000) / 1000 : g.weightLbs,
    rarity: 1,
    condition: 3,
    value: 0,
    tags: ['mundane'],
  };
  const row = await prisma.forgeItem.create({
    data: { campaignId, type: 'item', name, data: JSON.stringify(data), status: 'published', createdBy: actorId, authorUserId: actorId, karmicValue: BigInt(0), royaltyRate: 0 },
    select: { id: true },
  });
  return { id: row.id, data };
}

function safe(s: string): Record<string, unknown> { try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; } }

/** Holders before what they hold (depth-first by `into` → name). Pure. */
export function orderByHolding(goods: Good[]): Good[] {
  const nameOf = (g: Good) => (g.localName?.trim() || g.archetype.trim()).toLowerCase();
  const byName = new Map(goods.map(g => [nameOf(g), g]));
  const out: Good[] = [];
  const seen = new Set<Good>();
  const visit = (g: Good, stack: Set<Good>) => {
    if (seen.has(g) || stack.has(g)) return;
    stack.add(g);
    const holder = byName.get(g.into.trim().toLowerCase());
    if (holder && holder !== g) visit(holder, stack);
    seen.add(g);
    out.push(g);
  };
  for (const g of goods) visit(g, new Set());
  return out;
}

/** Place many ordinary things at once — a room, a wardrobe, a pantry. */
export async function stockGoods(campaignId: string, actor: { id: string; role: string }, input: unknown): Promise<StockResult> {
  const p = stockGoodsSchema.parse(input);
  const c = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true, name: true } });
  if (!c || c.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  const { resolvePlace, enclosingLocationId } = await import('./placement');
  const res: StockResult = { created: 0, archetypesCreated: 0, failed: [], containers: [] };
  // EVERYTHING IS A CONTAINER (Mike 2026-10-16: "Kitchen sink… might have a
  // dish in it. Refrigerator… Everything is a container… that's how we don't
  // overwhelm a human when they look at the canvas"). Any good may hold
  // others: place a good before every good whose `into` names it.
  const ordered = orderByHolding(p.goods);
  for (const g of ordered) {
    try {
      const place = await resolvePlace(campaignId, g.into);
      if (!place) { res.failed.push({ archetype: g.archetype, reason: `no room or container "${g.into}"` }); continue; }
      const before = await prisma.forgeItem.count({ where: { campaignId, type: 'item' } });
      const arch = await findOrMakeArchetype(campaignId, g, actor.id);
      if ('error' in arch) { res.failed.push({ archetype: g.archetype, reason: arch.error }); continue; }
      if ((await prisma.forgeItem.count({ where: { campaignId, type: 'item' } })) > before) res.archetypesCreated++;
      const locationId = place.kind === 'location' ? place.id : (place.locationId ?? await enclosingLocationId(place.id));
      const name = g.localName?.trim() || g.archetype.trim();
      const item = await createCampaignItem(campaignId, actor.id, actor.role, {
        name,
        type: (g.itemType ?? (arch.data.itemType as typeof ITEM_TYPES[number]) ?? 'misc'),
        data: { ...arch.data, condition: g.condition ?? 3, ...(g.qty ? { quantity: g.qty } : {}), ...(g.state ? { state: g.state } : {}), weightLbs: g.weightLbs },
        holderId: g.worn ? p.characterId : null,
        locationId: g.worn ? null : locationId,
        sourceForgeItemId: arch.id,
        story: g.story ?? null,
        origin: `life goods: ${g.archetype}, for ${c.name}`,
      });
      await prisma.entityRelationship.create({ data: { campaignId, sourceId: p.characterId, sourceType: 'CHARACTER', targetId: item.id, targetType: 'CAMPAIGN_ITEM', relationshipType: DEED_RELATIONSHIP, strength: 3 } });
      if (!g.worn) {
        await prisma.entityRelationship.create({ data: { campaignId, sourceId: item.id, sourceType: 'CAMPAIGN_ITEM', targetId: place.id, targetType: place.kind === 'location' ? 'LOCATION' : 'CAMPAIGN_ITEM', relationshipType: 'located_at', strength: 5 } });
      }
      if (p.goods.some(o => o !== g && o.into.trim().toLowerCase() === name.toLowerCase())) res.containers.push(name);
      res.created++;
    } catch (e) {
      res.failed.push({ archetype: g.archetype, reason: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return res;
}

// ── Coverage: what a lived-in life has ───────────────────────────────────

export interface CoverageArea { key: string; label: string; want: number; re: RegExp }

/** The checklist. `want` = the fewest distinct things that make it real. */
export const LIFE_AREAS: CoverageArea[] = [
  { key: 'tops', label: 'tops (shirts, sweaters)', want: 6, re: /\b(shirt|t-shirt|tee|blouse|top|sweater|jumper|cardigan|hoodie|sweatshirt|tank)\b/i },
  { key: 'bottoms', label: 'bottoms (jeans, trousers, skirts)', want: 4, re: /\b(jeans|trousers|pants|slacks|shorts|skirt|leggings)\b/i },
  { key: 'underwear', label: 'underwear and bras', want: 7, re: /\b(underwear|bra|briefs|panties|boxers|undershirt)\b/i },
  { key: 'socks', label: 'socks (one item each)', want: 8, re: /\bsocks?\b/i },
  { key: 'sleepwear', label: 'sleepwear', want: 2, re: /\b(pajama|pyjama|nightgown|sleep shirt|robe)\b/i },
  { key: 'outerwear', label: 'outerwear', want: 2, re: /\b(coat|jacket|parka|raincoat|windbreaker)\b/i },
  { key: 'footwear', label: 'footwear (one item per shoe)', want: 4, re: /\b(boot|shoe|sneaker|trainer|sandal|slipper|flat|heel)s?\b/i },
  { key: 'pantry', label: 'pantry staples', want: 10, re: /\b(rice|pasta|spaghetti|flour|sugar|oats|cereal|beans|lentils|bread|crackers|canned|soup|peanut butter|honey|tea|coffee)\b/i },
  { key: 'fridge', label: 'fridge and fresh food', want: 8, re: /\b(milk|eggs?|butter|cheese|yogurt|apple|onion|garlic|potato|carrot|lettuce|tomato|lemon|banana|leftover|orange juice|chicken)\b/i },
  { key: 'spices', label: 'oils, spices, condiments', want: 6, re: /\b(salt|pepper|oil|vinegar|spice|cinnamon|paprika|cumin|oregano|basil|ketchup|mustard|mayonnaise|soy sauce|hot sauce)\b/i },
  { key: 'cookware', label: 'cookware', want: 4, re: /\b(pan|pot|skillet|saucepan|baking sheet|kettle|colander|cutting board)\b/i },
  { key: 'utensils', label: 'utensils and knives', want: 6, re: /\b(fork|spoon|knife|spatula|ladle|whisk|tongs|peeler|can opener)\b/i },
  { key: 'dishes', label: 'dishes, mugs, glasses', want: 6, re: /\b(plate|bowl|mug|cup|glass|tumbler)\b/i },
  { key: 'toiletries', label: 'toiletries', want: 8, re: /\b(toothbrush|toothpaste|floss|soap|shampoo|conditioner|deodorant|razor|lotion|hairbrush|comb|hair tie|tampons?|pads?|makeup|lip balm)\b/i },
  { key: 'towels', label: 'towels and washcloths', want: 3, re: /\b(towel|washcloth|bath mat)\b/i },
  { key: 'medicine', label: 'medicine cabinet', want: 3, re: /\b(painkiller|ibuprofen|acetaminophen|aspirin|bandage|band-aid|vitamin|prescription|cold medicine|thermometer)\b/i },
  { key: 'bedding', label: 'bed and bedding', want: 4, re: /\b(bed|mattress|sheet|duvet|comforter|blanket|pillow|quilt)\b/i },
  { key: 'cleaning', label: 'cleaning and laundry', want: 5, re: /\b(detergent|dish soap|sponge|broom|mop|vacuum|trash bag|bleach|cleaner|paper towels?|laundry)\b/i },
  { key: 'papers', label: 'papers, ID, wallet, mail', want: 4, re: /\b(wallet|license|id card|passport|bill|mail|lease|receipt|checkbook|notebook|envelope)\b/i },
  { key: 'junk', label: 'the junk drawer', want: 6, re: /\b(rubber band|batteries|tape|scissors|takeout menu|spare key|pen|pencil|matches|lighter|twist tie|safety pin|screwdriver|flashlight|charger)\b/i },
];

export interface Coverage { area: string; have: number; want: number }

/** Score her things against the checklist. Pure. */
export function lifeCoverage(names: string[]): Coverage[] {
  return LIFE_AREAS.map(a => ({ area: a.label, have: names.filter(n => a.re.test(n)).length, want: a.want }));
}

/** The brief line. Pure. */
export function coverageLine(cov: Coverage[]): string {
  const gaps = cov.filter(c => c.have < c.want);
  if (!gaps.length) return 'LIFE COVERAGE: every area of a lived-in home is stocked.';
  return `LIFE COVERAGE — simulation level (Mike: "food or ingredients… simulation level extensive"). GAPS: ${gaps.map(g => `${g.area} ${g.have}/${g.want}`).join(' · ')}. Fill every gap with stock_goods (one call per room or container) before the stage is done.`;
}
