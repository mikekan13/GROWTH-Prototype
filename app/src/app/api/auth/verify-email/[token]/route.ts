import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { consumeToken } from '@/lib/auth-tokens';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// GET /api/auth/verify-email/[token]
//
// Consume the token, mark the user verified, redirect to the success page.
// Idempotent at the token layer: a second hit with the same token fails
// with "invalid or expired" (consumedAt is set). The user remains verified.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const consumed = await consumeToken(token, 'email_verification');
    if (!consumed) throw new ValidationError('Invalid or expired verification link');

    await prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerifiedAt: new Date() },
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}/auth/email-verified`);
  } catch (error) {
    return errorResponse(error);
  }
}
