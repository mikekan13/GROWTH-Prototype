import { describe, it, expect } from 'vitest';
import { placeKeys, factsForPlace, composeSceneLines } from './perceive';
import { computeSceneContent, rngFor } from './renderer-math';

const facts = [
  { id: 'f1', subjectKey: 'main-room.window', fact: 'The window faces the street.' },
  { id: 'f2', subjectKey: 'apartment.time', fact: 'It is mid-afternoon.' },
  { id: 'f3', subjectKey: 'bathroom.mirror', fact: 'A cracked mirror over the sink.' },
  { id: 'f4', subjectKey: 'violet.hair', fact: 'Her hair is tied back.' },
] as never[];

describe('placeKeys / factsForPlace — WorldFacts scoped to the place by subjectKey prefix', () => {
  it('matches the slug and the meaningful name tokens', () => {
    expect(placeKeys('Main Room')).toEqual(['main-room', 'main']);
    expect(placeKeys("Violet's Apartment — Fourth Floor Walkup")).toContain('apartment');
    expect(factsForPlace(facts, placeKeys('Main Room')).map(f => f.id)).toEqual(['f1']);
    expect(factsForPlace(facts, placeKeys("Violet's Apartment — Fourth Floor Walkup")).map(f => f.id)).toEqual(['f2']);
  });
});

const base = {
  headline: 'A bright eyed lass behind the bar gives you a wink. "Hey scruffy, you gonna order something?"',
  speech: [],
  place: { name: 'The Inn', data: { description: 'Low beams, a long bar.', environment: 'Smoke and spiced mead in the air.', features: [{ name: 'hearth', description: 'a wide stone hearth', type: 'landmark' as const }] } as never },
  parent: { name: 'The Neighborhood Block', data: null },
  present: [{ name: 'Danny', description: 'a wiry man in a work jacket' }],
  items: ['tankard', 'ledger'],
  facts: [{ id: 'x', subjectKey: 'the-inn.door', fact: 'The side door sticks.' }] as never[],
  parentFacts: [],
  senses: { canSee: true, canHear: true },
};

describe('composeSceneLines — the truth the being stands in', () => {
  it('headline first, then who is present, the place, the facts, the items — each with a salience', () => {
    const t = composeSceneLines(base);
    expect(t.headline).toBe(base.headline);
    expect(t.lines.map(l => l.kind)).toEqual(['present', 'place', 'place', 'place', 'place', 'fact', 'item']);
    expect(t.lines[0].text).toBe('Danny is here — a wiry man in a work jacket');
    expect(t.lines[0].salience).toBeGreaterThan(t.lines.at(-1)!.salience);
  });
  it('blind: no place, facts or items; deaf: no speech', () => {
    const blind = composeSceneLines({ ...base, senses: { canSee: false, canHear: true } });
    expect(blind.lines.map(l => l.kind)).toEqual(['sense', 'present']);
    expect(blind.lines[1].text).toBe('Danny is here.');
    const deaf = composeSceneLines({ ...base, headline: null, speech: ['Ruth: "Sit."'], senses: { canSee: true, canHear: false } });
    expect(deaf.lines.some(l => l.kind === 'speech')).toBe(false);
  });
});

describe('computeSceneContent — the mirror keeps the headline and blurs by salience', () => {
  const truth = composeSceneLines(base);
  const calm = { morale: 0, stress: 0, grief: 0 };
  it('F5 keeps everything; F1 keeps the headline and the person present; F0 keeps nothing', () => {
    const f5 = computeSceneContent({ subject: 'scene', subjectKey: 's', trueData: truth }, {}, calm, 5, rngFor('e', 's', 0));
    expect(f5.kept).toBe(truth.lines.length + 1);
    const f1 = computeSceneContent({ subject: 'scene', subjectKey: 's', trueData: truth }, {}, calm, 1, rngFor('e', 's', 0));
    expect(f1.prose.startsWith(base.headline)).toBe(true);
    expect(f1.prose).toContain('Danny is here');
    expect(f1.prose).not.toContain('tankard');
    const f0 = computeSceneContent({ subject: 'scene', subjectKey: 's', trueData: truth }, {}, calm, 0, rngFor('e', 's', 0));
    expect(f0.kept).toBe(0);
    expect(f0.prose).not.toContain('Danny');
  });
  it('F4 keeps most lines, is deterministic for the same seed, and never invents', () => {
    const a = computeSceneContent({ subject: 'scene', subjectKey: 's', trueData: truth }, {}, calm, 4, rngFor('e', 's', 0));
    const b = computeSceneContent({ subject: 'scene', subjectKey: 's', trueData: truth }, {}, calm, 4, rngFor('e', 's', 0));
    expect(a.prose).toBe(b.prose);
    expect(a.kept).toBeGreaterThanOrEqual(truth.lines.length - 2);
    for (const line of a.prose.split('\n').filter(l => l && !l.startsWith('Your mood'))) {
      expect([base.headline, ...truth.lines.map(l => l.text)]).toContain(line);
    }
  });
  it('a grim mood tags the tilt without adding content', () => {
    const r = computeSceneContent({ subject: 'scene', subjectKey: 's', trueData: truth }, {}, { morale: -0.8, stress: 0.9, grief: 0.5 }, 5, rngFor('e', 's', 0));
    expect(r.distortions).toContain('moodTilt:pessimistic');
    expect(r.prose.endsWith('Your mood tilts this grim.')).toBe(true);
  });
});
