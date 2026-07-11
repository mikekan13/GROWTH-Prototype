/**
 * T27 acceptance — death triggers end-to-end (r-2026-07-11-01/-02).
 *
 *  1. Deplete Frequency to 0 → Death's Door state reports the trigger.
 *  2. SURVIVAL: forced roll win → 1 Frequency restored; survival is final
 *     (no pending split). Strictly-greater rule: a TIE dies.
 *  3. BUFFS: a Nectar with a 'death save' rollModifier turns a losing roll
 *     into a survival (Mike's check — anything can be made).
 *  4. MERCY: failed roll marks the pending split; sparePendingDeath clears
 *     it (Tara's one-way mercy).
 *  5. DEATH: failed roll → split preview → executeDeathSplit → GHOST,
 *     ledger rows to campaign + Lady Death wallets, Lady Death invocation
 *     row logged.
 *
 * Deterministic (injected rng). Restores character state; the split's
 * ledger rows are append-only, so the KRMA is routed back to the Terminal
 * reserve afterward (CORRECTION) — the 100B audit still reconciles.
 *
 * Run: npx tsx scripts/test-death-e2e.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { executeFrequencyOp } from '../src/services/frequency';
import { getDeathSaveState, rollDeathSave, sparePendingDeath } from '../src/services/death-save';
import { previewDeathSplit, executeDeathSplit } from '../src/services/krma/death-split';
import { executeTransaction } from '../src/services/krma/ledger';
import type { GrowthCharacter, GrowthTrait } from '../src/types/growth';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** rng that returns queued values in order (die-size ignored — forced). */
function forcedRng(values: number[]) {
  const queue = [...values];
  return () => {
    const v = queue.shift();
    if (v === undefined) throw new Error('forcedRng exhausted');
    return v;
  };
}

async function depleteToZero(characterId: string, adminId: string, adminRole: string) {
  const row = await prisma.character.findUnique({ where: { id: characterId } });
  const data = JSON.parse(row!.data) as GrowthCharacter;
  const current = data.attributes.frequency.current;
  if (current > 0) {
    await executeFrequencyOp(adminId, adminRole, {
      characterId,
      op: 'deplete',
      amount: current,
      reason: 'T27 e2e — drive to Death\'s Door',
    });
  }
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const character = await prisma.character.findFirst({ where: { name: 'Test Pilgrim' } });
  if (!admin || !character || !character.campaignId) {
    console.error('Missing prerequisites — run npm run seed:all.');
    process.exit(1);
  }
  const backup = { data: character.data, status: character.status };
  const campaignId = character.campaignId;

  // Character wallet (create empty if the pipeline didn't) + reserve handles
  let charWallet = await prisma.wallet.findFirst({ where: { characterId: character.id } });
  if (!charWallet) {
    charWallet = await prisma.wallet.create({
      data: { ownerType: 'CHARACTER', walletType: 'CHARACTER', characterId: character.id, balance: BigInt(0) },
    });
  }
  const terminal = await prisma.wallet.findFirst({ where: { walletType: 'RESERVE', label: 'Terminal' } });
  const ladyDeathWallet = await prisma.wallet.findFirst({ where: { walletType: 'LADY_DEATH' } })
    ?? await prisma.wallet.findFirst({ where: { label: { contains: 'Lady Death' } } });
  if (!terminal || !ladyDeathWallet) {
    console.error('Reserve/Lady Death wallets missing — run npm run seed:all.');
    process.exit(1);
  }

  try {
    // ── 1. Trigger: Frequency → 0 opens Death's Door ──────────────────
    await depleteToZero(character.id, admin.id, admin.role);
    const state = await getDeathSaveState(character.id, admin.id, admin.role);
    check('trigger: Death\'s Door open at Frequency 0', state.atDeathsDoor && state.triggers.includes('frequency_zero'), state.triggers.join(','));

    // ── 2. Survival + restoration; ties die ───────────────────────────
    const win = await rollDeathSave(
      character.id,
      { door: 'COMBAT', taraChoice: 'd12' },
      admin.id, admin.role,
      { rng: forcedRng([4, 3]) }, // fate 4 vs tara 3 → strictly greater, survive
    );
    check('survive: FD 4 > Tara 3', win.survived === true);
    check('survive: 1 Frequency restored', win.restored?.frequency === true);
    const afterWin = JSON.parse((await prisma.character.findUnique({ where: { id: character.id } }))!.data) as GrowthCharacter;
    check('survive: frequency current = 1', afterWin.attributes.frequency.current === 1);

    await depleteToZero(character.id, admin.id, admin.role);
    const tie = await rollDeathSave(
      character.id,
      { door: 'COMBAT', taraChoice: 'd12' },
      admin.id, admin.role,
      { rng: forcedRng([4, 4]) }, // tie → Lady Death wins (r-2026-07-11-02)
    );
    check('tie: goes to Lady Death (dies)', tie.survived === false && tie.pendingDeathSplit === true);

    // ── 3. Mercy: Tara spares the failed roll ─────────────────────────
    await sparePendingDeath(character.id, admin.id, admin.role);
    const sparedState = await getDeathSaveState(character.id, admin.id, admin.role);
    check('mercy: pending split cleared, character lives', sparedState.pendingDeathSplit === false);

    // ── 4. Buffs: a death-save Nectar flips the outcome ───────────────
    {
      const row = await prisma.character.findUnique({ where: { id: character.id } });
      const data = JSON.parse(row!.data) as GrowthCharacter;
      const nectar: GrowthTrait = {
        name: 'Grave-Warded',
        category: 'blessing' as GrowthTrait['category'],
        description: 'T27 test — wards the bearer at the door of death.',
        type: 'nectar',
        pillar: 'spirit',
        rollModifiers: [{ flat: 2, skillNamePattern: 'death save', label: 'Grave-Warded' }],
      } as GrowthTrait;
      data.traits = [...(data.traits ?? []), nectar];
      await prisma.character.update({ where: { id: character.id }, data: { data: JSON.stringify(data) } });
    }
    const buffed = await rollDeathSave(
      character.id,
      { door: 'COMBAT', taraChoice: 'd12' },
      admin.id, admin.role,
      { rng: forcedRng([3, 4]) }, // raw 3 vs 4 would DIE; +2 Grave-Warded → 5 > 4 survives
    );
    check('buff: Nectar modifier applied (+2 from Grave-Warded)', buffed.modifiers?.totalFlat === 2, JSON.stringify(buffed.modifiers));
    check('buff: losing roll flipped to survival (3+2 > 4)', buffed.survived === true && buffed.characterTotal === 5);

    // ── 5. Death: fail → preview → confirm → ghost + ledger + Tara ────
    await depleteToZero(character.id, admin.id, admin.role);
    const fail = await rollDeathSave(
      character.id,
      { door: 'COMBAT', taraChoice: '3' }, // static value from the ladder
      admin.id, admin.role,
      { rng: forcedRng([1]) }, // fate 1 (+2 buff = 3) vs static 3 → tie → dies
    );
    check('death: failed save marks pending split', fail.survived === false && fail.pendingDeathSplit === true);

    const preview = await previewDeathSplit(character.id, campaignId);
    const manifest = preview.manifest;
    check('death: preview manifest routes toCampaign + toLadyDeath', manifest.toCampaign > 0 && manifest.toLadyDeath > 0,
      `toCampaign=${manifest.toCampaign} toLadyDeath=${manifest.toLadyDeath}`);

    // Fund the character wallet with exactly the manifest total so the
    // capped transfers fire in full (locked KV becomes liquid on death).
    const fundAmount = BigInt(manifest.toCampaign + manifest.toLadyDeath);
    await executeTransaction({
      fromWalletId: terminal.id,
      toWalletId: charWallet.id,
      amount: fundAmount,
      state: 'FLUID',
      reason: 'CORRECTION',
      description: 'T27 e2e — stage locked-KV liquidity for the death split',
      metadata: { test: 'test-death-e2e' },
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      idempotencyKey: `t27-fund-${Date.now()}`,
    });

    const split = await executeDeathSplit(character.id, campaignId, { cause: 'T27 e2e — Facing Death failed' }, admin.id);
    check('death: split executed with ledger transactions', split.transactions.length >= 2, `${split.transactions.length} txs`);
    const reasons = split.transactions.map(t => t.reason).sort().join(',');
    check('death: DEATH_BODY_RETURN + DEATH_FREQUENCY_SINK rows', reasons.includes('DEATH_BODY_RETURN') && reasons.includes('DEATH_FREQUENCY_SINK'), reasons);

    const ghost = await prisma.character.findUnique({ where: { id: character.id } });
    check('death: character status = GHOST', ghost?.status === 'GHOST', ghost?.status);

    const ladyDeath = await prisma.godHead.findUnique({ where: { name: 'Tara Almswood' } })
      ?? await prisma.godHead.findFirst({ where: { name: { contains: 'Death' } } });
    const invocation = await prisma.godHeadInvocation.findFirst({
      where: { godHeadId: ladyDeath?.id ?? '∅' },
      orderBy: { createdAt: 'desc' },
    });
    check('death: Lady Death invocation logged', !!invocation, invocation ? `status=${invocation.status}` : 'none');

    // ── Cleanup: route split KRMA back to Terminal; restore character ──
    for (const t of split.transactions) {
      await executeTransaction({
        fromWalletId: t.toWalletId,
        toWalletId: terminal.id,
        amount: BigInt(t.amount.toString()),
        state: 'FLUID',
        reason: 'CORRECTION',
        description: 'T27 e2e — reverse death-split test transfer',
        metadata: { test: 'test-death-e2e', reverses: t.id },
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        idempotencyKey: `t27-reverse-${t.id}`,
      });
    }
    // Any staged funds left on the character wallet flow back too.
    const charAfter = await prisma.wallet.findUnique({ where: { id: charWallet.id } });
    if (charAfter && charAfter.balance > BigInt(0)) {
      await executeTransaction({
        fromWalletId: charWallet.id,
        toWalletId: terminal.id,
        amount: charAfter.balance,
        state: 'FLUID',
        reason: 'CORRECTION',
        description: 'T27 e2e — return staged liquidity',
        metadata: { test: 'test-death-e2e' },
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        idempotencyKey: `t27-return-${Date.now()}`,
      });
    }
  } finally {
    await prisma.character.update({
      where: { id: character.id },
      data: { data: backup.data, status: backup.status },
    });
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
