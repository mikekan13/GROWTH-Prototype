import './_server-only-shim';
import crypto from 'crypto';
import { prisma } from '../src/lib/db';
import { seedDayaRoom } from './seed-daya-room';

const CAMPAIGN_NAME = 'The Incubator';

(async () => {
  // Mike — the ADMIN account
  const mike = await prisma.user.findFirst({ where: { OR: [{ email: 'admin@growth.local' }, { username: 'Mikekan13' }] } });
  if (!mike) { console.error('Could not find Mike admin account'); process.exit(1); }
  console.log(`Mike: ${mike.id} (${mike.email}, ${mike.role})`);

  let campaign = await prisma.campaign.findFirst({ where: { name: CAMPAIGN_NAME } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: CAMPAIGN_NAME,
        genre: 'DAYA',
        description: 'The Incubator — DAYA Phase 1: one room, one soul. A grounded apartment where AI-controlled entities live and are observed through JEWL.',
        gmUserId: mike.id,
        maxTrailblazers: 4,
        // The creation SERVICE generates this; script-created campaigns
        // must too or the settings form shows a blank invite code (B-3).
        inviteCode: crypto.randomBytes(4).toString('hex'),
      },
    });
    console.log(`+ Created campaign "${CAMPAIGN_NAME}" (${campaign.id}) under Mike`);
  } else {
    if (campaign.gmUserId !== mike.id) {
      campaign = await prisma.campaign.update({ where: { id: campaign.id }, data: { gmUserId: mike.id } });
      console.log(`= Reassigned existing "${CAMPAIGN_NAME}" GM to Mike`);
    } else {
      console.log(`= Campaign "${CAMPAIGN_NAME}" already exists under Mike (${campaign.id})`);
    }
  }

  // App invariant: the GM is NOT a campaignMember — gmUserId is the sole
  // GM link; a member row for the GM breaks campaign-page loading.
  const badMember = await prisma.campaignMember.findFirst({ where: { campaignId: campaign.id, userId: mike.id } });
  if (badMember) {
    await prisma.campaignMember.delete({ where: { id: badMember.id } });
    console.log('- Removed stray GM member row');
  }

  // seed the apartment room facts into THIS campaign (idempotent)
  await seedDayaRoom(CAMPAIGN_NAME);

  console.log('\n==================================================');
  console.log(`  THE INCUBATOR is ready.`);
  console.log(`  Campaign ID: ${campaign.id}`);
  console.log(`  DAYA canvas: http://localhost:3000/campaign/${campaign.id}/daya`);
  console.log('==================================================');
  await prisma.$disconnect();
  process.exit(0);
})().catch(async e => { console.error('ERR', e?.message || e); await prisma.$disconnect(); process.exit(1); });
