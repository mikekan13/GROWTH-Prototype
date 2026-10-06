import { describe, it, expect } from 'vitest';
import { placeKeys, factsForPlace, composeSceneLines, narrowToNew, sceneRoll, stimulusOnly, SCENE_RETAKE_MS, SCENE_ITEM_CAP } from './perceive';
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

// ── U2b-2: the room is taken in once ──────────────────────────────────────

describe('narrowToNew — after the first take, only the stimulus and what changed', () => {
  const rollOf = (input: Pick<typeof base, 'present' | 'items' | 'senses'>) => sceneRoll({ placed: true, present: input.present.map(p => p.name), items: input.items, senses: input.senses });
  const first = (input = base, now = 1_000) => narrowToNew(composeSceneLines(input), undefined, 'inn', now, rollOf(input));

  it('the first stimulus in a place carries the whole room', () => {
    const whole = composeSceneLines(base);
    const r = first();
    expect(r.standing).toBe('full');
    expect(r.truth).toEqual(whole);
    expect([...r.taken.present]).toEqual(['Danny']);
    expect([...r.taken.items]).toEqual(['tankard', 'ledger']);
  });
  it('the next one carries the new narration and none of the standing lines', () => {
    const next = { ...base, headline: 'The lass sets a mug in front of you.' };
    const r = narrowToNew(composeSceneLines(next), first().taken, 'inn', 2_000, rollOf(next));
    expect(r.standing).toBe('new');
    expect(r.truth).toEqual({ headline: 'The lass sets a mug in front of you.', lines: [] });
  });
  it('speech is the stimulus: it is always carried', () => {
    const said = { ...base, headline: null, speech: ['Danny: "You new here?"'] };
    const r = narrowToNew(composeSceneLines(said), first().taken, 'inn', 2_000, rollOf(said));
    expect(r.truth.lines).toEqual([{ text: 'Danny: "You new here?"', salience: 0.95, kind: 'speech' }]);
    const again = narrowToNew(composeSceneLines(said), r.taken, 'inn', 3_000, rollOf(said));
    expect(again.truth.lines.map(l => l.kind)).toEqual(['speech']);
  });
  it('someone who just arrived and a thing just placed are news on the very next stimulus', () => {
    const changed = { ...base, headline: 'The door bangs.', present: [...base.present, { name: 'Ruth', description: 'flour to the elbows' }], items: [...base.items, 'lantern'] };
    const r = narrowToNew(composeSceneLines(changed), first().taken, 'inn', 2_000, rollOf(changed));
    expect(r.truth.lines.map(l => l.text)).toEqual(['Ruth is here — flour to the elbows', 'Around you: tankard, ledger, lantern.']);
    const after = narrowToNew(composeSceneLines(changed), r.taken, 'inn', 3_000, rollOf(changed));
    expect(after.truth.lines).toEqual([]);
  });
  it('someone who left gets one plain absence line, then nothing', () => {
    const emptied = { ...base, headline: 'The room goes quiet.', present: [] };
    const r = narrowToNew(composeSceneLines(emptied), first().taken, 'inn', 2_000, rollOf(emptied));
    expect(r.truth.lines).toEqual([{ text: 'Danny is no longer here.', salience: 0.9, kind: 'present' }]);
    const after = narrowToNew(composeSceneLines(emptied), r.taken, 'inn', 3_000, rollOf(emptied));
    expect(after.truth.lines).toEqual([]);
  });
  it('a thing taken away is named as gone alongside the list as it now stands', () => {
    const lighter = { ...base, headline: 'A hand closes on the ledger.', items: ['tankard'] };
    const r = narrowToNew(composeSceneLines(lighter), first().taken, 'inn', 2_000, rollOf(lighter));
    expect(r.truth.lines.map(l => l.text)).toEqual(['Around you: tankard.', 'No longer here: ledger.']);
  });
  it('a changed description is a new line, not a departure', () => {
    const changed = { ...base, present: [{ name: 'Danny', description: 'soaked through, jacket gone' }] };
    const r = narrowToNew(composeSceneLines(changed), first().taken, 'inn', 2_000, rollOf(changed));
    expect(r.truth.lines.map(l => l.text)).toEqual(['Danny is here — soaked through, jacket gone']);
  });
  it('a new place, or a long gap, is the whole room again — with no absence lines', () => {
    const elsewhere = { ...base, present: [], items: [] };
    const moved = narrowToNew(composeSceneLines(elsewhere), first().taken, 'cellar', 2_000, rollOf(elsewhere));
    expect(moved.standing).toBe('full');
    expect(moved.truth.lines.some(l => l.text.includes('no longer'))).toBe(false);
    const later = narrowToNew(composeSceneLines(base), first().taken, 'inn', 1_000 + SCENE_RETAKE_MS + 1, rollOf(base));
    expect(later.standing).toBe('full');
    expect(later.truth).toEqual(composeSceneLines(base));
    const soon = narrowToNew(composeSceneLines(base), first().taken, 'inn', 1_000 + SCENE_RETAKE_MS, rollOf(base));
    expect(soon.standing).toBe('new');
  });
  it('a being that cannot tell who or what is here reports nobody gone and keeps what it last knew', () => {
    const blinded = { ...base, present: [], items: [], senses: { canSee: false, canHear: false } };
    const r = narrowToNew(composeSceneLines(blinded), first().taken, 'inn', 2_000, rollOf(blinded));
    expect(r.truth.lines.some(l => l.text.includes('no longer') || l.text.includes('No longer'))).toBe(false);
    expect([...r.taken.present]).toEqual(['Danny']);
    expect([...r.taken.items]).toEqual(['tankard', 'ledger']);
  });
  it('does not touch the scene or the memo it was given', () => {
    const whole = composeSceneLines(base);
    const before = first();
    const seenBefore = before.taken.seen.size;
    const changed = { ...base, present: [], items: ['lantern'] };
    narrowToNew(composeSceneLines(changed), before.taken, 'inn', 2_000, rollOf(changed));
    expect(before.taken.seen.size).toBe(seenBefore);
    expect(before.truth).toEqual(whole);
  });
});

describe('stimulusOnly — re-rendering a memory made from one stretch', () => {
  it('narration: the headline alone, none of the room', () => {
    expect(stimulusOnly(composeSceneLines(base))).toEqual({ headline: base.headline, lines: [] });
  });
  it('speech: the spoken line alone', () => {
    const said = composeSceneLines({ ...base, headline: null, speech: ['Danny: "You new here?"'] });
    expect(stimulusOnly(said)).toEqual({ headline: null, lines: [{ text: 'Danny: "You new here?"', salience: 0.95, kind: 'speech' }] });
  });
  it('a deaf being still gets no speech', () => {
    const deaf = composeSceneLines({ ...base, headline: null, speech: ['Danny: "You new here?"'], senses: { canSee: true, canHear: false } });
    expect(stimulusOnly(deaf)).toEqual({ headline: null, lines: [] });
  });
});

describe('sceneRoll — only what the senses can account for', () => {
  const full = { placed: true, present: ['Danny'], items: ['tankard'], senses: { canSee: true, canHear: true } };
  it('sighted and placed: both lists', () => {
    expect(sceneRoll(full)).toEqual({ present: ['Danny'], items: ['tankard'] });
  });
  it('blind: people by ear, no account of things; blind and deaf, or nowhere: no account of either', () => {
    expect(sceneRoll({ ...full, senses: { canSee: false, canHear: true } })).toEqual({ present: ['Danny'], items: null });
    expect(sceneRoll({ ...full, senses: { canSee: false, canHear: false } })).toEqual({ present: null, items: null });
    expect(sceneRoll({ ...full, placed: false })).toEqual({ present: null, items: null });
  });
  it('a list at the cap is a sample, so nothing can be called gone from it', () => {
    const many = Array.from({ length: SCENE_ITEM_CAP }, (_, i) => `thing ${i}`);
    expect(sceneRoll({ ...full, items: many }).items).toBeNull();
    expect(sceneRoll({ ...full, items: many.slice(1) }).items).toHaveLength(SCENE_ITEM_CAP - 1);
  });
});
