import { describe, it, expect } from 'vitest';
import {
  buildDesiresBlock, parseSpiritOutput, buildSpiritListeningPrompt, buildSpiritAnsweringPrompt,
  SPIRIT_TENETS_BLOCK, LISTENING_MAX_TOKENS, ANSWERING_MAX_TOKENS, type DesireSourceItem,
} from './spirit';
import { sealLint, hasHardHit } from '../../seal';

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

// ── U2b: the two halves of the split moment ───────────────────────────────

const WHO = {
  name: 'Mara',
  identityNarrative: 'A ferry pilot who trusts water more than people.',
  voiceNotes: 'Dry, short sentences.',
  feltStateBrief: 'Tired in the shoulders, wary.',
  standingScene: 'A low room with a long bar; rain on the shutters.',
};

describe('buildSpiritListeningPrompt — thoughts only, nothing said', () => {
  const args = {
    ...WHO,
    recallBlock: 'A night like this one, years back.',
    desiresBlock: buildDesiresBlock([{ description: 'Goal: To find steady work' }]),
    innerSoFar: '',
    heard: 'The door bangs open and a stranger shakes off the rain.',
  };
  const prompt = buildSpiritListeningPrompt(args);

  it('carries every block it was given, and the tenets', () => {
    for (const piece of [WHO.identityNarrative, WHO.voiceNotes, WHO.feltStateBrief, WHO.standingScene, args.recallBlock, args.heard]) expect(prompt).toContain(piece);
    expect(prompt).toContain(SPIRIT_TENETS_BLOCK);
  });
  it('asks for thoughts and forbids speech or action — no directive format is offered', () => {
    expect(prompt).toContain('Do not speak aloud and do not act');
    expect(prompt).not.toMatch(/Say:|Do:|Attend:/);
  });
  it('keeps wants in want-language (Ruling 22) — never a goal label or a task', () => {
    expect(prompt).toContain('want to find steady work');
    expect(prompt).not.toMatch(/goal\s*:/i);
  });
  it('says so when the being has only just started paying attention', () => {
    expect(prompt).toContain('you have only just started paying attention');
    expect(buildSpiritListeningPrompt({ ...args, innerSoFar: 'He looks like trouble.' })).toContain('He looks like trouble.');
  });
  it('adds no mechanical vocabulary of its own', () => {
    expect(hasHardHit(sealLint(prompt))).toBe(false);
  });
  it('stays a short call', () => {
    expect(LISTENING_MAX_TOKENS).toBeLessThanOrEqual(120);
  });
});

describe('buildSpiritAnsweringPrompt — one line, first words first', () => {
  const base = { ...WHO, innerState: 'He looks like trouble. Keep the bar between us.', heard: ['A stranger shakes off the rain.', 'He looks straight at you.'] };

  it('a turn handed over by the table', () => {
    const prompt = buildSpiritAnsweringPrompt({ ...base, ask: { kind: 'turn' } });
    expect(prompt).toContain('The moment has come to you.');
    expect(prompt).toContain('A stranger shakes off the rain.\nHe looks straight at you.');
    expect(prompt).toContain(base.innerState);
  });
  it('being spoken to carries the line exactly as it reached the being', () => {
    const prompt = buildSpiritAnsweringPrompt({ ...base, ask: { kind: 'spoken', heard: 'Oren: "You the pilot?"' } });
    expect(prompt).toContain('You are being spoken to, right now:\nOren: "You the pilot?"');
    expect(prompt).not.toContain('The moment has come to you.');
  });
  it('asks for exactly one line and no thinking aloud', () => {
    const prompt = buildSpiritAnsweringPrompt({ ...base, ask: { kind: 'turn' } });
    expect(prompt).toContain('in ONE line');
    expect(prompt).toContain('no thinking aloud first');
    expect(prompt).toMatch(/Say:[\s\S]*Do:[\s\S]*Rest/);
    expect(prompt).not.toContain('monologue freely');
  });
  it('holds up with nothing heard and nothing thought', () => {
    const prompt = buildSpiritAnsweringPrompt({ ...base, innerState: '', heard: [], ask: { kind: 'turn' } });
    expect(prompt).toContain('Nothing you have not already taken in.');
    expect(prompt).toContain('You have not had time to think.');
  });
  it('adds no mechanical vocabulary of its own, and stays a short call', () => {
    expect(hasHardHit(sealLint(buildSpiritAnsweringPrompt({ ...base, ask: { kind: 'turn' } })))).toBe(false);
    expect(ANSWERING_MAX_TOKENS).toBeLessThanOrEqual(60);
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
