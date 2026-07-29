/**
 * Seed an apartment-scale WorldFact environment for DAYA's World Adjudicator
 * (WP7) to resolve intents against. Idempotent: re-running does not
 * duplicate facts for a subjectKey that's already live.
 *
 * Usage: npx tsx scripts/seed-daya-room.ts [campaignName]
 *   campaignName defaults to '__DAYA_TEST__'. Creates the campaign and a GM
 *   user if either is missing, following existing seed-script conventions
 *   (see scripts/seed-campaign.ts, scripts/create-test-player.ts).
 */
import './_server-only-shim';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';
import { establishFact, currentFacts } from '../src/daya/world-ledger';

const DEFAULT_CAMPAIGN_NAME = '__DAYA_TEST__';
const GM_USERNAME = '__DAYA_TEST_GM__';
const SEED_CYCLE = 0;

/** ~21 facts: three rooms, connecting hallway, furniture, door/window
 * states, and a handful of positioned objects — enough for the Adjudicator
 * to reason about a room-scale physical intent. */
const ROOM_FACTS: Array<{ subjectKey: string; fact: string }> = [
  { subjectKey: 'apartment.rooms', fact: 'The apartment has three rooms — a kitchen, a living room, and a bedroom — connected by a short hallway.' },
  { subjectKey: 'apartment.time', fact: 'It is mid-afternoon; daylight comes in through the uncovered windows.' },
  { subjectKey: 'kitchen.counter', fact: 'The kitchen has a counter along the north wall, waist-height, laminate surface.' },
  { subjectKey: 'kitchen.counter.mug', fact: 'A ceramic mug sits on the kitchen counter, near the sink.' },
  { subjectKey: 'kitchen.sink', fact: 'The kitchen sink is stainless steel, empty, faucet off.' },
  { subjectKey: 'kitchen.fridge', fact: 'A refrigerator stands against the east wall of the kitchen, door closed.' },
  { subjectKey: 'kitchen.window', fact: 'The kitchen has one window above the sink, closed and latched.' },
  { subjectKey: 'kitchen.archway', fact: 'The kitchen opens into the hallway through a doorless archway.' },
  { subjectKey: 'livingroom.couch', fact: 'The living room has a two-seat couch against the west wall, facing a low table.' },
  { subjectKey: 'livingroom.table', fact: 'A low wooden table sits in front of the couch, bare.' },
  { subjectKey: 'livingroom.window', fact: "The living room has a large window on the south wall, closed, curtains open." },
  { subjectKey: 'livingroom.lamp', fact: 'A floor lamp stands beside the couch, currently off.' },
  { subjectKey: 'livingroom.door.exterior', fact: "The living room has the apartment's only exterior door, on the north wall, closed and locked." },
  { subjectKey: 'hallway.length', fact: 'The hallway is short, roughly ten feet, connecting the kitchen, living room, and bedroom.' },
  { subjectKey: 'hallway.lightswitch', fact: 'A light switch is mounted on the hallway wall, currently off.' },
  { subjectKey: 'bedroom.bed', fact: 'The bedroom has a single bed against the east wall, made, blanket folded at the foot.' },
  { subjectKey: 'bedroom.closet', fact: 'A closet with sliding doors sits on the north wall of the bedroom, closed.' },
  { subjectKey: 'bedroom.window', fact: 'The bedroom has one window on the west wall, closed, blinds drawn.' },
  { subjectKey: 'bedroom.desk', fact: 'A small desk sits under the bedroom window with a wooden chair tucked under it.' },
  { subjectKey: 'bedroom.desk.lamp', fact: 'A desk lamp sits on the desk, currently off.' },
  { subjectKey: 'bedroom.door', fact: 'The bedroom door is open, connecting to the hallway.' },
];

async function ensureGmUser() {
  const existing = await prisma.user.findFirst({ where: { username: GM_USERNAME } });
  if (existing) return existing;
  const hash = await bcrypt.hash(`daya-test-gm-${Date.now()}`, 12);
  const user = await prisma.user.create({
    data: {
      username: GM_USERNAME,
      email: 'daya-test-gm@test.local',
      passwordHash: hash,
      role: 'WATCHER',
    },
  });
  console.log(`+ Created GM user ${user.username} (${user.id})`);
  return user;
}

async function ensureCampaign(name: string) {
  const existing = await prisma.campaign.findFirst({ where: { name } });
  if (existing) {
    console.log(`= Campaign already exists: ${name} (${existing.id})`);
    return existing;
  }

  const gm = await ensureGmUser();
  const campaign = await prisma.campaign.create({
    data: {
      name,
      genre: 'DAYA Test',
      description: 'DAYA Phase 1 room-scale test environment — apartment seed for the World Adjudicator.',
      gmUserId: gm.id,
      maxTrailblazers: 0,
    },
  });
  console.log(`+ Created campaign ${name} (${campaign.id})`);

  await prisma.campaignMember.create({ data: { campaignId: campaign.id, userId: gm.id } });
  console.log(`+ Added GM as member`);

  return campaign;
}

export async function seedDayaRoom(campaignName: string = DEFAULT_CAMPAIGN_NAME) {
  const campaign = await ensureCampaign(campaignName);

  let written = 0;
  let skipped = 0;
  for (const item of ROOM_FACTS) {
    const live = await currentFacts(campaign.id, item.subjectKey);
    if (live.length > 0) {
      skipped++;
      continue;
    }
    await establishFact(campaign.id, item.subjectKey, item.fact, SEED_CYCLE);
    written++;
  }

  console.log(`WorldFacts: +${written} written, =${skipped} already live (idempotent)`);
  return { campaign, written, skipped };
}

async function main() {
  const campaignName = process.argv[2] || DEFAULT_CAMPAIGN_NAME;
  console.log(`Seeding DAYA room environment for campaign: ${campaignName}`);
  await seedDayaRoom(campaignName);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
