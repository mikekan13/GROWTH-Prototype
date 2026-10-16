/**
 * Currencies (Mike 2026-10-16): "campaign might have 100 currencies… think
 * earth alone… it is basically just a stored KRMA vehicle. Honestly it is
 * something the AI should manage for the GM to keep the world believable."
 *
 * A Currency is a campaign object (never forged). A dollar has no fixed
 * value — a story set in 1985 and one set in 2060 carry different dollars —
 * so each row has its own krmaPerUnit, anchored on the KRMA value of objects
 * (a 1 KV skillet costs what a skillet costs there). JEWL establishes and
 * adjusts them; the GM may too. Cash on a sheet is denominated in one
 * (GrowthWealth, services/wealth.ts). Retired currencies stay for history.
 *
 * NO FIXED RATE (Mike 2026-10-16: "my 150 to 1 dollar was just a random off
 * from the couch… that should still be a calculation determined at the
 * table"). krmaPerUnit is CALCULATED per campaign by JEWL (establish_currency)
 * from what graded objects cost there — KV IS the price, so the rate is
 * Σ KV ÷ Σ price over the anchor objects. Nothing in code assumes a rate.
 *
 * A UNIT IS A CONTAINER (Mike 2026-10-16: "it just acts as a container for
 * KRMA (plus the paper or metal it is made of)"): one unit's worth =
 * the KRMA it stores + the KV of its material (`unitKrma`). Physical cash
 * (bills, coins in a wallet) are items inside a holder; a bank balance is a
 * ledger line — nothing physical holds it.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

export const CURRENCY_CODE_MAX = 12;

export const establishCurrencySchema = z.object({
  name: z.string().min(1).max(100).describe('"United States dollar"'),
  code: z.string().min(1).max(CURRENCY_CODE_MAX).describe('Short code, unique in the campaign: "USD", "GBP", "crowns".'),
  symbol: z.string().max(8).optional().describe('"$", "£", "¤".'),
  krmaPerUnit: z.number().positive().max(1_000_000).describe('KRMA stored in ONE unit — calculated at the table, never assumed: KV is the price, so over several graded anchor objects krmaPerUnit = Σ their KV ÷ Σ their price in units here and now.'),
  scope: z.string().max(200).optional().describe('Where and when it is tender ("Sacramento, 2026").'),
  note: z.string().max(400).optional().describe('The anchor objects and prices the rate was set from.'),
});
export type EstablishCurrencyInput = z.infer<typeof establishCurrencySchema>;

export interface CurrencyRow {
  id: string;
  campaignId: string;
  name: string;
  code: string;
  symbol: string;
  krmaPerUnit: number;
  scope: string;
  note: string;
  status: string;
}

/** "usd " → "USD". Pure. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** KRMA → units of a currency. Pure; never negative. */
export function unitsForKrma(kv: number, krmaPerUnit: number): number {
  if (!(krmaPerUnit > 0)) throw new ValidationError('krmaPerUnit must be positive');
  return Math.max(0, kv) / krmaPerUnit;
}

/** Units of a currency → KRMA. Pure; never negative. */
export function krmaForUnits(units: number, krmaPerUnit: number): number {
  if (!(krmaPerUnit > 0)) throw new ValidationError('krmaPerUnit must be positive');
  return Math.max(0, units) * krmaPerUnit;
}

/**
 * What ONE unit is worth in KRMA: the KRMA it stores + the KV of what it is
 * made of (paper, metal) when known. Currency rows carry no material yet, so
 * this is krmaPerUnit until one is given. Pure.
 */
export function unitKrma(c: { krmaPerUnit: number; materialKvPerUnit?: number | null }): number {
  const material = typeof c.materialKvPerUnit === 'number' && c.materialKvPerUnit > 0 ? c.materialKvPerUnit : 0;
  return Math.max(0, c.krmaPerUnit) + material;
}

/** "$1,250.00" / "1250 USD" — a display line. Pure. */
export function formatUnits(amount: number, c: Pick<CurrencyRow, 'code' | 'symbol'>): string {
  const n = Math.round(amount * 100) / 100;
  const text = n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return c.symbol ? `${c.symbol}${text}` : `${text} ${c.code}`;
}

export async function listCurrencies(campaignId: string, opts: { includeRetired?: boolean } = {}): Promise<CurrencyRow[]> {
  return prisma.currency.findMany({
    where: { campaignId, ...(opts.includeRetired ? {} : { status: 'ACTIVE' }) },
    orderBy: [{ status: 'asc' }, { code: 'asc' }],
  });
}

/** A campaign currency by id or code (case-insensitive). */
export async function findCurrency(campaignId: string, ref: string): Promise<CurrencyRow | null> {
  const r = ref.trim();
  if (!r) return null;
  const byId = await prisma.currency.findFirst({ where: { campaignId, id: r } });
  if (byId) return byId;
  return prisma.currency.findFirst({ where: { campaignId, code: normalizeCode(r) } });
}

async function requireManager(campaignId: string, actor: { id: string; role: string }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.id, actor.role, campaign)) throw new ForbiddenError('Only the GM (or JEWL for them) manages currencies');
}

/** Create or re-rate a currency. Idempotent per (campaign, code). */
export async function establishCurrency(
  campaignId: string,
  actor: { id: string; role: string },
  input: unknown,
): Promise<{ currency: CurrencyRow; created: boolean }> {
  const p = establishCurrencySchema.parse(input);
  await requireManager(campaignId, actor);
  const code = normalizeCode(p.code);
  const existing = await prisma.currency.findUnique({ where: { campaignId_code: { campaignId, code } } });
  if (existing) {
    const currency = await prisma.currency.update({
      where: { id: existing.id },
      data: {
        name: p.name.trim(),
        ...(p.symbol != null ? { symbol: p.symbol } : {}),
        krmaPerUnit: p.krmaPerUnit,
        ...(p.scope != null ? { scope: p.scope } : {}),
        ...(p.note != null ? { note: p.note } : {}),
        status: 'ACTIVE',
      },
    });
    return { currency, created: false };
  }
  const currency = await prisma.currency.create({
    data: {
      campaignId, name: p.name.trim(), code, symbol: p.symbol ?? '', krmaPerUnit: p.krmaPerUnit,
      scope: p.scope ?? '', note: p.note ?? '', createdBy: actor.id,
    },
  });
  return { currency, created: true };
}

export async function retireCurrency(campaignId: string, actor: { id: string; role: string }, ref: string): Promise<CurrencyRow> {
  await requireManager(campaignId, actor);
  const c = await findCurrency(campaignId, ref);
  if (!c) throw new NotFoundError(`No currency "${ref}" in this campaign`);
  return prisma.currency.update({ where: { id: c.id }, data: { status: 'RETIRED' } });
}
