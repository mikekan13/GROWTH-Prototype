/**
 * PARTS — object permanence for many alike things (Michael 2026-11-01): "we can have items grouped together as one
 * item. Similar to the quantum-like storage containers. Basically it is an item that is actually multiple items and
 * until you have to separate one of them from the group. Like if I have an item called 'wad of cash' and in its details
 * it lists a 20 dollar bill and 2 one dollar bills." And: "it wouldn't just have to be money… A parts of arrows. A
 * stack of wood."
 *
 * One CampaignItem row IS the group. Its `parts` lists the parts by kind and count, with what is true of EACH (its
 * face as money, its weight). Nothing is counted twice: the sheet's wealth ledger holds money that is not an object
 * (a checking account); every bill in the world is a part of some thing, or a lone thing with `tender`.
 *
 * Splitting one off makes a new row for what left; the group keeps the rest. Paying is a split: the bills worth at
 * least the amount, fewest pieces, least over — what a hand does at a door. The receiver gets ONE new thing ("a twenty
 * and a five"), with where it came from on its history; change is the receiver's own act, the other way.
 *
 * Pure: no database here. services/parts.ts does the rows.
 * [[ruling-everything-is-a-container-full-human-body-2026-10-16]], [[ruling-currency-is-perceived-value-2026-10-17]].
 */
import type { ItemPart, GrowthWorldItem, Tender } from '@/types/item';

export type Parts = ItemPart[];

type ItemData = Partial<GrowthWorldItem> & { quantity?: number };

/** True when the row's data describes a group (a parts with parts, or a legacy quantity above one). */
export function isComposed(data: ItemData | null | undefined): boolean {
  if (!data) return false;
  if (Array.isArray(data.parts) && data.parts.some((m) => m && m.count > 0)) return true;
  return typeof data.quantity === 'number' && data.quantity > 1;
}

/**
 * The parts of a thing: its `parts`; else a lone `tender` thing as one part of itself; else a legacy `quantity`
 * of itself; else one of itself.
 */
export function partsOf(name: string, data: ItemData | null | undefined): Parts {
  const d = data ?? {};
  if (Array.isArray(d.parts) && d.parts.length) {
    const ms = d.parts
      .filter((m) => m && typeof m.name === 'string' && m.name.trim() && Number.isFinite(m.count) && m.count > 0)
      .map((m) => ({ name: m.name.trim(), count: Math.floor(m.count), ...(m.each ? { each: m.each } : {}) }));
    if (ms.length) return ms;
  }
  if (d.tender) return [{ name, count: 1, each: { tender: d.tender, ...(d.weightLbs != null ? { weightLbs: d.weightLbs } : {}) } }];
  const q = typeof d.quantity === 'number' && d.quantity > 1 ? Math.floor(d.quantity) : 1;
  return [{ name, count: q, ...(d.weightLbs != null && q === 1 ? { each: { weightLbs: d.weightLbs } } : {}) }];
}

/** The parts a hand can take out without unmaking the thing. */
export function looseParts(ms: Parts): Parts {
  return ms.filter((m) => !m.bound);
}

export function partCount(ms: Parts): number {
  return ms.reduce((a, m) => a + m.count, 0);
}

/** Money in the parts, summed by face. `currencyId` narrows to one currency; otherwise every tender part counts. */
export function tenderTotal(ms: Parts, currencyId?: string): number {
  let cents = 0;
  for (const m of ms) {
    const t = m.each?.tender;
    if (!t || (currencyId && t.currencyId !== currencyId)) continue;
    cents += Math.round(t.faceValue * 100) * m.count;
  }
  return cents / 100;
}

/** The currencies the parts are tender in (id → code). */
export function tenderCurrencies(ms: Parts): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of ms) if (m.each?.tender) out.set(m.each.tender.currencyId, m.each.tender.code);
  return out;
}

const SMALL = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function countWord(n: number, name: string): string {
  if (n === 1) return /^[aeiou]/i.test(name) ? 'an' : 'a';
  return SMALL[n] ?? String(n);
}
function plural(name: string): string {
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}
/** "twenty-dollar bill" → "twenty"; a bill named by its face is spoken by its face. Otherwise the name itself. */
function shortName(m: ItemPart): string {
  const bill = /^(.+?)[- ](?:dollar|pound|euro|yen|coin|note|bill)s?(?:\s+(?:bill|note|coin))?$/i.exec(m.name);
  if (m.each?.tender && bill) return bill[1].toLowerCase();
  return m.name;
}
/** "$25" by code when the currency is known to the caller; else "25 USD". */
export type MoneyFormatter = (amount: number, code: string) => string;
export const plainMoney: MoneyFormatter = (amount, code) => `${Math.round(amount * 100) / 100} ${code}`;

/**
 * "a twenty and a five ($25)", "two twenties and a five ($45)", "20 arrows", "a twenty-dollar bill". The money total is
 * appended per currency when any part is tender. Pure.
 */
export function partsInWords(ms: Parts, fmt: MoneyFormatter = plainMoney, opts: { money?: boolean } = {}): string {
  const parts = ms.filter((m) => m.count > 0).map((m) => {
    const short = shortName(m);
    return `${countWord(m.count, short)} ${m.count === 1 ? short : plural(short)}`;
  });
  const list = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  if (opts.money === false) return list;
  const totals: string[] = [];
  for (const [id, code] of tenderCurrencies(ms)) totals.push(fmt(tenderTotal(ms, id), code));
  return totals.length ? `${list} (${totals.join(', ')})` : list;
}

export interface TenderPick {
  picks: Array<{ name: string; count: number }>;
  /** What the picked parts are worth. */
  handed: number;
  /** handed − amount (0 when exact). */
  over: number;
  currencyId: string;
  code: string;
}

/**
 * The parts worth at least `amount` in one currency, with the least over, and the fewest pieces among ties — what a
 * hand picks out of a wallet. Null when the parts hold less than the amount (or none of that currency). Bounded:
 * the sums searched stop at amount + the largest face. Pure.
 */
export function pickTender(ms: Parts, amount: number, currencyId?: string): TenderPick | null {
  const need = Math.round(amount * 100);
  if (!(need > 0)) return null;
  const currencies = tenderCurrencies(ms);
  const cid = currencyId ?? (currencies.size === 1 ? [...currencies.keys()][0] : null);
  if (!cid) return null;
  const code = currencies.get(cid);
  if (!code) return null;
  const kinds = looseParts(ms)
    .filter((m) => m.each?.tender?.currencyId === cid && m.count > 0 && m.each!.tender!.faceValue > 0)
    .map((m) => ({ name: m.name, face: Math.round(m.each!.tender!.faceValue * 100), count: m.count }));
  if (!kinds.length) return null;
  const total = kinds.reduce((a, k) => a + k.face * k.count, 0);
  if (total < need) return null;
  const maxFace = Math.max(...kinds.map((k) => k.face));
  const limit = Math.min(total, need + maxFace);
  // Bounded knapsack by sum: fewest pieces to reach each sum ≤ limit, with the composition.
  const best: Array<{ pieces: number; via: number[] } | null> = new Array(limit + 1).fill(null);
  best[0] = { pieces: 0, via: kinds.map(() => 0) };
  for (let k = 0; k < kinds.length; k++) {
    const { face, count } = kinds[k];
    for (let s = limit; s >= 0; s--) {
      const base = best[s];
      if (!base) continue;
      for (let c = 1; c <= count; c++) {
        const t = s + face * c;
        if (t > limit) break;
        const cand = base.pieces + c;
        if (!best[t] || best[t]!.pieces > cand) {
          const via = base.via.slice();
          via[k] += c;
          best[t] = { pieces: cand, via };
        }
      }
    }
  }
  for (let s = need; s <= limit; s++) {
    const b = best[s];
    if (!b) continue;
    return {
      picks: kinds.map((k, i) => ({ name: k.name, count: b.via[i] })).filter((p) => p.count > 0),
      handed: s / 100,
      over: (s - need) / 100,
      currencyId: cid,
      code,
    };
  }
  return null;
}

/**
 * Take picks out of parts: what is left and what was taken, kinds kept with their `each`. Throws on more than there is,
 * and on a BOUND part unless `unmake` is set (the beads come off only when the rope is unmade).
 */
export function takeParts(ms: Parts, picks: Array<{ name: string; count: number }>, opts: { unmake?: boolean } = {}): { left: Parts; taken: Parts } {
  const left: Parts = ms.map((m) => ({ ...m }));
  const taken: Parts = [];
  for (const p of picks) {
    if (!(p.count > 0)) continue;
    const m = left.find((x) => x.name.toLowerCase() === p.name.trim().toLowerCase());
    if (!m || m.count < p.count) throw new Error(`no ${p.count} ${p.name} to take — ${m ? m.count : 0} there`);
    if (m.bound && !opts.unmake) throw new Error(`${p.name} is made into the thing — it comes off only by unmaking it`);
    m.count -= p.count;
    taken.push({ name: m.name, count: p.count, ...(m.each ? { each: m.each } : {}) });  // what left is loose now
  }
  return { left: left.filter((m) => m.count > 0), taken };
}

/** Parts added to parts; alike kinds (same name) merge by count. */
export function addParts(a: Parts, b: Parts): Parts {
  const out: Parts = a.map((m) => ({ ...m }));
  for (const m of b) {
    const same = out.find((x) => x.name.toLowerCase() === m.name.toLowerCase() && JSON.stringify(x.each?.tender ?? null) === JSON.stringify(m.each?.tender ?? null));
    if (same) same.count += m.count;
    else out.push({ ...m });
  }
  return out.filter((m) => m.count > 0);
}

/** The group fields a row carrying exactly these parts has: `parts` for many, `tender` for one bill, weight and KV summed from `each`. */
export function dataForParts(source: ItemData, ms: Parts): ItemData {
  const { quantity: _q, state: _s, parts: _b, tender: _t, mapShape: _m, ...rest } = source as ItemData & { state?: unknown; mapShape?: unknown };
  void _q; void _s; void _b; void _t; void _m;
  const out: ItemData = { ...rest };
  const weights = ms.map((m) => (m.each?.weightLbs != null ? m.each.weightLbs * m.count : null));
  if (weights.length && weights.every((w) => w != null)) out.weightLbs = Math.round((weights as number[]).reduce((a, w) => a + w, 0) * 10000) / 10000;
  const values = ms.map((m) => (m.each?.value != null ? m.each.value * m.count : null));
  if (values.length && values.every((v) => v != null)) out.value = Math.round((values as number[]).reduce((a, v) => a + v, 0) * 10000) / 10000;
  if (ms.length === 1 && ms[0].count === 1) {
    if (ms[0].each?.tender) out.tender = ms[0].each.tender;
    if (ms[0].each?.description) out.description = ms[0].each.description;
    return out;
  }
  out.parts = ms.map((m) => ({ ...m }));
  return out;
}

/** A local name for what left a group: one piece is called by its kind; several are called by what they are. */
export function nameForParts(ms: Parts): string {
  if (ms.length === 1 && ms[0].count === 1) return ms[0].name;
  const words = partsInWords(ms, plainMoney, { money: false });
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A tender part for a bill or coin of this face. */
export function billOf(name: string, count: number, tender: Tender, each: Omit<NonNullable<ItemPart['each']>, 'tender'> = {}): ItemPart {
  return { name, count, each: { tender, ...each } };
}

// ── The recipe law (Michael 2026-11-01): an instance never strays from its archetype's KV ──────────────────────────
// "An item can't stray from its KRMA value with these instantiated versions. Once they do they become something else" —
// a new archetype through the Forge now, a truly unique item (one campaign at a time) once the game is live. So the
// RECIPE (kinds, per-unit properties, bound or loose) is the archetype's; an instance may differ only in the COUNT of
// loose parts (the bills in this wad) and in paint (these beads are blue). KV derives from the parts when they carry one.

/** Does this instance's parts list stay inside the archetype's recipe? Pure. */
export function recipeAllows(recipe: Parts, parts: Parts): { ok: true } | { ok: false; reason: string } {
  const byName = new Map(recipe.map((r) => [r.name.toLowerCase(), r]));
  for (const p of parts) {
    const r = byName.get(p.name.toLowerCase());
    if (!r) return { ok: false, reason: `"${p.name}" is not a part of this kind of thing — a thing made of other parts is another thing (forge it)` };
    if (r.bound && p.count !== r.count) return { ok: false, reason: `${r.count} ${r.name} are made into it; ${p.count} would make it another thing (forge it)` };
    const rt = r.each?.tender, pt = p.each?.tender;
    if ((rt || pt) && JSON.stringify(rt ?? null) !== JSON.stringify(pt ?? null)) return { ok: false, reason: `"${p.name}" is not the money the recipe names` };
  }
  for (const r of recipe) if (r.bound && !parts.some((p) => p.name.toLowerCase() === r.name.toLowerCase())) return { ok: false, reason: `${r.name} is made into it and cannot be left out (forge it without)` };
  return { ok: true };
}

/** The KV of a composed thing when every part carries one: Σ value × count; null when any part has none. Pure. */
export function derivedValue(parts: Parts): number | null {
  let sum = 0;
  for (const p of parts) {
    if (p.each?.value == null) return null;
    sum += p.each.value * p.count;
  }
  return Math.round(sum * 10000) / 10000;
}

/** The instance's parts with the recipe's per-unit truths (each) laid under them — paint on top, mechanics from the archetype. */
export function partsFromRecipe(recipe: Parts, parts: Parts): Parts {
  const byName = new Map(recipe.map((r) => [r.name.toLowerCase(), r]));
  return parts.map((p) => {
    const r = byName.get(p.name.toLowerCase());
    if (!r) return p;
    const each = { ...(r.each ?? {}), ...(p.each?.description ? { description: p.each.description } : {}) };
    return { name: r.name, count: p.count, ...(r.bound ? { bound: true } : {}), ...(Object.keys(each).length ? { each } : {}) };
  });
}
