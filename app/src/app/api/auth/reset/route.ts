import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { consumeToken } from '@/lib/auth-tokens';
import { ValidationError } from '@/lib/errors';
import { checkRateLimit, getClientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

// POST /api/auth/reset — consume a password reset token and set a new password.
export async function POST(request: NextRequest) {
  try {
    const ipKey = getClientKey(request);
    const limit = checkRateLimit(`reset:${ipKey}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const body = await request.json();
    const { token, newPassword } = ResetSchema.parse(body);

    const consumed = consumeToken(token, 'password_reset');
    if (!consumed) throw new ValidationError('Invalid or expired reset link');

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash },
    });

    // Invalidate all existing sessions so other devices are forced to re-login
    // with the new password — protects against an attacker who got the old
    // session and is now using the password reset to be locked out.
    await prisma.session.deleteMany({ where: { userId: consumed.userId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
