/**
 * Undo the false "Kristopher's car" stub (HW8 run 5, 2026-10-26). JEWL asked about a car the world already had — the
 * 2017 Ford Fusion Energi, his through an `owns` edge, held by nobody, located nowhere — because his view of the sim
 * listed only what beings HOLD and what lies in the ROOM, not what they own elsewhere. Mike confirmed; a duplicate was
 * spun up and 50 KRMA settled against it (75 held, 25 released). This removes the duplicate and moves the 50 back from
 * the hold wallet to the campaign wallet as an improvisation release, on the record. Idempotent.
 */
import { prisma } from '@/lib/db';
import { executeTransaction } from '@/services/krma/ledger';

const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const STUB = 'cmvosqz8m00h72c48jl6gjj7j';
const TICKET = 'cmvosqnrc00h52c489wcysvod';
const FORD = 'cmvcfyn460009zc48xhwl6kb8';

async function main() {
  const stub = await prisma.campaignItem.findUnique({ where: { id: STUB } });
  if (stub) {
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: STUB }, { targetId: STUB }] } });
    await prisma.campaignItem.delete({ where: { id: STUB } });
    console.log('removed duplicate item:', stub.name);
  } else console.log('duplicate item already gone');

  const ticket = await prisma.reconciliation.findUnique({ where: { id: TICKET } });
  if (!ticket) { console.log('no ticket'); return; }
  const campaignWallet = await prisma.wallet.findFirst({ where: { campaignId: CAMP, walletType: 'CAMPAIGN' } });
  const settled = ticket.settledKrma ?? 0;
  if (ticket.holdWalletId && campaignWallet && settled > 0) {
    const tx = await executeTransaction({
      fromWalletId: ticket.holdWalletId, toWalletId: campaignWallet.id, amount: BigInt(settled), state: 'UNLOCK', reason: 'IMPROV_RELEASE',
      description: `False stub undone — the world already had the 2017 Ford Fusion Energi (${FORD}); ${settled} KRMA returned (reconciliation ${TICKET})`,
      metadata: { reconciliationId: TICKET, undone: true, duplicateOf: FORD }, campaignId: CAMP,
      actorId: ticket.createdBy, actorType: 'GM', idempotencyKey: `improv-undo::${TICKET}`,
    });
    await prisma.reconciliation.update({ where: { id: TICKET }, data: { settledKrma: 0, plan: JSON.stringify([{ ...(JSON.parse(ticket.plan) as unknown[])[0] as object, createdId: null, undone: 'duplicate of the 2017 Ford Fusion Energi' }]) } });
    console.log(`returned ${settled} KRMA to the campaign wallet (tx ${tx.id})`);
  } else console.log('nothing to return (settled', settled, ')');
  const wallets = await prisma.wallet.findMany({ where: { campaignId: CAMP }, select: { walletType: true, balance: true } });
  console.log('wallets:', wallets.map((w) => `${w.walletType}=${w.balance}`).join(' '));
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
