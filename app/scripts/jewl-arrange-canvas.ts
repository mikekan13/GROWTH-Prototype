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
import { layoutForest, type LayoutNode } from '../src/services/canvas-layout';

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
      { role: 'system', content: `You are JEWL, the copilot under a GROWTH Watcher's table, organizing the campaign canvas so a human can see and interpret the world at a glance. LAWS OF THE CANVAS (the renderer enforces these; a plan that ignores them shows up wrong): (1) The crystallization line is y = 0. A DRAFTING location (status planning) lives BELOW the line: y > 0. An ACTIVE location lives above: y < 0. The canvas clamps folders to their side, so put a planning place at y > 0. (2) A location renders as a FOLDER. A folder that CONTAINS things takes its rectangle from where its members are — its own anchor is ignored; only an EMPTY folder sits at its anchor (min 720 wide × 200 tall). (3) Items that have no stored position are gridded automatically near their ROOM's anchor: 3 columns, 260 apart, rows 150 apart, starting at (anchor.x − 250, anchor.y + 160). So a room with n items occupies about x from anchor.x − 400 to anchor.x + 400 and y from anchor.y to anchor.y + 200 + ceil(n/3)×150. (4) A character card is 520 wide × 240 tall, centred on its position; put each character INSIDE the area of the room it is at, below that room's item grid. (5) Folders nest by located_at: rooms inside an apartment, the apartment inside its building, buildings inside their block. A parent folder wraps its children automatically, so only the LEAF rooms, the empty places and the characters need real coordinates — but give every location an anchor anyway, in a spot consistent with the tree. Leave at least 150 between sibling rooms' areas and 300 between sibling buildings' areas. Lay the world out left-to-right and top-to-bottom the way a person reads. Respond with ONLY JSON: {"parents": [{"locationId": string, "parentId": string|null, "why": short}], "placements": [{"id": string, "x": number, "y": number}], "notes": [string]}. parents: only containment you judge wrong or missing (ids from the inventory; never invent ids). placements: EVERY location and EVERY character, by id. notes: data defects you notice (duplicates, people somewhere they should not be) — you do not fix those, the Watcher does. Do NOT think aloud: your reply must begin with { and end with } — the JSON object and nothing else.` },
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

  // JEWL decided the tree and the reading order; the geometry is computed
  // to the renderer's laws (services/canvas-layout.ts) so what he intends is
  // what the canvas shows: drafting places below the line, rooms spaced for
  // their item grids, characters inside their rooms, parents wrapping.
  const orderX = new Map(plan.placements.map((p) => [p.id, p.x]));
  const parentNow = new Map<string, string | null>();
  for (const l of locations) parentNow.set(l.id, await parentOf(l.id));
  const charsAt = new Map<string, string[]>();
  for (const c of characters) { const at = await parentOf(c.id); if (at) charsAt.set(at, [...(charsAt.get(at) ?? []), c.id]); }
  const itemCounts = new Map<string, number>();
  const itemIdsAt = new Map<string, string[]>();
  for (const l of locations) {
    const rows = await prisma.campaignItem.findMany({ where: { locationId: l.id }, select: { id: true }, orderBy: { createdAt: 'asc' } });
    itemCounts.set(l.id, rows.length);
    itemIdsAt.set(l.id, rows.map((r) => r.id));
  }
  const byOrder = (a: string, b: string) => (orderX.get(a) ?? 0) - (orderX.get(b) ?? 0) || (nameOf.get(a) ?? '').localeCompare(nameOf.get(b) ?? '');
  const build = (id: string): LayoutNode => ({
    id, name: nameOf.get(id) ?? id, status: locations.find((l) => l.id === id)?.status ?? 'PLANNING',
    children: locations.filter((l) => parentNow.get(l.id) === id).map((l) => l.id).sort(byOrder).map(build),
    itemCount: itemCounts.get(id) ?? 0,
    itemIds: itemIdsAt.get(id) ?? [],
    characterIds: (charsAt.get(id) ?? []).sort(byOrder),
  });
  const roots = locations.filter((l) => !parentNow.get(l.id)).map((l) => l.id).sort(byOrder).map(build);
  const geo = layoutForest(roots);
  const placements: Array<{ target: string; x: number; y: number }> = [];
  for (const [id, a] of geo.locations) placements.push({ target: id, x: a.x, y: a.y });
  for (const [id, c] of geo.characters) placements.push({ target: id, x: Math.round(c.x), y: Math.round(c.y) });
  for (const [id, c] of geo.items) placements.push({ target: id, x: Math.round(c.x), y: Math.round(c.y) });
  console.log('\ngeometry (computed to the canvas laws):');
  for (const pl of placements.filter((x) => !geo.items.has(x.target))) console.log(`  ${(nameOf.get(pl.target) ?? characters.find((c) => c.id === pl.target)?.name ?? pl.target).padEnd(40)} ${String(pl.x).padStart(6)}, ${String(pl.y).padStart(6)}`);

  let placed = 0;
  for (let i = 0; i < placements.length; i += 40) {
    const out = await arrangeCanvasTool.handler({ placements: placements.slice(i, i + 40) }, { campaignId, actorId: actor.userId, actorRole: actor.role });
    const o = out.output as { placed: unknown[]; skipped: Array<{ target: string; reason: string }> };
    placed += o.placed.length;
    for (const sk of o.skipped) console.warn('  skipped', sk.target, sk.reason);
  }
  console.log(`\napplied: ${plan.parents.length} containment changes, ${placed} placements`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
