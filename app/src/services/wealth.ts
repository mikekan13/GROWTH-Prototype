/**
 * The wealth LEDGER on a sheet (Mike 2026-10-16): cash in campaign
 * currencies and income per year. Never a level — the 10-level Wealth stat
 * is dead. Cash is stored KRMA in a currency vehicle (services/currency.ts);
 * at genesis it is what remains of her accumulated wealth once her material
 * life is built (services/life-budget.ts). Things she owns are CampaignItems,
 * not entries here.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canEditCharacter, canViewCharacter } from '@/lib/permissions';
import { findCurrency, krmaForUnits, formatUnits, type CurrencyRow } from './currency';
import type { GrowthCharacter, GrowthWealth, GrowthWealthHolding } from '@/types/growth';

export const grantCashSchema = z.object({
  characterId: z.string().min(1).max(64),
  currency: z.string().min(1).max(64).describe('Currency id or code ("USD"). Establish it first if the campaign has none.'),
  amount: z.number().describe('Units to ADD (negative = take). Her holding in that currency+where never drops below 0.'),
  where: z.string().max(80).optional().describe('"checking", "savings", "cash in the coffee tin". Default "cash".'),
  story: z.string().max(400).optional().describe('One line on where it came from — becomes the progress note.'),
});
export type GrantCashInput = z.infer<typeof grantCashSchema>;

export const setIncomeSchema = z.object({
  characterId: z.string().min(1).max(64),
  currency: z.string().min(1).max(64),
  amountPerYear: z.number().min(0).describe('Units per campaign year; 0 removes the line.'),
  source: z.string().min(1).max(120).describe('"barista, Midtown Grounds"; "disability"; "rent from the back room".'),
});
export type SetIncomeInput = z.infer<typeof setIncomeSchema>;

const DEFAULT_WHERE = 'cash';

/** Add (or take) units in one holding. Pure; floors at zero. */
export function applyHolding(w: GrowthWealth | undefined, h: { currencyId: string; code: string; amount: number; where?: string }): GrowthWealth {
  const holdings = [...(w?.holdings ?? [])];
  const where = (h.where ?? DEFAULT_WHERE).trim() || DEFAULT_WHERE;
  const i = holdings.findIndex(x => x.currencyId === h.currencyId && (x.where ?? DEFAULT_WHERE) === where);
  const next: GrowthWealthHolding = i >= 0
    ? { ...holdings[i], amount: Math.max(0, holdings[i].amount + h.amount) }
    : { currencyId: h.currencyId, code: h.code, amount: Math.max(0, h.amount), where };
  if (i >= 0) holdings[i] = next; else holdings.push(next);
  return { ...(w ?? { holdings: [] }), holdings: holdings.filter(x => x.amount > 0) };
}

/** Set one income line (0 removes it). Pure. */
export function applyIncome(w: GrowthWealth | undefined, line: { currencyId: string; code: string; amountPerYear: number; source: string }): GrowthWealth {
  const income = (w?.income ?? []).filter(x => !(x.currencyId === line.currencyId && x.source === line.source));
  if (line.amountPerYear > 0) income.push(line);
  return { holdings: w?.holdings ?? [], income };
}

/** KRMA tied up in the holdings, given the campaign's currencies. Pure. */
export function holdingsKrma(w: GrowthWealth | undefined, currencies: Array<Pick<CurrencyRow, 'id' | 'krmaPerUnit'>>): number {
  const rate = new Map(currencies.map(c => [c.id, c.krmaPerUnit]));
  return (w?.holdings ?? []).reduce((a, h) => a + (rate.has(h.currencyId) ? krmaForUnits(h.amount, rate.get(h.currencyId)!) : 0), 0);
}

async function loadCharacter(characterId: string) {
  const c = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, userId: true, campaignId: true, data: true, campaign: { select: { gmUserId: true } } },
  });
  if (!c) throw new NotFoundError('Character not found');
  return c;
}

function parseSheet(data: string): Partial<GrowthCharacter> {
  try { return JSON.parse(data) as Partial<GrowthCharacter>; } catch { return {}; }
}

export async function grantCash(campaignId: string, actor: { id: string; role: string }, input: unknown) {
  const p = grantCashSchema.parse(input);
  const c = await loadCharacter(p.characterId);
  if (c.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  if (!canEditCharacter(actor.id, actor.role, c)) throw new ForbiddenError('Not allowed to change this character\'s wealth');
  const cur = await findCurrency(campaignId, p.currency);
  if (!cur) throw new NotFoundError(`No currency "${p.currency}" in this campaign — establish_currency first.`);
  const sheet = parseSheet(c.data);
  sheet.wealth = applyHolding(sheet.wealth, { currencyId: cur.id, code: cur.code, amount: p.amount, where: p.where });
  await prisma.character.update({ where: { id: c.id }, data: { data: JSON.stringify(sheet) } });
  const holding = sheet.wealth.holdings.find(h => h.currencyId === cur.id && (h.where ?? DEFAULT_WHERE) === ((p.where ?? DEFAULT_WHERE).trim() || DEFAULT_WHERE));
  return {
    holding: holding ?? null,
    line: holding ? `${formatUnits(holding.amount, cur)} (${holding.where})` : `0 ${cur.code}`,
    krma: holding ? krmaForUnits(holding.amount, cur.krmaPerUnit) : 0,
  };
}

export async function setIncome(campaignId: string, actor: { id: string; role: string }, input: unknown) {
  const p = setIncomeSchema.parse(input);
  const c = await loadCharacter(p.characterId);
  if (c.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  if (!canEditCharacter(actor.id, actor.role, c)) throw new ForbiddenError('Not allowed to change this character\'s wealth');
  const cur = await findCurrency(campaignId, p.currency);
  if (!cur) throw new NotFoundError(`No currency "${p.currency}" in this campaign — establish_currency first.`);
  const sheet = parseSheet(c.data);
  sheet.wealth = applyIncome(sheet.wealth, { currencyId: cur.id, code: cur.code, amountPerYear: p.amountPerYear, source: p.source.trim() });
  await prisma.character.update({ where: { id: c.id }, data: { data: JSON.stringify(sheet) } });
  return { income: sheet.wealth.income ?? [] };
}

export interface WealthView {
  holdings: Array<GrowthWealthHolding & { line: string; krma: number }>;
  income: Array<{ currencyId: string; code: string; amountPerYear: number; source: string; line: string }>;
  totalKrma: number;
}

/** The ledger as the sheet's viewer sees it. */
export async function readWealth(characterId: string, actor: { id: string; role: string }): Promise<WealthView> {
  const c = await loadCharacter(characterId);
  if (!canViewCharacter(actor.id, actor.role, c)) throw new ForbiddenError('Not allowed to view this character');
  const sheet = parseSheet(c.data);
  const currencies = c.campaignId ? await prisma.currency.findMany({ where: { campaignId: c.campaignId } }) : [];
  const byId = new Map(currencies.map(x => [x.id, x]));
  const holdings = (sheet.wealth?.holdings ?? []).map(h => {
    const cur = byId.get(h.currencyId);
    return { ...h, line: cur ? `${formatUnits(h.amount, cur)} (${h.where ?? DEFAULT_WHERE})` : `${h.amount} ${h.code}`, krma: cur ? krmaForUnits(h.amount, cur.krmaPerUnit) : 0 };
  });
  const income = (sheet.wealth?.income ?? []).map(l => {
    const cur = byId.get(l.currencyId);
    return { ...l, line: `${cur ? formatUnits(l.amountPerYear, cur) : `${l.amountPerYear} ${l.code}`}/yr — ${l.source}` };
  });
  return { holdings, income, totalKrma: holdings.reduce((a, h) => a + h.krma, 0) };
}
