/**
 * Rewrite Violet's and Kristopher's thoughts and memories that hang on the struck messages (tmp/rewrite-thoughts-2026-11-07.json).
 * Every string field of a being_thought payload is rewritten (copies of a thought ride in other fields); memories by content.
 * Dry run counts matches per rewrite; --apply snapshots every touched row to data/archive first.
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/rewrite-thoughts-2026-11-07.ts [--apply]   (from app/)
 */
import '../app/scripts/_server-only-shim';
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const BEINGS = ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3'];
const spec = JSON.parse(readFileSync('../tmp/rewrite-thoughts-2026-11-07.json', 'utf-8')) as { deleteThoughtIds: string[]; deleteMemoryIds: string[]; deleteMemoryContaining: string[]; heardById: Record<string, string>; replace: Array<[string, string]> };
const hits = new Map<number, number>();

function rewrite(s: string): string {
  let out = s;
  spec.replace.forEach(([a, b], i) => { if (out.includes(a)) { hits.set(i, (hits.get(i) ?? 0) + 1); out = out.split(a).join(b); } });
  return out;
}
function walk(v: unknown): unknown {
  if (typeof v === 'string') return rewrite(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  return v;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const evs = await prisma.campaignEvent.findMany({ where: { campaignId: C, type: 'being_thought', characterId: { in: BEINGS } }, select: { id: true, payload: true } });
  const ents = await prisma.dayaEntity.findMany({ where: { characterId: { in: BEINGS } }, select: { id: true } });
  const mems = await prisma.dayaMemoryEntry.findMany({ where: { entityId: { in: ents.map((e) => e.id) } }, select: { id: true, content: true } });
  const evChanges: Array<{ id: string; before: string; after: string }> = [];
  for (const e of evs) {
    if (spec.deleteThoughtIds.includes(e.id)) continue;
    const p = walk(JSON.parse(e.payload)) as Record<string, unknown>;
    if (spec.heardById[e.id]) p.heard = spec.heardById[e.id];
    const after = JSON.stringify(p);
    if (after !== JSON.stringify(JSON.parse(e.payload))) evChanges.push({ id: e.id, before: e.payload, after });
  }
  const memChanges: Array<{ id: string; before: string; after: string }> = [];
  const memDeletes = mems.filter((m) => spec.deleteMemoryIds.includes(m.id) || spec.deleteMemoryContaining.some((s) => m.content.includes(s)));
  for (const m of mems) {
    if (memDeletes.includes(m)) continue;
    const after = rewrite(m.content);
    if (after !== m.content) memChanges.push({ id: m.id, before: m.content, after });
  }
  console.log(`thought records changed ${evChanges.length}, memories changed ${memChanges.length}, thoughts deleted ${spec.deleteThoughtIds.length}, memories deleted ${memDeletes.length}`);
  console.log(`heard rewrites ${Object.keys(spec.heardById).filter((id) => evs.some((e) => e.id === id)).length}/${Object.keys(spec.heardById).length}`);
  spec.replace.forEach(([a], i) => { if (!hits.get(i)) console.log(`  NO MATCH #${i}: ${a.slice(0, 90)}`); });
  if (!apply) { console.log('(dry run)'); return; }
  writeFileSync(`data/archive/rewrite-thoughts-${Date.now()}.json`, JSON.stringify({ evChanges, memChanges, deletedThoughts: evs.filter((e) => spec.deleteThoughtIds.includes(e.id)), deletedMemories: memDeletes }, null, 1));
  for (const c of evChanges) await prisma.campaignEvent.update({ where: { id: c.id }, data: { payload: c.after } });
  for (const c of memChanges) await prisma.dayaMemoryEntry.update({ where: { id: c.id }, data: { content: c.after } });
  await prisma.campaignEvent.deleteMany({ where: { id: { in: spec.deleteThoughtIds } } });
  if (memDeletes.length) await prisma.dayaMemoryEntry.deleteMany({ where: { id: { in: memDeletes.map((m) => m.id) } } });
  console.log('applied (snapshot in data/archive)');
}
main().finally(() => prisma.$disconnect());
