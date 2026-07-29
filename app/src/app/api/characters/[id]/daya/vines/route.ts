import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { seedInitialVines } from '@/daya/authoring';

export const dynamic = 'force-dynamic';

const seedVinesBodySchema = z.object({
  vines: z
    .array(
      z.object({
        description: z.string().min(3).max(500),
        priority: z.number().int().min(1).max(5).optional(),
        dormant: z.boolean().optional(),
        opportunity: z
          .object({
            description: z.string().min(3).max(1000),
            narrative: z.string().max(2000).optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(3),
});

// POST /api/characters/[id]/daya/vines — seed 1-3 initial goals ("vines")
// via the existing goal service (spec §2). GM/ADMIN only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = seedVinesBodySchema.parse(body);
    const result = await seedInitialVines(id, session.user.id, session.user.role, input.vines);
    return NextResponse.json({ vines: result });
  } catch (error) {
    return errorResponse(error);
  }
}
