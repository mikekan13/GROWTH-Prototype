/**
 * Auth token store — DB-backed (Prisma) implementation.
 *
 * Used by email verification + password reset flows. Tokens persist across
 * server restarts and are queryable for audit; cascade-delete with their
 * user via the Prisma `onDelete: Cascade` relation.
 *
 * Token issuance rules:
 *  - 32 bytes crypto random, base64url-encoded (~43 chars).
 *  - Single-use: consuming a token marks `consumedAt`; consumeToken() will
 *    not return it again. We keep consumed rows for audit until the
 *    user is deleted (or until a future janitor sweeps them).
 *  - Time-limited via `expiresAt` column. Defaults below.
 *  - `invalidateTokensForUser()` deletes outstanding tokens of a given
 *    kind for a user — used when issuing a new one and the flow wants
 *    prior links to immediately stop working.
 *
 * Design notes / future work:
 *  - The two tables (EmailVerificationToken, PasswordResetToken) are
 *    structurally identical. Kept separate because the SQL queries by
 *    `kind` would have to scan a single table — separate tables give
 *    cleaner indexes and let one workflow's churn not pollute the other.
 *  - A janitor job to delete expired+consumed tokens would be useful at
 *    scale. Not built now — table churn is low at beta volumes.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db';

export type TokenKind = 'email_verification' | 'password_reset';

const DEFAULT_TTL_MS: Record<TokenKind, number> = {
  email_verification: 1000 * 60 * 60 * 24, // 24 hours
  password_reset: 1000 * 60 * 30,          // 30 minutes
};

function generateTokenString(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function issueToken(userId: string, kind: TokenKind, ttlMs?: number): Promise<string> {
  const token = generateTokenString();
  const expiresAt = new Date(Date.now() + (ttlMs ?? DEFAULT_TTL_MS[kind]));
  if (kind === 'email_verification') {
    await prisma.emailVerificationToken.create({ data: { userId, token, expiresAt } });
  } else {
    await prisma.passwordResetToken.create({ data: { userId, token, expiresAt } });
  }
  return token;
}

/**
 * Look up and consume a token in one shot. Returns the user id on success,
 * null if the token is unknown / expired / already-consumed / wrong kind.
 *
 * Atomic: we mark `consumedAt` inside the same query as the lookup so a
 * concurrent second consume of the same token sees the marker and bounces.
 */
export async function consumeToken(token: string, kind: TokenKind): Promise<{ userId: string } | null> {
  const row = kind === 'email_verification'
    ? await prisma.emailVerificationToken.findUnique({ where: { token } })
    : await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  // Atomic mark-consumed. updateMany with where consumedAt=null guards
  // against the rare double-spend race.
  const now = new Date();
  if (kind === 'email_verification') {
    const r = await prisma.emailVerificationToken.updateMany({
      where: { token, consumedAt: null },
      data: { consumedAt: now },
    });
    if (r.count === 0) return null;
  } else {
    const r = await prisma.passwordResetToken.updateMany({
      where: { token, consumedAt: null },
      data: { consumedAt: now },
    });
    if (r.count === 0) return null;
  }
  return { userId: row.userId };
}

/**
 * Look at a token without consuming it. Used by UI flows that want to
 * validate a link before showing the form (e.g. "this link has expired").
 */
export async function peekToken(token: string, kind: TokenKind): Promise<{ userId: string } | null> {
  const row = kind === 'email_verification'
    ? await prisma.emailVerificationToken.findUnique({ where: { token } })
    : await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { userId: row.userId };
}

/**
 * Delete all outstanding tokens of a given kind for a user. Called before
 * issuing a fresh one in flows that want prior links invalidated.
 */
export async function invalidateTokensForUser(userId: string, kind: TokenKind): Promise<number> {
  const r = kind === 'email_verification'
    ? await prisma.emailVerificationToken.deleteMany({ where: { userId, consumedAt: null } })
    : await prisma.passwordResetToken.deleteMany({ where: { userId, consumedAt: null } });
  return r.count;
}
