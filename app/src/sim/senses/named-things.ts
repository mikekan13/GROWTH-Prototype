/**
 * THE THINGS A LINE NAMES (HW9, Mike 2026-10-29): "Kristopher … calls Violet's cell phone" / "Violet's cell phone
 * begins to ring" — the sound is at HER PHONE, in her pocket in the Main Room, not where the caller stands. Before
 * this the reach judge was told only who did it and where they stood, so Violet heard her own phone as "a sound
 * from beyond the room" and Kristopher heard it as something inside.
 *
 * Pure matching of a line against the campaign's things, derived from data alone: a thing's own name ("Her phone",
 * "Work phone"), its name without its leading article, and — for a held thing — its holder's possessive plus the
 * thing's head noun ("Violet's cell phone", "Violets phone"). A bare "her phone" counts only when nothing stronger
 * names it and only one held thing could be meant. No vocabulary beyond possessive forms.
 */
import type { ReachVerdict } from './reach';

export interface NamedThing { id: string; name: string; holderId: string | null; locationId: string | null }
export interface NamedBeing { id: string; name: string }
export interface ThingMatch { id: string; name: string; holderId: string | null; locationId: string | null; /** The words of the line that named it. */ as: string }

const ARTICLE_RE = /^(?:the|a|an|her|his|their|its|my|our|your)\s+/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SMALL = new Set(['of', 'the', 'and', 'with', 'for', 'in', 'on', 'to', 'a', 'an']);

/** The head noun of a thing's name: its last word ("Her phone" → phone, "Pizza (Hawaiian + black olives)" → pizza). Pure. */
export function headNoun(name: string): string {
  const bare = name.replace(/\(.*?\)/g, ' ').replace(ARTICLE_RE, '').trim().toLowerCase();
  const words = bare.split(/[^a-z0-9'’-]+/).filter((w) => w && !SMALL.has(w));
  return words[words.length - 1] ?? bare;
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** Every thing the line names, longest wording first, each thing once. Pure. */
export function matchNamedThings(text: string, things: NamedThing[], beings: NamedBeing[]): ThingMatch[] {
  const hay = ` ${text.replace(/[’]/g, "'").replace(/\s+/g, ' ')} `;
  const byId = new Map<string, NamedBeing>(beings.map((b) => [b.id, b]));
  const longest = (patterns: string[]): string | null => {
    let best: string | null = null;
    for (const p of patterns) {
      const m = hay.match(new RegExp(`(?<![\\w'])${p}(?![\\w'])`, 'i'));
      if (m && (!best || m[0].length > best.length)) best = m[0];
    }
    return best;
  };
  const found: ThingMatch[] = [];
  const vagueHits: ThingMatch[] = [];
  for (const t of things) {
    // STRONG: the thing's own name (when it does not itself open with "her/his"), or its holder's possessive before its head noun.
    const strong: string[] = [];
    const full = t.name.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (full && !/^(?:her|his|their|its|my|our|your)\s/i.test(full)) strong.push(esc(full));
    const bare = full.replace(ARTICLE_RE, '').trim();
    if (bare && bare.split(' ').length >= 2) strong.push(esc(bare));
    const noun = headNoun(t.name);
    const holder = t.holderId ? byId.get(t.holderId) : undefined;
    const vague: string[] = [];
    if (holder && noun.length >= 3) {
      const fn = esc(firstName(holder.name));
      // "Violet's cell phone", "Violets phone", "Violet's old phone" — up to two words between the possessive and the noun.
      strong.push(`${fn}(?:'s|s)\\s+(?:[a-z-]+\\s+){0,2}${esc(noun)}`);
      vague.push(`(?:her|his|their)\\s+(?:[a-z-]+\\s+){0,2}${esc(noun)}`);
    }
    const s = longest(strong);
    if (s) { found.push({ id: t.id, name: t.name, holderId: t.holderId, locationId: t.locationId, as: s.trim() }); continue; }
    const v = longest(vague);
    if (v) vagueHits.push({ id: t.id, name: t.name, holderId: t.holderId, locationId: t.locationId, as: v.trim() });
  }
  // "her phone" alone means one thing only when exactly one held thing of that noun exists.
  const byNoun = new Map<string, ThingMatch[]>();
  for (const h of vagueHits) { const n = headNoun(h.name); byNoun.set(n, [...(byNoun.get(n) ?? []), h]); }
  const claimed = (as: string) => found.some((f) => { const a = f.as.toLowerCase(), b = as.toLowerCase(); return a.includes(b) || b.includes(a); });
  for (const hits of byNoun.values()) if (hits.length === 1 && !found.some((f) => f.id === hits[0].id) && !claimed(hits[0].as)) found.push(hits[0]);
  return found.sort((a, b) => b.as.length - a.as.length);
}

/**
 * A being holding a named thing perceives what happens to it whole: it is on them (touch), in their hand or
 * pocket (sight), and sounds against them (hearing). Pure.
 */
export function holderVerdict(beingId: string, matches: ThingMatch[], v: ReachVerdict | undefined): ReachVerdict | undefined {
  if (!matches.some((m) => m.holderId === beingId)) return v;
  const via = new Set([...(v?.via ?? []), 'sight', 'hearing', 'touch']);
  return { beingId, reaches: true, via: [...via], noticed: true, salience: Math.max(v?.salience ?? 0, 0.7) };
}
