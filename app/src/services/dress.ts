/**
 * DRESS (Mike, 16 Oct 2026): "After face and body are locked in the user
 * should be able to go to the portrait and either dress their character
 * using their items that the character has deeds to, or let the AI pick an
 * outfit." NOTHING IS INVENTED OR GRANTED HERE — the WORLD stage built her
 * whole wardrobe and kit; dressing is choosing from what she already owns
 * (held, or held by deed in a room). JEWL is "intimate with every object she
 * has" and proposes what she WEARS (equippedTo = a region of her anatomy,
 * outermost shared region) and what she CARRIES (held, not equipped); the
 * player or GM approves — JEWL never approves.
 *
 *   listWardrobe   her things: garments + the rest, each worn / carried / owned
 *   setDressState  one thing → worn (region) | carried | owned (put down at home)
 *   proposeOutfit  ONE JEWL call (lane local, fiction) → {pieces} from her things
 *   applyOutfit    the approved proposal → the states (garments left out are taken off)
 *
 * Inventory law (Inventory_Paperdoll.md): equipped = worn OVER a body region
 * (data.equippedTo), carried = holderId with no region, possessions = `owns`
 * edges (links, not containment). A thing she picks up leaves its place
 * (located_at edges and locationId cleared); a thing put down goes to her home.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter, canViewCharacter } from '@/lib/permissions';
import { routedChatText } from '@/ai/network';
import { PLACE_RELATIONS } from '@/lib/genesis-stages';
import { possessiveFor, restoreDesigner } from '@/lib/appearance-designer';
import { lookLines } from './genesis-brief-context';
import { DEED_RELATIONSHIP, regionKeys } from './genesis-possessions';
import { factPrefix } from './genesis-reset';
import { extractJson } from './sketch-genesis-rules';
import { lightFacts } from './portrait-brief';
import type { GrowthCharacter } from '@/types/growth';

export const DRESS_TIMEOUT_MS = 25_000;
export const DRESS_STATES = ['worn', 'carried', 'owned'] as const;
export type DressState = (typeof DRESS_STATES)[number];

export const WARDROBE_EMPTY_LINE = 'Her wardrobe is empty — her life is built in the WORLD stage first.';

// ── Types ───────────────────────────────────────────────────────────────

export interface WardrobeItem {
  id: string;
  name: string;
  archetype: string | null;
  type: string;
  description: string | null;
  material: string | null;
  /** armorCategory: Clothing | Light | Heavy | null. */
  category: string | null;
  /** A garment (something worn as clothing) vs. the rest of her kit. */
  garment: boolean;
  state: DressState;
  /** equippedTo when worn. */
  region: string | null;
  /** The room it sits in when owned (put down). */
  where: string | null;
}

export interface Wardrobe {
  /** Her body regions (anatomy-derived; never a slot list). */
  regions: string[];
  garments: WardrobeItem[];
  things: WardrobeItem[];
  /** No garments at all → the DRESS section says so and offers no paint. */
  empty: boolean;
}

export interface OutfitPiece {
  itemId: string;
  name: string;
  state: 'worn' | 'carried';
  region: string | null;
  why: string;
}

export interface OutfitProposal {
  pieces: OutfitPiece[];
  /** True = JEWL wrote it; false = the deterministic fallback (he was cold or unreadable). */
  byJewl: boolean;
  empty: boolean;
}

// ── Pure ────────────────────────────────────────────────────────────────

const GARMENT_WORDS = /\b(coat|jacket|parka|anorak|blazer|shirt|t-shirt|tee|blouse|top|dress|gown|suit|boots?|shoes?|sneakers|trainers|sandals|heels|hat|cap|beanie|hood(ie)?|jeans|trousers|pants|slacks|shorts|skirt|sweater|jumper|cardigan|pullover|scarf|gloves?|mittens|socks|stockings|tights|leggings|outfit|clothes|clothing|cloak|robe|tunic|vest|waistcoat|uniform|jersey|overalls|coveralls|apron|belt|underwear|bra|lingerie|pyjamas|pajamas|nightgown|kimono|sari|poncho|shawl|wrap)\b/i;

/** Is this thing clothing? armorCategory Clothing, a clothing tag, or a garment word in the name/archetype. Pure. */
export function isGarment(name: string, archetype: string | null, data: { armorCategory?: string; tags?: unknown; itemType?: string }): boolean {
  if (data.armorCategory === 'Clothing') return true;
  if (Array.isArray(data.tags) && data.tags.some(t => typeof t === 'string' && /^(clothing|garment|apparel|wear)$/i.test(t))) return true;
  return GARMENT_WORDS.test(name) || (!!archetype && GARMENT_WORDS.test(archetype));
}

/**
 * The region a garment is worn over, from its words (outermost-shared-region
 * rule: a full outfit / dress / robe goes on the root; a coat on the torso;
 * boots on the feet). Falls back to the torso, then the root. Pure.
 */
export function guessRegion(name: string, regions: string[]): string | null {
  if (regions.length === 0) return null;
  const n = name.toLowerCase();
  const find = (re: RegExp) => regions.find(r => re.test(r.split('/').pop() ?? r));
  const root = regions.find(r => !r.includes('/')) ?? regions[0];
  if (/\b(outfit|dress|gown|robe|suit|uniform|overalls|coveralls|pyjamas|pajamas|nightgown|kimono|sari)\b/.test(n)) return root;
  if (/\b(hat|cap|beanie|hood|helmet|scarf|glasses|earrings?)\b/.test(n)) return find(/^head$/i) ?? root;
  if (/\b(boots?|shoes?|sneakers|trainers|sandals|heels|socks)\b/.test(n)) return find(/^(feet|foot|left foot|right foot|legs?)$/i) ?? root;
  if (/\b(jeans|trousers|pants|slacks|shorts|skirt|leggings|tights|stockings)\b/.test(n)) return find(/^(legs?|hips|waist)$/i) ?? find(/^torso$/i) ?? root;
  if (/\b(gloves?|mittens|ring|watch|bracelet)\b/.test(n)) return find(/^(hands?|left hand|right hand|arms?)$/i) ?? root;
  return find(/^torso$/i) ?? root;
}

const outfitAnswerSchema = z.object({
  pieces: z.array(z.object({
    itemId: z.string().min(1).max(64),
    state: z.enum(['worn', 'carried']).optional(),
    region: z.string().max(120).optional().nullable(),
    why: z.string().max(240).optional(),
  })).max(40),
});

/**
 * JEWL's answer → pieces, every one an item SHE OWNS (unknown ids dropped),
 * regions checked against her anatomy (a bad one is guessed from the name).
 * Null = no readable JSON. Pure.
 */
export function parseOutfitAnswer(text: string, wardrobe: Wardrobe): OutfitPiece[] | null {
  const json = extractJson(text);
  if (!json || typeof json !== 'object') return null;
  const r = outfitAnswerSchema.safeParse(json);
  if (!r.success) return null;
  const all = new Map([...wardrobe.garments, ...wardrobe.things].map(i => [i.id, i]));
  const seen = new Set<string>();
  const out: OutfitPiece[] = [];
  for (const p of r.data.pieces) {
    const item = all.get(p.itemId);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    const state: 'worn' | 'carried' = p.state ?? (item.garment ? 'worn' : 'carried');
    const region = state === 'worn'
      ? (p.region && wardrobe.regions.includes(p.region) ? p.region : guessRegion(item.name, wardrobe.regions))
      : null;
    out.push({ itemId: item.id, name: item.name, state, region, why: (p.why ?? '').trim().slice(0, 240) });
  }
  return out;
}

/** The deterministic outfit: one garment per region (worn), the pocket kit carried. Pure. */
export function draftOutfit(wardrobe: Wardrobe): OutfitPiece[] {
  const byRegion = new Map<string, WardrobeItem>();
  for (const g of wardrobe.garments) {
    const region = g.region && wardrobe.regions.includes(g.region) ? g.region : guessRegion(g.name, wardrobe.regions);
    if (!region) continue;
    // Keep what she already wears on a region; else the first garment named for it.
    const cur = byRegion.get(region);
    if (!cur || (g.state === 'worn' && cur.state !== 'worn')) byRegion.set(region, g);
  }
  const worn: OutfitPiece[] = [...byRegion.entries()].map(([region, g]) => ({ itemId: g.id, name: g.name, state: 'worn', region, why: g.state === 'worn' ? 'already on' : 'the garment for that part' }));
  const KIT = /\b(bag|purse|satchel|backpack|keys?|phone|wallet|watch|notebook|pen|lighter|cigarettes|glasses|umbrella)\b/i;
  const carried: OutfitPiece[] = wardrobe.things
    .filter(t => t.state === 'carried' || KIT.test(t.name) || (!!t.archetype && KIT.test(t.archetype)))
    .map(t => ({ itemId: t.id, name: t.name, state: 'carried', region: null, why: t.state === 'carried' ? 'already on her' : 'the everyday kit' }));
  return [...worn, ...carried];
}

/** The wardrobe as JEWL sees it. Pure. */
export function renderWardrobe(w: Wardrobe): string {
  const row = (i: WardrobeItem) =>
    `- ${i.id} · ${i.name}${i.archetype && i.archetype !== i.name ? ` [${i.archetype}]` : ''}${i.material ? ` · ${i.material}` : ''} · ${i.state}${i.region ? ` over ${i.region}` : ''}${i.where ? ` @ ${i.where}` : ''}${i.description ? ` — ${i.description.slice(0, 120)}` : ''}`;
  return [
    `HER REGIONS (a worn piece covers one; outermost shared region — a whole outfit goes on the root): ${w.regions.join(', ')}`,
    `GARMENTS (${w.garments.length}):`, ...w.garments.map(row),
    `THE REST (${w.things.length}; what she carries comes from here):`, ...w.things.map(row),
  ].join('\n');
}

// ── Load ────────────────────────────────────────────────────────────────

type Sheet = Partial<GrowthCharacter> & { identity?: { sex?: string; designer?: unknown } & Record<string, unknown>; wealth?: { holdings?: Array<{ amount: number; code: string; where?: string }>; income?: Array<{ amountPerYear: number; code: string; source: string }> } };

async function loadCharacter(characterId: string) {
  const c = await prisma.character.findUnique({ where: { id: characterId }, include: { campaign: { select: { gmUserId: true } } } });
  if (!c) throw new NotFoundError('Character not found');
  let sheet: Sheet = {};
  try { sheet = JSON.parse(c.data) as Sheet; } catch { sheet = {}; }
  return { row: c, sheet };
}

async function loadWardrobe(characterId: string, campaignId: string | null, sheet: Sheet): Promise<Wardrobe> {
  const regions = regionKeys(sheet);
  const deeds = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' },
    select: { targetId: true },
  });
  const rows = await prisma.campaignItem.findMany({
    where: { status: 'ACTIVE', ...(campaignId ? { campaignId } : {}), OR: [{ holderId: characterId }, { id: { in: deeds.map(d => d.targetId) } }] },
    select: { id: true, name: true, type: true, data: true, holderId: true, locationId: true, sourceForgeItemId: true },
    orderBy: { name: 'asc' },
  });
  const archIds = [...new Set(rows.map(r => r.sourceForgeItemId).filter((x): x is string => !!x))];
  const archetypes = archIds.length ? await prisma.forgeItem.findMany({ where: { id: { in: archIds } }, select: { id: true, name: true } }) : [];
  const archName = new Map(archetypes.map(a => [a.id, a.name]));
  const locIds = [...new Set(rows.map(r => r.locationId).filter((x): x is string => !!x))];
  const locations = locIds.length ? await prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }) : [];
  const locName = new Map(locations.map(l => [l.id, l.name]));

  const garments: WardrobeItem[] = [];
  const things: WardrobeItem[] = [];
  for (const r of rows) {
    let d: { equippedTo?: string; description?: string; primaryMaterial?: string; material?: string; armorCategory?: string; tags?: unknown; itemType?: string } = {};
    try { d = JSON.parse(r.data) as typeof d; } catch { d = {}; }
    const archetype = r.sourceForgeItemId ? archName.get(r.sourceForgeItemId) ?? null : null;
    const held = r.holderId === characterId;
    const worn = held && !!d.equippedTo && regions.includes(d.equippedTo);
    const item: WardrobeItem = {
      id: r.id, name: r.name, archetype, type: r.type,
      description: d.description ?? null, material: d.primaryMaterial ?? d.material ?? null, category: d.armorCategory ?? null,
      garment: isGarment(r.name, archetype, d),
      state: worn ? 'worn' : held ? 'carried' : 'owned',
      region: worn ? d.equippedTo! : null,
      where: !held && r.locationId ? locName.get(r.locationId) ?? null : null,
    };
    (item.garment ? garments : things).push(item);
  }
  return { regions, garments, things, empty: garments.length === 0 };
}

/** Her wardrobe + kit for the DRESS section. Viewer must see the character. */
export async function listWardrobe(characterId: string, viewer: { id: string; role: string }): Promise<Wardrobe> {
  const { row, sheet } = await loadCharacter(characterId);
  if (!canViewCharacter(viewer.id, viewer.role, row)) throw new ForbiddenError('Not allowed to view this character');
  return loadWardrobe(characterId, row.campaignId, sheet);
}

// ── Write ───────────────────────────────────────────────────────────────

export const setDressStateSchema = z.object({
  itemId: z.string().min(1).max(64),
  state: z.enum(DRESS_STATES),
  /** worn: a region key of her anatomy; omitted → guessed from the name. */
  region: z.string().max(120).optional().nullable(),
});
export type SetDressStateInput = z.infer<typeof setDressStateSchema>;

async function homeLocationId(characterId: string): Promise<string | null> {
  const edges = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, targetType: 'LOCATION', relationshipType: { in: [...PLACE_RELATIONS] } },
    select: { targetId: true, relationshipType: true },
  });
  const order = [...PLACE_RELATIONS] as string[];
  return [...edges].sort((a, b) => order.indexOf(a.relationshipType) - order.indexOf(b.relationshipType))[0]?.targetId ?? null;
}

async function writeState(
  characterId: string,
  regions: string[],
  item: { id: string; name: string; data: string; holderId: string | null; locationId: string | null },
  state: DressState,
  region: string | null | undefined,
): Promise<WardrobeItem['state']> {
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(item.data) as Record<string, unknown>; } catch { d = {}; }
  if (state === 'worn') {
    const r = region && regions.includes(region) ? region : guessRegion(item.name, regions);
    if (!r) throw new ValidationError(`No body region to wear "${item.name}" over — her anatomy has none`);
    if (region && !regions.includes(region)) throw new ValidationError(`"${region}" is not one of her body regions: ${regions.join(', ')}`);
    d.equippedTo = r; d.equipped = true;
  } else {
    delete d.equippedTo; d.equipped = false;
  }
  const picked = state !== 'owned';
  if (picked) {
    // Picked up: it leaves its place (a held thing is not placed).
    await prisma.entityRelationship.deleteMany({ where: { sourceId: item.id, relationshipType: 'located_at' } });
  } else {
    // Put down: still hers — the deed (an `owns` link) must exist or it leaves her wardrobe.
    const deed = await prisma.entityRelationship.findFirst({ where: { sourceId: characterId, targetId: item.id, relationshipType: DEED_RELATIONSHIP }, select: { id: true } });
    if (!deed) {
      const campaignId = (await prisma.campaignItem.findUnique({ where: { id: item.id }, select: { campaignId: true } }))?.campaignId;
      if (campaignId) {
        await prisma.entityRelationship.create({
          data: { campaignId, sourceId: characterId, sourceType: 'CHARACTER', targetId: item.id, targetType: 'CAMPAIGN_ITEM', relationshipType: DEED_RELATIONSHIP, strength: 5, data: JSON.stringify({ note: 'put down at the dress step' }) },
        });
      }
    }
  }
  await prisma.campaignItem.update({
    where: { id: item.id },
    data: {
      data: JSON.stringify(d),
      holderId: picked ? characterId : null,
      locationId: picked ? null : (item.locationId ?? await homeLocationId(characterId)),
    },
  });
  return state;
}

/** One thing → worn | carried | owned. Must be hers (held or deeded). Editor only. */
export async function setDressState(characterId: string, input: unknown, actor: { id: string; role: string }): Promise<WardrobeItem> {
  const p = setDressStateSchema.parse(input);
  const { row, sheet } = await loadCharacter(characterId);
  if (!canEditCharacter(actor.id, actor.role, row)) throw new ForbiddenError('Not allowed to edit this character');
  const item = await prisma.campaignItem.findUnique({ where: { id: p.itemId }, select: { id: true, name: true, data: true, holderId: true, locationId: true, status: true, campaignId: true } });
  if (!item || item.status !== 'ACTIVE' || (row.campaignId && item.campaignId !== row.campaignId)) throw new NotFoundError('Item not found');
  const deed = item.holderId === characterId ? null : await prisma.entityRelationship.findFirst({ where: { sourceId: characterId, targetId: item.id, relationshipType: DEED_RELATIONSHIP }, select: { id: true } });
  if (item.holderId !== characterId && !deed) throw new ValidationError('That thing is not hers — she can only wear or carry what she owns.');
  const regions = regionKeys(sheet);
  await writeState(characterId, regions, item, p.state, p.region);
  const w = await loadWardrobe(characterId, row.campaignId, sheet);
  const out = [...w.garments, ...w.things].find(i => i.id === item.id);
  if (!out) throw new NotFoundError('Item not found after the change');
  return out;
}

// ── JEWL proposes; the table approves ───────────────────────────────────

const SYSTEM =
  'You are JEWL, the AI in a tabletop game, and you know every object this character owns. Dress her for today from HER OWN THINGS ONLY — ' +
  'never name a thing that is not in the list, never invent one. Choose what she WEARS (one piece per body region, outermost shared region; ' +
  'a whole outfit goes on the root) and what she CARRIES (bag, keys, phone, the pocket kit). Fit the place, the hour, the weather, her means and who she is. ' +
  'Answer with ONE JSON object and nothing else: {"pieces":[{"itemId":"<id from the list>","state":"worn"|"carried","region":"<one of her regions, worn only>","why":"<one short clause>"}]}.';

async function dressContext(characterId: string, row: { name: string; campaignId: string | null }, sheet: Sheet): Promise<string> {
  const lines: string[] = [];
  const poss = possessiveFor(sheet.identity?.sex);
  lines.push(`CHARACTER: ${row.name} (${poss === 'her' ? 'she' : poss === 'his' ? 'he' : 'they'}).`);
  const look = lookLines(restoreDesigner(sheet.identity) as Parameters<typeof lookLines>[0]);
  if (look.length) lines.push(`HER LOOK: ${look.map(l => `${l.kind}: ${l.text}`).join(' · ')}`);
  const homeId = await homeLocationId(characterId);
  if (homeId) {
    const loc = await prisma.location.findUnique({ where: { id: homeId }, select: { name: true, data: true } });
    if (loc) {
      let d: { description?: string; environment?: string } = {};
      try { d = JSON.parse(loc.data) as typeof d; } catch { d = {}; }
      lines.push(`WHERE SHE LIVES: ${loc.name}${d.description ? ` — ${d.description.slice(0, 200)}` : ''}${d.environment ? ` · ${d.environment.slice(0, 120)}` : ''}`);
    }
  }
  if (row.campaignId) {
    const facts = await prisma.worldFact.findMany({ where: { campaignId: row.campaignId, supersededById: null, subjectKey: { startsWith: factPrefix(row.name) } }, select: { subjectKey: true, fact: true } });
    const light = lightFacts(facts.map(f => ({ key: f.subjectKey, fact: f.fact }))).slice(0, 4);
    if (light.length) lines.push(`THE HOUR / WEATHER: ${light.map(f => f.fact).join(' ')}`);
  }
  const means = [
    ...(sheet.wealth?.holdings ?? []).map(h => `${h.amount} ${h.code} (${h.where ?? 'cash'})`),
    ...(sheet.wealth?.income ?? []).map(i => `${i.amountPerYear} ${i.code}/yr — ${i.source}`),
  ];
  if (means.length) lines.push(`MEANS: ${means.join(' · ')}`);
  return lines.join('\n');
}

/** The ONE local-lane call. Throws on timeout / transport error. */
async function askJewlToDress(campaignId: string | null, context: string, wardrobe: Wardrobe, draft: OutfitPiece[]): Promise<string> {
  const call = routedChatText(
    { caller: 'dress', lane: 'local', contentClass: 'fiction', ...(campaignId ? { campaignId } : {}) },
    {
      system: SYSTEM,
      user: `${context}\n\n${renderWardrobe(wardrobe)}\n\nA PLAIN DRAFT (improve it from her things):\n${JSON.stringify({ pieces: draft })}\n\nDress her. JSON only.`,
      maxTokens: 900,
      temperature: 0.4,
      timeoutMs: DRESS_TIMEOUT_MS,
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('dress timed out')), DRESS_TIMEOUT_MS); });
  try {
    return (await Promise.race([call, cap])).text;
  } finally {
    if (timer) clearTimeout(timer);
    call.catch(() => { /* late failure after the cap */ });
  }
}

/**
 * LET JEWL DRESS HER: a proposal from her own things. Nothing is written —
 * the table approves with applyOutfit. An empty wardrobe makes no call.
 */
export async function proposeOutfit(characterId: string, viewer: { id: string; role: string }): Promise<OutfitProposal> {
  const { row, sheet } = await loadCharacter(characterId);
  if (!canViewCharacter(viewer.id, viewer.role, row)) throw new ForbiddenError('Not allowed to view this character');
  const wardrobe = await loadWardrobe(characterId, row.campaignId, sheet);
  if (wardrobe.empty) return { pieces: [], byJewl: false, empty: true };
  const draft = draftOutfit(wardrobe);
  try {
    const text = await askJewlToDress(row.campaignId, await dressContext(characterId, row, sheet), wardrobe, draft);
    const pieces = parseOutfitAnswer(text, wardrobe);
    if (pieces && pieces.length) return { pieces, byJewl: true, empty: false };
    console.warn('[dress] JEWL answer unparseable or empty — the draft stands');
  } catch (e) {
    console.warn(`[dress] JEWL call failed (${e instanceof Error ? e.message : 'error'}) — the draft stands`);
  }
  return { pieces: draft, byJewl: false, empty: false };
}

export const applyOutfitSchema = z.object({
  pieces: z.array(z.object({
    itemId: z.string().min(1).max(64),
    state: z.enum(['worn', 'carried']),
    region: z.string().max(120).optional().nullable(),
  })).max(60),
});
export type ApplyOutfitInput = z.infer<typeof applyOutfitSchema>;

/**
 * APPROVE OUTFIT: write the pieces' states; garments she wears that the
 * outfit leaves out come off (carried). Things not named are untouched.
 */
export async function applyOutfit(characterId: string, input: unknown, actor: { id: string; role: string }): Promise<Wardrobe> {
  const p = applyOutfitSchema.parse(input);
  const { row, sheet } = await loadCharacter(characterId);
  if (!canEditCharacter(actor.id, actor.role, row)) throw new ForbiddenError('Not allowed to edit this character');
  const before = await loadWardrobe(characterId, row.campaignId, sheet);
  const mine = new Map([...before.garments, ...before.things].map(i => [i.id, i]));
  const named = new Set<string>();
  for (const piece of p.pieces) {
    const w = mine.get(piece.itemId);
    if (!w) throw new ValidationError(`"${piece.itemId}" is not one of her things — nothing is invented at the dress step.`);
    named.add(w.id);
  }
  const rows = await prisma.campaignItem.findMany({ where: { id: { in: [...named, ...before.garments.filter(g => g.state === 'worn').map(g => g.id)] } }, select: { id: true, name: true, data: true, holderId: true, locationId: true } });
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const piece of p.pieces) {
    const r = byId.get(piece.itemId);
    if (r) await writeState(characterId, before.regions, r, piece.state, piece.region);
  }
  for (const g of before.garments) {
    if (g.state === 'worn' && !named.has(g.id)) {
      const r = byId.get(g.id);
      if (r) await writeState(characterId, before.regions, r, 'carried', null);
    }
  }
  return loadWardrobe(characterId, row.campaignId, sheet);
}
