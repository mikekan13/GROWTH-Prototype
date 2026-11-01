/**
 * LIFE GOODS — simulation-level material life (Mike 2026-10-16: "She have any
 * food or ingredients in that apartment? When I said extensive I meant
 * simulation level extensive.").
 *
 * Two pieces:
 *  1. `stockGoods` — ONE call places many ordinary things (a whole room, a
 *     wardrobe, a pantry): each good is a real CampaignItem she owns, placed
 *     in a room or inside a container, with quantity for consumables.
 *     MUNDANE GOODS (floor tier, under 1 KV — decimal since Mike 2026-10-16:
 *     "KV IS the price", an onion is 0.02 KV) get a campaign archetype created
 *     on the spot (tag `mundane`); a NEW thing worth 1 KV or more is forged
 *     first (the Watcher sees it). Every placement checks the holder's
 *     CAPACITY (services/capacity.ts). Anything with KV goes through the Forge as before. Nothing
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
import { findCurrency, listCurrencies } from './currency';
import { partsOf, recipeAllows, partsFromRecipe } from '@/lib/parts';
import { denominationsByCurrency } from './parts';

/** One recipe part per kind (two money goods of one currency are one "tender of" part). */
function dedupeRecipe(parts: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const p of parts) if (!out.some((o) => String(o.name).toLowerCase() === String(p.name).toLowerCase())) out.push(p);
  return out;
}
import { DEED_RELATIONSHIP } from './genesis-possessions';
import { itemKvOf, kvMirror, roundKv, WARDROBE_KIT_RE } from '@/lib/item-kv';

const ITEM_TYPES = ['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'misc'] as const;

export const goodSchema = z.object({
  archetype: z.string().min(1).max(100).describe('Campaign-agnostic name, singular, no proper nouns: "Cotton T-Shirt", "Dry Spaghetti", "Toothbrush", "Wool Sock".'),
  localName: z.string().max(100).optional().describe('Her name for this one ("the grey shirt with the hole").'),
  qty: z.number().int().min(1).max(500).optional().describe('Consumables and loose sets only (6 eggs, 40 index cards). Garments are one item each — never pairs.'),
  into: z.string().min(1).max(200).describe('Where it is: a room (Location), or ANY thing — every item is a container (the sink holds a dish, the fridge the eggs, a coat pocket a receipt). Name the holder by its local name; holders in the same call are placed first.'),
  itemType: z.enum(ITEM_TYPES).optional(),
  weightLbs: z.number().min(0).max(2000).describe('Real pounds for ONE (or for the whole qty for loose consumables).'),
  value: z.number().min(0).max(100000).optional().describe('KV — THE price (decimal: an onion 0.02, a couch 2). For ONE (or the whole qty for loose consumables). Used only when the archetype is new — stock carries its own. A new archetype must be under 1 KV; anything worth 1 KV or more is forged first.'),
  volumeCuFt: z.number().min(0).max(1_000_000).optional().describe('Space it takes up in cubic feet, for ONE (or the whole qty). A holder refuses what will not fit.'),
  capacityCuFt: z.number().min(0).max(1_000_000).optional().describe('Holders only (new archetypes): cubic feet inside (a fridge ~18, a junk drawer 0.5).'),
  capacityLbs: z.number().min(0).max(100_000).optional().describe('Holders only (new archetypes): pounds it can bear.'),
  primaryMaterial: z.string().min(1).max(60).describe('Cotton, Steel, Paper, Foodstuffs, Polymer, Glass, Ceramic, Wool, Leather…'),
  condition: z.number().int().min(0).max(4).optional().describe('4 new … 1 worn out (default 3).'),
  state: z.string().max(160).optional().describe('Present-tense state ("half full", "expires Thursday", "folded").'),
  story: z.string().max(300).optional().describe('One line, only when it has one. Most goods do not.'),
  worn: z.boolean().optional().describe('She has it on right now (sets it as carried + equipped later at dress time).'),
  parts: z.array(z.object({
    name: z.string().min(1).max(80).describe('One kind of part, singular: "twenty-dollar bill", "arrow", "split log", "blue plastic bead".'),
    count: z.number().int().min(1).max(10000),
    faceValue: z.number().min(0).optional().describe('MONEY ONLY: the face of ONE in `currency` (20 for a twenty).'),
    weightLbs: z.number().min(0).optional().describe('Pounds for ONE part.'),
    bound: z.boolean().optional().describe('Made INTO the thing (braided, sewn, nailed) — comes off only by unmaking it. Default loose: a hand can take one out.'),
    primaryMaterial: z.string().max(60).optional(),
  })).max(24).optional().describe('WHAT IT IS MADE OF, by kind and count (object permanence). A wad of cash: [{name:"twenty-dollar bill",count:2,faceValue:20},{name:"five-dollar bill",count:1,faceValue:5}]. A bundle of arrows: [{name:"arrow",count:20}]. A prayer rope: a knotted cord (bound) and three blue beads (bound). MONEY IS ALWAYS a thing whose parts are bills/coins with faceValue — never a consumable with qty, never a "state" that lists the bills in prose.'),
  currency: z.string().max(12).optional().describe("Currency code for faceValue (default: the campaign's only active currency)."),
});
export type Good = z.infer<typeof goodSchema>;

export const stockGoodsSchema = z.object({
  characterId: z.string().min(1).max(64),
  goods: z.array(goodSchema).min(1).max(120),
});

export interface StockResult {
  created: number;
  archetypesCreated: number;
  failed: Array<{ archetype: string; reason: string }>;
  containers: string[];
  /** Unknown volumes / capacities placed unchecked (stock is being backfilled). */
  warnings?: string[];
  /** What was created, with its KV (decimal). */
  items?: Array<{ id: string; name: string; kv: number }>;
}

/** New on-the-spot archetypes must sit under this KV; at or above it, forge first. */
export const MUNDANE_KV_CEILING = 1;

type Arch = { id: string; data: Record<string, unknown>; karmicValue: bigint | null };

async function findOrMakeArchetype(campaignId: string, g: Good, actorId: string, recipe: Record<string, unknown>[] | null = null): Promise<Arch | { error: string }> {
  const name = g.archetype.trim();
  const local = await prisma.forgeItem.findFirst({ where: { campaignId, type: 'item', name, status: { not: 'superseded' } }, select: { id: true, data: true, status: true, karmicValue: true } });
  if (local) {
    if (local.status === 'draft') return { error: `"${name}" is a Forge draft awaiting the Watcher` };
    return { id: local.id, data: safe(local.data), karmicValue: local.karmicValue ?? null };
  }
  const stock = await prisma.forgeItem.findFirst({ where: { isGlobal: true, type: 'item', name, status: 'published' }, select: { id: true } });
  if (stock) {
    const { pullFromGlobalCatalog } = await import('./forge');
    const copy = await pullFromGlobalCatalog(stock.id, campaignId, actorId, 'GODHEAD');
    const row = await prisma.forgeItem.findUnique({ where: { id: copy.id }, select: { id: true, data: true, karmicValue: true } });
    return row ? { id: row.id, data: safe(row.data), karmicValue: row.karmicValue ?? null } : { error: 'pull failed' };
  }
  // Mundane floor-tier archetype, created on the spot (see header). KV is
  // decimal (Mike 2026-10-16: sub-1 KRMA items allowed); a new thing worth
  // 1 KV or more is real crystallized value — the Watcher sees it in the Forge.
  const per = (n: number | undefined) => (n == null ? undefined : g.qty && g.qty > 1 ? Math.round((n / g.qty) * 1e6) / 1e6 : n);
  const value = per(g.value) ?? 0;
  if (value >= MUNDANE_KV_CEILING) {
    return { error: `"${name}" is not in stock and is worth ${value} KV — a thing of 1 KV or more is forged first (forge_blueprint), then stocked` };
  }
  const data: Record<string, unknown> = {
    description: `${name}.`,
    itemType: g.itemType ?? (g.qty ? 'consumable' : 'misc'),
    primaryMaterial: g.primaryMaterial,
    materialClass: /steel|iron|glass|ceramic|wood|stone|aluminum|metal|polymer|plastic/i.test(g.primaryMaterial) ? 'Hard' : 'Soft',
    weightLbs: per(g.weightLbs) ?? 0,
    ...(g.volumeCuFt != null ? { volumeCuFt: per(g.volumeCuFt) } : {}),
    ...(g.capacityCuFt != null ? { capacityCuFt: g.capacityCuFt } : {}),
    ...(g.capacityLbs != null ? { capacityLbs: g.capacityLbs } : {}),
    rarity: 1,
    condition: 3,
    value,
    tags: ['mundane'],
    // THE RECIPE IS THE ARCHETYPE'S (Michael 2026-11-01): what the kind of thing is made of, written when it is made.
    ...(recipe?.length ? { parts: recipe } : {}),
  };
  const row = await prisma.forgeItem.create({
    data: { campaignId, type: 'item', name, data: JSON.stringify(data), status: 'published', createdBy: actorId, authorUserId: actorId, karmicValue: kvMirror(value), royaltyRate: 0 },
    select: { id: true },
  });
  return { id: row.id, data, karmicValue: kvMirror(value) };
}

function safe(s: string): Record<string, unknown> { try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; } }

/** KV of one stocked good: the archetype's per-one KV × qty. Pure. */
export function goodKv(g: Pick<Good, 'qty'>, arch: { data: Record<string, unknown>; karmicValue?: bigint | null }): number {
  return itemKvOf(arch.data, arch.karmicValue) * (g.qty && g.qty > 1 ? g.qty : 1);
}

/** Volume of one stocked good (whole qty): stated, else archetype per-one × qty. Pure. */
export function goodVolume(g: Pick<Good, 'qty' | 'volumeCuFt'>, archData: Record<string, unknown>): number | null {
  if (g.volumeCuFt != null) return g.volumeCuFt;
  const v = archData.volumeCuFt;
  return typeof v === 'number' && Number.isFinite(v) ? v * (g.qty && g.qty > 1 ? g.qty : 1) : null;
}

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

export interface PlaceGoodsOpts {
  /** The character who owns them (deeded), or null for an unowned holder. */
  ownerId: string | null;
  /** Origin line for the item history. */
  origin: (g: Good) => string;
  /** Merged into every created item's data (e.g. { drawnFromKit }). */
  extraData?: Record<string, unknown>;
  /** A finite KV pool (a kit): each good's KV is drawn from it; one that does not fit fails alone. */
  budget?: { left: number };
}

/**
 * The shared stocking engine (stock_goods, kit draws): resolve each good's
 * place and archetype, check the holder's capacity, create the instance,
 * deed it, place it. Each good fails alone.
 */
export async function placeGoods(campaignId: string, actor: { id: string; role: string }, goods: Good[], opts: PlaceGoodsOpts): Promise<StockResult> {
  const { resolvePlace, enclosingLocationId } = await import('./placement');
  const { checkFit } = await import('./capacity');
  const warnings: string[] = [];
  const items: Array<{ id: string; name: string; kv: number }> = [];
  const res: StockResult = { created: 0, archetypesCreated: 0, failed: [], containers: [], warnings, items };
  // EVERYTHING IS A CONTAINER (Mike 2026-10-16: "Kitchen sink… might have a
  // dish in it. Refrigerator… Everything is a container… that's how we don't
  // overwhelm a human when they look at the canvas"). Any good may hold
  // others: place a good before every good whose `into` names it.
  const ordered = orderByHolding(goods);
  for (const g of ordered) {
    try {
      const place = await resolvePlace(campaignId, g.into);
      if (!place) { res.failed.push({ archetype: g.archetype, reason: `no room or container "${g.into}"` }); continue; }
      // WHAT IT IS MADE OF (Michael 2026-11-01): parts by kind and count; money parts carry their face in a campaign currency.
      let parts: Array<Record<string, unknown>> | null = null;
      if (g.parts?.length) {
        const needsCurrency = g.parts.some((pt) => pt.faceValue != null);
        const cur = needsCurrency ? (g.currency ? await findCurrency(campaignId, g.currency) : (await listCurrencies(campaignId))[0] ?? null) : null;
        if (needsCurrency && !cur) { res.failed.push({ archetype: g.archetype, reason: `no currency${g.currency ? ` "${g.currency}"` : ''} for the faces of ${g.localName?.trim() || g.archetype} — establish one first` }); continue; }
        parts = g.parts.map((pt) => ({
          name: pt.name.trim(), count: pt.count, ...(pt.bound ? { bound: true } : {}),
          each: {
            ...(pt.faceValue != null && cur ? { tender: { currencyId: cur.id, code: cur.code, faceValue: pt.faceValue } } : {}),
            ...(pt.weightLbs != null ? { weightLbs: pt.weightLbs } : {}),
            ...(pt.primaryMaterial ? { primaryMaterial: pt.primaryMaterial } : {}),
          },
        }));
      }
      const before = await prisma.forgeItem.count({ where: { campaignId, type: 'item' } });
      // The recipe on a NEW archetype: the good's kinds, loose kinds at count 1 (a wad holds any number of the bills it names).
      // MONEY NAMES NO FACES (Michael 2026-11-01): its recipe is "any denomination of this currency"; the faces live on the Currency.
      const recipe = parts ? dedupeRecipe(parts.map((pt) => {
        const each = pt.each as Record<string, unknown> | undefined;
        const tender = each?.tender as { currencyId: string } | undefined;
        if (tender) {
          const { tender: _t, ...rest } = each ?? {};
          void _t;
          return { name: `tender of ${(g.currency ?? tender.currencyId)}`, count: 1, each: { ...rest, tenderOf: tender.currencyId } };
        }
        return { ...pt, count: pt.bound ? pt.count : 1 };
      })) : null;
      const arch = await findOrMakeArchetype(campaignId, g, actor.id, recipe);
      if ('error' in arch) { res.failed.push({ archetype: g.archetype, reason: arch.error }); continue; }
      // THE RECIPE LAW: an existing archetype's recipe binds the instance.
      if (parts && Array.isArray(arch.data.parts)) {
        const faces = await denominationsByCurrency(campaignId);
        const recipeParts = partsOf(g.archetype, arch.data as Parameters<typeof partsOf>[1]);
        const instParts = partsOf(g.archetype, { parts } as unknown as Parameters<typeof partsOf>[1]);
        const verdict = recipeAllows(recipeParts, instParts, faces);
        if (!verdict.ok) { res.failed.push({ archetype: g.archetype, reason: verdict.reason }); continue; }
        parts = partsFromRecipe(recipeParts, instParts, faces) as unknown as Array<Record<string, unknown>>;
      }
      if ((await prisma.forgeItem.count({ where: { campaignId, type: 'item' } })) > before) res.archetypesCreated++;
      const name = g.localName?.trim() || g.archetype.trim();
      const kv = goodKv(g, arch);
      if (opts.budget && kv > opts.budget.left + 1e-9) {
        res.failed.push({ archetype: g.archetype, reason: `${name} (${roundKv(kv)} KV) exceeds the kit's remaining ${roundKv(opts.budget.left)} KV` });
        continue;
      }
      const volumeCuFt = goodVolume(g, arch.data);
      // CAPACITY (Mike 2026-10-16: "I can't put a whale in my apartment").
      if (!g.worn) {
        const fit = await checkFit(place, { name, volumeCuFt, weightLbs: g.weightLbs });
        if (!fit.ok) { res.failed.push({ archetype: g.archetype, reason: fit.reason ?? 'does not fit' }); continue; }
        for (const w of fit.warnings) if (warnings.length < 20 && !warnings.includes(w)) warnings.push(w);
      }
      const locationId = place.kind === 'location' ? place.id : (place.locationId ?? await enclosingLocationId(place.id));
      const item = await createCampaignItem(campaignId, actor.id, actor.role, {
        name,
        type: (g.itemType ?? (arch.data.itemType as typeof ITEM_TYPES[number]) ?? 'misc'),
        data: {
          ...arch.data, condition: g.condition ?? 3, ...(g.qty && !parts ? { quantity: g.qty } : {}), ...(g.state ? { state: g.state } : {}),
          ...(parts ? { parts } : {}),
          weightLbs: g.weightLbs, ...(volumeCuFt != null ? { volumeCuFt } : {}), ...(opts.extraData ?? {}),
        },
        holderId: g.worn ? opts.ownerId : null,
        locationId: g.worn ? null : locationId,
        sourceForgeItemId: arch.id,
        story: g.story ?? null,
        origin: opts.origin(g),
      });
      if (opts.ownerId) {
        await prisma.entityRelationship.create({ data: { campaignId, sourceId: opts.ownerId, sourceType: 'CHARACTER', targetId: item.id, targetType: 'CAMPAIGN_ITEM', relationshipType: DEED_RELATIONSHIP, strength: 3 } });
      }
      if (!g.worn) {
        await prisma.entityRelationship.create({ data: { campaignId, sourceId: item.id, sourceType: 'CAMPAIGN_ITEM', targetId: place.id, targetType: place.kind === 'location' ? 'LOCATION' : 'CAMPAIGN_ITEM', relationshipType: 'located_at', strength: 5 } });
      }
      if (goods.some(o => o !== g && o.into.trim().toLowerCase() === name.toLowerCase())) res.containers.push(name);
      if (opts.budget) opts.budget.left -= kv;
      items.push({ id: item.id, name, kv });
      res.created++;
    } catch (e) {
      res.failed.push({ archetype: g.archetype, reason: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return res;
}

/** Place many ordinary things at once — a room, a wardrobe, a pantry. */
export async function stockGoods(campaignId: string, actor: { id: string; role: string }, input: unknown): Promise<StockResult> {
  const p = stockGoodsSchema.parse(input);
  const c = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true, name: true } });
  if (!c || c.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  return placeGoods(campaignId, actor, p.goods, { ownerId: p.characterId, origin: g => `life goods: ${g.archetype}, for ${c.name}` });
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

/** The clothing areas a wardrobe kit satisfies. */
export const WARDROBE_AREAS = new Set(['tops', 'bottoms', 'underwear', 'socks', 'sleepwear', 'outerwear', 'footwear']);
export { WARDROBE_KIT_RE } from '@/lib/item-kv';

/** Score her things against the checklist. Pure. */
export function lifeCoverage(names: string[], kitContents: string[] = []): Coverage[] {
  // A KIT's one-line truth ("milk, eggs, leftover pad thai, ketchup") counts
  // too (2026-10-16): each comma / semicolon / "and" clause is one ordinary thing.
  const clauses = kitContents.flatMap(k => k.split(/[,;]|\band\b/i).map(x => x.trim()).filter(Boolean));
  const all = [...names, ...clauses];
  // A WARDROBE KIT (Mike 2026-10-16: "she doesn't need a full wardrobe… she
  // needs a kit") covers every clothing area at once.
  const wardrobeKit = kitContents.some(k => WARDROBE_KIT_RE.test(k));
  return LIFE_AREAS.map(a => {
    const have = all.filter(n => a.re.test(n)).length;
    return { area: a.label, have: wardrobeKit && WARDROBE_AREAS.has(a.key) ? Math.max(have, a.want) : have, want: a.want };
  });
}

/** The brief line. Pure. */
export function coverageLine(cov: Coverage[]): string {
  const gaps = cov.filter(c => c.have < c.want);
  if (!gaps.length) return 'LIFE COVERAGE: every area of a lived-in home is stocked.';
  return `LIFE COVERAGE — simulation level (Mike: "food or ingredients… simulation level extensive"). GAPS: ${gaps.map(g => `${g.area} ${g.have}/${g.want}`).join(' · ')}. Fill every gap before the stage is done: crystallize what matters with stock_goods; give each holder's ordinary contents a KIT (stock_kit) whose one-line truth names them.`;
}
