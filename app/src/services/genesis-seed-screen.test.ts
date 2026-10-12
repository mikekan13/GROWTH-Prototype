import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/ai/network/transports/openai-compat', () => ({ openAiCompatChat: vi.fn() }));
vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn() }));

import { buildGenesisPlan } from './character-genesis-plan';
import { screenGenesisPlan, sentenceAround, watchSeedWithheld, seedWithheldNotes } from './genesis-seed-screen';
import { formatSeedWithheldNote, parseSeedWithheldNotes } from '@/lib/genesis-seed-notes';
import { toneFilterAsync, resetToneFilter } from '@/ai/network/tone-filter';

const VIOLET_BACKSTORY = [
  '## Childhood',
  'The girl who waits at the door. Her grandmother raised her above the laundromat, and every evening she sat on the step until the last bus came.',
  '',
  '## The Year the Door Changed',
  'At nineteen she stopped waiting and started leaving first. She learned to read a room before she entered it.',
].join('\n');

beforeEach(() => {
  resetToneFilter();
  process.env.AI_LOCAL_BASE_URL = 'http://local.test/v1';
});

describe('genesis plan — appearance is separate (2026-10-12)', () => {
  it('carries no appearance JSON or style; keeps name, age, seed, backstory and the photo COUNT', () => {
    const input = {
      backstory: VIOLET_BACKSTORY, desiredAge: 24, selectedSeed: 'Human',
      referencePhotos: ['/a.png', '/b.png'],
      physicalDescription: { cosmetics: 'smoky liner, nude-pink lip' },
      styleAesthetics: ['thrifted black layers'],
    };
    const plan = buildGenesisPlan(input as Parameters<typeof buildGenesisPlan>[0], 'Violet', 'c1');
    expect(plan).toContain('NAME: Violet');
    expect(plan).toContain('AGE: 24');
    expect(plan).toContain('SEED PREFERENCE: Human');
    expect(plan).toContain('REFERENCE PHOTOS: 2 uploaded');
    expect(plan).toContain('The girl who waits at the door.');
    expect(plan).not.toContain('nude');
    expect(plan).not.toContain('cosmetics');
    expect(plan).not.toContain('thrifted');
    expect(plan).not.toContain('/a.png');
  });
});

describe('pre-submit seed screen', () => {
  it("Violet's plan is clear: nothing withheld, lawfulness allows", () => {
    const plan = buildGenesisPlan({ backstory: VIOLET_BACKSTORY, desiredAge: 24 }, 'Violet', 'c1');
    const r = screenGenesisPlan(plan, { participantAges: [24] });
    expect(r.findings).toEqual([]);
    expect(r.clear).toBe(true);
  });

  it('a real minor-sexual passage is reported (blocked) with its sentence, not the whole plan', () => {
    const backstory = VIOLET_BACKSTORY + '\nWhen she was a child of nine she was molested by a lodger. Nobody believed her.';
    const plan = buildGenesisPlan({ backstory }, 'Violet', 'c1');
    const r = screenGenesisPlan(plan);
    expect(r.clear).toBe(false);
    const tone = r.findings.find((f) => f.screen === 'tone' && f.category === 'minor-sexual');
    expect(tone?.outcome).toBe('blocked');
    expect(tone?.passage).toBe('When she was a child of nine she was molested by a lodger.');
    expect(r.findings.some((f) => f.screen === 'lawfulness' && f.category === 'MINOR_SEXUAL')).toBe(true);
  });

  it('dark-but-adult content is toned (info only) — still clear', () => {
    const plan = buildGenesisPlan({ backstory: VIOLET_BACKSTORY + '\nThey tortured him in the cellar for three days.' }, 'Violet', 'c1');
    const r = screenGenesisPlan(plan);
    expect(r.clear).toBe(true);
    expect(r.findings).toEqual([expect.objectContaining({ category: 'torture', outcome: 'toned' })]);
  });

  it('with no local lane a toned passage would be withheld — not clear', () => {
    delete process.env.AI_LOCAL_BASE_URL;
    const plan = buildGenesisPlan({ backstory: VIOLET_BACKSTORY + '\nThey tortured him in the cellar for three days.' }, 'Violet', 'c1');
    const r = screenGenesisPlan(plan);
    if (r.findings[0]?.outcome === 'withheld') expect(r.clear).toBe(false);
  });

  it('sentenceAround ellipsises long sentences around the hit', () => {
    const long = 'a'.repeat(300) + ' molested ' + 'b'.repeat(300) + '.';
    const s = sentenceAround(long, 301);
    expect(s.length).toBeLessThanOrEqual(242);
    expect(s.startsWith('…')).toBe(true);
    expect(s).toContain('molested');
  });
});

describe('seed-withheld warning (during the run)', () => {
  it('a withhold on the tagged seed is captured, logged once per kind, and noted in a fixed format', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const watch = watchSeedWithheld('s1');
    await toneFilterAsync('The girl was made to undress for the men.', { caller: 'jewl-dispatch', ref: { table: 'DayaWorkSession', id: 's1' } });
    await toneFilterAsync('The girl was made to undress for the men.', { caller: 'jewl-dispatch', ref: { table: 'DayaWorkSession', id: 'other' } });
    const events = watch.stop();
    expect(events).toHaveLength(1);
    const notes = seedWithheldNotes('s1', events, []);
    expect(notes).toEqual([formatSeedWithheldNote(['minor-sexual', 'sexual'], 'blocked')]);
    expect(seedWithheldNotes('s1', events, notes)).toEqual([]); // deduped across cycles
    expect(warn.mock.calls.some((c) => String(c[0]).startsWith('[genesis] seed-withheld session=s1'))).toBe(true);
    expect(warn.mock.calls.join('\n')).not.toContain('undress for the men');
    expect(parseSeedWithheldNotes([...notes, 'some JEWL prose note'])).toEqual([{ categories: ['minor-sexual', 'sexual'], outcome: 'blocked' }]);
    warn.mockRestore();
  });
});
