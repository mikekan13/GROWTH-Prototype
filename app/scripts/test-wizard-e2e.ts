/**
 * T29 acceptance — wizard sessions D+E end-to-end.
 *
 *  1. DRAFT entity → full crystallize input (seed Human, root Wanderer,
 *     branch First Blood, wizard attributes, a published-catalog-shaped
 *     skill + nectar/thorn pair, two goals).
 *  2. Asserts: status APPROVED; the ledger shows EXACTLY ONE
 *     CHARACTER_INVEST transaction whose amount equals the T16 calculator
 *     (calculateTKV) on the final sheet — to the KRMA; each goal carries a
 *     recorded custodian godhead (Council Router).
 *  3. Insufficient-funds guard: crystallization FAILS (stays DRAFT) when
 *     the campaign wallet can't cover the TKV.
 *
 * Cleans up: dissolve refund through the same single path, then deletes
 * the test rows. Run: npx tsx scripts/test-wizard-e2e.ts
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { prisma } from '../src/lib/db';
import { crystallizeEntity } from '../src/services/entity';
import { crystallizeEntity as crystallizeKrma } from '../src/services/krma/crystallization';
import { calculateTKV } from '../src/services/krma/evaluator';
import { createDefaultCharacter } from '../src/lib/defaults';
import type { GrowthCharacter } from '../src/types/growth';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const campaign = await prisma.campaign.findFirst({ where: { name: 'The Fraying' } });
  if (!admin || !campaign) {
    console.error('Missing prerequisites — run npm run seed:all.');
    process.exit(1);
  }
  const root = await prisma.forgeItem.findFirst({
    where: { campaignId: campaign.id, type: 'root', name: 'Wanderer', status: 'published' },
  });
  const branch = await prisma.forgeItem.findFirst({
    where: { campaignId: campaign.id, type: 'branch', name: 'First Blood', status: 'published' },
  });
  if (!root || !branch) {
    console.error('SRB content missing in The Fraying — run npm run seed:all.');
    process.exit(1);
  }

  // DRAFT entity
  const draft = await prisma.character.create({
    data: {
      name: 'T29 Probe',
      entityType: 'NPC',
      status: 'DRAFT',
      userId: admin.id,
      campaignId: campaign.id,
      data: JSON.stringify(createDefaultCharacter('T29 Probe')),
    },
  });

  const input = {
    seedName: 'Human',
    rootForgeItemId: root.id,
    branchForgeItemIds: [branch.id],
    attributes: { clout: 3, celerity: 2, constitution: 3, flow: 2, frequency: 4, focus: 2, willpower: 3, wisdom: 2, wit: 2 },
    skills: [
      { name: 'Survival', level: 4, governors: ['wisdom'], description: 'Live off the land' },
    ],
    traits: [
      { name: 'Iron Stomach', type: 'nectar' as const, pillar: 'body' as const, mechanicalEffect: 'The bearer suffers no penalty from spoiled food or drink.' },
      { name: 'Old Debt', type: 'thorn' as const, pillar: 'soul' as const, mechanicalEffect: 'A creditor from the past may call in a favor at the worst moment.' },
    ],
    goals: [
      { description: 'Find the sister who vanished in the Fraying', priority: 4 },
      { description: 'Repay the old debt before it is collected', priority: 2 },
    ],
  };

  let crystallized = false;
  try {
    const result = await crystallizeEntity(draft.id, admin.id, admin.role, input);
    crystallized = true;
    check('crystallize: returns APPROVED', result.status === 'APPROVED');

    const after = await prisma.character.findUnique({ where: { id: draft.id } });
    check('character: status APPROVED', after?.status === 'APPROVED', after?.status);
    const finalData = JSON.parse(after!.data) as GrowthCharacter;
    const tkv = calculateTKV(finalData);
    check('sheet: seed grants landed (Fate Die + fated age in TKV)', !!tkv.fateDie && !!tkv.fatedAge,
      `fateDie=${tkv.fateDie?.die}:${tkv.fateDie?.kv} fatedAge=${tkv.fatedAge?.kv}`);
    check('sheet: wizard skill + traits present',
      finalData.skills.some(s => s.name === 'Survival') && (finalData.traits ?? []).some(t => t.name === 'Iron Stomach'));

    // EXACTLY ONE investment transaction, amount == calculator
    const charWallet = await prisma.wallet.findFirst({ where: { characterId: draft.id } });
    check('ledger: character wallet created', !!charWallet);
    const investTxs = await prisma.krmaTransaction.findMany({
      where: { toWalletId: charWallet!.id, reason: 'CHARACTER_INVEST' },
    });
    check('ledger: EXACTLY ONE CHARACTER_INVEST transaction', investTxs.length === 1, `${investTxs.length} txs`);
    check(`ledger: investment == calculateTKV (${tkv.total})`, investTxs[0] && Number(investTxs[0].amount) === tkv.total,
      `tx=${investTxs[0] ? Number(investTxs[0].amount) : 'none'}`);

    // Council Router: custodian recorded per goal
    const goals = await prisma.goal.findMany({ where: { characterId: draft.id } });
    check('goals: both created', goals.length === 2, `${goals.length}`);
    check('goals: custodian godhead recorded on every goal',
      goals.length > 0 && goals.every(g => !!g.custodianId && !!g.custodianName),
      goals.map(g => `${g.custodianName ?? 'NONE'}(${g.pillar ?? '-'})`).join(', '));

    // Double-crystallization guard (single path enforces it)
    let doubleBlocked = false;
    try {
      await crystallizeKrma(admin.id, admin.role, campaign.id, {
        entityId: draft.id, entityType: 'character', entityName: draft.name,
        karmicValue: tkv.total, action: 'crystallize',
      });
    } catch { doubleBlocked = true; }
    check('guard: double-crystallization rejected', doubleBlocked);
  } finally {
    // Cleanup: dissolve refund through the same path, then delete rows.
    if (crystallized) {
      const after = await prisma.character.findUnique({ where: { id: draft.id } });
      const tkv = calculateTKV(JSON.parse(after!.data) as GrowthCharacter);
      await crystallizeKrma(admin.id, admin.role, campaign.id, {
        entityId: draft.id, entityType: 'character', entityName: draft.name,
        karmicValue: tkv.total, action: 'dissolve',
      }).catch(e => console.error('cleanup dissolve failed:', e));
    }
    await prisma.goal.deleteMany({ where: { characterId: draft.id } });
    await prisma.wallet.deleteMany({ where: { characterId: draft.id, balance: BigInt(0) } });
    await prisma.character.delete({ where: { id: draft.id } }).catch(() => null);
  }

  // ── 3. Insufficient-funds guard on a second draft ────────────────────
  const poorDraft = await prisma.character.create({
    data: {
      name: 'T29 Pauper',
      entityType: 'NPC',
      status: 'DRAFT',
      userId: admin.id,
      campaignId: campaign.id,
      data: JSON.stringify(createDefaultCharacter('T29 Pauper')),
    },
  });
  // Drain the campaign wallet to Terminal so the TKV is genuinely
  // unaffordable, attempt the crossing, then restore the funds.
  const campWallet = await prisma.wallet.findFirst({ where: { campaignId: campaign.id, ownerType: 'CAMPAIGN' } });
  const terminal = await prisma.wallet.findFirst({ where: { walletType: 'RESERVE', label: 'Terminal' } });
  const drained = campWallet!.balance;
  const { executeTransaction } = await import('../src/services/krma/ledger');
  try {
    if (drained > BigInt(0)) {
      await executeTransaction({
        fromWalletId: campWallet!.id, toWalletId: terminal!.id, amount: drained,
        state: 'FLUID', reason: 'CORRECTION', description: 'T29 e2e — drain for insufficient-funds guard',
        metadata: { test: 'test-wizard-e2e' }, actorId: 'SYSTEM', actorType: 'SYSTEM',
        idempotencyKey: `t29-drain-${Date.now()}`,
      });
    }
    let failedProperly = false;
    try {
      await crystallizeEntity(poorDraft.id, admin.id, admin.role, { ...input, goals: [] });
    } catch { failedProperly = true; }
    const pauper = await prisma.character.findUnique({ where: { id: poorDraft.id } });
    check('guard: unaffordable crystallization fails', failedProperly);
    check('guard: pauper stays DRAFT (no free characters)', pauper?.status === 'DRAFT', pauper?.status);
  } finally {
    if (drained > BigInt(0)) {
      await executeTransaction({
        fromWalletId: terminal!.id, toWalletId: campWallet!.id, amount: drained,
        state: 'FLUID', reason: 'CORRECTION', description: 'T29 e2e — restore campaign wallet',
        metadata: { test: 'test-wizard-e2e' }, actorId: 'SYSTEM', actorType: 'SYSTEM',
        idempotencyKey: `t29-restore-${Date.now()}`,
      }).catch(e => console.error('restore failed:', e));
    }
    await prisma.wallet.deleteMany({ where: { characterId: poorDraft.id, balance: BigInt(0) } });
    await prisma.character.delete({ where: { id: poorDraft.id } }).catch(() => null);
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
