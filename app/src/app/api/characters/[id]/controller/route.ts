import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import { setCharacterController } from '@/services/godhead-admin';

const bodySchema = z.discriminatedUnion('controller', [
  z.object({ controller: z.literal('AI') }),
  z.object({ controller: z.literal('GM') }),
  z.object({ controller: z.literal('PLAYER'), userId: z.string().min(1) }),
]);

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
      throw new ValidationError('Invalid controller payload');
    }
    const body = parsed.data;
    const result = await setCharacterController(
      id,
      session.user.id,
      session.user.role,
      body.controller,
      body.controller === 'PLAYER' ? body.userId : undefined,
    );
    return NextResponse.json({ ok: true, character: result });
  } catch (error) {
    return errorResponse(error);
  }
}
