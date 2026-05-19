import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { issueToken, invalidateTokensForUser } from '@/lib/auth-tokens';
import { sendEmail } from '@/lib/email';
import { checkRateLimit, getClientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ForgotSchema = z.object({ email: z.string().email() });

// POST /api/auth/forgot — start a password reset flow.
//
// Design note: this endpoint ALWAYS returns 200 to avoid leaking which
// email addresses have accounts. If the email is unknown, we silently
// drop the request after consuming the rate-limit budget.
export async function POST(request: NextRequest) {
  try {
    const ipKey = getClientKey(request);
    // 5 attempts per 15 minutes per client IP — protects against enumeration.
    const limit = checkRateLimit(`forgot:${ipKey}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: true }, // Don't reveal rate limit to attacker
        { status: 200 },
      );
    }

    const body = await request.json();
    const { email } = ForgotSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      invalidateTokensForUser(user.id, 'password_reset');
      const token = issueToken(user.id, 'password_reset');
      const resetUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/reset?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your GRO.WTH password',
        textBody: [
          `Hi ${user.username},`,
          '',
          'A password reset was requested for your account. If this was you,',
          'use the link below to choose a new password (link expires in 30 minutes):',
          '',
          resetUrl,
          '',
          'If this was not you, you can safely ignore this email.',
        ].join('\n'),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
