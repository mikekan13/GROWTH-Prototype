/**
 * Seed one example ForgeItem ("Iron Sword") blueprint into the first available
 * campaign so the canvas Item picker has something to show.
 *
 * Idempotent — re-running is a no-op if a forge item with the same name already
 * exists in the target campaign.
 *
 * Run: npx tsx scripts/seed-example-item.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { PRIME_CAMPAIGN_NAME } from '../src/lib/prime-campaign';

async function main() {
  const campaignName = process.env.SEED_CAMPAIGN_NAME;
  const campaign = await prisma.campaign.findFirst({
    where: campaignName ? { name: campaignName } : { name: { not: PRIME_CAMPAIGN_NAME } },
    orderBy: { createdAt: 'asc' },
    include: { gmUser: true },
  });
  if (!campaign) {
    console.log('No non-Prime campaigns found. Run seed-test-data.ts first.');
    return;
  }

  const name = 'Iron Sword';
  const existing = await prisma.forgeItem.findFirst({
    where: { campaignId: campaign.id, type: 'item', name },
  });
  if (existing) {
    console.log(
      `= ForgeItem "${name}" already exists in campaign "${campaign.name}" (id: ${existing.id}, status: ${existing.status})`,
    );
    return;
  }

  const itemData = {
    itemType: 'weapon',
    description: 'A reliable iron longsword. Plain hilt, well-balanced edge.',
    primaryMaterial: 'Iron',
    materialClass: 'Hard',
    baseResist: 17,
    weightLbs: 3.5,
    condition: 3,
    quality: 5,
    rarity: 5,
    value: 25,
    damage: {
      piercing: 2,
      slashing: 5,
      heat: 0,
      decay: 0,
      cold: 0,
      bashing: 1,
      energy: 0,
    },
    range: 'melee',
    properties: ['Sharp'],
    targetAttribute: 'Constitution',
    tags: ['martial', 'sword'],
  };

  const created = await prisma.forgeItem.create({
    data: {
      name,
      type: 'item',
      status: 'published',
      campaignId: campaign.id,
      data: JSON.stringify(itemData),
      createdBy: campaign.gmUserId,
    },
  });

  console.log(`+ Created ForgeItem blueprint "${name}" in campaign "${campaign.name}"`);
  console.log(`  forgeItemId: ${created.id}`);
  console.log(`  campaignId: ${campaign.id}`);
  console.log(`  status: ${created.status}`);
  console.log('  Click "Item" on the canvas Tool Card to spawn an instance.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
