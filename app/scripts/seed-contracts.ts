/**
 * Seed the day-one Terminal contracts (T13, INV-115).
 *
 * 1. Tara's cap (canonical example, ruling 2026-07-10 #2): "TKV may not
 *    reach 20% of total current KRMA in the system (excl. Terminal
 *    Reserve). Penalty: Dissolution." Modifiable in-game by vote (voteRef
 *    mechanism deferred) — NOT immutable.
 * 2. The Death succession contract (INV-101): "Whoever kills Lady Death
 *    becomes Lady Death." Terminal-hardcoded → immutable tier. Its
 *    predicate is event-driven content (played out in Prime), not yet
 *    computable by the DSL — seeded as a declarative always-holds row so
 *    the immutable tier exists from day one.
 *
 * Idempotent — looked up by name.
 *
 * Run: npx tsx scripts/seed-contracts.ts
 */
import { prisma } from '../src/lib/db';
import { createContract } from '../src/services/contracts';
import { getPrimeCampaign } from '../src/lib/prime-campaign';
import type { ContractPredicate, ContractPenalty, ContractParty } from '../src/types/contracts';

const TARA_CONTRACT_NAME = 'The Severity Cap — Tara Almswood';
const SUCCESSION_CONTRACT_NAME = 'Death Succession — Terminal Hardcode';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error('No ADMIN user found. Run seed-admin.ts first.');
    process.exit(1);
  }
  const prime = await getPrimeCampaign();
  if (!prime) {
    console.error('No __PRIME__ campaign. Run seed-campaign.ts first.');
    process.exit(1);
  }
  const tara = await prisma.character.findFirst({ where: { name: 'Tara Almswood' } });
  if (!tara) {
    console.error('Tara Almswood not found. Run seed-godheads.ts first.');
    process.exit(1);
  }

  // 1. Tara's cap
  const existingCap = await prisma.contract.findFirst({ where: { name: TARA_CONTRACT_NAME } });
  if (existingCap) {
    console.log(`= "${TARA_CONTRACT_NAME}" already exists (${existingCap.id})`);
  } else {
    const predicate: ContractPredicate = {
      op: 'lt',
      left: { op: 'tkv', characterId: tara.id },
      right: {
        op: 'mul',
        args: [
          { op: 'const', value: 0.2 }, // threshold lives in DATA — tunable without code
          { op: 'totalSupply', excludeReserves: ['Terminal'] },
        ],
      },
    };
    const penalty: ContractPenalty = { kind: 'DISSOLUTION', characterId: tara.id };
    const parties: ContractParty[] = [{ type: 'CHARACTER', id: tara.id, role: 'BOUND' }];
    const contract = await createContract(
      {
        name: TARA_CONTRACT_NAME,
        description:
          'TKV may not reach 20% of total current KRMA in the system (excluding the ' +
          'Terminal Reserve). Penalty: Dissolution. Modifiable in-game by vote, verified ' +
          'by Triu (vote mechanism deferred — Prime is played manually for now).',
        campaignId: prime.id,
        parties,
        predicate,
        penalty,
      },
      admin.id,
    );
    console.log(`+ Seeded "${TARA_CONTRACT_NAME}" (${contract.id})`);
  }

  // 2. Immutable succession contract (INV-101)
  const existingSuccession = await prisma.contract.findFirst({
    where: { name: SUCCESSION_CONTRACT_NAME },
  });
  if (existingSuccession) {
    console.log(`= "${SUCCESSION_CONTRACT_NAME}" already exists (${existingSuccession.id})`);
  } else {
    const contract = await createContract(
      {
        name: SUCCESSION_CONTRACT_NAME,
        description:
          'Whoever kills Lady Death becomes Lady Death. Hardcoded at Terminal level, below ' +
          'the vote layer (INV-101). Enforcement is event-driven (a kill event, resolved in ' +
          'play) — the declarative predicate below always holds; this row exists so the ' +
          'succession terms are on the books and untouchable from day one.',
        campaignId: prime.id,
        parties: [{ type: 'CHARACTER', id: tara.id, role: 'BOUND' }],
        // Declarative placeholder — always holds until succession enforcement
        // becomes computable (event predicates are a later, content-driven step).
        predicate: { op: 'before', dateISO: '9999-01-01T00:00:00.000Z' },
        penalty: {
          kind: 'FLAG_ADMIN',
          message: 'Death succession event — resolve mantle transfer in play.',
        },
      },
      admin.id,
      { allowImmutable: true, immutable: true },
    );
    console.log(`+ Seeded immutable "${SUCCESSION_CONTRACT_NAME}" (${contract.id})`);
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
