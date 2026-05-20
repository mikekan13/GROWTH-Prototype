import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { runDripForAll, runDripForUser } from '@/services/subscription';

export const dynamic = 'force-dynamic';

const PostSchema = z.object({
  /** Optional — drip a single user. Omit to drip all eligible subscriptions. */
  userId: z.string().optional(),
  /** Optional — override "now" for time travel / testing. ISO string. */
  asOf: z.string().datetime().optional(),
});

// POST /api/admin/subscription-drip
//
// Admin-triggered drip run. Idempotent per (user, monthIndex). Use the
// `userId` field to drip a specific user; omit it to run for all
// ACTIVE/FREE subscriptions.
//
// This endpoint is the manual lever; a scheduled job (cron) should hit
// the same logic via `runDripForAll`. The cron path lives in
// `cron/subscription-drip-job.ts` (TBD) — same call, different invocation
// surface.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) {
      throw new ForbiddenError('Admin only');
    }
    const body = await request.json().catch(() => ({}));
    const input = PostSchema.parse(body);
    const now = input.asOf ? new Date(input.asOf) : new Date();

    if (input.userId) {
      const result = await runDripForUser(input.userId, session.user.id, now);
      return NextResponse.json({ scope: 'user', userId: input.userId, ...result });
    }
    const result = await runDripForAll(session.user.id, now);
    return NextResponse.json({ scope: 'all', ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
