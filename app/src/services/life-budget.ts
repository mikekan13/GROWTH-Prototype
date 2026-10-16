/**
 * The LIFE BUDGET (Mike 2026-10-16): "Accumulated wealth is a krma number
 * that gets added all together and is the budget JEWL has to create the
 * material reality of the character. Any remaining or what he thinks they
 * would have in a currency is then exchanged and given to them."
 *
 *   budget    = Σ accumulatedWealth over her live roots + branches
 *   spent     = Σ KV of the things she holds or holds the deed to
 *               (CampaignItems — stock blueprints are free, the INSTANCES
 *               are the GM's KRMA crystallized as objects)
 *   cash      = Σ holdings × the currency's krmaPerUnit
 *   remaining = budget − spent − cash   (negative = over budget: say so)
 *
 * Named `possessions` grants on a block are priced in the block itself and
 * are NOT part of this budget — only the unnamed life is. Items that came
 * from a named grant are therefore excluded from `spent` when the instance
 * says so (history origin "block grant"); everything else she owns counts.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { liveBlockLinks, type LinkWithBlock } from './genesis-sheet-sync';
import { DEED_RELATIONSHIP } from './genesis-possessions';
import { holdingsKrma } from './wealth';
import type { GrowthCharacter } from '@/types/growth';

export interface LifeBudget {
  budgetKv: number;
  spentKv: number;
  cashKv: number;
  remainingKv: number;
  /** One line per root/branch: what it contributes. */
  sources: Array<{ block: string; type: string; accumulatedWealth: number }>;
  /** What counted as spent. */
  items: Array<{ id: string; name: string; kv: number }>;
  line: string;
}

function parse(data: string): Record<string, unknown> {
  try { return JSON.parse(data) as Record<string, unknown>; } catch { return {}; }
}

/** Σ accumulatedWealth over roots + branches. Pure. */
export function sumAccumulatedWealth(links: Array<Pick<LinkWithBlock, 'block' | 'localName'>>): LifeBudget['sources'] {
  return links
    .filter(l => l.block.type === 'root' || l.block.type === 'branch')
    .map(l => {
      const d = parse(l.block.data);
      const w = typeof d.accumulatedWealth === 'number' ? Math.max(0, d.accumulatedWealth) : 0;
      return { block: l.localName ?? l.block.name, type: l.block.type, accumulatedWealth: w };
    });
}

/** The KV of one owned instance. Pure. `value` is the item's KV on GrowthWorldItem. */
export function itemKv(data: Record<string, unknown>): number {
  const v = typeof data.value === 'number' ? data.value : typeof data.kv === 'number' ? data.kv : 0;
  return Math.max(0, v);
}

/** Did this instance come from a NAMED block grant (priced in the block already)? Pure. */
export function fromNamedGrant(history: string): boolean {
  try {
    const rows = JSON.parse(history) as Array<{ kind?: string; text?: string }>;
    return rows.some(r => r.kind === 'origin' && /block grant/i.test(r.text ?? ''));
  } catch { return false; }
}

export function budgetLine(b: Omit<LifeBudget, 'line'>): string {
  const over = b.remainingKv < 0;
  return `LIFE BUDGET: ${b.budgetKv} KV accumulated wealth − ${b.spentKv} KV in things − ${Math.round(b.cashKv)} KV in cash = ${Math.round(b.remainingKv)} KV ${over ? 'OVER — cut or re-rate' : 'left to place or exchange'}`;
}

export async function lifeBudget(characterId: string): Promise<LifeBudget> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { campaignId: true, data: true } });
  if (!c?.campaignId) throw new NotFoundError('Character not found in a campaign');
  const campaignId = c.campaignId;
  const links = await liveBlockLinks(characterId);
  const sources = sumAccumulatedWealth(links);
  const budgetKv = sources.reduce((a, s) => a + s.accumulatedWealth, 0);

  const deeds = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' },
    select: { targetId: true },
  });
  const rows = await prisma.campaignItem.findMany({
    where: { campaignId, status: 'ACTIVE', OR: [{ holderId: characterId }, { id: { in: deeds.map(d => d.targetId) } }] },
    select: { id: true, name: true, data: true, history: true },
  });
  const items = rows
    .filter(r => !fromNamedGrant(r.history))
    .map(r => ({ id: r.id, name: r.name, kv: itemKv(parse(r.data)) }));
  const spentKv = items.reduce((a, i) => a + i.kv, 0);

  const sheet = parse(c.data) as Partial<GrowthCharacter>;
  const currencies = await prisma.currency.findMany({ where: { campaignId }, select: { id: true, krmaPerUnit: true } });
  const cashKv = holdingsKrma(sheet.wealth, currencies);
  const partial = { budgetKv, spentKv, cashKv, remainingKv: budgetKv - spentKv - cashKv, sources, items };
  return { ...partial, line: budgetLine(partial) };
}
