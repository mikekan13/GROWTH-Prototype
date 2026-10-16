/** The wealth ledger (2026-10-16): cash + income on the sheet, never a level. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, find } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn(), update: vi.fn() },
    currency: { findMany: vi.fn() },
  },
  find: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./currency', async (orig) => ({ ...(await orig<typeof import('./currency')>()), findCurrency: (...a: unknown[]) => find(...a) }));

import { applyHolding, applyIncome, grantCash, holdingsKrma, readWealth, setIncome } from './wealth';

const USD = { id: 'cur1', campaignId: 'c1', code: 'USD', symbol: '$', krmaPerUnit: 0.05, name: 'US dollar', scope: '', note: '', status: 'ACTIVE' };
const JEWL = { id: 'jewl', role: 'GODHEAD' };

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet', userId: 'p1', campaignId: 'c1', data: JSON.stringify({}), campaign: { gmUserId: 'gm1' } });
  db.character.update.mockResolvedValue({});
  db.currency.findMany.mockResolvedValue([USD]);
  find.mockResolvedValue(USD);
});

describe('pure ledger ops', () => {
  it('adds into one holding per currency+where, floors at zero, drops empties', () => {
    let w = applyHolding(undefined, { currencyId: 'cur1', code: 'USD', amount: 100 });
    w = applyHolding(w, { currencyId: 'cur1', code: 'USD', amount: 50, where: 'savings' });
    w = applyHolding(w, { currencyId: 'cur1', code: 'USD', amount: -30 });
    expect(w.holdings).toEqual([
      { currencyId: 'cur1', code: 'USD', amount: 70, where: 'cash' },
      { currencyId: 'cur1', code: 'USD', amount: 50, where: 'savings' },
    ]);
    w = applyHolding(w, { currencyId: 'cur1', code: 'USD', amount: -500 });
    expect(w.holdings.map(h => h.where)).toEqual(['savings']);
  });
  it('income lines replace by currency+source; 0 removes', () => {
    let w = applyIncome(undefined, { currencyId: 'cur1', code: 'USD', amountPerYear: 24000, source: 'barista' });
    w = applyIncome(w, { currencyId: 'cur1', code: 'USD', amountPerYear: 26000, source: 'barista' });
    expect(w.income).toEqual([{ currencyId: 'cur1', code: 'USD', amountPerYear: 26000, source: 'barista' }]);
    w = applyIncome(w, { currencyId: 'cur1', code: 'USD', amountPerYear: 0, source: 'barista' });
    expect(w.income).toEqual([]);
  });
  it('holdings → KRMA at each currency\'s rate; unknown currencies count 0', () => {
    const w = { holdings: [{ currencyId: 'cur1', code: 'USD', amount: 200 }, { currencyId: 'gone', code: 'X', amount: 999 }] };
    expect(holdingsKrma(w, [USD])).toBe(10);
  });
});

describe('grantCash / setIncome / readWealth', () => {
  it('writes the holding on the sheet and reports its KRMA', async () => {
    const r = await grantCash('c1', JEWL, { characterId: 'v', currency: 'USD', amount: 1240, where: 'checking', story: 'what the cafe left her' });
    expect(r.holding).toEqual({ currencyId: 'cur1', code: 'USD', amount: 1240, where: 'checking' });
    expect(r.krma).toBeCloseTo(62);
    expect(r.line).toBe('$1,240 (checking)');
    const saved = JSON.parse(db.character.update.mock.calls[0][0].data.data);
    expect(saved.wealth.holdings).toHaveLength(1);
  });
  it('refuses an unknown currency', async () => {
    find.mockResolvedValue(null);
    await expect(grantCash('c1', JEWL, { characterId: 'v', currency: 'GBP', amount: 1 })).rejects.toThrow(/establish_currency/);
  });
  it('refuses a character from another campaign', async () => {
    await expect(grantCash('c2', JEWL, { characterId: 'v', currency: 'USD', amount: 1 })).rejects.toThrow(/not found/i);
  });
  it('sets income and readWealth renders both ledgers', async () => {
    db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet', userId: 'p1', campaignId: 'c1', campaign: { gmUserId: 'gm1' },
      data: JSON.stringify({ wealth: { holdings: [{ currencyId: 'cur1', code: 'USD', amount: 300, where: 'cash' }] } }) });
    await setIncome('c1', JEWL, { characterId: 'v', currency: 'USD', amountPerYear: 24000, source: 'barista' });
    const saved = JSON.parse(db.character.update.mock.calls[0][0].data.data);
    expect(saved.wealth.income[0].amountPerYear).toBe(24000);
    db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet', userId: 'p1', campaignId: 'c1', campaign: { gmUserId: 'gm1' }, data: JSON.stringify(saved) });
    const v = await readWealth('v', { id: 'p1', role: 'TRAILBLAZER' });
    expect(v.holdings[0].line).toBe('$300 (cash)');
    expect(v.income[0].line).toBe('$24,000/yr — barista');
    expect(v.totalKrma).toBeCloseTo(15);
  });
  it('a stranger cannot read it', async () => {
    await expect(readWealth('v', { id: 'x', role: 'TRAILBLAZER' })).rejects.toThrow(/Not allowed/);
  });
});
