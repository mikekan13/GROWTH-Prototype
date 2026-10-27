/**
 * REFERENTS THE GM LEAVES TO THE WORLD (HW8 run 7 #10, #2). The Watcher wrote "He tries to remember the price of the pizza and says it
 * through the door." The page said "He says the price through the door." and the hearer's stimulus was "He says it through the door." -
 * nothing to hear. A MEMORY check is a RECALL, never a roll (Mike, 27 Oct): the being looks in what it holds and remembers; the value is
 * what he says ("Twenty-two ninety-seven," he says through the door); and when nothing holds it, he honestly cannot.
 *
 * Deterministic: a small referent table (price / total / amount / cost -> a money figure in the text of a held thing or a memory; a name
 * -> the addressed being's name) before the builder is asked anything. Pure except `resolveReferents`' lookups.
 */
import 'server-only';
import { prisma } from '@/lib/db';

const MONEY_OBJECTS = 'price|total|amount|cost|bill|balance|tab';
const SAYS_RE = new RegExp(`(\\b(?:and\\s+)?)(says|speaks|calls out|calls|shouts|tells (?:her|him|them)|answers)\\s+(it|the (?:${MONEY_OBJECTS})(?: of [^.,;!?"]{1,40})?|(?:her|his|their) name|the name|the number)(\\s+(?:through the door|aloud|out loud|loudly|softly|quietly|back|again))?`, 'i');
const OBJECT_RE = new RegExp(`\\b(?:remember|recall|recollect|think of|work out|figure out|look at|checks?|reads?|find|read)\\s+(?:the\\s+|her\\s+|his\\s+)?(${MONEY_OBJECTS}|name|number)\\b`, 'i');
const AMOUNT_RE = /(?:total(?:\s+due)?|amount(?:\s+due)?|collect|price|balance|due|owed?)\D{0,14}\$?\s?(\d{1,4}(?:[.,]\d{2})?)/i;

/** A money figure out of a text that speaks of the object, or null. Pure. */
export function figureIn(text: string, object: string): string | null {
  const m = AMOUNT_RE.exec(text);
  if (m) return m[1].replace(',', '.');
  if (new RegExp(`\\b${object}\\b`, 'i').test(text)) {
    const lone = text.match(/\$\s?(\d{1,4}(?:[.,]\d{2})?)/g);
    if (lone && lone.length === 1) return lone[0].replace(/[$\s]/g, '').replace(',', '.');
  }
  return null;
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const below100 = (n: number): string => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
/** "22.97" -> "Twenty-two ninety-seven"; "22.00" -> "Twenty-two dollars"; a figure outside 1-99 dollars stays in digits. Pure. */
export function amountInWords(figure: string): string {
  const [d, c = '00'] = figure.split('.');
  const dollars = Number(d);
  const cents = Number(c.padEnd(2, '0').slice(0, 2));
  if (!Number.isFinite(dollars) || dollars < 1 || dollars > 99) return figure;
  const word = below100(dollars);
  const out = cents ? `${word} ${cents < 10 ? `oh ${ONES[cents]}` : below100(cents)}` : `${word} dollars`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export interface ReferentGround { held: Array<{ name: string; text: string }>; memories: string[]; addressedName: string | null }
export interface ReferentOutcome { message: string; kind: 'none' | 'said' | 'cannot'; value?: string }

/**
 * Rewrite a GM sentence whose spoken referent is left to the world. Returns the message with the clause resolved:
 *   `... and says it through the door` -> `... and says "Twenty-two ninety-seven" through the door`
 * and, when the being was trying to REMEMBER something nothing holds, `... but can't bring the number up`. Quoted words are never touched.
 */
export function resolveReferentsIn(message: string, ground: ReferentGround): ReferentOutcome {
  const sentences = message.split(/(?<=[.!?…])\s+/);
  let kind: ReferentOutcome['kind'] = 'none';
  let value: string | undefined;
  const out = sentences.map((s) => {
    if (/["“”]/.test(s)) return s;
    const says = SAYS_RE.exec(s);
    if (!says) return s;
    const phrase = says[3].toLowerCase();
    const trying = /\b(?:tries|try|trying|tried|attempts?|attempted)\s+to\s+(?:remember|recall|recollect|think of|work out|figure out)\b/i.test(s);
    const moneyHead = new RegExp(`^the (${MONEY_OBJECTS})`, 'i').exec(phrase);
    let object: string | null;
    if (/name/.test(phrase)) object = 'name';
    else if (moneyHead) object = moneyHead[1].toLowerCase();
    else if (/number/.test(phrase)) object = 'number';
    else object = OBJECT_RE.exec(s)?.[1]?.toLowerCase() ?? null; // "it"
    if (!object) return s;
    let found: string | null = null;
    if (object === 'name') found = ground.addressedName ? ground.addressedName.split(/\s+/)[0] : null;
    else {
      const key = object === 'number' ? 'total' : object;
      for (const h of ground.held) { found = figureIn(h.text, key); if (found) break; }
      if (!found) for (const m of ground.memories) { found = figureIn(m, key); if (found) break; }
    }
    const tail = says[4] ?? '';
    if (found) {
      kind = 'said'; value = found;
      const spoken = object === 'name' ? found : amountInWords(found);
      return s.replace(SAYS_RE, `${says[1]}${says[2]} "${spoken}"${tail}`);
    }
    if (trying) {
      kind = 'cannot';
      return s.replace(SAYS_RE, `but can't bring the ${object === 'name' ? 'name' : 'number'} up`).replace(/\band\s+but\b/i, 'but');
    }
    return s;
  });
  return { message: kind === 'none' ? message : out.join(' '), kind, ...(value ? { value } : {}) };
}

/** Load what the being holds and remembers and resolve the line. Never throws: the line stands as written. */
export async function resolveReferents(campaignId: string, message: string, actorId: string | null, addressedName: string | null): Promise<ReferentOutcome> {
  if (!actorId || !SAYS_RE.test(message)) return { message, kind: 'none' };
  try {
    const rows = await prisma.campaignItem.findMany({ where: { campaignId, holderId: actorId, status: { notIn: ['DESTROYED', 'CONSUMED', 'LOST'] } }, select: { name: true, data: true }, take: 60 });
    const held = (rows ?? []).flatMap((r) => { try { const t = (JSON.parse(r.data ?? '{}') as { text?: unknown }).text; return typeof t === 'string' && t.trim() ? [{ name: r.name, text: t }] : []; } catch { return []; } });
    const entity = await prisma.dayaEntity.findFirst({ where: { characterId: actorId }, select: { id: true } });
    const mems = entity ? await prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id }, orderBy: { realTime: 'desc' }, take: 120, select: { content: true } }) : [];
    return resolveReferentsIn(message, { held, memories: (mems ?? []).map((m) => m.content), addressedName });
  } catch (err) {
    console.warn('[table-referents] not resolved (non-fatal):', err instanceof Error ? err.message : err);
    return { message, kind: 'none' };
  }
}
