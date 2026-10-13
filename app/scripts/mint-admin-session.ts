/**
 * Mint a short-lived ADMIN session token for local browser-driving / smoke tests.
 * Usage: npx tsx scripts/mint-admin-session.ts [minutes=60]
 * Prints JSON { userId, username, token, expiresAt }. Never commit a token.
 */
import crypto from 'crypto';
import { prisma } from '../src/lib/db';

async function main() {
  const minutes = Number(process.argv[2] ?? 60);
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('no ADMIN user');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await prisma.session.create({ data: { userId: admin.id, token, expiresAt } });
  const outFile = process.argv[3];
  if (outFile) {
    const fs = await import('fs');
    fs.writeFileSync(outFile, token, { encoding: 'ascii' });
  }
  console.log(JSON.stringify({ userId: admin.id, username: (admin as { username?: string }).username ?? null, token: outFile ? '(written to file)' : token, expiresAt }));
}

main().catch((e) => { console.error(e); process.exit(1); });
