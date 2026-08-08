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

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        messages: [{
          role: 'user',
          content:
            'From this character backstory, infer the material culture they would dress in. ' +
            'GROWTH campaigns span any genre — read the ERA and culture from the story itself ' +
            '(a time-traveler from the future wears futuristic garments even in a medieval world).' +
            (styleAesthetics?.length
              ? ` The character's personal style preferences: ${styleAesthetics.join(', ')} — let these tint the choices.`
              : '') +
            `\n\nBACKSTORY:\n${backstory.slice(0, 4000)}\n\n` +
            'Reply with ONLY a JSON object, no prose:\n' +
            '{"era": "<one-line era/culture summary>", ' +
            '"underclothing": "<concrete garment description for a neutral reference image — specific nouns, fabric, cut; plain and unornamented>", ' +
            '"garmentNorms": "<one line: what this person\'s everyday clothing looks like>", ' +
            '"materials": "<comma list of typical materials>"}',
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn('[style-profile] Claude error', res.status);
      return null;
    }
    const data = await res.json() as { content: Array<{ type: string; text?: string }> };
    const text = data.content?.find(b => b.type === 'text')?.text ?? '';
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
