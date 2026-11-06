import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { NARRATOR_VOICE, parseVoiceSpec, voiceSpecForCharacter, type VoiceSpec } from '@/lib/speech-voices';

export type SpeechResult =
  | { ok: true; body: ArrayBuffer; seconds: number | null; engine: string | null; fx: string | null }
  | { ok: false; status: number; detail: string };

/** Character's sheet data as a plain object (bad JSON -> {}). */
export function parseCharacterData(raw: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* bad JSON */ }
  return {};
}

/** Gender lives at identity.physicalDescription.gender (or identity.sex); older rows had data.gender. */
export function genderFromData(data: Record<string, unknown>): string | null {
  const id = data.identity as { sex?: unknown; physicalDescription?: { gender?: unknown } } | undefined;
  const g = id?.physicalDescription?.gender ?? id?.sex ?? data.gender;
  return typeof g === 'string' ? g : null;
}

/** VoiceSpec for a character id, or the narrator when none. Throws NotFoundError for an unknown id. */
export async function voiceSpecForCharacterId(characterId?: string | null): Promise<VoiceSpec> {
  if (!characterId) return { engine: 'kokoro', voice: NARRATOR_VOICE };
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, data: true } });
  if (!row) throw new NotFoundError('Character not found');
  const data = parseCharacterData(row.data);
  return voiceSpecForCharacter({ id: row.id, gender: genderFromData(data), voice: data.voice });
}

/** @deprecated use voiceSpecForCharacterId */
export const voiceForCharacterId = voiceSpecForCharacterId;

/** The campaign's narrator (Michael 2026-11-06): its designed VoiceSpec when one is saved, else the Kokoro default. */
export async function voiceSpecForNarrator(campaignId?: string | null): Promise<VoiceSpec> {
  const fallback: VoiceSpec = { engine: 'kokoro', voice: NARRATOR_VOICE };
  if (!campaignId) return fallback;
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { narratorVoice: true } });
  if (!row?.narratorVoice) return fallback;
  try { return parseVoiceSpec(JSON.parse(row.narratorVoice)) ?? fallback; } catch { return fallback; }
}

export async function synthesizeSpeech(args: { text: string; spec: VoiceSpec; speed?: number }): Promise<SpeechResult> {
  const url = process.env.TTS_LOCAL_URL ?? 'http://127.0.0.1:9001/v1/audio/speech';
  const { spec } = args;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: args.text,
        voice_ref: spec.ref,
        voice: spec.ref ? undefined : spec.voice,
        fx: spec.fx ?? spec.preset ?? undefined,
        speed: args.speed ?? 1,
        response_format: 'wav',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      return { ok: false, status: res.status, detail: detail || `HTTP ${res.status}` };
    }
    const body = await res.arrayBuffer();
    const raw = res.headers.get('X-Audio-Seconds');
    const n = raw === null ? NaN : Number(raw);
    return {
      ok: true, body, seconds: Number.isFinite(n) ? n : null,
      engine: res.headers.get('X-Engine'), fx: res.headers.get('X-Fx'),
    };
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
