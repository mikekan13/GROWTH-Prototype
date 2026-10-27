import { describe, it, expect } from 'vitest';
import type { RollPayload } from '@/types/terminal';
import { rollForViewer, chosenNote } from './roll-card';

const card: RollPayload = {
  kind: 'roll', rollId: 'r1', event: 'Kristopher tries to force the lock.', actorId: 'k', actorName: 'Kristopher', isSkilled: false, governor: 'clout',
  sd: { die: 'flat:0', value: 0 }, hint: 'purple', fd: { die: 'd6', value: 4 }, effort: 2, effortAttribute: '2 clout', total: 6, dr: 10, drBy: 'sim',
  success: false, margin: -4, chosenBy: 'player', visibility: { v: 'full', t: 'event' },
};

describe('rollForViewer — the card per viewpoint', () => {
  it('the Watcher sees everything, DR included', () => {
    expect(rollForViewer(card, { kind: 'watcher' })).toMatchObject({ view: 'watcher', dr: 10, drBy: 'sim', total: 6 });
  });
  it('the actor sees the readout but never the DR', () => {
    const c = rollForViewer(card, { kind: 'character', characterId: 'k' })!;
    expect(c).toMatchObject({ view: 'full', total: 6, effort: 2 });
    expect(c.dr).toBeUndefined();
    expect(c.visibility).toBeUndefined();
  });
  it('a being that saw it gets the readout without the DR', () => {
    const c = rollForViewer(card, { kind: 'character', characterId: 'v' })!;
    expect(c.view).toBe('full');
    expect('dr' in c).toBe(false);
  });
  it('a being that only heard it gets the sentence and no numbers, no outcome', () => {
    const c = rollForViewer(card, { kind: 'character', characterId: 't' })!;
    expect(c).toMatchObject({ view: 'event', event: card.event, total: 0, effort: 0, success: false });
    expect(c.sd).toBeUndefined();
    expect(c.fd).toBeUndefined();
  });
  it('a being the stretch did not reach does not see the card at all', () => {
    expect(rollForViewer(card, { kind: 'character', characterId: 'nobody' })).toBeNull();
    expect(rollForViewer(card, { kind: 'character', characterId: null })).toBeNull();
  });
  it('the note says who chose the Effort', () => {
    expect(chosenNote({ chosenBy: 'ai-timeout', actorName: 'Violet' })).toBe('(chosen for Violet — no answer in time)');
    expect(chosenNote({ chosenBy: 'player', actorName: 'Violet' })).toBeNull();
  });
});
