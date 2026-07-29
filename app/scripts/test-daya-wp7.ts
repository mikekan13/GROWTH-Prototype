/**
 * WP7 acceptance — the World Ledger + World Adjudicator + room seed.
 *
 * Mock-based: injects a fake AnthropicLike client (tier C) so resolveIntent
 * never hits the real network. Uses a dedicated throwaway test campaign
 * (__DAYA_TEST_WP7__), cleaned up before and after.
 *
 *  1. Seeding is idempotent: re-seeding writes 0 new facts.
 *  2. resolveIntent('pick up the mug...') with a canned factsToWrite response
 *     writes a new fact AND supersedes the prior live fact for the same
 *     subjectKey — the contradiction guard: exactly one live fact remains,
 *     never a duplicate.
 *  3. resolveIntent with an explicit factsToSupersede-by-id response
 *     supersedes that exact fact.
 *  4. A response with a "check" triggers a server-side roll (lib/dice);
 *     roll.success matches roll.total >= roll.dr.
 *  5. experienceEvent is returned from every call.
 *
 * Run: npx tsx scripts/test-daya-wp7.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { seedDayaRoom } from './seed-daya-room';
import { currentFacts } from '../src/daya/world-ledger';
import { resolveIntent } from '../src/daya/adjudicator';
import type { AnthropicLike } from '../src/daya/model-client';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP7__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP7__ Probe';

function mockAnthropicQueue(responses: string[]): AnthropicLike {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const text = responses[Math.min(i, responses.length - 1)];
        i++;
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    },
  };
}

async function cleanupStale() {
  const campaign = await prisma.campaign.findFirst({ where: { name: TEST_CAMPAIGN_NAME } });
  if (campaign) {
    await prisma.worldFact.deleteMany({ where: { campaignId: campaign.id } });
    const chars = await prisma.character.findMany({ where: { name: TEST_CHAR_NAME, campaignId: campaign.id }, select: { id: true } });
    for (const c of chars) {
      await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
      await prisma.character.delete({ where: { id: c.id } });
    }
    await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
  }
}

async function main() {
  console.log('WP7 DAYA world ledger + adjudicator\n' + '─'.repeat(50));

  await cleanupStale();

  try {
    // ── 1. Idempotent seeding ──────────────────────────────────────────
    const first = await seedDayaRoom(TEST_CAMPAIGN_NAME);
    check('first seed writes facts', first.written > 0, `written=${first.written}`);

    const second = await seedDayaRoom(TEST_CAMPAIGN_NAME);
    check('re-seed writes 0 new facts (idempotent)', second.written === 0, `written=${second.written}`);
    check('re-seed reuses the same campaign', second.campaign.id === first.campaign.id);

    const campaign = first.campaign;

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.error('No ADMIN user found — run npm run seed:all first.');
      process.exit(1);
    }

    const character = await prisma.character.create({
      data: {
        name: TEST_CHAR_NAME,
        entityType: 'NPC',
        userId: admin.id,
        campaignId: campaign.id,
        data: JSON.stringify({ attributes: { frequency: { level: 10, current: 10 } } }),
        status: 'ACTIVE',
      },
    });

    const meterRowsBefore = await prisma.dayaModelCall.count({ where: { subsystem: 'adjudicator', tier: 'C' } });

    const mugBefore = await currentFacts(campaign.id, 'kitchen.counter.mug');
    check('precondition: exactly one live fact for kitchen.counter.mug before adjudication', mugBefore.length === 1, `count=${mugBefore.length}`);

    // ── 2. factsToWrite contradiction guard ────────────────────────────
    const pickupResponse = JSON.stringify({
      outcome: "You reach across the counter and close your hand around the mug's handle.",
      factsToWrite: [{ subjectKey: 'kitchen.counter.mug', fact: 'The mug is no longer on the counter — it is held in the entity\'s hand.' }],
      factsToSupersede: [],
      check: null,
      experienceEvent: { content: 'The mug is warm in my grip. Simple thing, solid thing.', valence: 0.2, salience: 0.15 },
    });

    const result1 = await resolveIntent(
      { campaignId: campaign.id, entityCharacterId: character.id, intent: 'pick up the mug from the kitchen counter', cycle: 1 },
      { anthropicClient: mockAnthropicQueue([pickupResponse]) },
    );

    check('result1: outcome text returned', result1.outcome.length > 0, result1.outcome);
    check('result1: one fact written', result1.factsWritten.length === 1, `count=${result1.factsWritten.length}`);
    check('result1: one fact superseded (the pre-existing counter fact)', result1.factsSuperseded.length === 1, `count=${result1.factsSuperseded.length}`);
    check('result1: superseded fact is the original mug-on-counter fact', result1.factsSuperseded[0]?.id === mugBefore[0].id);
    check('result1: experienceEvent returned', result1.experienceEvent.content.length > 0 && result1.experienceEvent.valence === 0.2);

    const mugAfter = await currentFacts(campaign.id, 'kitchen.counter.mug');
    check('contradiction guard: exactly one live fact remains (not duplicated)', mugAfter.length === 1, `count=${mugAfter.length}`);
    check('contradiction guard: live fact is the NEW one, not the old', mugAfter[0].id !== mugBefore[0].id && mugAfter[0].id === result1.factsWritten[0].id);

    const oldMugRow = await prisma.worldFact.findUnique({ where: { id: mugBefore[0].id } });
    check('old mug fact now points at its replacement', oldMugRow?.supersededById === mugAfter[0].id);

    // ── 3. Explicit factsToSupersede-by-id path ────────────────────────
    const windowBefore = await currentFacts(campaign.id, 'kitchen.window');
    check('precondition: one live fact for kitchen.window', windowBefore.length === 1);

    const windowResponse = JSON.stringify({
      outcome: 'You unlatch the kitchen window and slide it open a few inches.',
      factsToWrite: [],
      factsToSupersede: [{ id: windowBefore[0].id, fact: 'The kitchen window is open a few inches, unlatched.' }],
      check: null,
      experienceEvent: { content: 'Cool air slips in — the kitchen was stuffy.', valence: 0.1, salience: 0.1 },
    });

    const result2 = await resolveIntent(
      { campaignId: campaign.id, entityCharacterId: character.id, intent: 'open the kitchen window', cycle: 2 },
      { anthropicClient: mockAnthropicQueue([windowResponse]) },
    );

    check('result2: one fact written (the replacement)', result2.factsWritten.length === 1);
    check('result2: one fact superseded (by explicit id)', result2.factsSuperseded.length === 1 && result2.factsSuperseded[0].id === windowBefore[0].id);

    const windowAfter = await currentFacts(campaign.id, 'kitchen.window');
    check('explicit supersede: exactly one live fact remains', windowAfter.length === 1, `count=${windowAfter.length}`);
    check('explicit supersede: new fact text applied', windowAfter[0].fact.includes('open a few inches'));

    // ── 4. check/roll integration ──────────────────────────────────────
    const checkResponse = JSON.stringify({
      outcome: 'You try to pry the bedroom closet open.',
      factsToWrite: [],
      factsToSupersede: [],
      check: { attribute: 'clout', dr: 6 },
      experienceEvent: { content: 'The closet resists — stiffer than expected.', valence: -0.1, salience: 0.2 },
    });

    const result3 = await resolveIntent(
      { campaignId: campaign.id, entityCharacterId: character.id, intent: 'force the bedroom closet open', cycle: 3 },
      { anthropicClient: mockAnthropicQueue([checkResponse]) },
    );

    check('result3: roll returned', !!result3.roll, JSON.stringify(result3.roll));
    check('result3: roll.attribute matches', result3.roll?.attribute === 'clout');
    check('result3: roll.dr matches', result3.roll?.dr === 6);
    check('result3: roll.success matches total>=dr', result3.roll?.success === ((result3.roll?.total ?? -Infinity) >= 6));
    check('result3: outcome mentions server-resolved result', /worked|didn.t come together/.test(result3.outcome), result3.outcome);

    // ── 5. Metering: adjudicator calls went through the model client ──
    const meterRowsAfter = await prisma.dayaModelCall.count({ where: { subsystem: 'adjudicator', tier: 'C' } });
    check('adjudicator calls were metered via model-client (3 calls -> +3 rows)', meterRowsAfter - meterRowsBefore === 3, `delta=${meterRowsAfter - meterRowsBefore}`);
  } finally {
    await cleanupStale();
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
