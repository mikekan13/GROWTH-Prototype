/**
 * Undo improvisation test artifacts in a campaign (readiness/smoke cleanup,
 * 2026-09-26): removes stub Locations tagged `improvised` and stub NPCs
 * carrying `_improv`, returns whatever the HOLD wallet still holds to the
 * campaign wallet, and optionally moves the awake beings back home.
 *
 * NOT a play-time tool — Mike ruled that erasing a character is beyond the
 * limits of canon changing. This is for wiping SMOKE-TEST stubs only.
 *
 * Usage: npx tsx scripts/daya-cleanup-improv.ts <campaignId> [--home <locationId> --who <characterId>] [--dry]
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { prisma } from '../src/lib/db';
import { executeTransaction } from '../src/services/krma/ledger';

const args = process.argv.slice(2);
const campaignId = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
const homeIdx = args.indexOf('--home');
const home = homeIdx >= 0 ? args[homeIdx + 1] : null;
const whoIdx = args.indexOf('--who');
const who = whoIdx >= 0 ? args[whoIdx + 1] : null;
if (!campaignId) { console.error('usage: daya-cleanup-improv.ts <campaignId> [--home <locationId> --who <characterId>] [--dry]'); process.exit(1); }

(async () => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) { console.error('campaign not found'); process.exit(1); }

  const locs = (await prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true, data: true } }))
    .filter((l) => { try { const d = JSON.parse(l.data) as { tags?: string[]; improvised?: unknown }; return !!d.improvised || (d.tags ?? []).includes('improvised'); } catch { return false; } });
  const npcs = (await prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { id: true, name: true, data: true } }))
    .filter((c) => { try { return !!(JSON.parse(c.data) as { _improv?: unknown })._improv; } catch { return false; } });
  console.log(`${dry ? '[dry] ' : ''}improvised stubs: ${locs.length} locations (${locs.map((l) => l.name).join(', ') || '-'}), ${npcs.length} NPCs (${npcs.map((n) => n.name).join(', ') || '-'})`);

  if (!dry) {
    const ids = [...locs.map((l) => l.id), ...npcs.map((n) => n.id)];
    if (ids.length) {
      await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }] } });
      for (const n of npcs) {
        await prisma.dayaEntity.deleteMany({ where: { characterId: n.id } });
        await prisma.goal.deleteMany({ where: { characterId: n.id } });
        await prisma.character.delete({ where: { id: n.id } });
      }
      for (const l of locs) await prisma.location.delete({ where: { id: l.id } });
    }
  }

  const hold = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'HOLD' } });
  const campaignWallet = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'CAMPAIGN' } });
  if (hold && campaignWallet && hold.balance > BigInt(0)) {
    console.log(`${dry ? '[dry] ' : ''}returning ${hold.balance} KRMA from the hold wallet to the campaign`);
    if (!dry) {
      await executeTransaction({
        fromWalletId: hold.id, toWalletId: campaignWallet.id, amount: hold.balance, state: 'UNLOCK', reason: 'CORRECTION',
        description: 'Smoke-test improvisation stubs removed — hold returned', metadata: { cleanup: true }, campaignId,
        actorId: campaign.gmUserId, actorType: 'SYSTEM', idempotencyKey: `improv-cleanup::${Date.now()}`,
      });
    }
  }

  if (home && who && !dry) {
    await prisma.entityRelationship.deleteMany({ where: { sourceId: who, relationshipType: 'located_at' } });
    await prisma.entityRelationship.create({ data: { campaignId, sourceId: who, sourceType: 'CHARACTER', targetId: home, targetType: 'LOCATION', relationshipType: 'located_at' } });
    console.log(`moved ${who} home to ${home}`);
  }
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
