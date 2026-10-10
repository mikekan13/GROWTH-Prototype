import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  speech: [] as Array<{ memoryId: string; speakerId: string | null; pieces: unknown[] }>,
  located: new Map<string, string>(),
  raised: [] as Array<{ perceiverId: string; subjects: Array<{ subjectId: string; subjectKind: string }> }>,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    entityRelationship: {
      findFirst: async ({ where }: { where: { sourceId: string } }) => (h.located.has(where.sourceId) ? { targetId: h.located.get(where.sourceId) } : null),
      findMany: async ({ where }: { where: { targetId: string; sourceId: { in: string[] } } }) =>
        where.sourceId.in.filter((id) => h.located.get(id) === where.targetId).map((sourceId) => ({ sourceId })),
    },
  },
}));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 0 }));
vi.mock('@/services/familiarity', async (orig) => ({
  ...(await orig<typeof import('@/services/familiarity')>()),
  recordIntroductions: async (i: { perceiverId: string; subjects: Array<{ subjectId: string; subjectKind: string }> }) => { h.raised.push(i); return i.subjects.map((s) => s.subjectId); },
}));
vi.mock('@/services/visible-form', async (orig) => ({
  ...(await orig<typeof import('@/services/visible-form')>()),
  caughtSpeech: async () => ({
    ctx: { viewerEntityId: 'e-violet', viewerId: 'violet', entities: [
      { id: 'ruth', kind: 'NPC', name: 'Ruth' }, { id: 'kai', kind: 'CHARACTER', name: 'Kai' }, { id: 'violet', kind: 'CHARACTER', name: 'Violet' }, { id: 'door', kind: 'ITEM', name: 'Kai' },
    ] },
    speech: h.speech,
  }),
}));

import { renderVisibleForm, labelFor, VISIBLE_FORM_TUNING, type TruthLine, type VisibleRow } from './visible-form';
import { INTRODUCED_SCORE, scoreForLevel, scoreToFidelity } from './familiarity';
import { introducedBeings, type CaughtPiece } from '@/sim/perception/introductions';
import { learnIntroductions, groupRows } from './introductions';

beforeEach(() => { h.speech = []; h.located.clear(); h.raised = []; });

const ruth = { id: 'ruth', kind: 'NPC' as const, name: 'Ruth', description: 'Tall woman in a warden\'s coat.' };
const violet = { id: 'violet', kind: 'CHARACTER' as const, name: 'Violet', description: null };

describe('the feed\'s own fragmenting decides whether the name was caught', () => {
  it('across many rows at half hearing: a name gain happens exactly when "I\'m Ruth" survives as caught words', async () => {
    const truth: TruthLine = { refs: ['ev'], entities: [ruth, violet], rows: [{ type: 'character', speakerId: 'ruth', name: 'Ruth', segments: [{ kind: 'speech', text: "Evening, traveller. I'm Ruth. Mind the step." }] }] };
    let caught = 0; let missed = 0;
    for (let i = 0; i < 120; i++) {
      const form = await renderVisibleForm(truth, { viewerId: 'violet', noticed: true, via: ['hearing'], clarity: { hearing: 0.5 } }, {}, { seed: `mem-${i}` });
      const row = form.rows[0] as Extract<VisibleRow, { type: 'character' }> | undefined;
      const seg = row?.segments.find((s) => s.kind === 'speech');
      if (!seg) continue;
      const learned = introducedBeings(seg.pieces as CaughtPiece[], { id: 'ruth', name: 'Ruth' }, [{ id: 'ruth', name: 'Ruth' }], 'violet').length > 0;
      expect(learned).toBe(/I'm Ruth/.test(seg.text));
      if (learned) caught++; else missed++;
    }
    expect(caught).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });

  it('INTRODUCED_SCORE names the being in the feed; the Watcher\'s levels land in their band', () => {
    expect(scoreToFidelity(INTRODUCED_SCORE)).toBe(VISIBLE_FORM_TUNING.nameAt);
    expect(labelFor(ruth, scoreToFidelity(INTRODUCED_SCORE), 'violet')).toBe('Ruth');
    for (let l = 0; l <= 5; l++) expect(scoreToFidelity(scoreForLevel(l))).toBe(l);
  });
});

describe('learnIntroductions (wiring)', () => {
  it('self + by-another, beings only (an item sharing a name is never introduced), present = same place', async () => {
    h.located.set('violet', 'room'); h.located.set('ruth', 'room'); h.located.set('kai', 'room');
    h.speech = [
      { memoryId: 'm1', speakerId: 'ruth', pieces: [{ kind: 'text', text: "I'm Ruth, and this is Kai." }] },
    ];
    const out = await learnIntroductions('c', groupRows([{ characterId: 'violet', memoryId: 'm1' }, { characterId: 'violet', memoryId: null }]));
    expect(out.get('violet')?.sort()).toEqual(['kai', 'ruth']);
    expect(h.raised[0].perceiverId).toBe('e-violet');
    expect(h.raised[0].subjects).toEqual(expect.arrayContaining([expect.objectContaining({ subjectId: 'ruth', subjectKind: 'NPC', memoryId: expect.any(String) }), expect.objectContaining({ subjectId: 'kai', subjectKind: 'CHARACTER', memoryId: expect.any(String) })]));
  });

  it('someone elsewhere is not "present": no gain from "this is Kai" when Kai is in another place', async () => {
    h.located.set('violet', 'room'); h.located.set('kai', 'cellar');
    h.speech = [{ memoryId: 'm1', speakerId: 'ruth', pieces: [{ kind: 'text', text: 'This is Kai.' }] }];
    expect((await learnIntroductions('c', [{ characterId: 'violet', memoryIds: ['m1'] }])).size).toBe(0);
    expect(h.raised).toEqual([]);
  });

  it('a gapped name teaches nothing', async () => {
    h.speech = [{ memoryId: 'm1', speakerId: 'ruth', pieces: [{ kind: 'text', text: "I'm " }, { kind: 'gap' }, { kind: 'text', text: '.' }] }];
    expect((await learnIntroductions('c', [{ characterId: 'violet', memoryIds: ['m1'] }])).size).toBe(0);
  });
});
