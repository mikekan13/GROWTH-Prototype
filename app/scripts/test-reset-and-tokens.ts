/**
 * End-to-end test prep:
 *  1. Reset ClaudePlayer to INTERESTED in Prime Campaign.
 *  2. Delete the placeholder "Vex Thornwood" character (ClaudePlayer's draft).
 *  3. Generate fresh session tokens for Mike (ADMIN/GM) and ClaudePlayer.
 *
 * Prints the tokens for Playwright cookie injection. Idempotent.
 */
import crypto from 'crypto';
import { config } from 'dotenv';
config();
import { prisma } from '../src/lib/db';

async function makeSession(userId: string, label: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  console.log(`${label}_TOKEN=${token}`);
  return token;
}

async function main() {
  const mike = await prisma.user.findUnique({ where: { username: 'Mikekan13' } });
  const player = await prisma.user.findUnique({ where: { username: 'ClaudePlayer' } });
  if (!mike || !player) throw new Error('Missing seed users');

  const campaign = await prisma.campaign.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!campaign) throw new Error('No campaign');
  console.log(`CAMPAIGN_ID=${campaign.id}`);
  console.log(`MIKE_ID=${mike.id}`);
  console.log(`PLAYER_ID=${player.id}`);

  // Reset member status to INTERESTED so Accept flow can be exercised.
  const member = await prisma.campaignMember.update({
    where: { campaignId_userId: { campaignId: campaign.id, userId: player.id } },
    data: { status: 'INTERESTED' },
  });
  console.log(`MEMBER_ID=${member.id} status=${member.status}`);

  // Park ClaudePlayer's leftover in-progress characters (DRAFT/SUBMITTED/APPROVED) by
  // setting status=RETIRED so `createDraftCharacterForMember` won't find them and a
  // fresh character is created for the test run. Avoids cascade-delete pain.
  const stale = await prisma.character.findMany({
    where: { userId: player.id, campaignId: campaign.id, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } },
  });
  for (const c of stale) {
    await prisma.character.update({ where: { id: c.id }, data: { status: 'RETIRED' } });
    console.log(`RETIRED_STALE_CHAR=${c.id} (${c.name})`);
  }

  // Clean old sessions for these users so the token printout is the only valid one.
  await prisma.session.deleteMany({ where: { userId: { in: [mike.id, player.id] } } });

  await makeSession(mike.id, 'MIKE');
  await makeSession(player.id, 'PLAYER');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
