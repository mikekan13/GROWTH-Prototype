import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import {
  getDripConfig,
  setDripConfig,
  dripConfigPatchSchema,
  getMistakeBountyConfig,
  setMistakeBountyConfig,
  mistakeBountyPatchSchema,
} from '@/services/economy-config';

export const dynamic = 'force-dynamic';

// GET /api/admin/economy-config — current tunable economy constants.
export async function GET() {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const [drip, mistakeBounty] = await Promise.all([
      getDripConfig(),
      getMistakeBountyConfig(),
    ]);
    return NextResponse.json({ drip, mistakeBounty });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/admin/economy-config — override tunables. ADMIN only.
// Body: { drip?: Partial<DripConfig>, mistakeBounty?: Partial<MistakeBountyConfig> }.
// Values merge over the current config; nothing here mints KRMA (INV-13) — it
// only changes transfer sizes.
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const body = await request.json().catch(() => ({}));

    const drip = body?.drip
      ? await setDripConfig(dripConfigPatchSchema.parse(body.drip), session.user.id)
      : await getDripConfig();
    const mistakeBounty = body?.mistakeBounty
      ? await setMistakeBountyConfig(mistakeBountyPatchSchema.parse(body.mistakeBounty), session.user.id)
      : await getMistakeBountyConfig();

    return NextResponse.json({ drip, mistakeBounty });
  } catch (error) {
    return errorResponse(error);
  }
}
