import { prisma } from '@/lib/db';
import { NotFoundError, ServiceUnavailableError } from '@/lib/errors';
import { fnv1a, parseVoiceSpec, type FxParams, type VoiceSpec } from '@/lib/speech-voices';
import { genderFromData, parseCharacterData } from '@/services/speech';

const DESIGN_TIMEOUT_MS = 60_000;
const FALLBACK_DESCRIPTION = 'An adult voice, natural and clear.';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function ageWords(age: number, pronoun: 'her' | 'his' | 'their'): string | null {
  if (!Number.isFinite(age) || age <= 0) return null;
  if (age < 13) return 'a child';
  if (age < 20) return `in ${pronoun} teens`;
  const decades = ['twenties', 'thirties', 'forties', 'fifties', 'sixties', 'seventies', 'eighties', 'nineties'];
  const d = Math.min(Math.floor(age / 10) - 2, decades.length - 1);
  const n = age % 10;
  const stage = n <= 3 ? 'early' : n <= 6 ? 'mid' : 'late';
  return `in ${pronoun} ${stage}-${decades[d]}`;
}

function firstSentences(text: string, max: number): string {
  const parts = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) ?? [text];
  return parts.slice(0, max).join('').trim();
}

/** One or two sentences of plain prose from whatever the sheet holds. Deterministic. */
export function describeVoiceFromSheet(character: { id: string; name: string; data: Record<string, unknown> }): string {
  const data = character.data ?? {};
  const identity = obj(data.identity);
  const phys = obj(identity.physicalDescription);
  const gender = (genderFromData(data) ?? '').toLowerCase();
  const female = gender.includes('female') || gender.includes('woman') || gender === 'f';
  const male = !female && (gender.includes('male') || gender.includes('man') || gender === 'm');
  const noun = female ? 'woman' : male ? 'man' : 'person';
  const pronoun = female ? 'her' : male ? 'his' : 'their';

  const bits: string[] = [];
  const age = typeof identity.age === 'number' ? ageWords(identity.age, pronoun) : null;
  const build = str(phys.build);
  const seedName = str(obj(obj(data.creation).seed).name);
  const hasAny = Boolean(age || build || seedName || gender);

  if (hasAny) {
    const head = [`A ${noun}`];
    if (age) head[0] = age === 'a child' ? `A child` : `A ${noun} ${age}`;
    bits.push(head[0]);
    if (build) bits.push(`${build.toLowerCase()} build`);
    if (seedName) bits.push(seedName.toLowerCase());
  }
  const sentences: string[] = [];
  if (bits.length) sentences.push(`${bits.join(', ')}.`);

  const about = str(identity.description);
  if (about) sentences.push(firstSentences(about, 2));

  const traits = Array.isArray(data.traits) ? data.traits : [];
  const names = traits
    .map(t => obj(t))
    .filter(t => t.type === 'thorn' || t.type === 'nectar')
    .map(t => str(t.name))
    .filter((n): n is string => !!n)
    .slice(0, 3);
  if (names.length) {
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    sentences.push(`Shaped by ${list}.`);
  }
  const out = sentences.join(' ').trim();
  return (out || FALLBACK_DESCRIPTION).slice(0, 600);
}

async function loadCharacter(characterId: string) {
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, data: true } });
  if (!row) throw new NotFoundError('Character not found');
  return { id: row.id, name: row.name, data: parseCharacterData(row.data) };
}

async function saveData(characterId: string, data: Record<string, unknown>) {
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(data) } });
}

function designBase(): string {
  const url = process.env.TTS_LOCAL_URL ?? 'http://127.0.0.1:9001/v1/audio/speech';
  try { return new URL(url).origin; } catch { return 'http://127.0.0.1:9001'; }
}

export interface DesignOpts { description?: string; text?: string; preset?: string; fx?: FxParams; seed?: number }

/** Ask the speech server to design a voice from a description: returns the saved ref id and a preview clip. */
async function designVoice(args: { description: string; text: string; seed: number; fx?: FxParams | string }): Promise<{ ref: string; previewWavBase64: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DESIGN_TIMEOUT_MS);
  let json: { id?: unknown; preview_wav_base64?: unknown };
  try {
    const res = await fetch(`${designBase()}/v1/voices/design`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: args.description, text: args.text, language: 'English', seed: args.seed, fx: args.fx ?? undefined }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 503) throw new ServiceUnavailableError('Voice design model unavailable');
      throw new ServiceUnavailableError(`Voice design failed: HTTP ${res.status} ${detail}`.trim());
    }
    json = await res.json();
  } catch (e) {
    if (e instanceof ServiceUnavailableError) throw e;
    throw new ServiceUnavailableError(`Voice design server unreachable: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (typeof json.id !== 'string' || !json.id) throw new ServiceUnavailableError('Voice design server returned no voice id');
  return { ref: json.id, previewWavBase64: typeof json.preview_wav_base64 === 'string' ? json.preview_wav_base64 : '' };
}

export async function designVoiceForCharacter(
  characterId: string,
  opts: DesignOpts = {},
): Promise<{ spec: VoiceSpec; previewWavBase64: string }> {
  const character = await loadCharacter(characterId);
  const description = (opts.description?.trim() || describeVoiceFromSheet(character)).slice(0, 600);
  const text = (opts.text?.trim() || `${character.name} here. Say what you came to say.`).slice(0, 400);
  const seed = opts.seed ?? fnv1a(character.id);
  const designed = await designVoice({ description, text, seed, fx: opts.fx ?? opts.preset ?? undefined });
  const spec: VoiceSpec = { engine: 'qwen', ref: designed.ref, description, transcript: text, seed };
  if (opts.preset) spec.preset = opts.preset;
  if (opts.fx) spec.fx = opts.fx;
  await saveData(characterId, { ...character.data, voice: spec });
  return { spec, previewWavBase64: designed.previewWavBase64 };
}

// ─── The campaign's NARRATOR (Michael 2026-11-06) ───────────────────────────────────────────────────────────
// One designed voice per campaign that reads everything that is not a character's own line. The Watcher
// will design it at campaign creation (owed); until then it is set by the Watcher/ADMIN through the route.

const NARRATOR_FALLBACK_DESCRIPTION = "A storyteller's voice: mature, low and unhurried, warm but even, reading a novel aloud late at night.";
const NARRATOR_SAMPLE = 'Rain finds the windshield one drop at a time. He does not move. The phone is still in his hand.';

async function loadCampaign(campaignId: string) {
  const row = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true, narratorVoice: true } });
  if (!row) throw new NotFoundError('Campaign not found');
  let current: VoiceSpec | null = null;
  try { current = row.narratorVoice ? parseVoiceSpec(JSON.parse(row.narratorVoice)) : null; } catch { current = null; }
  return { id: row.id, name: row.name, current };
}

export async function getNarratorVoice(campaignId: string): Promise<VoiceSpec | null> {
  return (await loadCampaign(campaignId)).current;
}

export async function designNarratorVoice(
  campaignId: string,
  opts: DesignOpts = {},
): Promise<{ spec: VoiceSpec; previewWavBase64: string }> {
  const campaign = await loadCampaign(campaignId);
  const description = (opts.description?.trim() || NARRATOR_FALLBACK_DESCRIPTION).slice(0, 600);
  const text = (opts.text?.trim() || NARRATOR_SAMPLE).slice(0, 400);
  const seed = opts.seed ?? fnv1a(`narrator:${campaign.id}`);
  const designed = await designVoice({ description, text, seed, fx: opts.fx ?? opts.preset ?? undefined });
  const spec: VoiceSpec = { engine: 'qwen', ref: designed.ref, description, transcript: text, seed };
  if (opts.preset) spec.preset = opts.preset;
  if (opts.fx) spec.fx = opts.fx;
  await prisma.campaign.update({ where: { id: campaignId }, data: { narratorVoice: JSON.stringify(spec) } });
  return { spec, previewWavBase64: designed.previewWavBase64 };
}

export async function setNarratorVoice(
  campaignId: string,
  patch: Partial<Pick<VoiceSpec, 'preset' | 'fx' | 'voice' | 'lockedAt'>>,
): Promise<VoiceSpec> {
  const campaign = await loadCampaign(campaignId);
  const next: VoiceSpec = { ...(campaign.current ?? { engine: 'kokoro' as const }) };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (next as Record<string, unknown>)[k] = v;
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { narratorVoice: JSON.stringify(next) } });
  return next;
}

export async function clearNarratorVoice(campaignId: string): Promise<void> {
  await loadCampaign(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { narratorVoice: null } });
}

export async function setVoiceForCharacter(
  characterId: string,
  patch: Partial<Pick<VoiceSpec, 'preset' | 'fx' | 'voice' | 'lockedAt'>>,
): Promise<VoiceSpec> {
  const character = await loadCharacter(characterId);
  const current = parseVoiceSpec(character.data.voice) ?? { engine: 'kokoro' as const };
  const next: VoiceSpec = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (next as Record<string, unknown>)[k] = v;
  }
  await saveData(characterId, { ...character.data, voice: next });
  return next;
}

export async function clearVoiceForCharacter(characterId: string): Promise<void> {
  const character = await loadCharacter(characterId);
  const { voice: _removed, ...rest } = character.data;
  void _removed;
  await saveData(characterId, rest);
}
