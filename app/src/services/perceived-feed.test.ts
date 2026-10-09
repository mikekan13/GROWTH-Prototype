import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 1 }));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));

import { formToFeedEvents, segmentsToMessage, entityRef, inspectionForm, inspectionClsOf } from './perceived-feed';
import { buildFeedRows } from '@/components/terminal/table-feed/feed-rows';
import { perceivedFeedEntities } from '@/components/terminal/table-feed/perceived-entities';
import { splitPerceived, plainPerceived, entityToken } from '@/lib/perceived-text';
import type { VisibleForm } from './visible-form';
import type { TerminalEvent } from '@/types/terminal';

const form: VisibleForm = {
  memoryId: 'm1',
  truthRefs: ['k1'],
  rows: [
    { type: 'narration', text: 'A figure opens the door.', pieces: [{ kind: 'entity', text: 'A figure', entityId: 'ruth' }, { kind: 'text', text: ' opens the door.' }] },
    { type: 'character', speakerId: 'ruth', name: 'A figure', segments: [
      { kind: 'speech', text: 'Sit {gap} now.', pieces: [{ kind: 'text', text: 'Sit ' }, { kind: 'gap' }, { kind: 'text', text: ' now.' }] },
      { kind: 'action', text: 'someone moves', pieces: [{ kind: 'text', text: 'someone moves' }] },
    ] },
  ],
  entities: [{ id: 'ruth', kind: 'NPC', label: 'a figure', known: [{ aspectKind: 'appearance', fidelity: 1 }] }],
};

const asTerminal = (rows: ReturnType<typeof formToFeedEvents>): TerminalEvent[] => rows.map((r) => ({
  id: `ev-${r.id}`, type: r.type, timestamp: r.createdAt, campaignId: r.campaignId, actor: r.actor, actorUserId: r.actorUserId, actorName: r.actorName,
  characterId: r.characterId ?? undefined, characterName: r.characterName ?? undefined, payload: r.payload,
}));

describe('perceived feed rows (unit 9)', () => {
  it('a VisibleForm becomes rows the existing feed-rows reads unchanged: narration + a character line with gap/entity tokens', () => {
    const rows = buildFeedRows(asTerminal(formToFeedEvents(form, { campaignId: 'c1', viewerId: 'violet', at: new Date('2026-10-09T12:00:00Z'), cycle: 3, sessionId: null })));
    expect(rows.map((r) => r.type)).toEqual(['narration', 'character']);
    const n = rows[0] as { text: string; cycle?: number };
    expect(splitPerceived(n.text)).toEqual([{ kind: 'entity', id: 'ruth', label: 'A figure' }, { kind: 'text', text: ' opens the door.' }]);
    expect(n.cycle).toBe(3);
    const c = rows[1] as { name: string; characterId: string | null; segments: Array<{ kind: string; text: string }> };
    expect(c.name).toBe('A figure');
    expect(c.characterId).toBe('ruth');
    expect(c.segments).toEqual([{ kind: 'speech', text: 'Sit {gap} now.' }, { kind: 'action', text: 'someone moves' }]);
  });

  it('never carries an account name, a level number or the word "distorted"', () => {
    const raw = JSON.stringify(formToFeedEvents(form, { campaignId: 'c1', viewerId: 'violet', at: new Date(), sessionId: null }));
    expect(raw).not.toMatch(/distort/i);
    expect(raw).not.toContain('fidelity');
    expect(formToFeedEvents(form, { campaignId: 'c1', viewerId: 'violet', at: new Date(), sessionId: null }).every((e) => e.actorName === '' && e.actorUserId === '')).toBe(true);
  });

  it('speech quotes inside a segment cannot break the markup', () => {
    expect(segmentsToMessage({ type: 'character', speakerId: null, name: 'x', segments: [{ kind: 'speech', text: 'say "hi"', pieces: [{ kind: 'text', text: 'say "hi"' }] }] })).toBe('"say \'hi\'"');
  });

  it('entity refs carry known aspects\' values at the viewer\'s fidelity (never a level); named only at the name level or for the viewer itself', () => {
    expect(entityRef({ id: 'ruth', kind: 'NPC', label: 'a figure', known: [{ aspectKind: 'appearance', fidelity: 2 }] }, 'violet', { description: 'A tall woman in a grey coat with silver buttons.' }))
      .toEqual({ id: 'ruth', kind: 'NPC', label: 'a figure', known: [{ aspect: 'appearance', label: 'Appearance', value: 'A tall woman in a grey…' }], named: false });
    // No subject data → no value line (never the truth record, never a level).
    expect(entityRef({ id: 'ruth', kind: 'NPC', label: 'a figure', known: [{ aspectKind: 'appearance', fidelity: 2 }] }, 'violet').known).toEqual([]);
    expect(entityRef({ id: 'ruth', kind: 'NPC', label: 'Ruth', known: [{ aspectKind: 'identity', fidelity: 3 }] }, 'violet').named).toBe(true);
    expect(entityRef({ id: 'violet', kind: 'CHARACTER', label: 'Violet', known: [] }, 'violet').named).toBe(true);
  });

  it('the client entity list: perceived refs (portrait only when named) + the speaker of the viewer\'s own lines', () => {
    const subjects = new Map([['ruth', { description: 'Grey coat, silver buttons.' }]]);
    const events = asTerminal(formToFeedEvents(form, { campaignId: 'c1', viewerId: 'violet', at: new Date(), sessionId: null, subjects }));
    events.push({ id: 'ev-own', type: 'chat', timestamp: '', campaignId: 'c1', actor: 'player', actorUserId: 'p1', actorName: 'p1', characterId: 'violet', payload: { kind: 'chat', message: 'hi' } });
    const ents = perceivedFeedEntities(events, [
      { id: 'ruth', name: 'Ruth', kind: 'npc', portrait: '/ruth.png', description: 'TRUTH-DESC' },
      { id: 'violet', name: 'Violet', kind: 'character', portrait: '/v.png' },
    ]);
    expect(ents).toEqual([
      { id: 'ruth', name: 'a figure', kind: 'npc', portrait: null, known: [{ aspect: 'appearance', label: 'Appearance', value: 'a vague picture of it' }] },
      { id: 'violet', name: 'Violet', kind: 'character', portrait: '/v.png' },
    ]);
    expect(JSON.stringify(ents)).not.toContain('TRUTH-DESC');
  });

  it('text tokens round-trip', () => {
    const t = `${entityToken('ruth', 'a "tall" guard')} says {gap} today`;
    expect(splitPerceived(t)).toEqual([{ kind: 'entity', id: 'ruth', label: 'a tall guard' }, { kind: 'text', text: ' says ' }, { kind: 'gap' }, { kind: 'text', text: ' today' }]);
    expect(plainPerceived(t)).toBe('a tall guard says {gap} today');
    expect(splitPerceived('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
  });
});

describe('inspection line — the inspector\'s own line at its current knowledge', () => {
  const sword = { id: 'sword1', kind: 'ITEM' as const, label: 'an old sword', known: [{ aspectKind: 'identity', fidelity: 2 }, { aspectKind: 'weight', fidelity: 2 }, { aspectKind: 'material', fidelity: 0, impression: 'gold' }] };
  const data = { item: { weightLbs: 12, primaryMaterial: 'Silver' } };

  it('lists the studied aspects as known (a wrong impression as plain fact), the subject as a span', () => {
    const f = inspectionForm('m1', sword, ['weight', 'material'], data);
    const row = f.rows[0];
    expect(row.type).toBe('narration');
    if (row.type !== 'narration') return;
    expect(row.pieces[1]).toEqual({ kind: 'entity', text: 'an old sword', entityId: 'sword1' });
    expect(row.text).toBe('You study an old sword: Weight: about as heavy as a war hammer; Material: gold.');
    expect(f.entities).toEqual([sword]);
    const ev = formToFeedEvents(f, { campaignId: 'c', viewerId: 'violet', at: new Date(0), sessionId: null });
    expect(ev[0].payload).toMatchObject({ kind: 'game_event', eventType: 'declaration' });
  });

  it('nothing known of what it studied -> it made nothing of it; classification parsing is strict', () => {
    const row = inspectionForm('m2', { ...sword, known: [] }, ['weight'], data).rows[0];
    expect(row.type === 'narration' && row.text).toBe('You study an old sword, but make nothing of it.');
    expect(inspectionClsOf('{"kind":"inspection","subjectId":"s","aspects":["weight",3]}')).toMatchObject({ subjectId: 's', aspects: ['weight'] });
    expect(inspectionClsOf('{"kind":"declaration"}')).toBeNull();
    expect(inspectionClsOf('nope')).toBeNull();
  });
});
