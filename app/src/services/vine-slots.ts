/**
 * A character's GRO.vine slots, read from her seed. Kept apart from
 * genesis-vines.ts (which pulls the goal/dispatcher graph) so the genesis
 * stage check can import it without a cycle.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { vineSlotsForSeed } from '@/lib/vine-slots';
import { liveBlockLinks } from './genesis-sheet-sync';

async function seedDataOf(characterId: string, sheetData: string): Promise<Record<string, unknown> | null> {
  let seedId: string | undefined;
  try { seedId = (JSON.parse(sheetData) as { creation?: { seedForgeItemId?: string } }).creation?.seedForgeItemId; } catch { /* none */ }
  if (!seedId) seedId = (await liveBlockLinks(characterId)).find(l => l.block.type === 'seed')?.block.id;
  if (!seedId) return null;
  const row = await prisma.forgeItem.findUnique({ where: { id: seedId }, select: { data: true } });
  try { return row ? JSON.parse(row.data) as Record<string, unknown> : null; } catch { return null; }
}

/** Vine slots this character's seed grants. */
export async function vineSlotsForCharacter(characterId: string, sheetData: string): Promise<number> {
  return vineSlotsForSeed(await seedDataOf(characterId, sheetData));
}
