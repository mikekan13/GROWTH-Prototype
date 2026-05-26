import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import { setAIActionMode } from '@/services/godhead-admin';

const bodySchema = z.object({
  aiActionMode: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('aiActionMode must be a boolean');
    }
    const godhead = await setAIActionMode(
      id,
      session.user.id,
      session.user.role,
      parsed.data.aiActionMode,
    );
    return NextResponse.json({
      ok: true,
      godhead: { id: godhead.id, name: godhead.name, aiActionMode: godhead.aiActionMode },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
