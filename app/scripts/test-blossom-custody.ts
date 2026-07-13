/**
 * Blossom custody loop test (Mike 2026-07-13 — "borrowed power").
 *
 * Proves the full chain of custody:
 *   1. bestowBlossom transfers KRMA Godhead → character (LOCK) and stamps the
 *      trait with the grantor + kv.
 *   2. returnAllBlossoms (what the death engine calls) sends that exact KRMA
 *      back to the SAME Godhead (UNLOCK) — net-zero, fully attributed.
 *
 * Creates a throwaway NPC, runs the loop, verifies balances + ledger rows,
 * then cleans up the character (the ledger rows net to zero and stay).
 *
 * Run: npx tsx scripts/test-blossom-custody.ts   (exits non-zero on failure)
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { bestowBlossom, returnAllBlossoms } from '../src/services/blossom';
import type { GrowthCharacter } from '../src/types/growth';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
async function balance(walletId: string): Promise<bigint> {
  const w = await prisma.wallet.findUnique({ where: { id: walletId } });
  return w?.balance ?? BigInt(0);
}

const KV = 50;

async function main() {
  console.log('Blossom custody loop\n' + '─'.repeat(50));

  // Pick a godhead whose wallet actually holds enough to make the loan
  // (walletId is a loose string ref, so we scan balances).
  const godheads = await prisma.godHead.findMany({
    where: { walletId: { not: null } },
    select: { id: true, name: true, walletId: true },
  });
  let godhead: { id: string; name: string; walletId: string } | null = null;
  let gBefore = BigInt(0);
  for (const g of godheads) {
    const b = await balance(g.walletId!);
    if (b >= BigInt(KV)) { godhead = { id: g.id, name: g.name, walletId: g.walletId! }; gBefore = b; break; }
  }
  if (!godhead) {
    console.log('SKIP: no godhead wallet holds >= 50 KRMA — run `npm run seed:all` first.');
    process.exit(0);
  }
  console.log(`  (lender: ${godhead.name}, wallet ${gBefore} KRMA)`);
  const campaign = await prisma.campaign.findFirst({ select: { id: true, gmUserId: true } });
  if (!campaign) { console.log('SKIP: no campaign seeded.'); process.exit(0); }

  // Throwaway NPC.
  const char = await prisma.character.create({
    data: {
      name: 'Blossom Custody Test NPC',
      entityType: 'NPC',
      userId: campaign.gmUserId,
      campaignId: campaign.id,
      status: 'ACTIVE',
      data: JSON.stringify({ traits: [] } as Partial<GrowthCharacter>),
    },
  });

  try {
    // 1. Bestow (the loan).
    const { blossomInstanceId } = await bestowBlossom(godhead.id, char.id, {
      name: 'Test Bloom of Borrowed Vigor',
      pillar: 'spirit',
      mechanicalEffect: '+2 to a test check',
      kv: KV,
      durationCycles: 3,
      reason: 'custody loop test',
    });
    const charWallet = await prisma.wallet.findFirst({ where: { characterId: char.id } });
    const gAfterBestow = await balance(godhead.walletId);
    const cAfterBestow = charWallet ? await balance(charWallet.id) : BigInt(-1);
    check('bestow: Godhead wallet debited by kv', gAfterBestow === gBefore - BigInt(KV), `${gBefore} → ${gAfterBestow}`);
    check('bestow: character wallet holds the borrowed kv', cAfterBestow === BigInt(KV), `char wallet = ${cAfterBestow}`);

    const afterBestow = JSON.parse((await prisma.character.findUnique({ where: { id: char.id } }))!.data) as GrowthCharacter;
    const bloom = afterBestow.traits.find(t => t.blossomInstanceId === blossomInstanceId);
    check('bestow: blossom trait carries the custody chain', !!bloom && bloom.grantedByGodHeadId === godhead.id && bloom.kv === KV);

    // 2. Return (what death calls).
    const result = await returnAllBlossoms(afterBestow, char.id, campaign.id, 'death');
    const gAfterReturn = await balance(godhead.walletId);
    const cAfterReturn = charWallet ? await balance(charWallet.id) : BigInt(-1);
    check('return: total returned equals the loan', result.total === KV, `returned ${result.total}`);
    check('return: KRMA came home to the SAME Godhead (net-zero)', gAfterReturn === gBefore, `${gBefore} → ${gAfterReturn}`);
    check('return: character wallet emptied of the loan', cAfterReturn === BigInt(0), `char wallet = ${cAfterReturn}`);
    check('return: attributed to the grantor godhead', result.returns[0]?.godHeadId === godhead.id);

    // 3. Ledger has both attributed hops.
    const bestowTx = await prisma.krmaTransaction.findFirst({ where: { reason: 'BLOSSOM_BESTOW', metadata: { contains: blossomInstanceId } } });
    const returnTx = await prisma.krmaTransaction.findFirst({ where: { reason: 'BLOSSOM_RETURN', metadata: { contains: blossomInstanceId } } });
    check('ledger: BLOSSOM_BESTOW + BLOSSOM_RETURN rows exist', !!bestowTx && !!returnTx);
  } finally {
    // Clean up the throwaway character + its (now-zero) wallet. Ledger rows are
    // append-only and net to zero, so they stay.
    await prisma.wallet.deleteMany({ where: { characterId: char.id } });
    await prisma.character.delete({ where: { id: char.id } });
    console.log('  (cleaned up test NPC + wallet)');
  }

  console.log('─'.repeat(50));
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
