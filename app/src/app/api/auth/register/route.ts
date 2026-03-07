import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createSession, getRoleDashboard } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, email, password } = await request.json();

  if (!username || !email || !password) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existing) {
    return NextResponse.json(
      { error: existing.email === email ? 'Email already registered' : 'Username taken' },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  });

  // Create user wallet with 0 balance
  await prisma.wallet.create({
    data: { ownerId: user.id, ownerType: 'USER', balance: 0 },
  });

  await createSession(user.id);

  return NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role },
    redirect: getRoleDashboard(user.role),
  });
}
