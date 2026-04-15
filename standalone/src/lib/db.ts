import { PrismaClient } from '@/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import path from 'path';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  // DATABASE_URL from .env points at the shared main-app dev.db (SYNC.md).
  // Fall back to CWD-local dev.db for scripts that don't load .env.
  const envUrl = process.env.DATABASE_URL;
  const url = envUrl ?? `file:${path.join(process.cwd(), 'dev.db')}`;
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
