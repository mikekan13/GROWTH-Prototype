/**
 * Modern-Earth Blossoms — temporary states, Godhead/GM-bestowed in play.
 *
 * Mike ruling 2026-08-04: SHORT-TERM illnesses are negative Blossoms
 * (temporary by nature); long-term conditions are Thorns. Blossoms carry a
 * lighter design bar than Nectars/Thorns (canon): plain single-clause
 * effects are fine, they can be negative (r-2026-06-11-05), they expire,
 * and they don't count against the Fate-Die trait cap.
 *
 * Every entry states its own clear END CONDITION — a temporary state
 * without an exit is a Thorn wearing a costume.
 */

import type { TraitTemplate } from './types';

export const NEGATIVE_BLOSSOMS: TraitTemplate[] = [
  {
    name: 'The Flu',
    type: 'blossom',
    pillar: 'body',
    category: 'illness',
    description: 'Everything aches, everything is cold, and the body has unionized against the day.',
    mechanicalEffect: '−1 to all checks and −2 to Body-pillar checks. Ends after two full days of genuine rest (halve it with bed rest and care from another character).',
    kv: -10,
    tags: ['illness', 'modern', 'temporary'],
  },
  {
    name: 'Head Cold',
    type: 'blossom',
    pillar: 'body',
    category: 'illness',
    description: 'Not dying. Just narrating everything through a wet sock.',
    mechanicalEffect: '−1 to perception and social checks (everything sounds and tastes like cardboard). Ends after one full day of rest.',
    kv: -5,
    tags: ['illness', 'modern', 'temporary'],
  },
  {
    name: 'Food Poisoning',
    type: 'blossom',
    pillar: 'body',
    category: 'illness',
    description: 'The gas-station sushi has filed its counterclaim.',
    mechanicalEffect: 'For the rest of the day: −2 to Body checks, and once per scene the GM may declare an urgent interruption (the bearer must excuse themselves for one round). Ends after a night\'s rest.',
    kv: -10,
    tags: ['illness', 'modern', 'temporary'],
  },
  {
    name: 'Concussion',
    type: 'blossom',
    pillar: 'soul',
    category: 'injury',
    description: 'The world is at a slight delay, and bright lights are shouting.',
    mechanicalEffect: '−2 to Soul-pillar checks and the bearer may add at most 1 Effort to any roll. Ends after two days of rest with no second impact; a second impact upgrades it (GM: extend + worsen).',
    kv: -15,
    tags: ['injury', 'modern', 'temporary'],
  },
  {
    name: 'Sprained Ankle',
    type: 'blossom',
    pillar: 'body',
    category: 'injury',
    description: 'Every step is a small invoice.',
    mechanicalEffect: 'Movement is halved and chase/climb checks take −3. Ends after three days, or one day fully off it with ice and elevation.',
    kv: -10,
    tags: ['injury', 'modern', 'temporary'],
  },
  {
    name: 'Broken Arm',
    type: 'blossom',
    pillar: 'body',
    category: 'injury',
    description: 'Six-to-eight weeks of learning what the other hand is for.',
    mechanicalEffect: 'The arm is unusable: two-handed actions impossible without help, one-handed workarounds at −2. Ends after six in-game weeks in a cast (four with proper medical care).',
    kv: -20,
    tags: ['injury', 'modern', 'temporary'],
  },
  {
    name: 'Migraine (Acute)',
    type: 'blossom',
    pillar: 'soul',
    category: 'illness',
    description: 'A drill has opened an office behind one eye and is taking meetings.',
    mechanicalEffect: '−2 to all checks while in bright or loud environments. Ends after one scene spent somewhere dark and quiet, or after a night\'s sleep.',
    kv: -5,
    tags: ['illness', 'modern', 'temporary'],
  },
  {
    name: 'Jet Lag',
    type: 'blossom',
    pillar: 'body',
    category: 'fatigue',
    description: 'The body has arrived; the brain is still somewhere over the ocean.',
    mechanicalEffect: '−1 to all checks, and the bearer\'s Night Owl/Early Riser style bonuses (if any) do not function. Ends after two nights on local time.',
    kv: -5,
    tags: ['fatigue', 'modern', 'temporary'],
  },
  {
    name: 'Sleep Deprived',
    type: 'blossom',
    pillar: 'body',
    category: 'fatigue',
    description: 'Awake on a technicality.',
    mechanicalEffect: '−1 to all checks and the first Effort spent each scene costs 1 extra. Ends immediately after a full night\'s sleep.',
    kv: -10,
    tags: ['fatigue', 'modern', 'temporary'],
  },
  {
    name: 'Stomach Bug',
    type: 'blossom',
    pillar: 'body',
    category: 'illness',
    description: 'Twenty-four hours of regretting every decision that led here.',
    mechanicalEffect: 'The bearer cannot benefit from meals, and Body checks take −2. Ends after one full day.',
    kv: -5,
    tags: ['illness', 'modern', 'temporary'],
  },
];

export const POSITIVE_BLOSSOMS: TraitTemplate[] = [
  {
    name: 'Caffeinated',
    type: 'blossom',
    pillar: 'body',
    category: 'boost',
    description: 'The correct amount of coffee, which is slightly too much coffee.',
    mechanicalEffect: 'The bearer\'s first check each scene gains +1. Ends after a few hours (GM: end of the current stretch); on ending, the bearer\'s next Short Rest restores 1 less.',
    kv: 5,
    tags: ['modern', 'temporary'],
  },
  {
    name: 'Well-Rested',
    type: 'blossom',
    pillar: 'body',
    category: 'boost',
    description: 'Eight full hours. A myth made flesh.',
    mechanicalEffect: 'The first time each pool would be depleted today, reduce that depletion by 1. Ends at the next rest.',
    kv: 10,
    tags: ['modern', 'temporary'],
  },
  {
    name: 'Adrenaline Surge',
    type: 'blossom',
    pillar: 'body',
    category: 'boost',
    description: 'The body has decided the situation is survivable and has released the good chemistry.',
    mechanicalEffect: '+2 to Body-pillar checks this scene. When the scene ends, −1 to all checks for the following scene (the crash).',
    kv: 5,
    tags: ['modern', 'temporary'],
  },
  {
    name: 'In the Zone',
    type: 'blossom',
    pillar: 'spirit',
    category: 'boost',
    description: 'The task and the bearer have briefly become the same thing.',
    mechanicalEffect: 'On one declared task this scene, the bearer\'s Effort counts double. Any interruption ends this immediately.',
    kv: 10,
    tags: ['modern', 'temporary'],
  },
  {
    name: 'Second Wind',
    type: 'blossom',
    pillar: 'body',
    category: 'boost',
    description: 'Empty — and then, from somewhere, not.',
    mechanicalEffect: 'The next time a Body pool would hit 0 this session, it stops at 1 instead. Expires at session end.',
    kv: 10,
    tags: ['modern', 'temporary'],
  },
  {
    name: 'Riding High',
    type: 'blossom',
    pillar: 'soul',
    category: 'boost',
    description: 'Something went RIGHT, and the glow has legs.',
    mechanicalEffect: 'After a major personal win (GM bestows): +1 to social checks and the bearer\'s calm-or-inspire attempts auto-succeed on DR5 or less. Ends at the next session\'s start.',
    kv: 10,
    tags: ['modern', 'temporary'],
  },
];

export const ALL_BLOSSOMS: TraitTemplate[] = [...NEGATIVE_BLOSSOMS, ...POSITIVE_BLOSSOMS];
