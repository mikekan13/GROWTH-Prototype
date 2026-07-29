import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { seedEntityMemories } from '@/daya/authoring';

export const dynamic = 'force-dynamic';

const seedMemoriesBodySchema = z.object({
  memories: z
    .array(
      z.object({
        content: z.string().min(1).max(2000),
        valence: z.number().min(-1).max(1).optional(),
        arousal: z.number().min(0).max(1).optional(),
        salience: z.number().min(0).max(1).optional(),
        cycle: z.number().optional(),
        source: z.string().max(64).optional(),
      }),
    )
    .min(1)
    .max(20),
});

// POST /api/characters/[id]/daya/memories — seed N DayaMemoryEntry rows
// (spec §2), all-or-nothing sealLint-checked. GM/ADMIN only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = seedMemoriesBodySchema.parse(body);
    const result = await seedEntityMemories(id, session.user.role, input.memories);
    return NextResponse.json({ memories: result });
  } catch (error) {
    return errorResponse(error);
  }
}
