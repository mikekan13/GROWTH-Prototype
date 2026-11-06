// Voice choice for spoken text (Kokoro / designed Qwen voices). Pure: no service imports.
import { z } from 'zod';

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
export function fnv1a(s: string): number {
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

export function voiceForCharacter(c: { id: string; gender?: string | null; voice?: unknown }): string {
  if (typeof c.voice === 'string' && KOKORO_VOICES.some(v => v.id === c.voice)) return c.voice;
  if (c.voice && typeof c.voice === 'object') {
    const kv = (c.voice as { voice?: unknown }).voice;
    if (typeof kv === 'string' && KOKORO_VOICES.some(v => v.id === kv)) return kv;
  }
  const pool = poolFor(c.gender);
  return pool[fnv1a(c.id) % pool.length].id;
}

export const FX_PRESETS: readonly string[] = ['human', 'demonic', 'angelic', 'monstrous', 'robotic', 'ghostly', 'giant', 'tiny'];

export const fxParamsSchema = z.object({
  pitch: z.number().min(-24).max(24).optional(),
  formant: z.number().min(0.5).max(2).optional(),
  layers: z.number().min(0).max(4).optional(),
  grit: z.number().min(0).max(1).optional(),
  sub: z.number().min(0).max(1).optional(),
  air: z.number().min(0).max(1).optional(),
  reverb: z.number().min(0).max(1).optional(),
  crush: z.number().min(0).max(1).optional(),
  ring: z.number().min(0).optional(),
});
export type FxParams = z.infer<typeof fxParamsSchema>;

export const voiceSpecSchema = z.object({
  engine: z.enum(['kokoro', 'qwen']),
  voice: z.string().optional(),
  ref: z.string().optional(),
  description: z.string().optional(),
  transcript: z.string().optional(),
  preset: z.string().optional(),
  fx: fxParamsSchema.optional(),
  seed: z.number().int().optional(),
  lockedAt: z.string().optional(),
});
export type VoiceSpec = z.infer<typeof voiceSpecSchema>;

/** New object form, or a bare legacy Kokoro id. Anything else -> null. */
export function parseVoiceSpec(raw: unknown): VoiceSpec | null {
  if (typeof raw === 'string') {
    return KOKORO_VOICES.some(v => v.id === raw) ? { engine: 'kokoro', voice: raw } : null;
  }
  const r = voiceSpecSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function voiceSpecForCharacter(c: { id: string; gender?: string | null; voice?: unknown }): VoiceSpec {
  const parsed = parseVoiceSpec(c.voice);
  if (parsed) return parsed;
  return { engine: 'kokoro', voice: voiceForCharacter({ id: c.id, gender: c.gender }) };
}
