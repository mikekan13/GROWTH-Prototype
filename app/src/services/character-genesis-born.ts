/**
 * Born → awake (perf pass 2026-10-12). Found live: Violet finished genesis
 * with DayaEntity.status=DORMANT, so the table loop could not voice her
 * (daya/conversation.ts answers 'dormant' for anything not ACTIVE). When a
 * genesis session reaches its final stage (status 'done' = Born), the
 * character is wrapped as a DAYA entity if she is not yet (the 1:1 entity +
 * affect baseline wrapCharacterAsDaya creates) and set ACTIVE.
 *
 * Character.status (the sheet's review/lock lifecycle) is NOT touched — the
 * dossier still awaits the GM's review; committing it is ratification.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { wrapCharacterAsDaya } from '@/daya/authoring';
import { parseGenesisGoal } from './character-genesis-progress';

/** Wrap + wake the character a finished genesis built. Returns her id, or
 *  null when the goal names no character. Throws on DB failure — callers
 *  treat it as best-effort. */
export async function awakenGenesisCharacter(goal: string): Promise<string | null> {
  const parsed = parseGenesisGoal(goal);
  if (!parsed) return null;
  // GODHEAD: the system acting for JEWL — the wrap is Watcher-and-above.
  await wrapCharacterAsDaya(parsed.characterId, 'GODHEAD');
  await prisma.dayaEntity.update({
    where: { characterId: parsed.characterId },
    data: { status: 'ACTIVE' },
  });
  return parsed.characterId;
}
