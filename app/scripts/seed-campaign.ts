/**
 * Seed a test campaign for the GODHEAD user.
 * Usage: npx tsx scripts/seed-campaign.ts
 */
import { prisma } from '../src/lib/db';
import crypto from 'crypto';

async function main() {
  const godhead = await prisma.user.findFirst({ where: { role: 'GODHEAD' } });
  if (!godhead) {
    console.error('No GODHEAD user found. Run seed-admin.ts first.');
    return;
  }

  const existing = await prisma.campaign.findFirst({ where: { gmUserId: godhead.id } });
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
      gmUserId: godhead.id,
      inviteCode,
      maxTrailblazers: 5,
    },
  });

  // Also add the godhead as a campaign member
  await prisma.campaignMember.create({
    data: { campaignId: campaign.id, userId: godhead.id },
  });

  console.log(`Created campaign: "${campaign.name}" (id: ${campaign.id})`);
  console.log(`Invite code: ${inviteCode}`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
