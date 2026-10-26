import { describe, it, expect } from 'vitest';
import { onlyDerived, pinToSeed, cardsFromSeed, clockInWords, fromInnerVoice, type SeedParts } from './scene-builder';

describe('clockInWords — the hour as a novel gives it (HW8 2026-10-25)', () => {
  it('reads the clock in words with the part of day and the stretch of the month, never the date', () => {
    expect(clockInWords('17th Oct, Y2026 · 19:16 · 0.002 cyc')).toBe('a little after seven in the evening, mid October');
    expect(clockInWords('3rd Jan, Y2026 · 00:02 · 0.000 cyc')).toBe("twelve o'clock at night, early January");
    expect(clockInWords('28th Jun, Y2026 · 14:48 · 0.491 cyc')).toBe('coming up on three in the afternoon, late June');
    expect(clockInWords('9th Mar, Y2026 · 08:57 · 0.186 cyc')).toBe('just before nine in the morning, early March');
    expect(clockInWords('9th Mar, Y2026 · 10:30 · 0.186 cyc')).toBe('about half past ten in the morning, early March');
  });
  it('leaves a clock it cannot read alone', () => {
    expect(clockInWords('cycle 12')).toBe('cycle 12');
  });
});

describe('fromInnerVoice — a thought is the being\'s own voice or nothing (HW8 2026-10-25)', () => {
  const voice = 'The receipt is still warm in my hand, the ink smudging under the caged bulb. I raise my knuckles toward Violet\'s door. Odd.';
  it('keeps the sentences the voice carries and drops the ones it never had', () => {
    expect(fromInnerVoice('The receipt is warm in my hand, the ink smudging under the bulb. Am I still the man who built, or the one who broke?', voice))
      .toBe('The receipt is warm in my hand, the ink smudging under the bulb.');
  });
  it('a short thought stands when the voice says it', () => {
    expect(fromInnerVoice('Odd.', voice)).toBe('Odd.');
    expect(fromInnerVoice('Run.', voice)).toBeNull();
  });
  it('no voice, no thought', () => {
    expect(fromInnerVoice('Only one apartment on the whole floor.', '')).toBeNull();
  });
});

// HW7 line 1 (2026-10-25), the seed Mike typed three times.
const SEED: SeedParts = {
  full: 'Kristopher stands on the fourth floor landing which only has one apartment. He thinks it is odd and his brain begins to race for meaning where perhaps none is. He wipes his eyes from the tears he was crying in the car. And he says the prayer in his head. "Lord Jesus Christ, Son of God, have mercy on me a sinner." He knocks on the door and a genuine smile flutters across his face.',
  narration: 'Kristopher stands on the fourth floor landing which only has one apartment.',
  actions: [
    { actorId: 'kris', actorLabel: 'Kristopher', text: 'Wipes his eyes from the tears he was crying in the car' },
    { actorId: 'kris', actorLabel: 'Kristopher', text: 'Knocks on the door and a genuine smile flutters across his face' },
  ],
  thoughts: [
    { actorId: 'kris', actorLabel: 'Kristopher', text: 'Thinks it is odd and his brain begins to race for meaning where perhaps none is', sentence: 'He thinks it is odd and his brain begins to race for meaning where perhaps none is.' },
    { actorId: 'kris', actorLabel: 'Kristopher', text: 'Says the prayer in his head: "Lord Jesus Christ, Son of God, have mercy on me a sinner."', sentence: 'And he says the prayer in his head. "Lord Jesus Christ, Son of God, have mercy on me a sinner."' },
  ],
  quotes: [],
};
const FACTS = [
  '[clock] 1st Jan, Y1 · 19:18 (evening)',
  '[place · Kristopher stands in] Fourth-floor landing: The fourth-floor landing of the walkup: a narrow hall of scuffed hexagonal tile under one caged ceiling bulb. Violet\'s door at the near end.',
  '[map] door "Entry door" between Main Room and Fourth-floor landing: LOCKED',
  '[Kristopher holds] carrying: Pizza box',
];
const NAMES = ['Kristopher', 'Violet', 'Fourth-floor landing', "Violet's Apartment — Fourth-Floor Walkup Studio", 'Main Room'];

describe('scene builder — the compile pass (derive, never invent)', () => {
  it('a sentence naming someone the world does not know is dropped; the known stay', () => {
    const draft = 'The caged bulb hums over scuffed hexagonal tile. Violet\'s door waits at the near end, locked. Marcus watches from the stair. The pizza box is warm in his hands.';
    expect(onlyDerived(draft, [SEED.full, ...FACTS, ...NAMES])).toBe('The caged bulb hums over scuffed hexagonal tile. Violet\'s door waits at the near end, locked. The pizza box is warm in his hands.');
  });
  it('a sentence-initial word is never held against it; the prayer\'s names pass', () => {
    expect(onlyDerived('Only one apartment on the whole floor. Lord Jesus Christ, Son of God, have mercy on me a sinner.', [SEED.full])).toBe('Only one apartment on the whole floor. Lord Jesus Christ, Son of God, have mercy on me a sinner.');
  });
});

describe('scene builder — every built segment is pinned to a seed sentence', () => {
  const sentences = [
    'Kristopher stands on the fourth floor landing which only has one apartment.',
    'He thinks it is odd and his brain begins to race for meaning where perhaps none is.',
    'He wipes his eyes from the tears he was crying in the car.',
    'And he says the prayer in his head.',
    '"Lord Jesus Christ, Son of God, have mercy on me a sinner."',
    'He knocks on the door and a genuine smile flutters across his face.',
  ];
  it('a verbatim "from" is kept; a loose one is matched by its words', () => {
    expect(pinToSeed('He knocks on the door and a genuine smile flutters across his face.', 'He knocks on the door.', sentences)).toBe(sentences[5]);
    expect(pinToSeed('he knocks on the door and a genuine smile flutters across his face', 'He knocks.', sentences)).toBe(sentences[5]);
    expect(pinToSeed(undefined, 'He wipes his eyes.', sentences)).toBe(sentences[2]);
    expect(pinToSeed(undefined, 'Only one apartment on the whole floor. Odd.', sentences)).toBe(sentences[0]);
  });
});

describe('scene builder — the seed as cards (the fallback)', () => {
  it('one card per actor, acts and thoughts carrying their seed sentence', () => {
    const cards = cardsFromSeed(SEED);
    expect(cards).toHaveLength(1);
    expect(cards[0].actorId).toBe('kris');
    expect(cards[0].segments.map((s) => s.kind)).toEqual(['action', 'action', 'thought', 'thought']);
    expect(cards[0].segments[2].sentence).toBe('He thinks it is odd and his brain begins to race for meaning where perhaps none is.');
  });
});
