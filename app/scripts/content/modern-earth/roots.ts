/**
 * Modern-Earth Roots — upbringings to age 18 (canon max start age 25).
 *
 * Root KV = attribute levels + skill levels + net trait KV + named grants +
 * ACCUMULATED WEALTH (Mike ruling 2026-10-16 — the material lines live
 * INSIDE the TKV and compete with attributes). Frequency cost = KV −
 * break-even; the regrade lifted every root by ~50 at root scale, so the
 * break-even moved with it (150 at age 18; see seed-modern-earth.ts and
 * forge-pricing.ts). The seeder computes KV and frequency from these
 * templates — numbers here are the content, not the price.
 *
 * Design (regrade 2026-10-16, drafts for Mike): attribute levels sum ≈90
 * (a functioning 18-year-old), 4-5 skills at levels 3-7 (soft creation cap
 * 10), zero or one bundled trait, ONE or TWO named grants (stock archetypes
 * genesis pulls free and paints), and accumulated wealth 12-28 KV scaled to
 * the household's means (Foster < Artist < Working-class < Suburban <
 * Academic). Personal thorns (health, history) are deliberately NOT baked
 * into upbringings — those are the player's own choices, made separately.
 * An upbringing shapes you; it doesn't diagnose you.
 */

import type { RootTemplate } from './types';

export const MODERN_ROOTS: RootTemplate[] = [
  {
    name: 'Suburban Childhood',
    description: 'Lawns, homework, group chats, a learner\'s permit at fifteen. An ordinary launchpad — which is to say, a good one.',
    age: 18,
    attributes: { clout: 10, celerity: 11, constitution: 11, focus: 11, flow: 10, willpower: 11, wisdom: 13, wit: 13 },
    skills: [
      { name: 'Driving', level: 5 },
      { name: 'Research', level: 5 },
      { name: 'Etiquette', level: 3 },
      { name: 'Athletics', level: 3 },
      { name: 'Cooking', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Laptop', description: 'The graduation laptop — stickers, a cracked corner, every essay ever written.', kv: 10 },
    ],
    accumulatedWealth: 26,
  },
  {
    name: 'Rural Upbringing',
    description: 'Animals before dawn, machinery before breakfast, weather as a household member. Work was never abstract.',
    age: 18,
    attributes: { clout: 12, celerity: 11, constitution: 13, focus: 10, flow: 11, willpower: 11, wisdom: 12, wit: 10 },
    skills: [
      { name: 'Animal Handling', level: 5 },
      { name: 'Mechanics', level: 4 },
      { name: 'Driving', level: 4 },
      { name: 'Survival', level: 4 },
      { name: 'Carpentry', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Toolbox (Stocked)', description: 'A grandfather\'s toolbox, every drawer labelled in two hands.', kv: 6 },
      { name: 'Pocket Knife', description: 'Carried since the age the house decided it was allowed.', kv: 5 },
    ],
    accumulatedWealth: 24,
  },
  {
    name: 'Inner-City Streets',
    description: 'Four locks on the door and a map of the neighborhood written in instinct: which corners, which hours, which faces.',
    age: 18,
    attributes: { clout: 10, celerity: 13, constitution: 11, focus: 11, flow: 10, willpower: 11, wisdom: 10, wit: 14 },
    skills: [
      { name: 'Streetwise', level: 7 },
      { name: 'Athletics', level: 5 },
      { name: 'Sleight of Hand', level: 3 },
      { name: 'Insight', level: 4 },
      { name: 'Persuasion', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Skateboard', description: 'Transport, seat, and occasionally argument.', kv: 3 },
      { name: 'Pocket Knife', description: 'Never shown; always there.', kv: 5 },
    ],
    accumulatedWealth: 22,
  },
  {
    name: 'Military Family',
    description: 'Seven schools in twelve years. Boxes never fully unpacked, friendships made fast, discipline ambient as air.',
    age: 18,
    attributes: { clout: 11, celerity: 11, constitution: 12, focus: 12, flow: 9, willpower: 12, wisdom: 11, wit: 12 },
    skills: [
      { name: 'Athletics', level: 4 },
      { name: 'Etiquette', level: 4 },
      { name: 'Navigation', level: 4 },
      { name: 'Firearms', level: 4 },
      { name: 'First Aid', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Hiking Backpack (65L)', description: 'The one bag that always went first and came out last.', kv: 6 },
      { name: 'Multitool', description: 'A parent\'s hand-me-down, worn smooth.', kv: 4 },
      { name: 'Duffel Bag (Large)', description: 'Half-packed by habit.', kv: 1 },
    ],
    accumulatedWealth: 26,
  },
  {
    name: 'First-Generation Household',
    description: 'Two languages at the dinner table, three jobs between two parents, and the quiet weight of being the reason they came.',
    age: 18,
    attributes: { clout: 10, celerity: 10, constitution: 11, focus: 11, flow: 10, willpower: 12, wisdom: 12, wit: 13 },
    skills: [
      { name: 'Languages', level: 6 },
      { name: 'Cooking', level: 5 },
      { name: 'Finance', level: 4 },
      { name: 'Etiquette', level: 3 },
      { name: 'Persuasion', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Kitchen Kit', description: 'The pans that crossed the border, the recipes that live in them.', kv: 3 },
      { name: 'Sewing Machine', description: 'A mother\'s second income, then a child\'s inheritance.', kv: 2 },
    ],
    accumulatedWealth: 28,
  },
  {
    name: 'Homeschooled',
    description: 'The kitchen table was the classroom and curiosity set the curriculum. Socialization happened on purpose or not at all.',
    age: 18,
    attributes: { clout: 10, celerity: 10, constitution: 10, focus: 12, flow: 10, willpower: 11, wisdom: 13, wit: 13 },
    skills: [
      { name: 'Research', level: 7 },
      { name: 'Writing', level: 5 },
      { name: 'Music Performance', level: 3 },
      { name: 'Cooking', level: 3 },
      { name: 'Languages', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Bookshelf', description: 'The curriculum, in the order it was discovered.', kv: 2 },
      { name: 'Digital Keyboard (61-key)', description: 'Music hour, every weekday, for eleven years.', kv: 3 },
      { name: 'Notebook & Pen', description: 'The current volume of a lifelong habit.', kv: 1 },
    ],
    accumulatedWealth: 26,
  },
  {
    name: 'Academic Household',
    description: 'Bookshelves as furniture, dinner-table debates with citation requests, report cards read like peer reviews.',
    age: 18,
    attributes: { clout: 9, celerity: 10, constitution: 10, focus: 11, flow: 10, willpower: 11, wisdom: 14, wit: 14 },
    skills: [
      { name: 'Research', level: 7 },
      { name: 'Law', level: 3 },
      { name: 'Writing', level: 5 },
      { name: 'Public Speaking', level: 3 },
      { name: 'Languages', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Laptop', description: 'Bought for the first thesis the household expected of a fourteen-year-old.', kv: 10 },
      { name: 'Bookshelf', description: 'One of many; this one was yours.', kv: 2 },
    ],
    accumulatedWealth: 26,
  },
  {
    name: 'Athlete\'s Youth',
    description: 'Five a.m. practices, taped ankles, the particular silence of a locker room after a loss. The body was the project.',
    age: 18,
    attributes: { clout: 12, celerity: 14, constitution: 14, focus: 11, flow: 10, willpower: 11, wisdom: 9, wit: 9 },
    skills: [
      { name: 'Athletics', level: 7 },
      { name: 'Swimming', level: 4 },
      { name: 'First Aid', level: 4 },
      { name: 'Public Speaking', level: 3 },
      { name: 'Driving', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Mountain Bike', description: 'Cross-training that became the way to get anywhere.', kv: 12 },
      { name: 'Adjustable Dumbbells', description: 'The garage gym, what is left of it.', kv: 2 },
      { name: 'Athletic Wear Set', description: 'Team colors, faded.', kv: 1 },
    ],
    accumulatedWealth: 20,
  },
  {
    name: 'Artist\'s Household',
    description: 'Paint on every doorknob, instruments as furniture, money as an occasional guest. Beauty was non-negotiable; rent was.',
    age: 18,
    attributes: { clout: 10, celerity: 11, constitution: 10, focus: 12, flow: 14, willpower: 10, wisdom: 11, wit: 12 },
    skills: [
      { name: 'Music Performance', level: 6 },
      { name: 'Photography', level: 4 },
      { name: 'Writing', level: 4 },
      { name: 'Sleight of Hand', level: 3 },
      { name: 'Persuasion', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'DSLR Camera', description: 'A parent\'s working camera, inherited when they went digital-only.', kv: 6 },
      { name: 'Acoustic Guitar', description: 'The house guitar; nobody remembers whose it was first.', kv: 3 },
      { name: 'Paint & Supplies Kit', description: 'Half-used tubes, a hundred brushes, one good one.', kv: 2 },
    ],
    accumulatedWealth: 16,
  },
  {
    name: 'Working-Class Grind',
    description: 'Everyone in the house had shifts, and the house itself seemed to have one. You learned to fix it, cook it, or do without it.',
    age: 18,
    attributes: { clout: 12, celerity: 11, constitution: 13, focus: 10, flow: 10, willpower: 12, wisdom: 10, wit: 12 },
    skills: [
      { name: 'Mechanics', level: 5 },
      { name: 'Cooking', level: 5 },
      { name: 'Driving', level: 4 },
      { name: 'Carpentry', level: 3 },
      { name: 'First Aid', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Toolbox (Stocked)', description: 'Assembled one paycheck at a time.', kv: 6 },
      { name: 'Work Boots (Steel Toe)', description: 'The first pair bought with own money.', kv: 3 },
    ],
    accumulatedWealth: 24,
  },
  {
    name: 'Coastal Childhood',
    description: 'Salt in everything: hair, air, engines. The water was the playground, the workplace, and the thing you learned to respect first.',
    age: 18,
    attributes: { clout: 11, celerity: 12, constitution: 12, focus: 11, flow: 12, willpower: 10, wisdom: 12, wit: 10 },
    skills: [
      { name: 'Swimming', level: 7 },
      { name: 'Navigation', level: 5 },
      { name: 'Survival', level: 3 },
      { name: 'Piloting', level: 3 },
      { name: 'First Aid', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Fishing Rod & Tackle', description: 'Taught by someone who is in every memory of it.', kv: 2 },
      { name: 'Two-Person Tent', description: 'Beach nights, then everywhere else.', kv: 4 },
      { name: 'Pocket Knife', description: 'For line, bait and the occasional splinter.', kv: 5 },
    ],
    accumulatedWealth: 24,
  },
  {
    name: 'Faith Community',
    description: 'Potlucks and choir practice, doctrine and doubt, and a hundred adults who knew your name and your business.',
    age: 18,
    attributes: { clout: 10, celerity: 10, constitution: 11, focus: 10, flow: 12, willpower: 14, wisdom: 13, wit: 10 },
    skills: [
      { name: 'Etiquette', level: 4 },
      { name: 'Public Speaking', level: 5 },
      { name: 'Insight', level: 5 },
      { name: 'Music Performance', level: 3 },
      { name: 'Cooking', level: 3 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Business Suit', description: 'Sunday clothes that became interview clothes.', kv: 4 },
      { name: 'Acoustic Guitar', description: 'Youth group, then everything after.', kv: 3 },
      { name: 'Everyday Outfit', description: 'Modest, mended, clean.', kv: 1 },
    ],
    accumulatedWealth: 26,
  },
  {
    name: 'Foster System',
    description: 'Homes, plural. A duffel bag that stayed half-packed, a radar for moods, and a promise to owe nobody anything.',
    age: 18,
    attributes: { clout: 11, celerity: 12, constitution: 12, focus: 12, flow: 10, willpower: 14, wisdom: 10, wit: 13 },
    skills: [
      { name: 'Streetwise', level: 5 },
      { name: 'Insight', level: 6 },
      { name: 'Cooking', level: 4 },
      { name: 'Stealth', level: 4 },
      { name: 'Persuasion', level: 4 },
    ],
    nectars: [],
    thorns: [],
    possessions: [
      { name: 'Duffel Bag (Large)', description: 'The constant. Everything that mattered fit in it.', kv: 1 },
      { name: 'Burner Phone', description: 'The number nobody from any of the houses has.', kv: 5 },
    ],
    accumulatedWealth: 12,
  },
];
