import { describe, it, expect } from 'vitest';
import { buildDesiresBlock, parseSpiritOutput, type DesireSourceItem } from './spirit';

describe('buildDesiresBlock (Ruling 22 guard — want-language, never task-phrasing)', () => {
  it('renders a goal as want-language with no imperative/quest format', () => {
    const items: DesireSourceItem[] = [{ description: 'Find a job' }];
    const out = buildDesiresBlock(items);
    expect(out.toLowerCase()).toContain('want');
    expect(out).not.toMatch(/^goal\s*:/i);
    expect(out).not.toContain('Goal:');
    expect(out).not.toMatch(/^[-*]\s/); // no bullet format
    expect(out).not.toMatch(/^(find|get|do|complete)\b/i); // no bare imperative opener
  });

  it('strips a "Goal:" label and leading "to" before framing', () => {
    const out = buildDesiresBlock([{ description: 'Goal: To reconcile with her sister' }]);
    expect(out).not.toMatch(/goal\s*:/i);
    expect(out).toContain('want to reconcile with her sister');
  });

  it('handles multiple items without producing a list/bullet structure', () => {
    const out = buildDesiresBlock([
      { description: 'find steady work' },
      { description: 'protect her brother' },
      { description: 'earn back his trust' },
    ]);
    expect(out).not.toMatch(/\n\s*[-*]/);
    expect(out.split(' want to ').length - 1).toBe(3);
  });

  it('returns an open/neutral line when there are no active desires', () => {
    const out = buildDesiresBlock([]);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/goal/i);
  });
});

describe('parseSpiritOutput (lenient Say:/Do:/Attend:/Rest parsing)', () => {
  it('parses a Say: directive', () => {
    const action = parseSpiritOutput('I feel uneasy about this.\nSay: "I don\'t think that\'s a good idea."');
    expect(action.kind).toBe('speak');
    if (action.kind === 'speak') expect(action.content).toContain("don't think");
  });

  it('parses a Do: directive', () => {
    const action = parseSpiritOutput('My hand moves before I think.\nDo: reach for the mug on the counter.');
    expect(action.kind).toBe('act');
    if (action.kind === 'act') expect(action.content).toContain('mug');
  });

  it('parses an Attend: directive', () => {
    const action = parseSpiritOutput('Something creaks.\nAttend: the sound from the hallway.');
    expect(action.kind).toBe('attend');
  });

  it('parses a Rest directive with no trailing content', () => {
    const action = parseSpiritOutput('Nothing here needs me.\nRest');
    expect(action.kind).toBe('rest');
  });

  it('falls back to speak when no directive line is present', () => {
    const action = parseSpiritOutput('Just a stray thought, nothing more.');
    expect(action.kind).toBe('speak');
  });
});
