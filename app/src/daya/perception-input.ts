/**
 * FINDING 71 (live 2026-11-05): Violet's card said she typed "Extra Space. In ten." and hit send; it never reached the world, yet on
 * Kristopher's next beat the perception said he had just typed it. A being's CARD (its thought and action segments, its scene line)
 * is the table's page about that being, not something in the world. It reaches another being only through a sense: words SPOKEN
 * or SENT arrive inside the world event itself. So nothing of another being's card may ride into a perception order's input
 * (the surroundings) unless the event itself carries that text. Pure.
 */

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** The pieces of a card worth guarding: quoted words (8+ chars) and whole sentences (16+ chars), normalised. */
export function cardFragments(texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    const n = norm(t);
    if (n.length >= 16 && n.length <= 200) out.add(n);
    for (const m of t.matchAll(/["“]([^"”]{8,})["”]/g)) out.add(norm(m[1]));
    for (const sentence of t.split(/(?<=[.!?])\s+/)) { const s = norm(sentence); if (s.length >= 16) out.add(s); }
  }
  return [...out];
}

/**
 * The surroundings lines with any line that carries another being's card text removed — unless that text is in the event itself
 * (then it was perceived through a sense: a line heard, a message read). Never removes a line the event itself is.
 */
export function scrubOthersCardText(lines: string[], event: string, othersCardTexts: string[]): string[] {
  const frags = cardFragments(othersCardTexts);
  if (!frags.length) return lines;
  const ev = norm(event);
  const live = frags.filter((f) => !ev.includes(f));
  if (!live.length) return lines;
  return lines.filter((l) => { const n = norm(l); return !live.some((f) => n.includes(f)); });
}
