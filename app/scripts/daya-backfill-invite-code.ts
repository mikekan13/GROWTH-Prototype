/** Scratch: backfill Campaign.inviteCode where null (B-3) — script-created
 * campaigns skipped the service that generates it. Prime is left alone
 * deliberately (ADMIN-only, not joinable). */
import './_server-only-shim';
import crypto from 'crypto';
import { prisma } from '../src/lib/db';

(async () => {
  const missing = await prisma.campaign.findMany({
    where: { inviteCode: null },
    select: { id: true, name: true },
  });
  for (const c of missing) {
    if (c.name === '__PRIME__') {
      console.log(`= Skipping ${c.name} (ADMIN-only, not joinable)`);
      continue;
    }
    const inviteCode = crypto.randomBytes(4).toString('hex');
    await prisma.campaign.update({ where: { id: c.id }, data: { inviteCode } });
    console.log(`+ ${c.name} (${c.id}) inviteCode=${inviteCode}`);
  }
  if (missing.length === 0) console.log('No campaigns missing inviteCode');
  await prisma.$disconnect();
})();
