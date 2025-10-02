/**
 * Session Management
 * Handles creating, validating, and destroying user sessions
 * Replaces NextAuth session management
 */

import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { nanoid } from 'nanoid';

const SESSION_COOKIE_NAME = 'growth-session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Creates a new session for a user
 */
export async function createSession(userId: string): Promise<string> {
  const sessionToken = nanoid(32);
  const expires = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      sessionToken,
      userId,
      expires,
    },
  });

  // Set the session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  });

  return sessionToken;
}

/**
 * Gets the current session user from the session cookie
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (session.expires < new Date()) {
    await prisma.session.delete({ where: { sessionToken } });
    return null;
  }

  return session.user;
}

/**
 * Destroys the current session (logout)
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await prisma.session.delete({ where: { sessionToken } }).catch(() => {
      // Session might not exist in DB, that's okay
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Requires authentication - throws error if not authenticated
 * Use in API routes and server components
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Requires admin role - throws error if not admin
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();

  if (user.role !== 'ADMIN') {
    throw new Error('Forbidden: Admin access required');
  }

  return user;
}

/**
 * Requires WATCHER role (GM) - throws error if not WATCHER or ADMIN
 */
export async function requireWatcher(): Promise<SessionUser> {
  const user = await requireAuth();

  if (user.role !== 'WATCHER' && user.role !== 'ADMIN') {
    throw new Error('Forbidden: Watcher access required');
  }

  return user;
}

/**
 * Cleans up expired sessions (should be run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expires: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}
