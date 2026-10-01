/**
 * Give sheet-less NPCs a real mechanical sheet (readiness pass 2026-09-26).
 *
 * The three Incubator NPCs were built as voices only — 0 attributes, 0
 * skills — so Effort refuses (Muted), the round engine can't order them, and
 * the survival rung has nothing to read. This applies the campaign's
 * published seed (Human by default) through the SAME path a player character
 * takes: `assignMechanics` → createDefaultCharacter + applyCreationGrants.
 *
 * assignMechanics refuses a locked (status ACTIVE) character, and every NPC
 * is ACTIVE. We unlock, apply, and restore the status — nothing else on the
 * row changes (identity/backstory are carried over by assignMechanics; the
 * NPC-only blocks `_npc` and `notes`, plus a non-empty inventory, are
 * re-attached here because the reset would drop them).
 *
 * Usage: npx tsx scripts/daya-npc-sheets.ts <campaignId> [--seed <forgeItemId>] [--dry] [--force]
 *   default: only NPCs whose sheet has no attributes at all. --force re-applies to every NPC.
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { prisma } from '../src/lib/db';
import { assignMechanics } from '../src/services/character';
import type { GrowthCharacter } from '../src/types/growth';

const args = process.argv.slice(2);
const campaignId = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
const force = args.includes('--force');
const seedIdx = args.indexOf('--seed');
const seedArg = seedIdx >= 0 ? args[seedIdx + 1] : null;

if (!campaignId) { console.error('usage: daya-npc-sheets.ts <campaignId> [--seed <forgeItemId>] [--dry] [--force]'); process.exit(1); }

function hasAttributes(raw: string): boolean {
  try {
    const data = JSON.parse(raw) as GrowthCharacter;
    const attrs = (data as unknown as { attributes?: Record<string, unknown> }).attributes ?? {};
    return Object.keys(attrs).length > 0;
  } catch { return false; }
}

(async () => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, name: true, gmUserId: true, gmUser: { select: { role: true } } } });
  if (!campaign) { console.error('campaign not found'); process.exit(1); }

  const seed = seedArg
    ? await prisma.forgeItem.findUnique({ where: { id: seedArg }, select: { id: true, name: true, status: true, type: true } })
    : await prisma.forgeItem.findFirst({ where: { campaignId, type: 'seed', status: 'published', name: 'Human' }, select: { id: true, name: true, status: true, type: true } })
      ?? await prisma.forgeItem.findFirst({ where: { campaignId, type: 'seed', status: 'published' }, select: { id: true, name: true, status: true, type: true } });
  if (!seed || seed.type !== 'seed' || seed.status !== 'published') { console.error('no published seed ForgeItem found — pass --seed <id>'); process.exit(1); }
  console.log(`campaign ${campaign.name}: seed = ${seed.name} (${seed.id})${dry ? ' [dry]' : ''}`);

  const npcs = await prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { id: true, name: true, status: true, data: true } });
  for (const npc of npcs) {
    const had = hasAttributes(npc.data);
    if (had && !force) { console.log(`= ${npc.name}: already has attributes, skipped`); continue; }
    if (dry) { console.log(`~ ${npc.name}: would apply ${seed.name} (status ${npc.status})`); continue; }
    const before = JSON.parse(npc.data) as Record<string, unknown>;
    const wasLocked = npc.status === 'ACTIVE';
    if (wasLocked) await prisma.character.update({ where: { id: npc.id }, data: { status: 'DRAFT' } });
    try {
      await assignMechanics(npc.id, campaign.gmUserId, campaign.gmUser?.role ?? 'WATCHER', { seedForgeItemId: seed.id });
    } finally {
      if (wasLocked) await prisma.character.update({ where: { id: npc.id }, data: { status: 'ACTIVE' } });
    }
    const after = await prisma.character.findUnique({ where: { id: npc.id }, select: { data: true } });
    const data = JSON.parse(after!.data) as Record<string, unknown> & { attributes?: Record<string, unknown> };
    // Re-attach what the reset dropped: NPC persona block, notes, a real inventory.
    const restored: string[] = [];
    for (const key of ['_npc', 'notes'] as const) {
      if (before[key] !== undefined && data[key] === undefined) { data[key] = before[key]; restored.push(key); }
    }
    const beforeInv = before.inventory as { items?: unknown[] } | undefined;
    if (beforeInv && Array.isArray(beforeInv.items) && beforeInv.items.length > 0) { data.inventory = beforeInv; restored.push('inventory'); }
    if (restored.length) await prisma.character.update({ where: { id: npc.id }, data: { data: JSON.stringify(data) } });
    console.log(`+ ${npc.name}: ${Object.keys(data.attributes ?? {}).length} attributes applied, status restored to ${npc.status}${restored.length ? `, re-attached ${restored.join('/')}` : ''}`);
  }
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
