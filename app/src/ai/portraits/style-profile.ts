import 'server-only';

/**
 * Style/era profile inference — the walking version of genesis-authored
 * appearance context.
 *
 * Ruling (Mike 2026-08-08): image generation is HARD-GATED on the genome
 * (backstory) existing, because era, culture, and garments are inferred
 * from WHO THE CHARACTER IS — never hard-coded. GROWTH is any genre, even
 * all at once: the time-traveler from the future wears modern seamless
 * underthings in a medieval world because her STORY says so. User override
 * fields always win over inference; the full genesis dossier supersedes
 * this one-shot pass later. End state: renders read the character's actual
 * equipped state + style preferences.
 */

import { prisma } from '@/lib/db';
import { routedChatText } from '@/ai/network';


export interface StyleProfile {
  era: string;
  underclothing: string;
  garmentNorms: string;
  materials: string;
}

/** In-memory cache keyed by genome hash — walking version; genesis owns
 *  the durable authoring later. */
const cache = new Map<string, StyleProfile>();

function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

/** Pull the stored backstory for a character (Character.data JSON). */
export async function loadCharacterBackstory(characterId: string): Promise<string> {
  const row = await prisma.character.findUnique({
    where: { id: characterId },
    select: { data: true },
  });
  if (!row) return '';
  try {
    const data = JSON.parse(row.data) as Record<string, unknown>;
    const desc = (data.characterDesc ?? {}) as Record<string, unknown>;
    const creation = (data.creation ?? {}) as Record<string, unknown>;
    const backstory = desc.backstory ?? creation.backstory ?? data.backstory;
    return typeof backstory === 'string' ? backstory : '';
  } catch {
    return '';
  }
}

export async function deriveStyleProfile(
  backstory: string,
  styleAesthetics?: string[],
): Promise<StyleProfile | null> {
  const key = hashKey(`${backstory}|${styleAesthetics?.join(',') ?? ''}`);
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    // The backstory is fiction: it may reach Claude, through the wall.
    const { text } = await routedChatText(
      { caller: 'portrait-style-profile', lane: 'judgment', contentClass: 'fiction' },
      {
        system: '',
        maxTokens: 400,
        temperature: 0.7,
        user:
          'From this character backstory, infer the material culture they would dress in. ' +
          'GROWTH campaigns span any genre — read the ERA and culture from the story itself ' +
          '(a time-traveler from the future wears futuristic garments even in a medieval world).' +
          (styleAesthetics?.length
            ? ` The character's personal style preferences: ${styleAesthetics.join(', ')} — let these tint the choices.`
            : '') +
          `\n\nBACKSTORY:\n${backstory.slice(0, 4000)}\n\n` +
          'Reply with ONLY a JSON object, no prose:\n' +
          '{"era": "<one-line era/culture summary>", ' +
          // UNDERWEAR only (2026-10-17): "a garment for a neutral reference image" came back as Kristopher's
          // tee, jeans and belt, and the body step painted him dressed.
          '"underclothing": "<their UNDERWEAR only, as their era and culture would have it — specific nouns, fabric, cut; plain and unornamented; never a shirt, trousers, shoes or any outer garment>", ' +
          '"garmentNorms": "<one line: what this person\'s everyday clothing looks like>", ' +
          '"materials": "<comma list of typical materials>"}',
      },
    );
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<StyleProfile>;
    if (!parsed.underclothing) return null;
    const profile: StyleProfile = {
      era: String(parsed.era ?? ''),
      underclothing: String(parsed.underclothing),
      garmentNorms: String(parsed.garmentNorms ?? ''),
      materials: String(parsed.materials ?? ''),
    };
    cache.set(key, profile);
    return profile;
  } catch (e) {
    console.warn('[style-profile] inference failed:', e);
    return null;
  }
}
