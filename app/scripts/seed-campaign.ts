/**
 * Seed a test campaign for the GODHEAD user.
 * Usage: npx tsx scripts/seed-campaign.ts
 */
import { prisma } from '../src/lib/db';
import crypto from 'crypto';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user found. Run seed-admin.ts first.');
    return;
  }

  const existing = await prisma.campaign.findFirst({
    where: { name: 'The Prime Campaign' },
  });
  if (existing) {
    console.log(`Campaign "${existing.name}" already exists (id: ${existing.id}). Skipping.`);
    return;
  }

  const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  const campaign = await prisma.campaign.create({
    data: {
      name: 'The Prime Campaign',
      genre: 'Cosmic Fantasy',
      description: 'The original campaign — where the patterns were first recognized.',
      worldContext: 'A world where magic and technology are not separate forces, but the same patterns viewed through different lenses of consciousness.',
      gmUserId: admin.id,
      inviteCode,
      maxTrailblazers: 5,
    },
  });

  await prisma.campaignMember.create({
    data: { campaignId: campaign.id, userId: admin.id },
  });

  // Also create the campaign's KRMA wallet so authoring/economy can target it.
  await prisma.wallet.create({
    data: {
      ownerType: 'CAMPAIGN',
      walletType: 'CAMPAIGN',
      campaignId: campaign.id,
      label: campaign.name,
      balance: 0n,
    },
  });

  console.log(`Created campaign: "${campaign.name}" (id: ${campaign.id})`);
  console.log(`GM: ${admin.username || admin.email} (${admin.id})`);
  console.log(`Invite code: ${inviteCode}`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
