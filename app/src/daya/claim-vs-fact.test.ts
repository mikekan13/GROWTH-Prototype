import { describe, it, expect } from 'vitest';
import { claimVsFact, statesOf, factHint } from './claim-vs-fact';

const DOOR = { subjectKey: 'entry_door', fact: 'closed, locked from the inside; the deadbolt is untouched' };

describe('claimVsFact — a spoken claim against the world\'s facts (HW8 run 6)', () => {
  it('reads states with negation', () => {
    expect([...statesOf('closed, locked from the inside')].sort()).toEqual(['closed', 'locked']);
    expect([...statesOf("It isn't locked")]).toEqual(['unlocked']);
    expect([...statesOf('unlocked and open')].sort()).toEqual(['open', 'unlocked']);
    expect([...statesOf('the room is dark')]).toEqual(['dark']);
  });
  it('"It\'s open." behind a closed, locked door is a contradiction — found through the ask it answers', () => {
    const c = claimVsFact("It's open.", [DOOR], 'Kristopher: Violet? I have a pizza... open the door');
    expect(c?.subjectKey).toBe('entry_door');
    expect(c?.claimed).toBe('open');
    expect(factHint("It's open.", c!)).toContain('closed, locked from the inside');
  });
  it('a claim in the fact\'s own words, or about a different thing, stands', () => {
    expect(claimVsFact("It's locked. I'm not opening it.", [DOOR], 'open the door')).toBeNull();
    expect(claimVsFact("The window is open.", [DOOR], 'knock on the door')).toBeNull();
    expect(claimVsFact("Come back later.", [DOOR], 'open the door')).toBeNull();
  });
  it('"I haven\'t unlocked it" and "it\'s not open" agree with the fact', () => {
    expect(claimVsFact("It's not open.", [DOOR], 'the door')).toBeNull();
    expect(claimVsFact('The door is unlocked.', [DOOR])?.claimed).toBe('unlocked');
  });
  it('a fact that asserts no state is never a contradiction', () => {
    expect(claimVsFact('The door is open.', [{ subjectKey: 'entry_door', fact: 'solid wood, painted green' }])).toBeNull();
  });
});
