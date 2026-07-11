/**
 * JEWL's godhead identity lookup.
 *
 * JEWL runs in the ai/copilot pipeline but ALSO has a GodHead row (seeded by
 * scripts/seed-godheads.ts) so he can:
 *   - own a wallet (mistake-bounty mechanic per [[jewl-is-the-interface-2026-06-15]])
 *   - author Forge blueprints via the existing draft → Kai chain
 *   - be a routable target for Et'herling's route_to_godhead orchestration
 *
 * This module is the bridge: copilot tools that need JEWL's GodHead row
 * (or his Character row, his user, his wallet) call `getJewlGodHead()`
 * and get a stable handle.
 *
 * See [[forge-chain-recon-2026-06-16]].
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

export const JEWL_GODHEAD_NAME = 'JEWL';

/** The only label non-ADMIN users ever see (INV-69 — the mask is the point). */
export const JEWL_PUBLIC_LABEL = 'Copilot';

/**
 * Mask JEWL's name at serialization boundaries (INV-69/70). Every API
 * response that can carry a godhead name to a non-ADMIN viewer must pass
 * it through here. Other godhead names pass through untouched.
 */
export function maskJewlName(name: string, viewerRole: string): string {
  if (viewerRole === 'ADMIN') return name;
  return name === JEWL_GODHEAD_NAME ? JEWL_PUBLIC_LABEL : name;
}

export interface JewlGodHeadHandle {
  godHeadId: string;
  godHeadName: string;
  characterId: string;
  /** The user that "owns" JEWL's Character row — used as authorUserId on
   *  ForgeItems JEWL drafts, and for any other userId-keyed write. */
  characterUserId: string;
  walletId: string | null;
}

let cached: JewlGodHeadHandle | null = null;

/**
 * Look up JEWL's GodHead row. Cached in-process after the first hit since
 * the row never changes during the lifetime of a server process.
 *
 * Throws NotFoundError if the seed hasn't been run yet — that's a
 * configuration error, not a runtime condition.
 */
export async function getJewlGodHead(): Promise<JewlGodHeadHandle> {
  if (cached) return cached;
  const row = await prisma.godHead.findUnique({
    where: { name: JEWL_GODHEAD_NAME },
    include: { character: { select: { id: true, userId: true } } },
  });
  if (!row) {
    throw new NotFoundError(
      'JEWL GodHead row missing. Run: npx tsx scripts/seed-godheads.ts',
    );
  }
  cached = {
    godHeadId: row.id,
    godHeadName: row.name,
    characterId: row.character.id,
    characterUserId: row.character.userId,
    walletId: row.walletId,
  };
  return cached;
}
