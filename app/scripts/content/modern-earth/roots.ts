/**
 * Modern-Earth Roots — upbringings to age 18 (canon max start age 25).
 *
 * Root KV = attribute levels + skill levels + net trait KV (r-2026-04-22-10,
 * NO formulaic age term). Anchor: plain 18-year-old Human Root ≈ 100 KV.
 * Frequency cost = KV − break-even, break-even = 100 + (age−18)×5.
 * The seeder computes KV and frequency from these templates — numbers here
 * are the content, not the price.
 *
 * Design: attribute levels sum ≈80 (a functioning 18-year-old), 3-4 skills
 * at levels 3-6 (soft creation cap 10, seed-grant cap d4 doesn't apply to
 * Roots), zero or one bundled trait. Personal thorns (health, history) are
 * deliberately NOT baked into upbringings — those are the player's own
 * choices, made separately. An upbringing shapes you; it doesn't diagnose you.
 */

import type { RootTemplate } from './types';

export const MODERN_ROOTS: RootTemplate[] = [
  {
    name: 'Suburban Childhood',
    description: 'Lawns, homework, group chats, a learner\'s permit at fifteen. An ordinary launchpad — which is to say, a good one.',
    age: 18,
    attributes: { clout: 9, celerity: 10, constitution: 10, focus: 10, flow: 9, willpower: 10, wisdom: 11, wit: 11 },
    skills: [
      { name: 'Driving', level: 4 },
      { name: 'Research', level: 4 },
      { name: 'Etiquette', level: 3 },
      { name: 'Athletics', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Rural Upbringing',
    description: 'Animals before dawn, machinery before breakfast, weather as a household member. Work was never abstract.',
    age: 18,
    attributes: { clout: 11, celerity: 10, constitution: 12, focus: 9, flow: 10, willpower: 10, wisdom: 10, wit: 8 },
    skills: [
      { name: 'Animal Handling', level: 5 },
      { name: 'Mechanics', level: 4 },
      { name: 'Driving', level: 4 },
      { name: 'Survival', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Inner-City Streets',
    description: 'Four locks on the door and a map of the neighborhood written in instinct: which corners, which hours, which faces.',
    age: 18,
    attributes: { clout: 9, celerity: 11, constitution: 10, focus: 10, flow: 9, willpower: 10, wisdom: 9, wit: 12 },
    skills: [
      { name: 'Streetwise', level: 6 },
      { name: 'Athletics', level: 4 },
      { name: 'Sleight of Hand', level: 3 },
      { name: 'Insight', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Military Family',
    description: 'Seven schools in twelve years. Boxes never fully unpacked, friendships made fast, discipline ambient as air.',
    age: 18,
    attributes: { clout: 10, celerity: 10, constitution: 10, focus: 11, flow: 8, willpower: 11, wisdom: 10, wit: 10 },
    skills: [
      { name: 'Athletics', level: 4 },
      { name: 'Etiquette', level: 4 },
      { name: 'Navigation', level: 3 },
      { name: 'Firearms', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'First-Generation Household',
    description: 'Two languages at the dinner table, three jobs between two parents, and the quiet weight of being the reason they came.',
    age: 18,
    attributes: { clout: 9, celerity: 9, constitution: 10, focus: 10, flow: 9, willpower: 11, wisdom: 11, wit: 11 },
    skills: [
      { name: 'Languages', level: 6 },
      { name: 'Cooking', level: 4 },
      { name: 'Finance', level: 3 },
      { name: 'Etiquette', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Homeschooled',
    description: 'The kitchen table was the classroom and curiosity set the curriculum. Socialization happened on purpose or not at all.',
    age: 18,
    attributes: { clout: 9, celerity: 9, constitution: 9, focus: 11, flow: 9, willpower: 10, wisdom: 12, wit: 11 },
    skills: [
      { name: 'Research', level: 6 },
      { name: 'Writing', level: 4 },
      { name: 'Music Performance', level: 3 },
      { name: 'Cooking', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Academic Household',
    description: 'Bookshelves as furniture, dinner-table debates with citation requests, report cards read like peer reviews.',
    age: 18,
    attributes: { clout: 8, celerity: 9, constitution: 9, focus: 10, flow: 9, willpower: 10, wisdom: 12, wit: 13 },
    skills: [
      { name: 'Research', level: 6 },
      { name: 'Law', level: 3 },
      { name: 'Writing', level: 4 },
      { name: 'Public Speaking', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Athlete\'s Youth',
    description: 'Five a.m. practices, taped ankles, the particular silence of a locker room after a loss. The body was the project.',
    age: 18,
    attributes: { clout: 11, celerity: 12, constitution: 12, focus: 10, flow: 9, willpower: 10, wisdom: 8, wit: 8 },
    skills: [
      { name: 'Athletics', level: 6 },
      { name: 'Swimming', level: 4 },
      { name: 'First Aid', level: 3 },
      { name: 'Public Speaking', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Artist\'s Household',
    description: 'Paint on every doorknob, instruments as furniture, money as an occasional guest. Beauty was non-negotiable; rent was.',
    age: 18,
    attributes: { clout: 9, celerity: 10, constitution: 9, focus: 11, flow: 12, willpower: 9, wisdom: 10, wit: 10 },
    skills: [
      { name: 'Music Performance', level: 5 },
      { name: 'Photography', level: 4 },
      { name: 'Writing', level: 3 },
      { name: 'Sleight of Hand', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Working-Class Grind',
    description: 'Everyone in the house had shifts, and the house itself seemed to have one. You learned to fix it, cook it, or do without it.',
    age: 18,
    attributes: { clout: 11, celerity: 10, constitution: 11, focus: 9, flow: 9, willpower: 11, wisdom: 9, wit: 10 },
    skills: [
      { name: 'Mechanics', level: 4 },
      { name: 'Cooking', level: 4 },
      { name: 'Driving', level: 4 },
      { name: 'Carpentry', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Coastal Childhood',
    description: 'Salt in everything: hair, air, engines. The water was the playground, the workplace, and the thing you learned to respect first.',
    age: 18,
    attributes: { clout: 10, celerity: 11, constitution: 11, focus: 10, flow: 10, willpower: 9, wisdom: 10, wit: 9 },
    skills: [
      { name: 'Swimming', level: 6 },
      { name: 'Navigation', level: 4 },
      { name: 'Survival', level: 3 },
      { name: 'Piloting', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Faith Community',
    description: 'Potlucks and choir practice, doctrine and doubt, and a hundred adults who knew your name and your business.',
    age: 18,
    attributes: { clout: 9, celerity: 9, constitution: 10, focus: 9, flow: 10, willpower: 12, wisdom: 12, wit: 9 },
    skills: [
      { name: 'Etiquette', level: 4 },
      { name: 'Public Speaking', level: 4 },
      { name: 'Insight', level: 4 },
      { name: 'Music Performance', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
  {
    name: 'Foster System',
    description: 'Homes, plural. A duffel bag that stayed half-packed, a radar for moods, and a promise to owe nobody anything.',
    age: 18,
    attributes: { clout: 9, celerity: 10, constitution: 10, focus: 10, flow: 9, willpower: 12, wisdom: 9, wit: 11 },
    skills: [
      { name: 'Streetwise', level: 4 },
      { name: 'Insight', level: 5 },
      { name: 'Cooking', level: 3 },
      { name: 'Stealth', level: 3 },
    ],
    nectars: [],
    thorns: [],
  },
];
