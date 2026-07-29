import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getDayaAuthoringState, updateDayaAuthoring } from '@/daya/authoring';

export const dynamic = 'force-dynamic';

// GET /api/characters/[id]/daya — read persona-harness authoring state
// (wrapped?, introspection, persona, affect, believed sheet, goals, recent
// memories). Any authenticated user who can reach the route; the
// authoring/mutation routes below are the GM/ADMIN-gated ones.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;
    const state = await getDayaAuthoringState(id);
    return NextResponse.json(state);
  } catch (error) {
    return errorResponse(error);
  }
}

const authoringBodySchema = z.object({
  introspection: z.number().min(0).max(1).optional(),
  voice: z
    .object({
      register: z.string().max(200).optional(),
      rhythm: z.string().max(200).optional(),
      images: z.array(z.string().max(100)).max(10).optional(),
    })
    .optional(),
  bias: z
    .object({
      selfRegard: z.number().min(-1).max(1).optional(),
      optimism: z.number().min(-1).max(1).optional(),
      projection: z.number().min(-1).max(1).optional(),
      denial: z.number().min(-1).max(1).optional(),
      catastrophize: z.number().min(-1).max(1).optional(),
    })
    .optional(),
  identityNarrative: z.string().max(4000).optional(),
  voiceNotes: z.string().max(2000).optional(),
});

// PATCH /api/characters/[id]/daya — set the soul-level authoring params not
// on the standard sheet (spec §2). GM/ADMIN only (enforced in the service).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = authoringBodySchema.parse(body);
    const result = await updateDayaAuthoring(id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
