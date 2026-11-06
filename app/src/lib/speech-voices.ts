// Voice choice for spoken text (Kokoro). Pure: no service imports.

export interface KokoroVoice {
  id: string;
  label: string;
  sex: 'f' | 'm';
  accent: 'american' | 'british';
}

export const KOKORO_VOICES: readonly KokoroVoice[] = [
  { id: 'af_heart', label: 'Heart', sex: 'f', accent: 'american' },
  { id: 'af_bella', label: 'Bella', sex: 'f', accent: 'american' },
  { id: 'af_nicole', label: 'Nicole', sex: 'f', accent: 'american' },
  { id: 'af_sarah', label: 'Sarah', sex: 'f', accent: 'american' },
  { id: 'af_sky', label: 'Sky', sex: 'f', accent: 'american' },
  { id: 'am_adam', label: 'Adam', sex: 'm', accent: 'american' },
  { id: 'am_michael', label: 'Michael', sex: 'm', accent: 'american' },
  { id: 'am_liam', label: 'Liam', sex: 'm', accent: 'american' },
  { id: 'bf_emma', label: 'Emma', sex: 'f', accent: 'british' },
  { id: 'bf_isabella', label: 'Isabella', sex: 'f', accent: 'british' },
  { id: 'bf_alice', label: 'Alice', sex: 'f', accent: 'british' },
  { id: 'bf_lily', label: 'Lily', sex: 'f', accent: 'british' },
  { id: 'bm_george', label: 'George', sex: 'm', accent: 'british' },
  { id: 'bm_lewis', label: 'Lewis', sex: 'm', accent: 'british' },
  { id: 'bm_daniel', label: 'Daniel', sex: 'm', accent: 'british' },
];

export const NARRATOR_VOICE = 'bm_daniel';

/** FNV-1a 32-bit. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function poolFor(gender: string | null | undefined): KokoroVoice[] {
  const g = (gender ?? '').trim().toLowerCase();
  const base = KOKORO_VOICES.filter(v => v.id !== NARRATOR_VOICE);
  if (g.includes('female') || g.includes('woman') || g === 'f') return base.filter(v => v.sex === 'f');
  if (g.includes('male') || g.includes('man') || g === 'm') return base.filter(v => v.sex === 'm');
  return base;
}

export function voiceForCharacter(c: { id: string; gender?: string | null; voice?: string | null }): string {
  if (c.voice && KOKORO_VOICES.some(v => v.id === c.voice)) return c.voice;
  const pool = poolFor(c.gender);
  return pool[fnv1a(c.id) % pool.length].id;
}
