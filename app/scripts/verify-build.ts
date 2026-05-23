/**
 * verify-build.ts — programmatic test harness for the 2026-05-20 build.
 *
 * Exercises:
 *  1. Body damage routing — pure routeDamage + applyDamageToCharacter wiring
 *  2. Subscription lifecycle — createSubscription (lump) + runDripForUser
 *     (catch-up + idempotency)
 *  3. Auth tokens — issue + consume + reject-expired + reject-double-consume
 *  4. Stripe signature verification — accepts good sig, rejects bad sig and
 *     stale timestamp
 *  5. Death engine sanity — calculateDeathSplit on Test Pilgrim returns
 *     non-zero campaign + lady-death and a 'GHOST' transformation
 *
 * Each test prints a single line PASS/FAIL with the reason. Exit code is
 * the number of failures.
 *
 * Run: `npx tsx scripts/verify-build.ts`
 */

import './_server-only-shim'; // MUST be first — neutralizes 'server-only' at import time
import { config } from 'dotenv';
config();

import crypto from 'node:crypto';
import { prisma } from '../src/lib/db';
import { routeDamage, HUMAN_BASELINE_ANATOMY } from '../src/lib/body-damage';
import { applyDamageToCharacter } from '../src/services/damage';
import { createSubscription, runDripForUser } from '../src/services/subscription';
import { monthlyDrip, SUBSCRIBE_LUMP } from '../src/services/subscription-drip';
import { issueToken, consumeToken } from '../src/lib/auth-tokens';
import { calculateTKV, calculateDeathSplit } from '../src/services/krma/evaluator';
import { gatherTraitModifiers } from '../src/services/trait-modifiers';
import type { GrowthCharacter, GrowthTrait } from '../src/types/growth';
import type { GrowthWorldItem } from '../src/types/item';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    const msg = detail ? `${name} — ${detail}` : name;
    errors.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ── 1. Body damage routing ──────────────────────────────────────────────

async function testDamageRouting() {
  section('1. Body damage routing (pure routeDamage)');

  // Light hit absorbed by armor-equivalent (head resist 6, damage 5)
  const r1 = routeDamage(HUMAN_BASELINE_ANATOMY, 'bashing', 5);
  const headEvent1 = r1.events.find(e => e.partName === 'Head');
  assert('light hit recorded against root before head', r1.events[0].partName === 'Body');
  // 5 damage to Body (resist 4) → passes 1 through, splits over Head+Torso = 0 each
  assert('light hit does NOT propagate to head when split <1', headEvent1 === undefined,
    `events: ${r1.events.map(e => e.partName).join(', ')}`);

  // Heavy bashing — should cascade and drop conditions
  const r2 = routeDamage(HUMAN_BASELINE_ANATOMY, 'bashing', 30);
  const bodyEv = r2.events.find(e => e.partName === 'Body');
  assert('heavy hit drops Body condition tier', bodyEv?.brokeTier === true);
  const torsoEv = r2.events.find(e => e.partName === 'Torso');
  assert('heavy hit cascades to Torso', torsoEv !== undefined);
  assert('heavy hit cascades to Head', r2.events.some(e => e.partName === 'Head'));

  // Piercing with explicit target path
  const r3 = routeDamage(HUMAN_BASELINE_ANATOMY, 'piercing', 30, {
    piercingTargetPath: ['Head', 'Brain'],
  });
  const brainEv = r3.events.find(e => e.partName === 'Brain');
  assert('piercing reaches designated Brain', brainEv !== undefined);
  assert('piercing path does NOT touch Torso', !r3.events.some(e => e.partName === 'Torso'));

  // Piercing with invalid path falls back to even-split
  const r4 = routeDamage(HUMAN_BASELINE_ANATOMY, 'piercing', 30, {
    piercingTargetPath: ['Nonexistent Part'],
  });
  assert('piercing with bad path falls back gracefully (no throw)', r4.events.length > 0);

  // Resist 0 weak point — every hit registers
  const weakBody: GrowthWorldItem = {
    description: 'Weak test body',
    isBodyPart: true,
    partName: 'WeakBody',
    baseResist: 0,
    condition: 3,
    contains: [
      { description: 'Heart', isBodyPart: true, partName: 'Heart', baseResist: 0, condition: 3 },
    ],
  };
  const r5 = routeDamage(weakBody, 'slashing', 1);
  assert('damage 1 with resist 0 drops a tier on root', r5.events[0].brokeTier === true);

  // Multiple-of-N even split arithmetic
  const fourChildBody: GrowthWorldItem = {
    description: 'Body with 4 children',
    isBodyPart: true,
    partName: 'Quad',
    baseResist: 0,
    condition: 3,
    contains: [
      { description: 'A', isBodyPart: true, partName: 'A', baseResist: 0, condition: 3 },
      { description: 'B', isBodyPart: true, partName: 'B', baseResist: 0, condition: 3 },
      { description: 'C', isBodyPart: true, partName: 'C', baseResist: 0, condition: 3 },
      { description: 'D', isBodyPart: true, partName: 'D', baseResist: 0, condition: 3 },
    ],
  };
  const r6 = routeDamage(fourChildBody, 'heat', 12);
  const childDamage = r6.events.filter(e => ['A','B','C','D'].includes(e.partName));
  assert('4-way split delivers to all 4 children', childDamage.length === 4);
  assert('4-way split delivers 3 each (12/4=3)', childDamage.every(e => e.damageDealt === 3));
}

async function testDamageApi() {
  section('2. applyDamageToCharacter (DB round-trip)');

  // Find Test Pilgrim
  const character = await prisma.character.findFirst({ where: { name: 'Test Pilgrim' } });
  if (!character) {
    assert('Test Pilgrim exists', false, 'run bootstrap first');
    return;
  }
  assert('Test Pilgrim exists', true);

  // Need an admin to act with edit permissions
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) { assert('admin exists', false); return; }

  const before = JSON.parse(character.data) as GrowthCharacter;
  const beforeAnatomy = before.bodyAnatomy as GrowthWorldItem | undefined;
  assert('Test Pilgrim has bodyAnatomy from creation', beforeAnatomy !== undefined);

  // Apply damage via the service path
  const result = await applyDamageToCharacter(admin.id, 'ADMIN', {
    characterId: character.id,
    damageType: 'slashing',
    amount: 20,
  });
  assert('damage application returns events', result.events.length > 0);

  // Re-read and verify persisted
  const after = await prisma.character.findUnique({ where: { id: character.id } });
  const afterData = JSON.parse(after!.data) as GrowthCharacter;
  const afterAnatomy = afterData.bodyAnatomy as GrowthWorldItem | undefined;
  assert('persisted bodyAnatomy still present', afterAnatomy !== undefined);
  if (afterAnatomy) {
    // After 20 slashing damage, Body (resist 4) should have taken a tier hit.
    assert('persisted root condition dropped', (afterAnatomy.condition ?? 3) < 3);
  }

  // Campaign event written
  const events = await prisma.campaignEvent.findMany({
    where: { campaignId: character.campaignId!, type: 'damage' },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  assert('damage event logged to campaignEvent', events.length === 1);
}

// ── 3. Subscription lifecycle ────────────────────────────────────────────

async function testSubscription() {
  section('3. Subscription drip lifecycle');

  // Use the admin as the test subscriber
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) { assert('admin exists', false); return; }

  // Wipe any prior test subscription
  await prisma.subscription.deleteMany({ where: { userId: admin.id } });

  // Capture wallet balance before
  const walletBefore = await prisma.wallet.findFirst({ where: { ownerId: admin.id } });
  if (!walletBefore) { assert('admin wallet exists', false); return; }
  const balanceBefore = walletBefore.balance;

  // Create — lump fires
  const { subscription, lumpTransactionId } = await createSubscription(
    { userId: admin.id, status: 'ACTIVE' },
    'TEST',
  );
  assert('subscription created', subscription !== null);
  assert('lump transaction fired', lumpTransactionId !== null);

  const walletAfterLump = await prisma.wallet.findUnique({ where: { id: walletBefore.id } });
  assert('lump credited exactly SUBSCRIBE_LUMP',
    walletAfterLump!.balance - balanceBefore === BigInt(SUBSCRIBE_LUMP),
    `delta=${walletAfterLump!.balance - balanceBefore}`);

  // Idempotency: re-create should be a no-op for lump
  const second = await createSubscription({ userId: admin.id }, 'TEST');
  assert('re-create returns existing sub', second.subscription?.id === subscription?.id);
  assert('re-create does NOT re-pay lump', second.lumpTransactionId === null);

  // Force subscribedAt 3 months ago, then run drip
  await prisma.subscription.update({
    where: { userId: admin.id },
    data: { subscribedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 100) }, // ~3.3 months
  });
  const dripResult = await runDripForUser(admin.id, 'TEST');
  assert('drip catches up 3 months', dripResult.executed.length >= 3,
    `executed=${dripResult.executed.length}`);
  const expectedSum = monthlyDrip(1) + monthlyDrip(2) + monthlyDrip(3);
  const actualSum = dripResult.executed.slice(0, 3).reduce((s, e) => s + e.amount, 0);
  assert('drip months 1-3 sum matches monthlyDrip()',
    actualSum === expectedSum,
    `actual=${actualSum} expected=${expectedSum}`);

  // Idempotent: running again is a no-op
  const dripAgain = await runDripForUser(admin.id, 'TEST');
  assert('drip re-run is a no-op (idempotent)', dripAgain.executed.length === 0);

  // Cleanup
  await prisma.subscription.deleteMany({ where: { userId: admin.id } });
}

// ── 4. Auth tokens ──────────────────────────────────────────────────────

async function testAuthTokens() {
  section('4. Auth tokens (DB-backed)');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) { assert('admin exists', false); return; }

  const t1 = await issueToken(admin.id, 'email_verification');
  assert('token issued', typeof t1 === 'string' && t1.length > 20);

  const consumed1 = await consumeToken(t1, 'email_verification');
  assert('token consumes', consumed1?.userId === admin.id);

  const consumed2 = await consumeToken(t1, 'email_verification');
  assert('token cannot be double-consumed', consumed2 === null);

  // Wrong kind should fail
  const t2 = await issueToken(admin.id, 'password_reset');
  const wrongKind = await consumeToken(t2, 'email_verification');
  assert('wrong-kind consume fails', wrongKind === null);

  // Expired token via tiny TTL
  const t3 = await issueToken(admin.id, 'email_verification', 1);
  await new Promise(r => setTimeout(r, 10));
  const expired = await consumeToken(t3, 'email_verification');
  assert('expired token rejected', expired === null);

  // Unknown token rejected
  const bogus = await consumeToken('not-a-real-token', 'email_verification');
  assert('unknown token rejected', bogus === null);
}

// ── 5. Stripe signature verification ────────────────────────────────────

function verifyStripeSig(payload: string, header: string, secret: string): boolean {
  // Mirror of the route's logic — we can't import it directly since it's
  // a route handler. If we change the route, update here too.
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const eq = p.indexOf('=');
      return eq === -1 ? [p, ''] : [p.slice(0, eq), p.slice(eq + 1)];
    })
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const ts = parseInt(t, 10);
  const age = Math.floor(Date.now() / 1000) - ts;
  if (!Number.isFinite(age) || Math.abs(age) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  const a = Buffer.from(v1, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function testStripeSignature() {
  section('5. Stripe webhook signature');
  const secret = 'whsec_test_dummy';
  const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', data: { object: {} } });
  const ts = Math.floor(Date.now() / 1000);

  // Good signature
  const goodSig = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  assert('valid signature accepted', verifyStripeSig(payload, `t=${ts},v1=${goodSig}`, secret));

  // Bad signature
  assert('tampered signature rejected', !verifyStripeSig(payload, `t=${ts},v1=deadbeef`, secret));

  // Stale timestamp (6 mins ago)
  const staleTs = ts - 6 * 60;
  const staleSig = crypto.createHmac('sha256', secret).update(`${staleTs}.${payload}`).digest('hex');
  assert('stale timestamp rejected', !verifyStripeSig(payload, `t=${staleTs},v1=${staleSig}`, secret));

  // Wrong secret
  const wrongSecretSig = crypto.createHmac('sha256', 'whsec_wrong').update(`${ts}.${payload}`).digest('hex');
  assert('wrong-secret signature rejected', !verifyStripeSig(payload, `t=${ts},v1=${wrongSecretSig}`, secret));
}

// ── 6. Death engine ─────────────────────────────────────────────────────

async function testDeathEngine() {
  section('6. Death engine (calculateDeathSplit)');
  const character = await prisma.character.findFirst({ where: { name: 'Test Pilgrim' } });
  if (!character) { assert('Test Pilgrim exists', false); return; }
  const charData = JSON.parse(character.data) as GrowthCharacter;
  const tkv = calculateTKV(charData);
  const manifest = calculateDeathSplit(charData, tkv);
  assert('manifest produces components', manifest.components.length > 0);
  assert('toPlayer is 0 (transformation model)', manifest.toPlayer === 0);
  assert('toCampaign > 0 (body strips)', manifest.toCampaign > 0,
    `toCampaign=${manifest.toCampaign}`);
  // Lady Death gets frequency capacity at minimum
  assert('toLadyDeath > 0 (freq capacity + soul halves)',
    manifest.toLadyDeath > 0,
    `toLadyDeath=${manifest.toLadyDeath}`);
  // 'kept' components should appear for spirit/non-body
  assert('manifest has kept components',
    manifest.components.some(c => c.destination === 'kept'));
}

// ── 7. Trait roll-modifier pipeline ─────────────────────────────────────

function testTraitModifiers() {
  section('7. Trait roll-modifier pipeline (gatherTraitModifiers)');

  const buildTrait = (
    name: string,
    type: 'nectar' | 'blossom' | 'thorn',
    rollModifiers: GrowthTrait['rollModifiers'],
  ): GrowthTrait => ({
    name,
    type,
    category: 'utility',
    description: '',
    rollModifiers,
  });

  const char = {
    traits: [
      buildTrait("Sword's Edge", 'nectar', [{ flat: 2, skillNamePattern: 'sword', label: '+2 sword' }]),
      buildTrait('Iron Will', 'nectar', [{ flat: 1, governorAttribute: 'willpower' }]),
      buildTrait('Eternal Focus', 'blossom', [{ flat: 1 }]),
      buildTrait('Crippling Doubt', 'thorn', [{ flat: -1, governorAttribute: 'willpower' }]),
      buildTrait('No-op (no mods)', 'nectar', undefined),
    ],
  } as unknown as GrowthCharacter;

  // Case A: sword check governed by clout — sword nectar (+2) + always-on Eternal Focus (+1) = +3
  const a = gatherTraitModifiers(char, { skillName: 'Swordsmanship', governorAttribute: 'clout' });
  assert('skill-name pattern + global modifier sum correctly', a.totalFlat === 3,
    `expected 3, got ${a.totalFlat}; sources=${a.sources.map(s => `${s.traitName}:${s.flat}`).join(',')}`);

  // Case B: willpower check — Iron Will (+1) + Eternal Focus (+1) + Crippling Doubt (-1) = +1
  const b = gatherTraitModifiers(char, { skillName: 'Meditation', governorAttribute: 'willpower' });
  assert('governor-matched nectar + thorn net out correctly', b.totalFlat === 1,
    `expected 1, got ${b.totalFlat}`);

  // Case C: unrelated check (no skill, no governor) — only the always-on blossom fires
  const c = gatherTraitModifiers(char, {});
  assert('global-only modifier applies when context empty', c.totalFlat === 1,
    `expected 1, got ${c.totalFlat}`);

  // Case D: trait with no rollModifiers contributes nothing
  const charNone = { traits: [buildTrait('Pure flavor', 'nectar', undefined)] } as unknown as GrowthCharacter;
  const d = gatherTraitModifiers(charNone, { skillName: 'Anything' });
  assert('trait without rollModifiers contributes 0', d.totalFlat === 0 && d.sources.length === 0);

  // Case E: contributor list carries trait type for UI styling
  assert('sources track trait type', a.sources.every(s => s.traitType === 'nectar' || s.traitType === 'blossom'));
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('━'.repeat(60));
  console.log('verify-build.ts — 2026-05-20 build verification');
  console.log('━'.repeat(60));
  try {
    await testDamageRouting();
    await testDamageApi();
    await testSubscription();
    await testAuthTokens();
    await testStripeSignature();
    await testDeathEngine();
    testTraitModifiers();
  } catch (err) {
    failed += 1;
    errors.push(`UNCAUGHT: ${err instanceof Error ? err.message : String(err)}`);
    console.error('UNCAUGHT', err);
  }

  console.log('\n' + '━'.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const e of errors) console.log(`  - ${e}`);
  }
  await prisma.$disconnect();
  process.exit(failed);
}

main();
