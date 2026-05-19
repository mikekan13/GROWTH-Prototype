/**
 * Auth token store — in-memory implementation.
 *
 * Used by email verification + password reset flows. The interface is small
 * and DB-swap-ready: when production migrates to PostgreSQL, drop in a
 * Prisma-backed implementation and the route handlers don't change.
 *
 * Token issuance rules:
 * - Tokens are 32 bytes of crypto random, base64url-encoded (≈43 chars).
 * - Single-use: consuming a token deletes it.
 * - Time-limited: default TTL is the per-kind cap below.
 * - Issuing a new token for the same (kind, userId) does NOT invalidate
 *   prior tokens automatically — flows that need that property should
 *   call invalidateTokensForUser() explicitly before issuing.
 *
 * NOTE: Because storage is in-memory, tokens DO NOT survive a server
 * restart. This is acceptable for dev. Production needs DB-backed
 * tokens — see `models EmailVerificationToken / PasswordResetToken` in
 * the deferred schema patch (TODO: pair with Postgres migration in M6b).
 */

import crypto from 'crypto';

export type TokenKind = 'email_verification' | 'password_reset';

interface StoredToken {
  token: string;
  userId: string;
  kind: TokenKind;
  expiresAt: number;
}

// In-memory store keyed by token string.
const tokens = new Map<string, StoredToken>();

const DEFAULT_TTL_MS: Record<TokenKind, number> = {
  email_verification: 1000 * 60 * 60 * 24, // 24 hours
  password_reset: 1000 * 60 * 30,          // 30 minutes
};

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function issueToken(userId: string, kind: TokenKind, ttlMs?: number): string {
  const token = generateToken();
  const expiresAt = Date.now() + (ttlMs ?? DEFAULT_TTL_MS[kind]);
  tokens.set(token, { token, userId, kind, expiresAt });
  pruneExpired();
  return token;
}

export function consumeToken(token: string, kind: TokenKind): { userId: string } | null {
  pruneExpired();
  const entry = tokens.get(token);
  if (!entry) return null;
  if (entry.kind !== kind) return null;
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  tokens.delete(token);
  return { userId: entry.userId };
}

export function peekToken(token: string, kind: TokenKind): { userId: string } | null {
  pruneExpired();
  const entry = tokens.get(token);
  if (!entry || entry.kind !== kind || entry.expiresAt < Date.now()) return null;
  return { userId: entry.userId };
}

export function invalidateTokensForUser(userId: string, kind: TokenKind): number {
  let n = 0;
  for (const [k, v] of tokens) {
    if (v.userId === userId && v.kind === kind) { tokens.delete(k); n += 1; }
  }
  return n;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (v.expiresAt < now) tokens.delete(k);
  }
}

// Exposed only for tests
export function _resetTokenStoreForTests(): void {
  tokens.clear();
}
