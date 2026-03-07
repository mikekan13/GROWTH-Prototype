import { z } from 'zod';
import { prisma } from '@/lib/db';
import { AuthError, ConflictError } from '@/lib/errors';
import { hashPassword, verifyPassword, createSession, getRoleDashboard } from '@/lib/auth';
import { validateAccessCode } from '@/services/access-code';

// --- Schemas ---

export const loginSchema = z.object({
  login: z.string().min(1, 'Username or email required'),
  password: z.string().min(1, 'Password required'),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  accessCode: z.string().optional(),
});

// --- Service Functions ---

export async function loginUser(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.login }, { username: input.login }],
    },
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AuthError('Invalid credentials');
  }

  await createSession(user.id);

  return {
    user: { id: user.id, username: user.username, role: user.role },
    redirect: getRoleDashboard(user.role),
  };
}

export async function registerUser(input: z.infer<typeof registerSchema>) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
  });

  if (existing) {
    const msg = existing.email === input.email ? 'Email already registered' : 'Username taken';
    throw new ConflictError(msg);
  }

  let grantedRole = 'TRAILBLAZER';
  let accessCodeId: string | null = null;
  if (input.accessCode?.trim()) {
    const code = await validateAccessCode(input.accessCode);
    grantedRole = code.role;
    accessCodeId = code.id;
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { username: input.username, email: input.email, passwordHash, role: grantedRole },
    });

    await tx.wallet.create({
      data: { ownerId: newUser.id, ownerType: 'USER', balance: 0 },
    });

    if (accessCodeId) {
      await tx.accessCode.update({
        where: { id: accessCodeId },
        data: { redeemedById: newUser.id, redeemedAt: new Date() },
      });
    }

    return newUser;
  });

  await createSession(user.id);

  return {
    user: { id: user.id, username: user.username, role: user.role },
    redirect: getRoleDashboard(user.role),
  };
}
