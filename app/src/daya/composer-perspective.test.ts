import { describe, it, expect } from 'vitest';
import { takesOverTheDeed } from './composer';

describe('takesOverTheDeed (2026-11-07)', () => {
  it('catches the being doing someone else\'s deed', () => {
    expect(takesOverTheDeed('I type "Yes please." and hit send.')).toBe(true);
    expect(takesOverTheDeed('I take the work phone out of my pocket.')).toBe(true);
  });
  it('lets the being\'s own sensing stand', () => {
    expect(takesOverTheDeed('I hear Kristopher say "Come sit down."')).toBe(false);
    expect(takesOverTheDeed('I see him lift the cup and smile.')).toBe(false);
    expect(takesOverTheDeed('Kristopher sets the cup down. I notice his hands shake.')).toBe(false);
  });
  it('a first-person sentence that names the other as actor stands', () => {
    expect(takesOverTheDeed('My phone buzzes in my hand; Kristopher has written again.')).toBe(false);
  });
});
