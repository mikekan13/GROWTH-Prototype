/**
 * Migrate godheads into the Prime campaign.
 *
 * Before: all GODHEAD entityType Characters had `campaignId: null`
 *         (global/cross-campaign).
 * After:  all godheads belong to one hidden ADMIN-only campaign named
 *         '__PRIME__'. The canvas, character sheet, wizard, and
 *         relationship tooling all work on them naturally.
 *
 * Idempotent — if the Prime campaign already exists and godheads are
 * already members, this is a no-op.
 *
 * Run: npx tsx scripts/migrate-godheads-to-meta.ts
 */

import { prisma } from '../src/lib/db';
import { PRIME_CAMPAIGN_NAME, PRIME_CAMPAIGN_DISPLAY } from '../src/lib/prime-campaign';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user found. Run seed-admin.ts first.');
    process.exit(1);
  }

  // 1. Get or create the Prime campaign
  let meta = await prisma.campaign.findFirst({ where: { name: PRIME_CAMPAIGN_NAME } });
  if (!meta) {
    meta = await prisma.campaign.create({
      data: {
        name: PRIME_CAMPAIGN_NAME,
        worldContext: `${PRIME_CAMPAIGN_DISPLAY} — hidden admin campaign housing all God-head entities. Treat the canvas here as the cosmic council overview. Members are not real players; godheads are first-class characters with their own sheets, wallets, and relationship graph. Created by migration.`,
        gmUserId: admin.id,
        maxTrailblazers: 0,  // no players
      },
    });
    console.log(`✔ Created Prime campaign (id: ${meta.id})`);
  } else {
    console.log(`= Prime campaign already exists (id: ${meta.id})`);
  }

  // 2. Find all godhead characters that aren't yet in META
  const orphans = await prisma.character.findMany({
    where: {
      entityType: 'GODHEAD',
      OR: [{ campaignId: null }, { campaignId: { not: meta.id } }],
    },
    select: { id: true, name: true, campaignId: true },
  });

  if (orphans.length === 0) {
    console.log('= All godheads already in Prime campaign — nothing to migrate');
    return;
  }

  console.log(`Migrating ${orphans.length} godhead(s) into META...`);
  for (const g of orphans) {
    await prisma.character.update({
      where: { id: g.id },
      data: { campaignId: meta.id },
    });
    const wasCampaign = g.campaignId ?? 'null';
    console.log(`  ✔ ${g.name.padEnd(35)}  ${wasCampaign} → ${meta.id}`);
  }

  // 3. Optional: log a final count
  const totalInMeta = await prisma.character.count({
    where: { campaignId: meta.id, entityType: 'GODHEAD' },
  });
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Done. ${totalInMeta} godheads now in Prime campaign.`);
  console.log(`Admin terminal URL: /campaign/${meta.id}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
