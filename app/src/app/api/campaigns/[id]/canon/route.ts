import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listCanon, memoryVersusTruth, readVineForWatcher } from '@/services/canon';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  sinceCycle: z.coerce.number().optional(),
  untilCycle: z.coerce.number().optional(),
  actorId: z.string().optional(),
  targetId: z.string().optional(),
  kind: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  /** When set, returns this character's memories beside the canon they point at instead of the ledger. */
  versusCharacterId: z.string().optional(),
  /** When set, returns the vine (custodian + resistance entries) for this goal instead of the ledger. */
  goalId: z.string().optional(),
});

// GET /api/campaigns/[id]/canon — the infallible ledger, the Watcher's view (GM/ADMIN only).
// No POST/PATCH/DELETE exists: canon is written by the simulation and the table, never edited.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const q = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const actor = { userId: session.user.id, role: session.user.role };
    if (q.versusCharacterId) {
      return NextResponse.json({ versus: await memoryVersusTruth(campaignId, actor, q.versusCharacterId, q.limit) });
    }
    if (q.goalId) {
      return NextResponse.json({ vine: await readVineForWatcher(campaignId, actor, q.goalId) });
    }
    return NextResponse.json({ canon: await listCanon(campaignId, actor, q) });
  } catch (error) {
    return errorResponse(error);
  }
}
