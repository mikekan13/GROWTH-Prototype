/**
 * What JEWL's read sees of the world beyond names (Mike 2026-10-26): the TEXT written on things, what the beings
 * remember that touches the line, how well the present beings know each other. Pure formatters over rows the
 * caller fetched, so they test without prisma.
 */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** One thing, with what is written on it. `data` is the raw CampaignItem.data JSON (parsed defensively). */
export function itemLine(name: string, rawData: string | null | undefined): string {
  let text = '';
  let description = '';
  try {
    const d = JSON.parse(rawData ?? '{}') as { text?: unknown; description?: unknown };
    text = typeof d.text === 'string' ? d.text.trim() : '';
    description = typeof d.description === 'string' ? d.description.trim() : '';
  } catch { /* no readable data */ }
  const parts = [name];
  if (description) parts.push(`described: ${clip(description, 200)}`);
  if (text) parts.push(`text written on it: "${clip(text.replace(/\s+/g, ' '), 600)}"`);
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join('; ')})` : name;
}

/** Capitalised words (≥3 letters) and quoted things in the line, plus the present names' words — the memory match keys. */
export function memoryKeys(message: string, presentNames: string[]): string[] {
  const keys = new Set<string>();
  for (const m of message.matchAll(/\b[A-Z][A-Za-z'’-]{2,}\b/g)) keys.add(m[0].toLowerCase());
  for (const m of message.matchAll(/["“]([^"”]{3,40})["”]/g)) for (const w of m[1].split(/\s+/)) if (w.length >= 3) keys.add(w.toLowerCase().replace(/[^a-z'’-]/g, ''));
  for (const n of presentNames) for (const w of n.split(/\s+/)) if (w.length >= 3) keys.add(w.toLowerCase());
  keys.delete('');
  // Sentence-opening filler that is only capitalised by position.
  for (const stop of ['the', 'and', 'but', 'his', 'her', 'she', 'they', 'then', 'when', 'with']) keys.delete(stop);
  return [...keys];
}

/** Up to `cap` of a being's memories whose content contains a key; most recent first (input order kept). */
export function touchingMemories(contents: string[], keys: string[], cap = 8): string[] {
  const out: string[] = [];
  for (const c of contents) {
    const low = c.toLowerCase();
    if (keys.some((k) => low.includes(k))) out.push(clip(c.replace(/\s+/g, ' ').trim(), 240));
    if (out.length >= cap) break;
  }
  return out;
}

export interface FamiliarityRowLite { perceiver: string; subject: string; aspectKind: string; score: number }

/** "A knows B: identity 0.7, appearance 0.7" — only perceiver/subject pairs both in the scene. */
export function familiarityLines(rows: FamiliarityRowLite[]): string[] {
  const by = new Map<string, FamiliarityRowLite[]>();
  for (const r of rows) {
    const k = `${r.perceiver}→${r.subject}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return [...by.values()].map((rs) => `${rs[0].perceiver} knows ${rs[0].subject}: ${rs.sort((a, b) => b.score - a.score).slice(0, 5).map((r) => `${r.aspectKind} ${r.score.toFixed(1)}`).join(', ')}`);
}

export function answeredLines(tickets: Array<{ message: string; answer: string | null }>): string[] {
  return tickets.filter((t) => t.answer && t.answer.trim()).map((t) => `- on "${clip(t.message.replace(/\s+/g, ' '), 140)}" the Watcher told JEWL: ${clip(t.answer!.trim(), 300)}`);
}
