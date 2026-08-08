import './_server-only-shim';
import { prisma } from '../src/lib/db';

const INCUBATOR = 'cms5z4j6z0000zg48z5vzl2jn';
const MIKE = 'cmrep1oh300002g48ue1bn5rg';

(async () => {
  const del = await prisma.campaignMember.deleteMany({ where: { campaignId: INCUBATOR, userId: MIKE } });
  console.log('deleted member records:', del.count);
  const camp = await prisma.campaign.findUnique({ where: { id: INCUBATOR } });
  const remaining = await prisma.campaignMember.count({ where: { campaignId: INCUBATOR } });
  console.log(`gmUserId=${camp?.gmUserId} isMike=${camp?.gmUserId === MIKE} | remaining members=${remaining}`);
  process.exit(0);
})().catch(async e => { console.error('ERR', e?.message || e); await prisma.$disconnect(); process.exit(1); });
