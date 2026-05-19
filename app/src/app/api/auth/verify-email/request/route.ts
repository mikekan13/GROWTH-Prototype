import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { issueToken, invalidateTokensForUser } from '@/lib/auth-tokens';
import { sendEmail } from '@/lib/email';
import { checkRateLimit, getClientKey } from '@/lib/rate-limit';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify-email/request
// Send (or re-send) the email-verification mail to the current user.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Rate-limit by client + user — 3 sends per 15 min.
    const key = `verify-email:${session.user.id}:${getClientKey(request)}`;
    const limit = checkRateLimit(key, 3, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new ValidationError('User not found');

    invalidateTokensForUser(user.id, 'email_verification');
    const token = issueToken(user.id, 'email_verification');
    const verifyUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/api/auth/verify-email/${token}`;

    await sendEmail({
      to: user.email,
      subject: 'Verify your GRO.WTH email',
      textBody: [
        `Hi ${user.username},`,
        '',
        'Confirm your email to finish setting up your GRO.WTH account:',
        '',
        verifyUrl,
        '',
        'This link expires in 24 hours.',
      ].join('\n'),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
