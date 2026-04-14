import { cookies } from 'next/headers';
import { prisma } from './db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { UserRole } from '@/types/growth';
import { AuthError, ForbiddenError } from './errors';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return token;
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    cookieStore.delete('session_token');
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new AuthError();
  }
  return session;
}

export async function requireRole(role: UserRole) {
  const session = await requireAuth();
  if (session.user.role !== role && session.user.role !== 'ADMIN' && session.user.role !== 'GODHEAD') {
    throw new ForbiddenError();
  }
  return session;
}

export function getRoleDashboard(role: string): string {
  switch (role) {
    case 'GODHEAD':
    case 'ADMIN':
      return '/terminal';
    case 'WATCHER':
      return '/watcher';
    default:
      return '/trailblazer';
  }
}
