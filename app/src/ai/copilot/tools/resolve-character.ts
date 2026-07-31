/**
 * Shared character-reference resolver for JEWL tools.
 *
 * JEWL (and the model behind him) frequently passes character NAMES
 * ("Violet") where a tool schema says characterId — the model knows the
 * fiction, not the database. Every tool that takes a character reference
 * should accept either: a real id wins, otherwise a case-insensitive
 * name match scoped to the campaign. Returns null when nothing matches
 * (ambiguity resolves to the most recently updated match — campaigns
 * rarely duplicate names, and a wrong-but-named pick is more useful to
 * the GM than a refusal).
 */
import 'server-only';
import { prisma } from '@/lib/db';

export interface ResolvedCharacterRef {
  id: string;
  name: string;
}

export async function resolveCharacterRef(
  campaignId: string,
  ref: string,
): Promise<ResolvedCharacterRef | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  // Exact id first (ids are CUIDs; a hit is unambiguous).
  const byId = await prisma.character.findFirst({
    where: { id: trimmed, campaignId },
    select: { id: true, name: true },
  });
  if (byId) return byId;

  // Name match, case-insensitive, campaign-scoped. SQLite Prisma has no
  // mode:'insensitive', so match in JS over the campaign's characters.
  const candidates = await prisma.character.findMany({
    where: { campaignId },
    select: { id: true, name: true },
    orderBy: { updatedAt: 'desc' },
  });
  const lower = trimmed.toLowerCase();
  const exact = candidates.find(c => c.name.toLowerCase() === lower);
  if (exact) return exact;
  const prefix = candidates.find(c => c.name.toLowerCase().startsWith(lower));
  return prefix ?? null;
}
