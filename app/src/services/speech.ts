import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { NARRATOR_VOICE, voiceForCharacter } from '@/lib/speech-voices';

export type SpeechResult =
  | { ok: true; body: ArrayBuffer; seconds: number | null }
  | { ok: false; status: number; detail: string };

/** Voice for a character id, or the narrator when none. Throws NotFoundError for an unknown id. */
export async function voiceForCharacterId(characterId?: string | null): Promise<string> {
  if (!characterId) return NARRATOR_VOICE;
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, data: true } });
  if (!row) throw new NotFoundError('Character not found');
  let data: { gender?: unknown; voice?: unknown } = {};
  try {
    const parsed = JSON.parse(row.data ?? '{}');
    if (parsed && typeof parsed === 'object') data = parsed;
  } catch { /* bad JSON: no gender */ }
  return voiceForCharacter({
    id: row.id,
    gender: typeof data.gender === 'string' ? data.gender : null,
    voice: typeof data.voice === 'string' ? data.voice : null,
  });
}

export async function synthesizeSpeech(args: { text: string; voice: string; speed?: number }): Promise<SpeechResult> {
  const url = process.env.TTS_LOCAL_URL ?? 'http://127.0.0.1:9001/v1/audio/speech';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: args.text, voice: args.voice, speed: args.speed ?? 1, response_format: 'wav' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      return { ok: false, status: res.status, detail: detail || `HTTP ${res.status}` };
    }
    const body = await res.arrayBuffer();
    const raw = res.headers.get('X-Audio-Seconds');
    const n = raw === null ? NaN : Number(raw);
    return { ok: true, body, seconds: Number.isFinite(n) ? n : null };
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
