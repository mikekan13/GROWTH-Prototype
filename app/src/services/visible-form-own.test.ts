/** Perception hardening: the viewer's OWN doings render in full (ruling: the viewer's own lines in full), whatever their senses. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 0 }));

import { renderVisibleForm, truthRowsFromCanon, renderSignature, type TruthEntity, type TruthLine, type ViewerPerception } from './visible-form';

const violet: TruthEntity = { id: 'violet', kind: 'CHARACTER', name: 'Violet', description: 'Small and quick.' };
const ruth: TruthEntity = { id: 'ruth', kind: 'NPC', name: 'Ruth', description: 'Tall woman.' };
const entities = [violet, ruth];
const blurred: ViewerPerception = { viewerId: 'violet', noticed: true, via: ['sight'], clarity: { sight: 0.3 } };
const deafOnlyTouch: ViewerPerception = { viewerId: 'violet', noticed: true, via: ['touch'], clarity: { touch: 1 } };

describe('own doings in full', () => {
  it('her own encounter action, seen poorly, is still exactly what she did', async () => {
    const rows = truthRowsFromCanon({ id: 'a', kind: 'encounter_round', narration: 'Violet swings her lantern at Ruth.', detail: '{}', actorId: 'violet' }, entities);
    const line: TruthLine = { refs: ['a'], entities, rows };
    const seen = await renderVisibleForm(line, blurred, { ruth: { identity: 3 } }, { seed: 'm1' });
    expect(seen.rows).toHaveLength(1);
    expect(seen.rows[0].type === 'narration' && seen.rows[0].text).toBe('Violet swings her lantern at Ruth.');
    // Others in it are still named as she knows them (a stranger stays a stranger in her own line).
    const stranger = await renderVisibleForm(line, blurred, {}, { seed: 'm1' });
    expect(stranger.rows[0].type === 'narration' && stranger.rows[0].text).toBe('Violet swings her lantern at a figure.');
  });

  it('someone else\'s action under the same blur is still vaguer (unchanged)', async () => {
    const rows = truthRowsFromCanon({ id: 'b', kind: 'encounter_round', narration: 'Ruth swings at Violet.', detail: '{}', actorId: 'ruth' }, entities);
    const seen = await renderVisibleForm({ refs: ['b'], entities, rows }, blurred, {}, { seed: 'm2' });
    expect(seen.rows[0].type === 'narration' && seen.rows[0].text).not.toBe('Ruth swings at Violet.');
  });

  it('her own words and thoughts in full even when nothing carried them by ear', async () => {
    const line: TruthLine = { refs: ['d'], entities, rows: [{ type: 'character', speakerId: 'violet', name: 'Violet', segments: [{ kind: 'action', text: 'steps back' }, { kind: 'speech', text: 'Not tonight, Ruth.' }, { kind: 'thought', text: 'she knows' }] }] };
    const seen = await renderVisibleForm(line, deafOnlyTouch, {}, { seed: 'm3' });
    const r = seen.rows[0];
    expect(r.type === 'character' && r.segments.map((s) => `${s.kind}:${s.text}`)).toEqual(['action:steps back', 'speech:Not tonight, Ruth.', 'thought:she knows']);
  });

  it('the cache signature changed with the rule (old cached forms re-render)', () => {
    const line: TruthLine = { refs: ['x'], entities, rows: [] };
    expect(renderSignature(line, blurred, {})).toMatch(/^[0-9a-f]{40}$/);
  });
});
