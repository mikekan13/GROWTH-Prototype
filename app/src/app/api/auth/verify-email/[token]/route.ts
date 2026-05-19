import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { consumeToken } from '@/lib/auth-tokens';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// GET /api/auth/verify-email/[token]
// Consume the token and redirect to a verified page. Idempotent in spirit
// (a second consume just 404s — that's fine; the user is already verified).
//
// NOTE: While the email_verification schema column is pending the Postgres
// migration (see ROADMAP.md M6b), we record the verified state in-memory
// only — the redirect proves the consumer holds a valid token, but we
// don't persist the verifiedAt timestamp yet. Once the migration lands,
// flip a single line below to write user.emailVerifiedAt = new Date().
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const consumed = consumeToken(token, 'email_verification');
    if (!consumed) throw new ValidationError('Invalid or expired verification link');

    // TODO: when EmailVerification schema migration lands, also write:
    //   await prisma.user.update({ where: { id: consumed.userId }, data: { emailVerifiedAt: new Date() } });
    void consumed.userId;

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}/auth/email-verified`);
  } catch (error) {
    return errorResponse(error);
  }
}
