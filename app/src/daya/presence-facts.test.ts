import { describe, it, expect } from 'vitest';
import { presenceFacts, knowsLine } from './presence-facts';

describe('presenceFacts / knowsLine (HW8 run 7 #5, #9)', () => {
  it('with the door closed no one is in sight, and the line says so', () => {
    const r = presenceFacts('landing', [{ id: 'v', name: 'Violet', roomName: 'apartment', route: [{ kind: 'door', state: 'closed', name: 'entry_door' }] }]);
    expect(r.noOneInView).toBe(true);
    expect(r.lines[0]).toMatch(/No one is in sight/);
    expect(r.lines.join(' ')).toMatch(/entry door between you is closed/);
    expect(r.absentNames).toEqual(['Violet']);
  });
  it('with the door open, or the other in the room, someone may be in view', () => {
    expect(presenceFacts('landing', [{ id: 'v', name: 'Violet', roomName: 'apartment', route: [{ kind: 'door', state: 'open', name: 'entry_door' }] }]).noOneInView).toBe(false);
    expect(presenceFacts('apartment', [{ id: 'k', name: 'Kristopher', roomName: 'apartment', route: [] }]).lines[0]).toMatch(/In the room with you: Kristopher/);
  });
  it('states the familiarity he has with her (F3), not a stranger', () => {
    expect(knowsLine('Violet', 0.7, 0.7)).toBe('You know Violet: identity F3, appearance F3 - they are not a stranger to you.');
    expect(knowsLine('Violet', 0, 0)).toBeNull();
  });
});
