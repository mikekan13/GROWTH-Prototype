/**
 * Genesis AGE stage (2026-10-12) — age is ADDITIVE (r-2026-08-19-01):
 * starting age = Σ years over the character's roots + branches (seeds add 0);
 * current age = currentCycle − birthCycle; fatedAge lives top-level (the
 * seed's lifespan, Violet 80).
 *
 * The years are the BEARER'S (how long SHE spent in the household), so they
 * are written on her block instance (CharacterBlockLink.ageAdded); the
 * archetype's ageAdded stays its default and its mechanics never change
 * (narrative paint law, 2026-10-12). When the brief states an AGE the years
 * must sum to it exactly — Violet's drafts summed 18+2+6 = 26 against AGE 25.
 *
 * identity.age is the legacy display fallback (cards read it) — set too.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { findGenesisSession } from './block-attachment';
import { liveBlockLinks, type LinkWithBlock } from './genesis-sheet-sync';
import { briefAge, startingAgeFromLinks } from '@/lib/genesis-stages';
import type { GrowthCharacter } from '@/types/growth';

/** Canon: roots run from birth, max 25 years (r-2026-04-22-11). */
export const ROOT_MAX_YEARS = 25;

export const setStartingAgeSchema = z.object({
  characterId: z.string().min(1).max(64),
  years: z.array(z.object({
    block: z.string().min(1).max(200).describe('Root/branch: block id, link id, archetype name or her local name.'),
    ageAdded: z.number().int().min(0).max(1000).describe('Calendar years SHE spent in it (a duration, not an age).'),
  })).max(20).optional().describe('Her years per root/branch. Omit when the blocks already sum to the brief\'s AGE.'),
});

function archetypeYears(link: LinkWithBlock): number | null {
  try {
    const d = JSON.parse(link.block.data) as { ageAdded?: unknown };
    return typeof d.ageAdded === 'number' ? d.ageAdded : null;
  } catch { return null; }
}

/** Resolve a year-assignment's block ref against her root/branch links. Pure. */
export function findAgeLink(links: LinkWithBlock[], ref: string): LinkWithBlock | undefined {
  const r = ref.trim().toLowerCase();
  const timed = links.filter(l => l.block.type === 'root' || l.block.type === 'branch');
  return timed.find(l => l.id === ref || l.forgeItemId === ref)
    ?? timed.find(l => l.block.name.toLowerCase() === r)
    ?? timed.find(l => (l.localName ?? '').toLowerCase() === r);
}

export interface AgePlan {
  age: number;
  overrides: Array<{ linkId: string; ageAdded: number }>;
  years: Array<{ block: string; localName: string | null; type: string; years: number }>;
}

/** The years per block after the assignment, and the starting age. Pure. Throws on a bad plan. */
export function planStartingAge(links: LinkWithBlock[], assign: Array<{ block: string; ageAdded: number }>, target: number | null): AgePlan {
  const overrides = new Map<string, number>();
  for (const a of assign) {
    const link = findAgeLink(links, a.block);
    if (!link) throw new ValidationError(`No root/branch "${a.block}" on this character.`);
    if (link.block.type === 'root' && a.ageAdded > ROOT_MAX_YEARS) {
      throw new ValidationError(`A root covers at most ${ROOT_MAX_YEARS} years ("${link.block.name}": ${a.ageAdded}).`);
    }
    overrides.set(link.id, a.ageAdded);
  }
  const timed = links.filter(l => l.block.type === 'root' || l.block.type === 'branch');
  const years = timed.map(l => ({
    block: l.block.name,
    localName: l.localName,
    type: l.block.type,
    years: Math.max(0, overrides.get(l.id) ?? l.ageAdded ?? archetypeYears(l) ?? 0),
  }));
  const age = startingAgeFromLinks(timed.map(l => ({
    type: l.block.type,
    instanceYears: overrides.get(l.id) ?? l.ageAdded,
    archetypeYears: archetypeYears(l),
  })));
  if (target != null && timed.length > 0 && age !== target) {
    throw new ValidationError(
      `Her years sum to ${age}, but the brief's AGE is ${target}. Assign her years per block so they sum to ${target}: ` +
      years.map(y => `${y.type} "${y.block}"${y.localName ? ` (${y.localName})` : ''} = ${y.years}`).join('; '),
    );
  }
  return { age: timed.length ? age : (target ?? 0), overrides: [...overrides].map(([linkId, ageAdded]) => ({ linkId, ageAdded })), years };
}

/** Write her instance years, identity.age, birthCycle and the top-level fatedAge. */
export async function setStartingAge(campaignId: string, input: unknown) {
  const p = setStartingAgeSchema.parse(input);
  const character = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true, data: true } });
  if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  const sheet = JSON.parse(character.data) as GrowthCharacter;
  const links = await liveBlockLinks(p.characterId);
  const session = await findGenesisSession(campaignId, p.characterId);
  const target = briefAge(session?.plan) ?? (links.some(l => l.block.type === 'root' || l.block.type === 'branch') ? null : sheet.identity?.age ?? null);
  const plan = planStartingAge(links, p.years ?? [], target);

  for (const o of plan.overrides) {
    await prisma.characterBlockLink.update({ where: { id: o.linkId }, data: { ageAdded: o.ageAdded } });
  }
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
  const currentCycle = campaign?.currentCycle ?? 0;
  const seedLink = links.find(l => l.block.type === 'seed');
  let seedFated: number | null = null;
  try { const d = seedLink ? JSON.parse(seedLink.block.data) as { fatedAge?: unknown } : {}; seedFated = typeof d.fatedAge === 'number' ? d.fatedAge : null; } catch { /* none */ }

  sheet.identity = { ...sheet.identity, age: plan.age };
  sheet.birthCycle = currentCycle - plan.age;
  if (!sheet.fatedAge && seedFated) sheet.fatedAge = seedFated;
  await prisma.character.update({ where: { id: p.characterId }, data: { data: JSON.stringify(sheet) } });
  return { age: plan.age, birthCycle: sheet.birthCycle, fatedAge: sheet.fatedAge ?? null, years: plan.years };
}
