/**
 * PARTS ON THE ROWS (Michael 2026-11-01, object permanence): the pure rules are lib/parts; this module moves the
 * parts between CampaignItem rows. A split makes a new row for what left and keeps the rest on the source (CONSUMED
 * when nothing is left); a payment is a split out of every money row the actor carries into ONE new row in the
 * receiver's hands, with where it came from on the new row's history ("paid" — from, to, the amount owed and the amount
 * handed). The planner reads those payments back to know a routine's "paid" end is met.
 *
 * Never a wealth-ledger write: the sheet's ledger is money that is not an object (checking). What is in a hand is here.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import {
  partsOf, pickTender, takeParts, addParts, dataForParts, nameForParts, partsInWords, tenderTotal, tenderCurrencies,
  recipeAllows, partsFromRecipe, derivedValue,
  type Parts, type MoneyFormatter, type Denominations,
} from '@/lib/parts';
import { formatUnits, denominationsOf } from './currency';

export interface HistoryEntry { kind: string; at: string; text: string; [k: string]: unknown }

function parseData(raw: string | null | undefined): Record<string, unknown> {
  try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
function parseHistory(raw: string | null | undefined): HistoryEntry[] {
  try { const h = raw ? JSON.parse(raw) : []; return Array.isArray(h) ? h : []; } catch { return []; }
}

type CurrencyLite = { id: string; code: string; symbol: string };

/** A formatter that knows the campaign's currencies ("$25"), falling back to "25 USD". */
export async function moneyFormatter(campaignId: string): Promise<MoneyFormatter> {
  const rows: CurrencyLite[] = await prisma.currency.findMany({ where: { campaignId }, select: { id: true, code: true, symbol: true } }).catch(() => []);
  const byCode = new Map(rows.map((c) => [c.code.toUpperCase(), c]));
  return (amount, code) => {
    const c = byCode.get(code.toUpperCase());
    return c ? formatUnits(amount, c) : `${Math.round(amount * 100) / 100} ${code}`;
  };
}

export interface SplitDest {
  holderId: string | null;
  locationId: string | null;
  /** A local name for what left; derived from the parts when absent. */
  name?: string;
  /** Why, for both rows' histories ("handed to Kristopher for the pizza"). */
  because: string;
  cycle?: number | null;
}

/**
 * Split picks out of a parts row into a new row at `dest`. The source keeps the rest, or is CONSUMED when nothing is
 * left. Returns the new row.
 */
export async function splitOff(campaignId: string, itemId: string, picks: Array<{ name: string; count: number }>, dest: SplitDest): Promise<{ id: string; name: string; parts: Parts }> {
  const row = await prisma.campaignItem.findFirst({ where: { id: itemId, campaignId, status: 'ACTIVE' } });
  if (!row) throw new Error('no such thing to split');
  const data = parseData(row.data);
  const ms = partsOf(row.name, data);
  const { left, taken } = takeParts(ms, picks);
  if (!taken.length) throw new Error('nothing picked');
  const at = new Date().toISOString();
  const fmt = await moneyFormatter(campaignId);
  const takenWords = partsInWords(taken, fmt);
  const name = dest.name?.trim() || nameForParts(taken);
  const made = await prisma.campaignItem.create({
    data: {
      campaignId, name, type: row.type, status: 'ACTIVE', createdBy: row.createdBy, sourceForgeItemId: row.sourceForgeItemId,
      data: JSON.stringify(dataForParts(data, taken)),
      holderId: dest.holderId, locationId: dest.locationId,
      history: JSON.stringify([{ kind: 'origin', at, text: `${takenWords} out of "${row.name}": ${dest.because}`, fromItemId: row.id, ...(dest.cycle != null ? { cycle: dest.cycle } : {}) }]),
    },
  });
  const history = parseHistory(row.history);
  if (left.length) {
    history.push({ kind: 'split', at, text: `${takenWords} taken out: ${dest.because}`, toItemId: made.id, ...(dest.cycle != null ? { cycle: dest.cycle } : {}) });
    await prisma.campaignItem.update({ where: { id: row.id }, data: { data: JSON.stringify({ ...dataForParts(data, left), description: data.description }), history: JSON.stringify(history) } });
  } else {
    history.push({ kind: 'emptied', at, text: `the last of it (${takenWords}) taken out: ${dest.because}`, toItemId: made.id, ...(dest.cycle != null ? { cycle: dest.cycle } : {}) });
    await prisma.campaignItem.update({ where: { id: row.id }, data: { status: 'CONSUMED', history: JSON.stringify(history) } });
  }
  return { id: made.id, name, parts: taken };
}

export interface TenderRow { id: string; name: string; parts: Parts; words: string }
export interface TenderOnHand extends CurrencyLite { currencyId: string; amount: number; items: TenderRow[] }

/** The money one character carries, per currency, from every ACTIVE row in their hands. Never throws. */
export async function tenderOnHand(campaignId: string, characterId: string): Promise<TenderOnHand[]> {
  try {
    const rows = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', holderId: characterId }, select: { id: true, name: true, data: true } });
    const currencies: CurrencyLite[] = await prisma.currency.findMany({ where: { campaignId }, select: { id: true, code: true, symbol: true } });
    const fmt = await moneyFormatter(campaignId);
    const out = new Map<string, TenderOnHand>();
    for (const r of rows) {
      const ms = partsOf(r.name, parseData(r.data));
      for (const [cid, code] of tenderCurrencies(ms)) {
        const cur = currencies.find((c) => c.id === cid) ?? { id: cid, code, symbol: '' };
        const slot = out.get(cid) ?? { ...cur, currencyId: cid, amount: 0, items: [] };
        const mine = ms.filter((m) => m.each?.tender?.currencyId === cid);
        slot.amount = Math.round((slot.amount + tenderTotal(mine, cid)) * 100) / 100;
        slot.items.push({ id: r.id, name: r.name, parts: mine, words: partsInWords(mine, fmt) });
        out.set(cid, slot);
      }
    }
    return [...out.values()];
  } catch { return []; }
}

export type PayResult =
  | { ok: true; handed: number; over: number; code: string; itemId: string; name: string; words: string; overWords: string; sourceIds: string[] }
  | { ok: false; reason: string };

/**
 * Pay: hand bills worth at least `amount` from what `from` carries to `to`. The pieces are picked across every money
 * row in the payer's hands (fewest pieces, least over); each source keeps its rest; the receiver gets ONE new row with
 * the payment on its history. Change is not made here — it is the receiver's own act, the other way.
 */
export async function payFromHand(
  campaignId: string,
  from: { id: string; name: string },
  to: { id: string; name: string; locationId: string | null },
  amount: number,
  opts: { currency?: string; because: string; cycle?: number | null },
): Promise<PayResult> {
  if (!(amount > 0)) return { ok: false, reason: 'no amount' };
  const onHand = await tenderOnHand(campaignId, from.id);
  if (!onHand.length) return { ok: false, reason: `${from.name} carries no money` };
  const want = opts.currency?.trim().toUpperCase();
  const slot = want ? onHand.find((h) => h.code.toUpperCase() === want || h.currencyId === opts.currency) : onHand.length === 1 ? onHand[0] : null;
  if (!slot) return { ok: false, reason: want ? `${from.name} carries no ${want}` : `${from.name} carries more than one currency — say which` };
  const fmt = await moneyFormatter(campaignId);
  const pooled = slot.items.reduce<Parts>((a, r) => addParts(a, r.parts), []);
  const pick = pickTender(pooled, amount, slot.currencyId);
  if (!pick) return { ok: false, reason: `${from.name} has ${fmt(slot.amount, slot.code)} on ${/^f/i.test('') ? 'her' : 'them'} — not ${fmt(amount, slot.code)}`.replace(' on them', '') };
  // Allocate the picked pieces to the rows that hold them, in order.
  const wants = new Map(pick.picks.map((p) => [p.name.toLowerCase(), p.count]));
  const at = new Date().toISOString();
  const sourceIds: string[] = [];
  let taken: Parts = [];
  for (const r of slot.items) {
    const picksHere: Array<{ name: string; count: number }> = [];
    for (const m of r.parts) {
      const left = wants.get(m.name.toLowerCase()) ?? 0;
      if (left <= 0) continue;
      const n = Math.min(left, m.count);
      picksHere.push({ name: m.name, count: n });
      wants.set(m.name.toLowerCase(), left - n);
    }
    if (!picksHere.length) continue;
    const row = await prisma.campaignItem.findUnique({ where: { id: r.id } });
    if (!row) continue;
    const data = parseData(row.data);
    const ms = partsOf(row.name, data);
    const res = takeParts(ms, picksHere);
    taken = addParts(taken, res.taken);
    const history = parseHistory(row.history);
    const entry = { kind: 'paid', at, text: `${partsInWords(res.taken, fmt)} handed to ${to.name}: ${opts.because}`, from: from.id, to: to.id, amount, handed: pick.handed, currencyId: slot.currencyId, code: slot.code, ...(opts.cycle != null ? { cycle: opts.cycle } : {}) };
    history.push(entry);
    if (res.left.length) {
      await prisma.campaignItem.update({ where: { id: row.id }, data: { data: JSON.stringify({ ...dataForParts(data, res.left), description: data.description }), history: JSON.stringify(history) } });
    } else {
      await prisma.campaignItem.update({ where: { id: row.id }, data: { status: 'CONSUMED', history: JSON.stringify(history) } });
    }
    sourceIds.push(row.id);
  }
  if (!taken.length) return { ok: false, reason: 'nothing could be picked' };
  const first = await prisma.campaignItem.findUnique({ where: { id: sourceIds[0] } });
  const base = parseData(first?.data);
  const words = partsInWords(taken, fmt);
  const name = nameForParts(taken);
  const made = await prisma.campaignItem.create({
    data: {
      campaignId, name, type: first?.type ?? 'misc', status: 'ACTIVE', createdBy: first?.createdBy ?? from.id, sourceForgeItemId: first?.sourceForgeItemId ?? null,
      data: JSON.stringify({ ...dataForParts(base, taken), ...(typeof base.description === 'string' ? { description: base.description } : {}) }),
      holderId: to.id, locationId: to.locationId,
      history: JSON.stringify([{ kind: 'paid', at, text: `${words} from ${from.name}: ${opts.because}${pick.over > 0 ? ` (${fmt(pick.over, slot.code)} over)` : ''}`, from: from.id, to: to.id, amount, handed: pick.handed, currencyId: slot.currencyId, code: slot.code, fromItemIds: sourceIds, ...(opts.cycle != null ? { cycle: opts.cycle } : {}) }]),
    },
  });
  return { ok: true, handed: pick.handed, over: pick.over, code: slot.code, itemId: made.id, name, words, overWords: fmt(pick.over, slot.code), sourceIds };
}

export interface PaymentRecord { from: string; to: string; amount: number; handed: number; code: string; currencyId: string; cycle: number | null; itemId: string }

/** Payments made by `from` (and/or to `to`), read back from the rows' histories; `sinceCycle` keeps the recent ones. Never throws. */
export async function recentPayments(campaignId: string, q: { from?: string; to?: string; sinceCycle?: number }): Promise<PaymentRecord[]> {
  try {
    const rows = await prisma.campaignItem.findMany({ where: { campaignId, history: { contains: '"kind":"paid"' } }, select: { id: true, history: true } });
    const out: PaymentRecord[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      for (const h of parseHistory(r.history)) {
        if (h.kind !== 'paid' || typeof h.from !== 'string' || typeof h.to !== 'string') continue;
        if (q.from && h.from !== q.from) continue;
        if (q.to && h.to !== q.to) continue;
        const cycle = typeof h.cycle === 'number' ? h.cycle : null;
        if (q.sinceCycle != null && cycle != null && cycle < q.sinceCycle) continue;
        const key = `${h.from}|${h.to}|${h.at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ from: h.from, to: h.to, amount: Number(h.amount) || 0, handed: Number(h.handed) || 0, code: String(h.code ?? ''), currencyId: String(h.currencyId ?? ''), cycle, itemId: r.id });
      }
    }
    return out;
  } catch { return []; }
}

/** currencyId → the faces it comes in (Currency.denominations), for the recipe check. Never throws. */
export async function denominationsByCurrency(campaignId: string): Promise<Denominations> {
  const out: Denominations = new Map();
  try {
    const rows = await prisma.currency.findMany({ where: { campaignId }, select: { id: true, denominations: true } });
    for (const r of rows) out.set(r.id, denominationsOf(r));
  } catch { /* no faces known */ }
  return out;
}

// ── Telling a thing what it is made of (JEWL's compose_item) ─────────────────

export interface PartSpec { name: string; count: number; faceValue?: number; weightLbs?: number; value?: number; bound?: boolean; primaryMaterial?: string; description?: string }

/**
 * Set what an existing thing is made of — under THE RECIPE LAW (Michael 2026-11-01): the recipe is the archetype's (the
 * Forge's); an instance may differ only in the count of loose parts and in paint. With an archetype that has a recipe,
 * the parts must stay inside it or the call is refused ("another thing — forge it"). An archetype under 1 KV with no recipe
 * yet takes this composition AS its recipe (the way stock_goods mints mundane archetypes on the spot); a forged archetype
 * (1 KV or more) takes its recipe in the Forge, not here. A thing with no archetype (legacy rows) keeps its own parts.
 * Money parts take their face in the campaign currency. KV derives from the parts when every part carries one.
 */
export async function setParts(campaignId: string, itemRef: string, specs: PartSpec[], opts: { currency?: string; because?: string } = {}): Promise<{ id: string; name: string; words: string }> {
  const rows = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', OR: [{ id: itemRef.trim() }, { name: itemRef.trim() }] } });
  const row = rows.find((r) => r.id === itemRef.trim()) ?? rows.find((r) => r.name.toLowerCase() === itemRef.trim().toLowerCase()) ?? null;
  if (!row) throw new Error(`no thing called "${itemRef}" in this campaign (exact local name or id)`);
  const needsCurrency = specs.some((p) => p.faceValue != null);
  let cur: { id: string; code: string } | null = null;
  if (needsCurrency) {
    const list = await prisma.currency.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, code: true } });
    cur = opts.currency ? list.find((c) => c.code.toUpperCase() === opts.currency!.trim().toUpperCase() || c.id === opts.currency) ?? null : list.length === 1 ? list[0] : null;
    if (!cur) throw new Error(opts.currency ? `no currency "${opts.currency}" in this campaign` : 'say which currency the faces are in');
  }
  const parts: Parts = specs.filter((p) => p.name.trim() && p.count > 0).map((p) => ({
    name: p.name.trim(), count: Math.floor(p.count), ...(p.bound ? { bound: true } : {}),
    each: {
      ...(p.faceValue != null && cur ? { tender: { currencyId: cur.id, code: cur.code, faceValue: p.faceValue } } : {}),
      ...(p.weightLbs != null ? { weightLbs: p.weightLbs } : {}),
      ...(p.value != null ? { value: p.value } : {}),
      ...(p.primaryMaterial ? { primaryMaterial: p.primaryMaterial } : {}),
      ...(p.description ? { description: p.description } : {}),
    },
  }));
  if (!parts.length) throw new Error('no parts given');
  const data = parseData(row.data);
  // THE RECIPE LAW: the archetype's recipe binds the instance.
  let recipeNote = '';
  const arch = row.sourceForgeItemId ? await prisma.forgeItem.findUnique({ where: { id: row.sourceForgeItemId }, select: { id: true, name: true, data: true, status: true } }).catch(() => null) : null;
  let finalParts: Parts = parts;
  if (arch) {
    const archData = parseData(arch.data);
    const recipe = Array.isArray(archData.parts) ? partsOf(arch.name, archData as Parameters<typeof partsOf>[1]) : null;
    if (recipe) {
      const faces = await denominationsByCurrency(campaignId);
      const verdict = recipeAllows(recipe, parts, faces);
      if (!verdict.ok) throw new Error(`"${row.name}" is a ${arch.name}: ${verdict.reason}`);
      finalParts = partsFromRecipe(recipe, parts, faces);
    } else {
      const archValue = typeof archData.value === 'number' ? archData.value : 0;
      if (archValue >= 1) throw new Error(`"${arch.name}" is a forged thing (${archValue} KV) — its recipe is written in the Forge (propose_forge_blueprint), not on one instance`);
      await prisma.forgeItem.update({ where: { id: arch.id }, data: { data: JSON.stringify({ ...archData, parts }) } });
      recipeNote = ` — recipe written on the archetype "${arch.name}"`;
    }
  }
  const dv = derivedValue(finalParts);
  const { quantity: _q, tender: _t, parts: _p, ...rest } = data as Record<string, unknown> & { quantity?: unknown; tender?: unknown; parts?: unknown };
  void _q; void _t; void _p;
  const next: Record<string, unknown> = { ...rest };
  if (finalParts.length === 1 && finalParts[0].count === 1 && finalParts[0].each?.tender) next.tender = finalParts[0].each.tender;
  else next.parts = finalParts;
  if (dv != null) next.value = dv;
  const weights = finalParts.map((m) => (m.each?.weightLbs != null ? m.each.weightLbs * m.count : null));
  if (weights.every((w) => w != null)) next.weightLbs = Math.round((weights as number[]).reduce((a, w) => a + w, 0) * 10000) / 10000;
  const history = parseHistory(row.history);
  const fmt = await moneyFormatter(campaignId);
  const words = partsInWords(finalParts, fmt);
  history.push({ kind: 'composed', at: new Date().toISOString(), text: `made of ${words}${opts.because ? ` — ${opts.because}` : ''}${recipeNote}` });
  await prisma.campaignItem.update({ where: { id: row.id }, data: { data: JSON.stringify(next), history: JSON.stringify(history) } });
  return { id: row.id, name: row.name, words };
}
