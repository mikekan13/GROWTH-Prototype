/**
 * NAME TRANSLATOR for the privacy wall (SIMULATION-COMPOSER-DESIGN 2026-11-03 s4).
 * Before text goes to the cloud, every proper name becomes a per-call placeholder
 * (Person-A, Place-A, ...); the answer is mapped back. The map lives only for the call.
 */

export type NameKind = 'person' | 'place' | 'thing' | 'org' | 'user';
export interface NameEntry { name: string; kind: NameKind; aliases?: string[] }
/** keys: lowercased real name / exact placeholder */
export interface TranslationMap { toPlaceholder: Map<string, string>; toReal: Map<string, string> }

const PREFIX: Record<NameKind, string> = {
  person: 'Person', place: 'Place', thing: 'Thing', org: 'Org', user: 'User',
};
const MIN_LEN = 3;

export function newTranslationMap(): TranslationMap {
  return { toPlaceholder: new Map(), toReal: new Map() };
}

/** 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ... */
function letters(n: number): string {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Escape regex syntax characters only. Under the u flag an escaped "-" or "/" is a SyntaxError (2026-11-03: a place named
 *  "… fourth-floor walkup studio" broke every cloud call through the gate). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countKind(map: TranslationMap, kind: NameKind): number {
  const p = PREFIX[kind] + '-';
  let n = 0;
  for (const ph of map.toReal.keys()) if (ph.startsWith(p)) n++;
  return n;
}

/** Replace every occurrence of every name (and alias) with its placeholder. Mutates and returns the map. */
export function translateOut(
  text: string,
  names: NameEntry[],
  map: TranslationMap = newTranslationMap(),
): { text: string; map: TranslationMap } {
  // variant (lowercased) -> entry; first registration wins
  const variants = new Map<string, NameEntry>();
  const add = (v: string, e: NameEntry) => {
    const t = v.trim().replace(/\s+/g, ' ');
    if (t.length < MIN_LEN) return;
    const k = t.toLowerCase();
    if (!variants.has(k)) variants.set(k, e);
  };
  for (const e of names) {
    if (!e || typeof e.name !== 'string' || e.name.trim().length < MIN_LEN) continue;
    add(e.name, e);
    if (e.kind === 'place') {
      const m = /^the\s+(.+)$/i.exec(e.name.trim());
      if (m) add(m[1], e);
    }
    for (const a of e.aliases ?? []) add(a, e);
  }
  if (!variants.size || !text) return { text, map };

  const alts = [...variants.keys()]
    .sort((a, b) => b.length - a.length)
    .map(v => escapeRegex(v).replace(/ /g, '\\s+'));
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?<![\\p{L}]['’])(?:${alts.join('|')})(?![\\p{L}\\p{N}_])`,
    'giu',
  );

  const out = text.replace(re, (m) => {
    const entry = variants.get(m.toLowerCase().replace(/\s+/g, ' '));
    if (!entry) return m;
    const key = entry.name.trim().toLowerCase();
    let ph = map.toPlaceholder.get(key);
    if (!ph) {
      ph = `${PREFIX[entry.kind]}-${letters(countKind(map, entry.kind))}`;
      map.toPlaceholder.set(key, ph);
      map.toReal.set(ph, entry.name.trim());
    }
    return ph;
  });
  return { text: out, map };
}

/** Put the real names back. Unknown placeholders are left alone. */
export function translateBack(text: string, map: TranslationMap): string {
  if (!text || !map.toReal.size) return text;
  const alts = [...map.toReal.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const re = new RegExp(`(?<![A-Za-z0-9_-])(?:${alts.join('|')})(?![A-Za-z0-9_])`, 'g');
  // A THING IN THE BEING'S MOUTH (table test run 7, 2026-11-04: "I set my Personal phone down"): the ledger's label comes back in its
  // own casing; after a lowercase determiner ("my", "the") a thing's first letter follows the sentence, unless a proper name sits
  // inside the label ("my Chess Pizza polo"). People and places keep their capitals.
  return text.replace(re, (ph: string, offset: number) => {
    const real = map.toReal.get(ph) ?? ph;
    if (!ph.startsWith('Thing-') || !/\b(?:my|the|her|his|their|a|an|that|this|your|our)\s$/i.test(text.slice(Math.max(0, offset - 8), offset))) return real;
    if (/\s[A-Z][a-z]/.test(real)) return real;
    return real.charAt(0).toLowerCase() + real.slice(1);
  });
}

const COMMON_LEAD = /^(the|her|his|their|my|a|an)\s/i;

function looksProper(name: string): boolean {
  const n = name.trim();
  if (!n || COMMON_LEAD.test(n)) return false;
  return /^\p{Lu}/u.test(n) || /^\d/.test(n);
}

/** The campaign's proper names. Best-effort: [] on any error. */
export async function campaignNames(campaignId: string): Promise<NameEntry[]> {
  try {
    const { prisma } = await import('@/lib/db');
    const [chars, locs, items] = await Promise.all([
      prisma.character.findMany({ where: { campaignId }, select: { name: true } }),
      prisma.location.findMany({ where: { campaignId }, select: { name: true } }),
      prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { name: true } }),
    ]);
    const out: NameEntry[] = [];
    const seen = new Set<string>();
    const push = (e: NameEntry) => {
      const k = e.name.trim().toLowerCase();
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(e);
    };
    for (const c of chars) {
      const name = (c.name ?? '').trim();
      if (!name) continue;
      const parts = name.split(/\s+/);
      const first = parts[0];
      push({ name, kind: 'person', aliases: parts.length > 1 && first.length >= 3 ? [first] : undefined });
    }
    for (const l of locs) {
      const name = (l.name ?? '').trim();
      // A description is not a name (2026-11-03: "the lot behind the hotel" went out as "Place-A" and the perception agent
      // could not know it was a parking lot). Only a place name with a capitalised word past a leading "The" is swapped.
      if (name && /\b[A-Z]/.test(name.replace(/^the\s+/i, ''))) push({ name, kind: 'place' });
    }
    for (const i of items) {
      const name = (i.name ?? '').trim();
      if (name && looksProper(name)) push({ name, kind: 'thing' });
    }
    return out;
  } catch {
    return [];
  }
}

const NAME_TTL_MS = 30_000;
const nameCache = new Map<string, { at: number; names: NameEntry[] }>();
/**
 * A placeholder with no name behind it, left in an answer after translateBack (the model invented or borrowed one), becomes
 * a neutral word by kind so it never reaches the page: Person → someone, Place → somewhere, Thing → something. Pure.
 */
export function neutralizeStrayPlaceholders(text: string): { text: string; count: number } {
  let count = 0;
  const words: Record<string, [string, string]> = { Person: ['someone', "someone's"], User: ['someone', "someone's"], Place: ['somewhere', "somewhere's"], Thing: ['something', "something's"], Org: ['some outfit', "some outfit's"] };
  const out = text.replace(/\b(Person|Place|Thing|Org|User)-[A-Z]{1,2}\b(['’]s)?/g, (_m, kind: string, poss?: string) => {
    count++;
    return poss ? words[kind][1] : words[kind][0];
  });
  return { text: out, count };
}

/** campaignNames, cached briefly per campaign (every cloud call of a beat reads the same names). Never throws. */
export async function campaignNamesCached(campaignId: string): Promise<NameEntry[]> {
  const hit = nameCache.get(campaignId);
  if (hit && Date.now() - hit.at < NAME_TTL_MS) return hit.names;
  const names = await campaignNames(campaignId).catch((): NameEntry[] => []);
  nameCache.set(campaignId, { at: Date.now(), names });
  return names;
}
