/**
 * HOLDER KITS — quantum contents (Mike 2026-10-16, accepted): crystallize
 * what matters (worn, carried, used, storied, valuable); every HOLDER (the
 * fridge, the pantry, the junk drawer, the medicine cabinet) carries a KIT —
 * a KV budget + a one-line truth of its ordinary contents — drawn down into
 * real items when observed in play, and those items persist once seen.
 *
 *   holder.data.kit = { kvBudget, contents, spentKv, resolvedItemIds }
 *
 * The kit's KV is spent ONCE, at stocking (life-budget counts kvBudget);
 * a draw moves value from potential to concrete — drawn items carry
 * `drawnFromKit` so they are never counted twice. Same ontology as item kits
 * (r-2026-08-24-16, ai/copilot/tools/draw-from-kit.ts): finite budget +
 * plausibility. Draws reuse the stock_goods engine (life-goods placeGoods),
 * so capacity and decimal KV apply.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { readKit, roundKv } from '@/lib/item-kv';
import { DEED_RELATIONSHIP } from './genesis-possessions';
import { goodSchema, placeGoods, type Good, type StockResult } from './life-goods';

export interface Kit { kvBudget: number; contents: string; spentKv: number; resolvedItemIds: string[] }

export const stockKitSchema = z.object({
  kvBudget: z.number().min(0).max(1000).describe('KV of the ordinary contents, decimal (a junk drawer ~0.3, a stocked fridge ~1.5). Spent once, now.'),
  contents: z.string().min(1).max(500).describe('ONE line, the truth of what is in it: "milk, half a dozen eggs, leftover pad thai, ketchup, wilting cilantro".'),
});

/** A draw's goods: `into` defaults to the holder itself. */
export const kitGoodSchema = goodSchema.extend({ into: goodSchema.shape.into.optional() });
export const drawFromHolderKitSchema = z.array(kitGoodSchema).min(1).max(60);

type ActorRef = { id: string; role: string };

function parse(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

async function loadHolder(campaignId: string, holderItemId: string) {
  const h = await prisma.campaignItem.findUnique({ where: { id: holderItemId }, select: { id: true, name: true, campaignId: true, status: true, data: true, holderId: true } });
  if (!h || h.campaignId !== campaignId) throw new NotFoundError('Holder not found in this campaign');
  if (h.status !== 'ACTIVE') throw new ValidationError(`"${h.name}" is ${h.status} — it holds nothing.`);
  return h;
}

/** Remaining KV of a kit. Pure. */
export function kitRemaining(kit: Pick<Kit, 'kvBudget' | 'spentKv'>): number {
  return Math.max(0, kit.kvBudget - kit.spentKv);
}

/**
 * Give a holder its kit (or re-stock it). A re-stock keeps what was already
 * drawn; the budget can never drop below what has been spent.
 */
export async function stockKit(campaignId: string, holderItemId: string, input: unknown): Promise<{ holderId: string; name: string; kit: Kit; remainingKv: number }> {
  const p = stockKitSchema.parse(input);
  const h = await loadHolder(campaignId, holderItemId);
  const data = parse(h.data);
  if (typeof data.drawnFromKit === 'string') throw new ValidationError(`"${h.name}" was drawn out of a kit — stock its holder instead.`);
  const prior = readKit(data);
  if (prior && p.kvBudget < prior.spentKv) {
    throw new ValidationError(`"${h.name}" has already given ${roundKv(prior.spentKv)} KV of things — its kit budget cannot drop below that.`);
  }
  const kit: Kit = { kvBudget: p.kvBudget, contents: p.contents.trim(), spentKv: prior?.spentKv ?? 0, resolvedItemIds: prior?.resolvedItemIds ?? [] };
  await prisma.campaignItem.update({ where: { id: h.id }, data: { data: JSON.stringify({ ...data, kit }) } });
  return { holderId: h.id, name: h.name, kit, remainingKv: kitRemaining(kit) };
}

/**
 * Observe a holder's kit: crystallize the named goods out of its remaining
 * budget (each good fails alone when it does not fit the budget or the
 * holder's capacity). The drawn items are deeded to the holder's owner,
 * placed in the holder (or inside one another), and recorded on the kit.
 */
export async function drawFromHolderKit(
  campaignId: string,
  holderItemId: string,
  goods: unknown,
  actor: ActorRef,
): Promise<StockResult & { kit: Kit; remainingKv: number }> {
  const parsed = drawFromHolderKitSchema.parse(goods);
  const h = await loadHolder(campaignId, holderItemId);
  const kit = readKit(parse(h.data));
  if (!kit) throw new ValidationError(`"${h.name}" has no kit — give it one with stock_kit first.`);
  const owner = h.holderId
    ?? (await prisma.entityRelationship.findFirst({ where: { campaignId, targetId: h.id, relationshipType: DEED_RELATIONSHIP, sourceType: 'CHARACTER' }, select: { sourceId: true } }))?.sourceId
    ?? null;
  const withInto: Good[] = parsed.map(g => ({ ...g, into: g.into?.trim() || h.id }));
  const budget = { left: kitRemaining(kit) };
  const res = await placeGoods(campaignId, actor, withInto, {
    ownerId: owner,
    origin: g => `drawn from the kit of ${h.name}: ${g.archetype}`,
    extraData: { drawnFromKit: h.id },
    budget,
  });
  // Re-read so a concurrent edit to the holder is not lost.
  const fresh = parse((await prisma.campaignItem.findUnique({ where: { id: h.id }, select: { data: true } }))?.data ?? h.data);
  const cur = readKit(fresh) ?? kit;
  const drawn = res.items ?? [];
  const next: Kit = {
    ...cur,
    spentKv: roundKv6(cur.spentKv + drawn.reduce((a, i) => a + i.kv, 0)),
    resolvedItemIds: [...cur.resolvedItemIds, ...drawn.map(i => i.id)],
  };
  if (drawn.length) await prisma.campaignItem.update({ where: { id: h.id }, data: { data: JSON.stringify({ ...fresh, kit: next }) } });
  return { ...res, kit: next, remainingKv: kitRemaining(next) };
}

function roundKv6(n: number): number { return Math.round(n * 1e6) / 1e6; }
