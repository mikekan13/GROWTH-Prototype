import { describe, it, expect } from 'vitest';
import { onlyDerived, pinToSeed, cardsFromSeed, clockInWords, fromInnerVoice, nameHead, isSpeechTagAct, lightOf, withoutRepeatedHour, dropEchoedThoughts, reattachDanglers, withoutLightLabel, physicalDoingToAct, invertsVoice, statedThoughtSentences, withoutRestatedStage, type SeedParts } from './scene-builder';

describe('nameHead / isSpeechTagAct (HW8 run 2)', () => {
  it('takes the name before its qualifier', () => {
    expect(nameHead("Violet's Apartment — Fourth-Floor Walkup Studio")).toBe("Violet's Apartment");
    expect(nameHead('Fourth-floor landing')).toBe('Fourth-floor landing');
    expect(nameHead('Main Room: the studio')).toBe('Main Room');
  });
  it('a bare speech tag is not an act', () => {
    expect(isSpeechTagAct('He speaks.')).toBe(true);
    expect(isSpeechTagAct('Kristopher says,')).toBe(true);
    expect(isSpeechTagAct('He speaks softly through the door.')).toBe(false);
    expect(isSpeechTagAct('He knocks again, a bit louder.')).toBe(false);
  });
});

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

describe('lightOf — the light is a fact (HW8 2026-10-25)', () => {
  it('October evening is after dark, afternoon is daylight, July 7 pm is daylight, July 10 pm is dark', () => {
    expect(lightOf(19, 9)).toBe('after dark');
    expect(lightOf(14, 9)).toBe('daylight');
    expect(lightOf(19, 6)).toBe('daylight');
    expect(lightOf(22, 6)).toBe('after dark');
  });
});

describe('withoutRepeatedHour — the page gave the hour once (HW8 2026-10-25)', () => {
  const scene = 'A little after seven in the evening, Violet stands in the Main Room, the entry door locked behind her.';
  it('strips a leading hour the page already gave', () => {
    expect(withoutRepeatedHour(scene, ['A little after seven in the evening: the fourth-floor landing…'])).toBe('Violet stands in the Main Room, the entry door locked behind her.');
  });
  it('leaves the scene alone on an empty page', () => {
    expect(withoutRepeatedHour(scene, [])).toBe(scene);
  });
});

describe('dropEchoedThoughts / reattachDanglers — one sentence, one segment (HW8 2026-10-25)', () => {
  it('drops a thought that is an act said twice', () => {
    const out = dropEchoedThoughts([
      { kind: 'action' as const, text: 'His fingers twitch toward the door.' },
      { kind: 'thought' as const, text: 'My fingers twitch toward the door.' },
      { kind: 'thought' as const, text: 'I wonder who is on the other side.' },
    ]);
    expect(out.map((s) => s.text)).toEqual(['His fingers twitch toward the door.', 'I wonder who is on the other side.']);
  });
  it('reattaches a dangling participle tail to the act before it', () => {
    const out = reattachDanglers([
      { kind: 'action' as const, text: 'His thumb rubs the ink.' },
      { kind: 'thought' as const, text: 'Wanting to verify the ink is still there.' },
      { kind: 'thought' as const, text: 'Nothing moves.' },
    ]);
    expect(out).toEqual([
      { kind: 'action', text: 'His thumb rubs the ink, wanting to verify the ink is still there.' },
      { kind: 'thought', text: 'Nothing moves.' },
    ]);
  });
});

describe('withoutLightLabel — the light is a fact, never a pasted label (HW8 run 5, 2026-10-26)', () => {
  it('strips a bare light label', () => {
    expect(withoutLightLabel('About half past seven in the evening — after dark. The landing is quiet.')).toBe('About half past seven in the evening. The landing is quiet.');
    expect(withoutLightLabel('— daylight. The landing is quiet.')).toBe('The landing is quiet.');
  });
});

describe('physicalDoingToAct — a doing in his voice becomes an act (HW8 run 5, 2026-10-26)', () => {
  it('converts the first person', () => {
    expect(physicalDoingToAct('I adjust the cross, feeling the wood grain against my sternum.', 'Kristopher')).toBe('Kristopher adjusts the cross, feeling the wood grain against his sternum.');
    expect(physicalDoingToAct('The wood grain under my palm is rough, familiar.', 'Kristopher')).toBe('The wood grain under his palm is rough, familiar.');
    expect(physicalDoingToAct('The silence stretches.', 'Kristopher')).toBeNull();
  });
});

describe('a thought is never inverted or patched with the world\'s truth (HW8 run 6)', () => {
  const voice = "The ink is dry. The tab is settled. She's already moved on";
  it('"She hasn\'t moved on at all." is the voice turned inside out and fails; the voice\'s own sentence passes', () => {
    expect(invertsVoice("She hasn't moved on at all.", voice)).toBe(true);
    expect(invertsVoice("She's already moved on.", voice)).toBe(false);
    expect(fromInnerVoice("She hasn't moved on at all.", voice)).toBeNull();
    expect(fromInnerVoice("The ink is dry. The tab is settled.", voice)).toBe('The ink is dry. The tab is settled.');
  });
  it('the receipt\'s text is not his voice: "Not paid — collect 22.97." fails against what he actually thought', () => {
    expect(fromInnerVoice('Not paid — collect 22.97. She hasn\'t moved on at all.', voice)).toBeNull();
  });
});

describe('statedThoughtSentences — what the Watcher voiced as his mind is kept (HW8 run 6)', () => {
  const seed = ['He remembers this woman and thinks she is pretty.', 'Was that him or the voice he wonders?', 'Who was she?', 'He steadies his thoughts again with the prayer.'];
  it('a mental-state sentence and the questions running on from it', () => {
    expect(statedThoughtSentences(seed)).toEqual(['He remembers this woman and thinks she is pretty.', 'Was that him or the voice he wonders?', 'Who was she?']);
  });
  it('a question after an act is no thought of his', () => {
    expect(statedThoughtSentences(['He knocks twice.', 'Who is there?'])).toEqual([]);
  });
});

describe('withoutRestatedStage — the page remembers itself, scene lines included (HW8 run 6)', () => {
  const page = ["Kristopher stands outside Violet's door under a single caged bulb.", 'About half past seven in the evening, mid October.'];
  it('drops a sentence that restates where he stands or the bulb; keeps what is new', () => {
    expect(withoutRestatedStage("Kristopher stands at Violet's door. A latch clicks somewhere inside.", page)).toBe('A latch clicks somewhere inside.');
    expect(withoutRestatedStage('One caged bulb burns above the landing.', page)).toBe('One caged bulb burns above the landing.');
    expect(withoutRestatedStage("Kristopher stands outside Violet's door under a single caged bulb.", page)).toBe('');
  });
  it('an empty page changes nothing', () => {
    expect(withoutRestatedStage('He stands at the door.', [])).toBe('He stands at the door.');
  });
});

import { narratedIsFaithful, takeNarrated } from './scene-builder';
describe('narrated thoughts (HW8 run 7 item 14) — a narrator form brings in nothing new', () => {
  it('tense and person may change, content may not', () => {
    expect(narratedIsFaithful('I know this door. I have been here before.', 'He knew this door. He had been here before.')).toBe(true);
    expect(narratedIsFaithful('I know this door.', 'He knew this heavy door.')).toBe(false);
  });
  it('a missing or unfaithful form is left undefined', () => {
    expect(takeNarrated('I know this door.', undefined, 'Kristopher')).toBeUndefined();
    expect(takeNarrated('I know this door.', 'He feared the shadows.', 'Kristopher')).toBeUndefined();
    expect(takeNarrated('I know this door.', ' He knew this door. ', 'Kristopher')).toBe('He knew this door.');
  });
});

import { cardLight } from './scene-builder';
describe('HW8 run 7 #9 / #11', () => {
  it('statedThoughtSentences catches the mental verbs the GM used', () => {
    const seed = ['He waits for the door to open.', "He doesn't know why he used her name.", 'Not normal.'];
    expect(statedThoughtSentences(seed)).toEqual(["He doesn't know why he used her name.", 'Not normal.']);
    expect(statedThoughtSentences(['He wonders if she is home.'])).toEqual(['He wonders if she is home.']);
    expect(statedThoughtSentences(['He notices the bulb flicker.', 'He cannot stop staring.'])).toEqual(['He notices the bulb flicker.', 'He cannot stop staring.']);
  });
  it('the clock line\'s "after dark" is not a light fact; a bulb is', () => {
    expect(cardLight(['[clock] about half past seven in the evening — after dark'])).toBe(false);
    expect(cardLight(['[clock] x', '[fact · the place] A caged bulb lights the landing.'])).toBe(true);
  });
});

import { isBareHour } from './scene-builder';
describe('isBareHour (HW8 run 7 #13)', () => {
  it('an hour alone is not a thought on a being card', () => {
    expect(isBareHour("Seven o'clock.")).toBe(true);
    expect(isBareHour('Half past seven.')).toBe(true);
    expect(isBareHour('Seven pizzas, and not one of them mine.')).toBe(false);
  });
});
