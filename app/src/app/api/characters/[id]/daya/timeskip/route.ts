import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { runTimeSkip } from '@/daya/timeskip';

export const dynamic = 'force-dynamic';

const timeSkipBodySchema = z.object({
  /** Mike's framing of the skipped stretch (e.g. "a week passes") — not
   * threaded into the model call directly (the vine_tick prompt is fixed,
   * WP9), but returned alongside the result so the UI can show what was
   * declared next to what happened. */
  framing: z.string().max(500).optional(),
  alsoDream: z.boolean().optional(),
});

// POST /api/characters/[id]/daya/timeskip — Ruling 15 time-skip (spec §6):
// vine_tick coarse Spirit-lite call -> World Adjudicator resolves -> stamped
// as a lived memory via adjudication_result, optional dream-tick thickening.
// GM/ADMIN only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = timeSkipBodySchema.parse(body);
    const result = await runTimeSkip(id, session.user.role, {}, input.alsoDream ?? false);
    return NextResponse.json({ framing: input.framing, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
