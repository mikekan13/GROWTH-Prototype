import './_server-only-shim';
import { prisma } from '../src/lib/db';

(async () => {
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, username: true } });
  console.log('USERS:');
  for (const u of users) console.log(`  ${u.id} | ${u.email} | ${u.role} | ${u.username ?? ''}`);

  const camps = await prisma.campaign.findMany({ select: { id: true, name: true, gmUserId: true } });
  console.log('CAMPAIGNS:');
  for (const c of camps) console.log(`  ${c.id} | name=${JSON.stringify(c.name)} | gm=${c.gmUserId}`);

  const chars = await prisma.character.findMany({ select: { id: true, name: true, campaignId: true } });
  console.log('CHARACTERS:', chars.length);
  for (const c of chars.slice(0, 20)) console.log(`  ${c.id} | ${JSON.stringify(c.name)} | camp=${c.campaignId}`);
  process.exit(0);
})().catch(e => { console.error('ERR', e?.message || e); process.exit(1); });
