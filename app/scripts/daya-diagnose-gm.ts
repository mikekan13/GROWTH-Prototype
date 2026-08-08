import './_server-only-shim';
import { prisma } from '../src/lib/db';

const INCUBATOR_ID = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const camp = await prisma.campaign.findUnique({ where: { id: INCUBATOR_ID } });
  console.log('INCUBATOR:', camp ? `${camp.id} name=${JSON.stringify(camp.name)} gmUserId=${camp.gmUserId}` : 'NOT FOUND');

  if (camp) {
    const gm = await prisma.user.findUnique({ where: { id: camp.gmUserId } });
    console.log('  GM user:', gm ? `${gm.id} | ${gm.email} | ${gm.username} | ${gm.role}` : 'MISSING');
    const members = await prisma.campaignMember.findMany({ where: { campaignId: INCUBATOR_ID } });
    console.log('  members:', JSON.stringify(members));
  }

  // Who is actually logged in? Inspect sessions.
  try {
    // @ts-ignore
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { userId: true, createdAt: true, expiresAt: true },
    });
    console.log('RECENT SESSIONS:');
    for (const s of sessions) {
      const u = await prisma.user.findUnique({ where: { id: s.userId }, select: { email: true, username: true, role: true } });
      const live = (s as any).expiresAt ? new Date((s as any).expiresAt).getTime() > Date.now() : '?';
      console.log(`  ${s.userId} | ${u?.email} | ${u?.username} | ${u?.role} | expires-valid=${live}`);
    }
  } catch (e) {
    console.log('SESSIONS: could not read —', (e as any)?.message);
  }
  process.exit(0);
})().catch(async e => { console.error('ERR', e?.message || e); await prisma.$disconnect(); process.exit(1); });
