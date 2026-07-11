/**
 * T31 acceptance — services emit lifecycle events.
 *
 * Fires each REAL lifecycle action (dispatcher in PENDING mode — no agent
 * runs) and asserts a dispatcher invocation row lands per routed event:
 *   blueprint.published, blueprint.unused_for_90d (sweep), goal.completed,
 *   goal.failed, goal.abandoned, contract.violated.
 * (entity.died covered by test-death-e2e; character.crystallized emits with
 * an intentionally empty route; entity.retired's emission point lands with
 * T30's retire flow.)
 *
 * Run: npx tsx scripts/test-lifecycle-events.ts
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });
delete process.env.GODHEAD_DISPATCHER; // PENDING mode — rows only, no agents

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const { prisma } = await import('../src/lib/db');
  const { createForgeItem, publishForgeItem, sweepUnusedBlueprints } = await import('../src/services/forge');
  const { createGoal, completeGoal, failGoal, abandonGoal } = await import('../src/services/goal');
  const { createContract, evaluateContract } = await import('../src/services/contracts');
  const { createDefaultCharacter } = await import('../src/lib/defaults');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const campaign = await prisma.campaign.findFirst({ where: { name: 'The Fraying' } });
  if (!admin || !campaign) { console.error('run npm run seed:all'); process.exit(1); }
  // forge's assertCampaignGM is strict — act as the actual GM there.
  const gm = await prisma.user.findUnique({ where: { id: campaign.gmUserId } });
  if (!gm) { console.error('campaign GM missing'); process.exit(1); }
  const before = new Date();

  const character = await prisma.character.create({
    data: {
      name: 'T31 Vessel', entityType: 'NPC', status: 'ACTIVE', userId: admin.id,
      campaignId: campaign.id, data: JSON.stringify(createDefaultCharacter('T31 Vessel')),
    },
  });
  let forgeItemId: string | null = null;
  let contractId: string | null = null;
  try {
    // blueprint.published + unused sweep (0-day window flags it instantly)
    const item = await createForgeItem(campaign.id, gm.id, gm.role, {
      type: 'item', name: `T31 Probe Blade ${Date.now()}`, data: { description: 'T31 probe', weightLbs: 1 },
    });
    forgeItemId = item.id;
    await publishForgeItem(item.id, gm.id, gm.role);
    const swept = await sweepUnusedBlueprints(0);
    check('sweep: flagged the fresh unused blueprint', swept.flagged >= 1, `${swept.flagged}`);

    // goal lifecycle ×3
    const mk = () => createGoal(admin.id, admin.role, {
      characterId: character.id, campaignId: campaign.id, description: 'T31 probe goal — lifecycle emission', priority: 1,
    });
    const g1 = await mk(); await completeGoal(g1.id);
    const g2 = await mk(); await failGoal(g2.id);
    const g3 = await mk(); await abandonGoal(g3.id, admin.id, admin.role);

    // contract.violated — synthetic always-false contract
    const contract = await createContract({
      name: `__T31__ always-violated ${Date.now()}`,
      parties: [{ type: 'CHARACTER', id: character.id }],
      predicate: { op: 'gt', left: { op: 'const', value: 1 }, right: { op: 'const', value: 2 } },
      penalty: { kind: 'FLAG_ADMIN', message: 'T31 probe' },
      campaignId: campaign.id,
    }, admin.id);
    contractId = contract.id;
    await evaluateContract(contract.id, 'MANUAL');

    await sleep(1500); // emissions are fire-and-forget

    const expect: Array<[string, string]> = [
      ['blueprint.published', 'Kai'],
      ['blueprint.unused_for_90d', 'Tara Almswood'],
      ['goal.completed', "Eth'erling"],
      ['goal.failed', "Eth'erling"],
      ['goal.abandoned', "Eth'erling"],
      ['contract.violated', 'Selva'],
    ];
    for (const [event, godheadName] of expect) {
      const godhead = await prisma.godHead.findUnique({ where: { name: godheadName } });
      const row = await prisma.godHeadInvocation.findFirst({
        where: { triggerType: event, godHeadId: godhead?.id ?? '∅', createdAt: { gt: before } },
      });
      check(`dispatcher row: ${event} → ${godheadName}`, !!row, row ? row.status : 'MISSING');
    }
  } finally {
    await prisma.goal.deleteMany({ where: { characterId: character.id } });
    await prisma.character.delete({ where: { id: character.id } }).catch(() => null);
    if (forgeItemId) await prisma.forgeItem.delete({ where: { id: forgeItemId } }).catch(() => null);
    if (contractId) {
      await prisma.contractEvaluation.deleteMany({ where: { contractId } });
      await prisma.penaltyAction.deleteMany({ where: { contractId } });
      await prisma.contract.delete({ where: { id: contractId } }).catch(() => null);
    }
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
