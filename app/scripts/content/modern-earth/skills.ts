/**
 * Modern-Earth skill definitions — global catalog entries (type 'skill').
 * Governors from SKILL_GOVERNORS (8 attributes; Frequency is never a governor).
 * Die ladder (locked): 1-3 flat, 4-5 d4, 6-7 d6, 8-11 d8, 12-19 d12, 20 d20.
 */

import type { SkillTemplate } from './types';

export const MODERN_SKILLS: SkillTemplate[] = [
  // ── Movement & body ──
  { name: 'Athletics', governors: ['clout', 'constitution', 'celerity'], description: 'Running, jumping, throwing, general physical performance.' },
  { name: 'Swimming', governors: ['constitution', 'celerity'], description: 'Staying alive and fast in the water.' },
  { name: 'Climbing', governors: ['clout', 'celerity'], description: 'Walls, ropes, cliffs, scaffolding, fences at 2 a.m.' },
  { name: 'Stealth', governors: ['celerity', 'focus'], description: 'Moving unseen and unheard; blending into crowds.' },
  { name: 'Sleight of Hand', governors: ['celerity', 'wit'], description: 'Palming, picking, planting, and every quick-fingered trade.' },

  // ── Combat ──
  { name: 'Melee Combat', governors: ['clout', 'celerity'], description: 'Fighting with handheld weapons, from kitchen knife to baseball bat.' },
  { name: 'Unarmed Combat', governors: ['clout', 'celerity'], description: 'Boxing, wrestling, martial arts — the body as the weapon.' },
  { name: 'Firearms', governors: ['focus', 'celerity'], description: 'Handling, aiming, and maintaining guns of all common types.' },
  { name: 'Archery', governors: ['focus', 'clout'], description: 'Bows and crossbows, from range targets to hunting.' },

  // ── Vehicles ──
  { name: 'Driving', governors: ['celerity', 'focus'], description: 'Cars, trucks, motorcycles — ordinary and decidedly not.' },
  { name: 'Piloting', governors: ['focus', 'celerity'], description: 'Aircraft, drones, boats: vehicles where the ground is optional.' },

  // ── Practical trades ──
  { name: 'Mechanics', governors: ['wit', 'clout'], description: 'Engines, machines, and moving parts: diagnosis and repair.' },
  { name: 'Electronics', governors: ['wit', 'focus'], description: 'Circuits, wiring, gadget repair, hardware hacking.' },
  { name: 'Programming', governors: ['wit', 'focus'], description: 'Writing, reading, and breaking software.' },
  { name: 'Carpentry', governors: ['clout', 'wit'], description: 'Building and fixing things in wood, from shelves to house frames.' },
  { name: 'Cooking', governors: ['wit', 'focus'], description: 'Turning ingredients into morale. Professional or survival grade.' },
  { name: 'First Aid', governors: ['wit', 'focus'], description: 'Stabilizing the hurt: CPR, wounds, shock, field dressing.' },
  { name: 'Medicine', governors: ['wisdom', 'wit'], description: 'Clinical diagnosis and treatment beyond first response.' },

  // ── Knowledge & mind ──
  { name: 'Research', governors: ['wit', 'wisdom'], description: 'Finding what is known: archives, databases, sources, the deep web of libraries.' },
  { name: 'Finance', governors: ['wit', 'wisdom'], description: 'Money and its habits: accounts, markets, fraud, and where it hides.' },
  { name: 'Law', governors: ['wisdom', 'wit'], description: 'Statutes, procedure, contracts, and the gaps between them.' },
  { name: 'Navigation', governors: ['wit', 'focus'], description: 'Maps, headings, dead reckoning, and never being truly lost.' },
  { name: 'Survival', governors: ['constitution', 'wisdom'], description: 'Shelter, water, fire, and food where none is provided.' },
  { name: 'Languages', governors: ['wit', 'wisdom'], description: 'Acquiring and using tongues beyond one\'s first.' },

  // ── Social ──
  { name: 'Persuasion', governors: ['wisdom', 'wit'], description: 'Moving people with reason, charm, and well-chosen truth.' },
  { name: 'Deception', governors: ['wit', 'willpower'], description: 'Moving people with well-chosen everything else.' },
  { name: 'Intimidation', governors: ['clout', 'willpower'], description: 'Making compliance the comfortable option.' },
  { name: 'Insight', governors: ['wisdom', 'focus'], description: 'Reading people: tells, moods, and the sentence under the sentence.' },
  { name: 'Streetwise', governors: ['wit', 'wisdom'], description: 'Who runs what, where not to be, and what things really cost.' },
  { name: 'Etiquette', governors: ['wisdom', 'willpower'], description: 'The unwritten rules of any given room, and how to pass among them.' },
  { name: 'Public Speaking', governors: ['willpower', 'wit'], description: 'Holding a room: speeches, pitches, sermons, stand-up.' },

  // ── Expression ──
  { name: 'Music Performance', governors: ['flow', 'focus'], description: 'Playing, singing, moving a room through sound.' },
  { name: 'Writing', governors: ['wit', 'wisdom'], description: 'Prose, journalism, scripts: the craft of the written word.' },
  { name: 'Photography', governors: ['focus', 'wit'], description: 'Seeing, framing, and catching the moment that matters.' },
  { name: 'Animal Handling', governors: ['wisdom', 'flow'], description: 'Calming, training, and working with animals.' },
];
