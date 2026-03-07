import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';

// --- Schemas ---

export const generateCodesSchema = z.object({
  count: z.number().int().min(1).max(100).default(1),
  label: z.string().max(100).optional(),
  role: z.string().default('WATCHER'),
  expiresInDays: z.number().int().min(1).optional(),
});

export const redeemCodeSchema = z.object({
  code: z.string().min(1, 'Access code required').max(20),
});

// --- Service Functions ---

export async function listAccessCodes(userRole: string) {
  if (!isAdminRole(userRole)) throw new ForbiddenError('Admin only');

  return prisma.accessCode.findMany({
    include: { redeemedBy: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function generateAccessCodes(userRole: string, input: z.infer<typeof generateCodesSchema>) {
  if (!isAdminRole(userRole)) throw new ForbiddenError('Admin only');

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const codes = [];
  for (let i = 0; i < input.count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const accessCode = await prisma.accessCode.create({
      data: { code, role: input.role, label: input.label, expiresAt },
    });
    codes.push(accessCode);
  }
  return codes;
}

export async function redeemAccessCode(userId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();

  const accessCode = await prisma.accessCode.findUnique({ where: { code } });
  if (!accessCode) throw new NotFoundError('Invalid access code');
  if (accessCode.redeemedById) throw new ConflictError('Code already redeemed');
  if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
    throw new ValidationError('Code has expired');
  }

  await prisma.$transaction([
    prisma.accessCode.update({
      where: { id: accessCode.id },
      data: { redeemedById: userId, redeemedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { role: accessCode.role },
    }),
  ]);

  return { role: accessCode.role };
}

// Validates an access code during registration (doesn't redeem it yet)
export async function validateAccessCode(rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const accessCode = await prisma.accessCode.findUnique({ where: { code } });

  if (!accessCode) throw new ValidationError('Invalid access code');
  if (accessCode.redeemedById) throw new ConflictError('Access code already redeemed');
  if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
    throw new ValidationError('Access code has expired');
  }

  return accessCode;
}
