/**
 * Restore canonical Seeds (Human, Altered Human) to the global catalog
 * after a DB reset. Idempotent — re-running is a no-op for entries that
 * already exist with status='published'.
 *
 * These are the only "verified canonical" seeds (per ruling 2026-04-22).
 * Other seeds in seed-catalog.ts are unverified design proposals; they
 * stay in code only until a GM authors and publishes them.
 *
 * Run: npx tsx scripts/seed-canonical-seeds.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { SEED_CATALOG } from '../src/lib/seed-catalog';

const CANONICAL_NAMES = ['Human', 'Altered Human'];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No ADMIN user. Run seed-admin.ts first.');

  for (const name of CANONICAL_NAMES) {
    const seed = SEED_CATALOG.find((s) => s.name === name);
    if (!seed) {
      console.warn(`✗ ${name} not found in SEED_CATALOG — skipping`);
      continue;
    }

    const existing = await prisma.forgeItem.findFirst({
      where: { campaignId: null, type: 'seed', name },
    });
    if (existing) {
      console.log(`= ${name} already in global catalog (id: ${existing.id}, status: ${existing.status})`);
      continue;
    }

    const data = {
      description: seed.description,
      baseFateDie: seed.baseFateDie,
      frequency: seed.frequency,
      fatedAge: seed.fatedAge,
      baseResist: seed.baseResist,
      attributes: seed.attributes,
      skills: seed.skills,
      nectars: seed.nectars,
      thorns: seed.thorns,
      bodyStructure: seed.bodyStructure,
    };

    const item = await prisma.forgeItem.create({
      data: {
        type: 'seed',
        name,
        data: JSON.stringify(data),
        status: 'published',
        campaignId: null,
        isGlobal: true,
        createdBy: admin.id,
        authorUserId: admin.id,
        karmicValue: BigInt(seed.seedKV),
      },
    });

    console.log(`✔ Restored ${name} → global catalog (id: ${item.id}, KV: ${seed.seedKV})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
