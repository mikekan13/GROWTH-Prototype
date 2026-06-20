/**
 * Build the per-campaign vocabulary string Whisper uses to bias proper-noun
 * recognition. Without this, Whisper substitutes phonetic neighbors for
 * unusual names ("Valmir" → "found me", "Et'herling" → "atherling", etc.).
 *
 * Strategy: assemble PCs + NPCs + locations + canonical cosmology terms
 * + common GROWTH mechanics terms into one comma-separated string. Cache
 * per campaign for 60 seconds so we don't query the DB on every audio
 * chunk (6/min before, 12/min now with 5s chunks).
 *
 * Whisper's `initial_prompt` is treated as recent context — the model
 * conditions on it without being required to output it. Keep the
 * string under ~200 tokens for best behavior.
 */

import 'server-only';
import { prisma } from '@/lib/db';

interface CachedVocab {
  text: string;
  builtAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CachedVocab>();

// Canon names that should ALWAYS prime Whisper. Kept TIGHT — every word
// here biases Whisper toward emitting it on silence (Whisper "hears" what
// it was primed on). Only add names that are routinely spoken aloud.
// Lore-deep cosmology terms (Sephirot names, Yaldabaoth, etc.) were
// removed after they started showing up as hallucinations on silence.
const CANON_GLOBAL = [
  // Prime Party — actively named in conversation
  'Val Pendragon',
  'Tara Almswood',
  'Kai',
  "Et'herling",
  // JEWL himself
  'JEWL',
  // Core mechanics terms — said in nearly every session
  'KRMA',
  'GROWTH',
  'Godhead',
];

export async function buildSttVocabulary(campaignId: string): Promise<string> {
  const cached = cache.get(campaignId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.text;
  }

  const [characters, locations] = await Promise.all([
    prisma.character.findMany({
      where: {
        OR: [{ campaignId }, { campaignId: null }], // include global Godheads
        status: 'ACTIVE',
      },
      select: { name: true },
      take: 100,
    }),
    prisma.location.findMany({
      where: { campaignId },
      select: { name: true },
      take: 50,
    }),
  ]);

  const names = new Set<string>();
  for (const c of characters) {
    if (c.name && c.name.length <= 80) names.add(c.name);
  }
  for (const l of locations) {
    if (l.name && l.name.length <= 80) names.add(l.name);
  }
  for (const n of CANON_GLOBAL) names.add(n);

  // Comma-separated; Whisper handles this format well. Keep total under
  // ~800 chars to stay within token budget.
  let text = Array.from(names).join(', ');
  if (text.length > 800) text = text.slice(0, 800);

  cache.set(campaignId, { text, builtAt: Date.now() });
  return text;
}

/** Invalidate a campaign's vocab cache. Call when characters/locations change. */
export function invalidateSttVocabulary(campaignId: string): void {
  cache.delete(campaignId);
}
