/**
 * Modern-Earth Branches — life chapters after the Root (post-18/25 canon).
 *
 * Branch KV = attribute levels + skill levels + net trait KV (same shape as
 * Root costing). Each Branch's years add break-even headroom at the ~5 KV/yr
 * sanity weight (r-2026-04-22-10/-11); the seeder computes KV and stores
 * frequency = KV − ageAdded×5 (signed; negative = the years covered it).
 * Kai's norm gauge flags KV-per-year outside ~3-15 — templates stay inside.
 *
 * Skill grants are ADDITIVE levels on top of whatever the character has.
 */

import type { BranchTemplate } from './types';

const ZERO = { clout: 0, celerity: 0, constitution: 0, focus: 0, flow: 0, willpower: 0, wisdom: 0, wit: 0 };

export const MODERN_BRANCHES: BranchTemplate[] = [
  {
    name: 'College Degree',
    description: 'Four years of lectures, all-nighters, cheap noodles, and one professor who changed everything.',
    ageAdded: 4,
    attributes: { ...ZERO, wit: 2, wisdom: 1, focus: 1 },
    skills: [
      { name: 'Research', level: 4 },
      { name: 'Writing', level: 3 },
      { name: 'Finance', level: 2 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 18+',
  },
  {
    name: 'Trade Apprenticeship',
    description: 'Three years under a master who was stingy with praise and generous with correction. The hands remember all of it.',
    ageAdded: 3,
    attributes: { ...ZERO, clout: 1, wit: 2, focus: 1 },
    skills: [
      { name: 'Mechanics', level: 5 },
      { name: 'Carpentry', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 16+',
  },
  {
    name: 'Military Service',
    description: 'A contract, a uniform, and the discovery of exactly where one\'s limits are — followed by the discovery that they move.',
    ageAdded: 4,
    attributes: { ...ZERO, constitution: 2, willpower: 2, focus: 1, clout: 1 },
    skills: [
      { name: 'Firearms', level: 5 },
      { name: 'Athletics', level: 3 },
      { name: 'First Aid', level: 3 },
      { name: 'Navigation', level: 2 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 18+',
  },
  {
    name: 'Medical Training',
    description: 'The long road: school, rotations, residency, and the first night someone lived because you were in the room.',
    ageAdded: 7,
    attributes: { ...ZERO, wit: 2, wisdom: 2, focus: 2, willpower: 1 },
    skills: [
      { name: 'Medicine', level: 8 },
      { name: 'First Aid', level: 4 },
      { name: 'Research', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 22+, prior degree or equivalent',
  },
  {
    name: 'Nursing Years',
    description: 'Twelve-hour shifts at the exact intersection of medicine and humanity. Nothing about people surprises you anymore.',
    ageAdded: 4,
    attributes: { ...ZERO, constitution: 1, wisdom: 2, willpower: 2, focus: 1 },
    skills: [
      { name: 'First Aid', level: 6 },
      { name: 'Medicine', level: 4 },
      { name: 'Insight', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 20+',
  },
  {
    name: 'Software Career',
    description: 'Standups, deploys, incidents at 3 a.m., and the quiet godlike joy of a green build.',
    ageAdded: 5,
    attributes: { ...ZERO, wit: 3, focus: 2 },
    skills: [
      { name: 'Programming', level: 7 },
      { name: 'Electronics', level: 3 },
      { name: 'Research', level: 2 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 18+',
  },
  {
    name: 'Long-Haul Years',
    description: 'A hundred thousand miles of highway, truck-stop coffee, audiobooks, and a country memorized at sixty-five miles an hour.',
    ageAdded: 4,
    attributes: { ...ZERO, constitution: 2, focus: 2, willpower: 1 },
    skills: [
      { name: 'Driving', level: 7 },
      { name: 'Mechanics', level: 3 },
      { name: 'Navigation', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 21+',
  },
  {
    name: 'Parenthood',
    description: 'Sleep became negotiable, patience became load-bearing, and love got a face that keeps changing.',
    ageAdded: 5,
    attributes: { ...ZERO, willpower: 3, wisdom: 2, constitution: 1 },
    skills: [
      { name: 'Cooking', level: 3 },
      { name: 'First Aid', level: 3 },
      { name: 'Insight', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Any age 18+',
  },
  {
    name: 'Service Industry Years',
    description: 'Tables, tickets, doubles, regulars. A master class in people, taken standing up.',
    ageAdded: 3,
    attributes: { ...ZERO, celerity: 2, wit: 1, willpower: 1, constitution: 1 },
    skills: [
      { name: 'Insight', level: 4 },
      { name: 'Cooking', level: 4 },
      { name: 'Persuasion', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 16+',
  },
  {
    name: 'The Startup Ride',
    description: 'Eighteen months of equity, adrenaline, and ramen; the exit was an education either way.',
    ageAdded: 3,
    attributes: { ...ZERO, wit: 2, willpower: 2, focus: 1 },
    skills: [
      { name: 'Finance', level: 4 },
      { name: 'Public Speaking', level: 4 },
      { name: 'Programming', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 20+',
  },
  {
    name: 'Year Abroad',
    description: 'One year somewhere the maps at home get wrong. Came back with a second language and a first perspective.',
    ageAdded: 1,
    attributes: { ...ZERO, wisdom: 1, wit: 1 },
    skills: [
      { name: 'Languages', level: 4 },
      { name: 'Navigation', level: 2 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 18+',
  },
  {
    name: 'Recovery Journey',
    description: 'The hardest project the bearer ever shipped was themselves, one day at a time, with witnesses.',
    ageAdded: 4,
    attributes: { ...ZERO, willpower: 4, wisdom: 2 },
    skills: [
      { name: 'Insight', level: 4 },
      { name: 'Public Speaking', level: 2 },
    ],
    nectars: ['Unshakeable'],
    thorns: [],
    requirements: 'A past worth leaving; GM conversation',
  },
  {
    name: 'Beat Cop Years',
    description: 'Five years of nights knowing a precinct block by block: its saints, its liars, and everyone commuting between the two.',
    ageAdded: 5,
    attributes: { ...ZERO, constitution: 1, willpower: 2, wisdom: 1, focus: 1 },
    skills: [
      { name: 'Streetwise', level: 5 },
      { name: 'Firearms', level: 4 },
      { name: 'Insight', level: 4 },
      { name: 'Law', level: 3 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 21+',
  },
  {
    name: 'Kitchen Line Years',
    description: 'Four years of heat, knives, and shouted French. Pressure stopped being a feeling and became a workplace.',
    ageAdded: 4,
    attributes: { ...ZERO, celerity: 2, constitution: 1, focus: 2 },
    skills: [
      { name: 'Cooking', level: 7 },
      { name: 'First Aid', level: 2 },
    ],
    nectars: [],
    thorns: [],
    requirements: 'Age 16+',
  },
];
