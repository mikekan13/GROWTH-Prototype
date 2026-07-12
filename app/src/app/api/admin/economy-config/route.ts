import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { getDripConfig, setDripConfig, dripConfigPatchSchema } from '@/services/economy-config';

export const dynamic = 'force-dynamic';

// GET /api/admin/economy-config — current tunable economy constants.
export async function GET() {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const drip = await getDripConfig();
    return NextResponse.json({ drip });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/admin/economy-config — override drip anchors. ADMIN only.
// Body: { drip: Partial<DripConfig> }. Values are merged over the current
// config; nothing here mints KRMA (INV-13) — it only changes transfer sizes.
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const body = await request.json().catch(() => ({}));
    const patch = dripConfigPatchSchema.parse(body?.drip ?? {});
    const drip = await setDripConfig(patch, session.user.id);
    return NextResponse.json({ drip });
  } catch (error) {
    return errorResponse(error);
  }
}
