/**
 * Seed the `__PRIME__` campaign — the meta's control room (INV-116).
 * Always ADMIN-owned, no player seats; godheads are attached by
 * migrate-godheads-to-prime.ts. Idempotent.
 * Usage: npx tsx scripts/seed-campaign.ts
 */
import { prisma } from '../src/lib/db';
import { PRIME_CAMPAIGN_NAME, PRIME_CAMPAIGN_DISPLAY } from '../src/lib/prime-campaign';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user found. Run seed-admin.ts first.');
    return;
  }

  let campaign = await prisma.campaign.findFirst({
    where: { name: PRIME_CAMPAIGN_NAME },
  });

  if (campaign) {
    console.log(`= Prime campaign already exists (id: ${campaign.id})`);
  } else {
    campaign = await prisma.campaign.create({
      data: {
        name: PRIME_CAMPAIGN_NAME,
        genre: 'Cosmic Fantasy',
        description: 'The Prime Campaign — where the patterns were first recognized.',
        worldContext: `${PRIME_CAMPAIGN_DISPLAY} — hidden admin campaign housing all God-head entities. Treat the canvas here as the cosmic council overview. Members are not real players; godheads are first-class characters with their own sheets, wallets, and relationship graph.`,
        gmUserId: admin.id,
        maxTrailblazers: 0, // no player seats — the meta is played by godheads
      },
    });
    console.log(`+ Created Prime campaign (id: ${campaign.id})`);
  }

  const member = await prisma.campaignMember.findFirst({
    where: { campaignId: campaign.id, userId: admin.id },
  });
  if (!member) {
    await prisma.campaignMember.create({
      data: { campaignId: campaign.id, userId: admin.id },
    });
    console.log(`+ Added ADMIN as member`);
  }

  // The campaign's KRMA wallet so authoring/economy can target it.
  const wallet = await prisma.wallet.findFirst({
    where: { campaignId: campaign.id, ownerType: 'CAMPAIGN' },
  });
  if (!wallet) {
    await prisma.wallet.create({
      data: {
        ownerType: 'CAMPAIGN',
        walletType: 'CAMPAIGN',
        campaignId: campaign.id,
        label: PRIME_CAMPAIGN_NAME,
        balance: BigInt(0),
      },
    });
    console.log(`+ Created Prime campaign wallet`);
  }

  console.log(`GM: ${admin.username || admin.email} (${admin.id})`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
