/**
 * Create a test character through the proper Seed/Root/Branch pipeline.
 *
 * Unlike scripts/seed-test-character.ts (which writes a hand-built data blob,
 * bypassing the creation pipeline and leaving TKV gaps), this script:
 *
 *   1. Finds the first campaign + a player user.
 *   2. Creates a fresh Character via the default factory.
 *   3. Looks up published Seed "Human", Root "Wanderer", Branch "First Blood".
 *   4. Calls applyCreationGrants() to populate attributes, augments,
 *      Fate Die, Fated Age, base resist, skills, and seed/root/branch traits.
 *   5. Persists the result so the TKV calculator can see every contribution.
 *
 * The resulting character is named "Test Pilgrim" (so it doesn't clobber
 * existing Vex / Kael data) and lands in status='APPROVED'.
 *
 * Run: npx tsx scripts/seed-pipeline-character.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { createDefaultCharacter } from '../src/lib/defaults';
import { applyCreationGrants } from '../src/services/character-grants';
import { calculateCharacterTKV } from '../src/lib/kv-calculator';

const SEED_NAME = 'Human';
const ROOT_NAME = 'Wanderer';
const BRANCH_NAMES = ['First Blood'];
const CHARACTER_NAME = 'Test Pilgrim';

async function findForge(campaignId: string, type: 'seed' | 'root' | 'branch', name: string) {
  const row = await prisma.forgeItem.findFirst({
    where: { campaignId, type, name, status: 'published' },
  });
  if (!row) {
    throw new Error(`Missing published ${type} "${name}". Run scripts/seed-test-srb.ts first.`);
  }
  return {
    id: row.id,
    name: row.name,
    data: JSON.parse(row.data),
  };
}

async function main() {
  const campaign = await prisma.campaign.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!campaign) throw new Error('No campaigns found.');
  console.log(`Campaign: ${campaign.name} (${campaign.id})`);

  // Use the GM as the test owner (any user works for this seed).
  const owner = await prisma.user.findUnique({ where: { id: campaign.gmUserId } });
  if (!owner) throw new Error('Campaign GM not found.');

  const seed = await findForge(campaign.id, 'seed', SEED_NAME);
  const root = await findForge(campaign.id, 'root', ROOT_NAME);
  const branches = await Promise.all(
    BRANCH_NAMES.map((n) => findForge(campaign.id, 'branch', n)),
  );

  const fresh = createDefaultCharacter(CHARACTER_NAME);
  // Stamp identity bits so the sheet has something to render in the header.
  fresh.identity = {
    ...(fresh.identity ?? {}),
    name: CHARACTER_NAME,
    age: 18,
  };
  const populated = applyCreationGrants(fresh, seed, [root], branches);

  // Idempotent: replace any existing "Test Pilgrim" in this campaign.
  const existing = await prisma.character.findFirst({
    where: { campaignId: campaign.id, name: CHARACTER_NAME },
  });

  const saved = existing
    ? await prisma.character.update({
        where: { id: existing.id },
        data: { data: JSON.stringify(populated), status: 'APPROVED' },
      })
    : await prisma.character.create({
        data: {
          name: CHARACTER_NAME,
          userId: owner.id,
          campaignId: campaign.id,
          data: JSON.stringify(populated),
          status: 'APPROVED',
        },
      });

  // Show the TKV breakdown so we can verify the pipeline is fully wired.
  const breakdown = calculateCharacterTKV(populated, []);
  console.log(`\n${existing ? 'Updated' : 'Created'}: ${CHARACTER_NAME} (id: ${saved.id})`);
  console.log(`Seed   : ${seed.name}  (Fate Die ${populated.creation?.seed?.baseFateDie}, Fated Age ${populated.creation?.fatedAge})`);
  console.log(`Root   : ${root.name}`);
  console.log(`Branch : ${branches.map((b) => b.name).join(', ')}`);
  console.log('\nTKV breakdown');
  console.log('-------------');
  console.log(`Body subtotal    : ${breakdown.body.subtotal}`);
  console.log(`Spirit subtotal  : ${breakdown.spirit.subtotal}`);
  console.log(`Soul subtotal    : ${breakdown.soul.subtotal}`);
  console.log(`Skills           : ${breakdown.skillsTotal} (${breakdown.skills.length} skills)`);
  console.log(`Body Resist      : ${breakdown.bodyResist.total}`);
  console.log(`Traits           : ${breakdown.traitsTotal} (${breakdown.traits.length} traits)`);
  console.log(`Augs             : ${breakdown.augs?.total ?? 0}`);
  console.log(`Fate Die (${breakdown.fateDie?.die ?? '-'})    : ${breakdown.fateDie?.kv ?? 0}`);
  console.log(`Fated Age (${breakdown.fatedAge?.years ?? 0}y) : ${breakdown.fatedAge?.kv ?? 0}`);
  console.log(`---------`);
  console.log(`TKV TOTAL        : ${breakdown.total}`);
  console.log('\nTraits applied:');
  for (const t of breakdown.traits) {
    console.log(`  - ${t.type}: ${t.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
