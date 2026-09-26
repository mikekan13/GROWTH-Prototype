/**
 * JEWL organizes a campaign's canvas (Mike 2026-09-26: "have JEWL organize
 * the entire incubator canvas").
 *
 * JEWL reads the whole inventory — every Location (status, description,
 * containment via located_at, current anchor, item count) and every
 * Character (type, status, where it is) — and lays the stage out through
 * his own tools: `setLocationParent` for containment he judges wrong or
 * missing, and the `arrange_canvas` tool for positions. Nothing is deleted
 * or renamed; data defects he notices are printed for Mike, not fixed.
 *
 * Canvas semantics he is told: a Location's x/y is the anchor its FOLDER
 * renders from (top-left); the live canvas shelf-packs a folder's
 * located_at members inside it, so children need room inside their parent
 * and characters are packed into their location's folder wherever they
 * are dropped. y < 0 is the active side of the crystallization line,
 * y > 0 the drafting side.
 *
 * Usage: npx tsx scripts/jewl-arrange-canvas.ts <campaignId> [--dry]
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { prisma } from '../src/lib/db';
import { chat } from '../src/daya/model-client';
import { setLocationParent } from '../src/services/location';
import { arrangeCanvasTool } from '../src/ai/copilot/tools/arrange-canvas';

const args = process.argv.slice(2);
const campaignId = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
if (!campaignId) { console.error('usage: jewl-arrange-canvas.ts <campaignId> [--dry]'); process.exit(1); }

interface Plan {
  parents: Array<{ locationId: string; parentId: string | null; why: string }>;
  placements: Array<{ id: string; x: number; y: number }>;
  notes: string[];
}

(async () => {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true, gmUserId: true, gmUser: { select: { role: true } } } });
  if (!campaign) { console.error('campaign not found'); process.exit(1); }
  const actor = { userId: campaign.gmUserId, role: campaign.gmUser?.role ?? 'WATCHER' };

  const parentOf = async (id: string) => (await prisma.entityRelationship.findFirst({ where: { sourceId: id, relationshipType: 'located_at' }, select: { targetId: true } }))?.targetId ?? null;
  const locations = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, status: true, data: true } });
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));
  const locLines: string[] = [];
  for (const l of locations) {
    let d: { description?: string; canvasX?: number; canvasY?: number; tags?: string[] } = {};
    try { d = JSON.parse(l.data); } catch { /* none */ }
    const parent = await parentOf(l.id);
    const items = await prisma.campaignItem.count({ where: { locationId: l.id } });
    locLines.push(`- id=${l.id} "${l.name}" [${l.status.toLowerCase()}] parent=${parent ? `"${nameOf.get(parent) ?? parent}" (${parent})` : 'none'} anchor=${typeof d.canvasX === 'number' ? `${d.canvasX},${d.canvasY}` : 'unplaced'} items=${items}${d.tags?.length ? ` tags=${d.tags.join('/')}` : ''}${d.description ? ` — ${d.description.slice(0, 160)}` : ''}`);
  }
  const characters = await prisma.character.findMany({ where: { campaignId, entityType: { not: 'GODHEAD' } }, select: { id: true, name: true, entityType: true, status: true, data: true } });
  const charLines: string[] = [];
  for (const c of characters) {
    let d: { canvasX?: number; canvasY?: number } = {};
    try { d = JSON.parse(c.data); } catch { /* none */ }
    const at = await parentOf(c.id);
    charLines.push(`- id=${c.id} "${c.name}" ${c.entityType} [${c.status.toLowerCase()}] at=${at ? `"${nameOf.get(at) ?? at}"` : 'nowhere'} card=${typeof d.canvasX === 'number' ? `${d.canvasX},${d.canvasY}` : 'unplaced'}`);
  }
  console.log(`${campaign.name}: ${locations.length} locations, ${characters.length} characters${dry ? ' [dry]' : ''}`);

  const res = await chat({
    tier: 'C', subsystem: 'arrange-canvas',
    messages: [
      { role: 'system', content: `You are JEWL, the copilot under a GROWTH Watcher's table, organizing the campaign canvas so a human can see and interpret the world at a glance. The canvas is a spatial web of cards. RULES OF THE CANVAS: a Location's x/y is the anchor its FOLDER renders from (top-left of the folder); the live canvas packs a folder's contained members (child locations, characters, items) inside it automatically, so a child only needs to sit roughly inside its parent's area and the canvas tidies the rest; a character card is packed into the folder of the location it is at, so give it a spot inside that folder; y < 0 is the ACTIVE side of the crystallization line, y > 0 the DRAFTING side — planning-status places belong at y > 0? NO: keep everything where the Watcher works, y < 0, unless it is a draft nobody has committed. Containment is the located_at edge: rooms inside an apartment, an apartment inside its building, buildings inside their block. Card sizes: a location folder needs about 700 wide × 500 tall per child room it holds plus 200 for its own header; a character card is 520 × 240; leave 80 between siblings. Lay the world out left-to-right and top-to-bottom the way a person would read it: the block as the outer frame, buildings side by side inside it, the apartment inside its building, its rooms side by side inside the apartment, people in the room they are in. Respond with ONLY JSON: {"parents": [{"locationId": string, "parentId": string|null, "why": short}], "placements": [{"id": string, "x": number, "y": number}], "notes": [string]}. parents: only containment you judge wrong or missing (use ids from the inventory; never invent ids). placements: EVERY location and EVERY character, by id. notes: data defects you notice (duplicates, people somewhere they should not be) — you do not fix those, the Watcher does. Do NOT think aloud: your reply must begin with { and end with } — the JSON object and nothing else.` },
      { role: 'user', content: `LOCATIONS:\n${locLines.join('\n')}\n\nCHARACTERS:\n${charLines.join('\n')}` },
    ],
    maxTokens: 6000, temperature: 0.2,
  });
  const m = res.text.match(/\{[\s\S]*\}/);
  if (!m) { console.error('JEWL returned no JSON'); console.error(res.text.slice(0, 500)); process.exit(1); }
  const plan = JSON.parse(m[0]) as Plan;
  const knownLoc = new Set(locations.map((l) => l.id));
  const knownChar = new Set(characters.map((c) => c.id));
  plan.parents = (plan.parents ?? []).filter((p) => knownLoc.has(p.locationId) && (p.parentId === null || knownLoc.has(p.parentId)) && p.parentId !== p.locationId);
  plan.placements = (plan.placements ?? []).filter((p) => (knownLoc.has(p.id) || knownChar.has(p.id)) && Number.isFinite(p.x) && Number.isFinite(p.y));

  console.log('\nJEWL — containment changes:');
  for (const p of plan.parents) console.log(`  ${nameOf.get(p.locationId)} → ${p.parentId ? nameOf.get(p.parentId) : 'none'}   (${p.why})`);
  if (!plan.parents.length) console.log('  (none)');
  console.log('\nJEWL — placements:');
  for (const p of plan.placements) console.log(`  ${(nameOf.get(p.id) ?? characters.find((c) => c.id === p.id)?.name ?? p.id).padEnd(40)} ${String(p.x).padStart(6)}, ${String(p.y).padStart(6)}`);
  console.log('\nJEWL — notes for the Watcher:');
  for (const n of plan.notes ?? []) console.log(`  · ${n}`);

  if (dry) { await prisma.$disconnect(); process.exit(0); }

  for (const p of plan.parents) {
    try { await setLocationParent(campaignId, actor.userId, actor.role, p.locationId, p.parentId); }
    catch (err) { console.warn(`  parent change failed for ${nameOf.get(p.locationId)}:`, err instanceof Error ? err.message : err); }
  }
  const batches: Plan['placements'][] = [];
  for (let i = 0; i < plan.placements.length; i += 40) batches.push(plan.placements.slice(i, i + 40));
  let placed = 0;
  for (const batch of batches) {
    const out = await arrangeCanvasTool.handler({ placements: batch.map((p) => ({ target: p.id, x: p.x, y: p.y })) }, { campaignId, actorId: actor.userId, actorRole: actor.role });
    const o = out.output as { placed: unknown[]; skipped: Array<{ target: string; reason: string }> };
    placed += o.placed.length;
    for (const s of o.skipped) console.warn('  skipped', s.target, s.reason);
  }
  console.log(`\napplied: ${plan.parents.length} containment changes, ${placed} placements`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
