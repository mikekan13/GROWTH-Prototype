import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { resolveNectarBestowal } from '@/services/nectar-bestowal';

const bodySchema = z.object({ action: z.enum(['accept', 'decline']) });

/** GM resolves a Nectar bestowal proposal (T32 golden path landing). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const session = await requireAuth();
    const { messageId } = await params;
    const { action } = bodySchema.parse(await request.json());
    const result = await resolveNectarBestowal(messageId, action, session.user.id, session.user.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
