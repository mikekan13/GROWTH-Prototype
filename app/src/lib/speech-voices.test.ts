import { describe, it, expect } from 'vitest';
import { KOKORO_VOICES, NARRATOR_VOICE, voiceForCharacter, parseVoiceSpec, voiceSpecForCharacter } from './speech-voices';

const sexOf = (id: string) => KOKORO_VOICES.find(v => v.id === id)!.sex;
const ids = Array.from({ length: 200 }, (_, i) => `char-${i}`);

describe('voiceForCharacter', () => {
  it('is deterministic', () => {
    expect(voiceForCharacter({ id: 'abc', gender: 'Female' })).toBe(voiceForCharacter({ id: 'abc', gender: 'Female' }));
  });
  it('female pool for female/woman/f', () => {
    for (const g of ['Female', 'woman', 'F']) for (const id of ids) expect(sexOf(voiceForCharacter({ id, gender: g }))).toBe('f');
  });
  it('male pool for male/man/m, and female never lands there', () => {
    for (const g of ['Male', 'man', 'm']) for (const id of ids) expect(sexOf(voiceForCharacter({ id, gender: g }))).toBe('m');
    for (const id of ids) expect(sexOf(voiceForCharacter({ id, gender: 'female' }))).not.toBe('m');
  });
  it('unknown or missing uses all voices', () => {
    const seen = new Set<string>();
    for (const id of ids) {
      seen.add(voiceForCharacter({ id, gender: 'Non-binary' }));
      seen.add(voiceForCharacter({ id }));
    }
    expect(seen.size).toBeGreaterThan(8);
    expect([...seen].every(v => KOKORO_VOICES.some(k => k.id === v))).toBe(true);
  });
  it('honours an explicit known voice, ignores an unknown one', () => {
    expect(voiceForCharacter({ id: 'x', gender: 'Female', voice: 'am_liam' })).toBe('am_liam');
    expect(voiceForCharacter({ id: 'x', gender: 'Female', voice: 'nope' })).not.toBe('nope');
  });
  it('never picks the narrator', () => {
    for (const g of [undefined, 'Male', 'Female', 'other']) for (const id of ids) expect(voiceForCharacter({ id, gender: g })).not.toBe(NARRATOR_VOICE);
  });
});

describe('parseVoiceSpec', () => {
  it('accepts a legacy Kokoro id', () => {
    expect(parseVoiceSpec('af_heart')).toEqual({ engine: 'kokoro', voice: 'af_heart' });
  });
  it('accepts the object form', () => {
    const spec = { engine: 'qwen' as const, ref: 'r1', preset: 'demonic', fx: { pitch: -3, reverb: 0.4 }, seed: 7 };
    expect(parseVoiceSpec(spec)).toEqual(spec);
  });
  it('rejects junk', () => {
    expect(parseVoiceSpec('nope')).toBeNull();
    expect(parseVoiceSpec(null)).toBeNull();
    expect(parseVoiceSpec({ engine: 'espeak' })).toBeNull();
    expect(parseVoiceSpec({ engine: 'qwen', fx: { pitch: 99 } })).toBeNull();
  });
});

describe('voiceSpecForCharacter', () => {
  it('returns the parsed spec when present', () => {
    expect(voiceSpecForCharacter({ id: 'a', voice: { engine: 'qwen', ref: 'r' } })).toEqual({ engine: 'qwen', ref: 'r' });
  });
  it('falls back to the derived Kokoro voice', () => {
    expect(voiceSpecForCharacter({ id: 'a', gender: 'Female' })).toEqual({ engine: 'kokoro', voice: voiceForCharacter({ id: 'a', gender: 'Female' }) });
  });
  it('treats an unparseable voice as absent', () => {
    expect(voiceSpecForCharacter({ id: 'a', voice: 42 }).engine).toBe('kokoro');
  });
});
