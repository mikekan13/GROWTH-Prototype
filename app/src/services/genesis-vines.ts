/**
 * Genesis VINES stage (Mike 2026-10-12): "GRO.vines are chosen by the AI
 * (would be overwritten by a trailblazer in an entity's seat) just like
 * simulation."
 *
 * A GRO.vine is a THREE-AUTHOR contract (GROVINE-TRUE-DESIGN-2026-08-19):
 * Goal (the entity), Resistance (the Watcher), Opportunity (the godhead).
 * Genesis authors ONLY the Goal third, marked authoredBy 'ai'; a seated
 * Trailblazer's edit overwrites it (services/goal.ts → 'trailblazer').
 * Resistance and Opportunity are never written here.
 *
 * Slots are a SEED stat (avg 3; the Human seed's "Ambitious" nectar +1 → 4).
 * No seed in the catalog carries a slot field yet: `grovineSlots` is read
 * when present, else 3; +1 for Ambitious. Capped by MAX_ACTIVE_GOALS.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { emit as emitGodHeadEvent } from './godhead-dispatcher';
import { MAX_ACTIVE_GOALS } from '@/lib/vine-slots';
import { pronounsForSheet, withPronouns } from '@/lib/appearance-designer';
import { vineSlotsForCharacter } from './vine-slots';

export { DEFAULT_VINE_SLOTS, vineSlotsForSeed } from '@/lib/vine-slots';
export { vineSlotsForCharacter } from './vine-slots';
export const AI_AUTHOR = 'ai';

export const authorVineGoalSchema = z.object({
  characterId: z.string().min(1).max(64),
  goals: z.array(z.object({
    description: z.string().min(3).max(300).describe('The want, in the character\'s own terms ("Finish the reincarnation book"). Goal only — no resistance, no opportunity.'),
    priority: z.number().int().min(1).max(5).optional(),
  })).min(1).max(MAX_ACTIVE_GOALS),
});

/** Write AI-chosen vine GOALS into her free slots. */
export async function authorVineGoals(campaignId: string, input: unknown) {
  const p = authorVineGoalSchema.parse(input);
  const character = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true, data: true } });
  if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  const slots = await vineSlotsForCharacter(p.characterId, character.data);
  const active = await prisma.goal.findMany({ where: { characterId: p.characterId, status: 'ACTIVE' }, select: { description: true } });
  const free = slots - active.length;
  if (p.goals.length > free) {
    throw new ValidationError(withPronouns(`{Possessive} seed gives ${slots} GRO.vine slot${slots === 1 ? '' : 's'}; ${active.length} in use — author at most ${Math.max(0, free)}.`, pronounsForSheet(character.data)));
  }
  const seen = new Set(active.map(a => a.description.trim().toLowerCase()));
  const created: Array<{ id: string; description: string }> = [];
  for (const g of p.goals) {
    const key = g.description.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const goal = await prisma.goal.create({
      data: {
        characterId: p.characterId,
        campaignId,
        description: g.description.trim(),
        priority: g.priority ?? 3,
        authoredBy: AI_AUTHOR,
      },
    });
    created.push({ id: goal.id, description: goal.description });
    // The Terminal's custodian triage, as for any new vine (services/goal.ts).
    void emitGodHeadEvent('goal.created', {
      goalId: goal.id, characterId: goal.characterId, campaignId: goal.campaignId, description: goal.description, priority: goal.priority,
    }).catch(() => { /* dispatcher logs its own failures */ });
  }
  return { slots, used: active.length + created.length, created };
}
