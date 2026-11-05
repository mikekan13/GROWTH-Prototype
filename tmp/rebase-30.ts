/** Re-base the attribute scale to a ~30 human average (Mike 2026-10-29, r-2026-10-29-01).
 *  Roots ×2.4, Branches ×2.5, Seed augments ×2.4 (rounded, half up) on EVERY ForgeItem of those types, global and
 *  campaign copies alike; KV moves by the points added (1 level = 1 KV, 1 aug = 1 KV — forge-pricing). Kristopher's
 *  four blocks are re-shaped to explicit targets (Flow above Focus, Focus his lowest). The two sheets' levels are
 *  rewritten as the sum of their root + branch blocks, pools full (the world sits at the knock).
 *  Usage (from app/): npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/rebase-30.ts [--dry] */
import { prisma } from '../app/src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
const ATTRS = ['clout', 'celerity', 'constitution', 'flow', 'focus', 'willpower', 'wisdom', 'wit'] as const;
type A = Record<(typeof ATTRS)[number], number>;
const ROOT_X = 2.4, BRANCH_X = 2.5, SEED_X = 2.4;
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
/** Kristopher: average 30, Focus the lowest, Flow well above it (Mike). */
const KRIS_TARGET: A = { clout: 18, celerity: 22, constitution: 32, flow: 40, focus: 14, willpower: 42, wisdom: 42, wit: 30 };
const dry = process.argv.includes('--dry');
const round = (x: number) => Math.floor(x + 0.5);
const sum = (a: Partial<A>) => ATTRS.reduce((n, k) => n + (a[k] ?? 0), 0);
const scale = (a: Partial<A>, x: number): A => Object.fromEntries(ATTRS.map((k) => [k, round((a[k] ?? 0) * x)])) as A;

/** Split each attribute's target across blocks by their current shares; largest remainder so the totals are exact. */
function split(blocks: Partial<A>[], target: A): A[] {
  const out = blocks.map(() => ({} as A));
  for (const k of ATTRS) {
    const cur = blocks.map((b) => b[k] ?? 0);
    const total = cur.reduce((n, v) => n + v, 0) || blocks.length;
    const raw = cur.map((v) => (total === blocks.length && !cur.some(Boolean) ? 1 : v) / total * target[k]);
    const base = raw.map(Math.floor);
    let rest = target[k] - base.reduce((n, v) => n + v, 0);
    const order = raw.map((r, i) => [r - base[i], i] as const).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) { if (rest <= 0) break; base[i] += 1; rest -= 1; }
    base.forEach((v, i) => { out[i][k] = v; });
  }
  return out;
}

(async () => {
  const p = prisma as any;
  const items: any[] = await p.forgeItem.findMany({ where: { type: { in: ['seed', 'root', 'branch'] } } });
  const krisLinks: any[] = await p.characterBlockLink.findMany({ where: { characterId: KRIS }, select: { forgeItemId: true } });
  const krisIds = new Set(krisLinks.map((l) => l.forgeItemId));
  const krisBlocks = items.filter((i) => krisIds.has(i.id) && i.type !== 'seed').sort((a, b) => (a.type === 'root' ? -1 : 1));
  const krisNew = split(krisBlocks.map((b) => JSON.parse(b.data).attributes ?? {}), KRIS_TARGET);
  const changes: any[] = [];
  for (const it of items) {
    const data = JSON.parse(it.data ?? '{}');
    const before: Partial<A> = data.attributes ?? {};
    let after: A;
    const ki = krisBlocks.findIndex((b) => b.id === it.id);
    if (ki >= 0) after = krisNew[ki];
    else after = scale(before, it.type === 'seed' ? SEED_X : it.type === 'root' ? ROOT_X : BRANCH_X);
    const delta = sum(after) - sum(before);
    const kvBefore = Number(it.karmicValue ?? 0);
    const kvAfter = kvBefore + delta;
    changes.push({ id: it.id, type: it.type, name: it.name, global: it.isGlobal, campaignId: it.campaignId, before, after, kvBefore, kvAfter });
    if (!dry) await p.forgeItem.update({ where: { id: it.id }, data: { data: JSON.stringify({ ...data, attributes: after }), karmicValue: BigInt(kvAfter) } });
  }
  // The two sheets: level = sum of linked root + branch blocks (as genesis wrote them), pools full.
  const sheets: any[] = [];
  for (const [name, id] of [['Violet', VIOLET], ['Kristopher', KRIS]] as const) {
    const links: any[] = await p.characterBlockLink.findMany({ where: { characterId: id }, select: { forgeItemId: true } });
    const mine = changes.filter((c) => c.type !== 'seed' && links.some((l) => l.forgeItemId === c.id));
    const levels = Object.fromEntries(ATTRS.map((k) => [k, mine.reduce((n, c) => n + (c.after[k] ?? 0), 0)])) as A;
    const ch = await p.character.findUnique({ where: { id }, select: { data: true } });
    const d = JSON.parse(ch.data);
    const was = Object.fromEntries(ATTRS.map((k) => [k, d.attributes?.[k]?.level])) as A;
    for (const k of ATTRS) { d.attributes[k] = { ...(d.attributes[k] ?? {}), level: levels[k], current: levels[k] }; }
    sheets.push({ name, id, was, now: levels, mean: sum(levels) / 8 });
    if (!dry) await p.character.update({ where: { id }, data: { data: JSON.stringify(d) } });
  }
  mkdirSync('data/archive', { recursive: true });
  const file = `data/archive/rebase-30-${new Date().toISOString().replace(/[:.]/g, '-')}${dry ? '-dry' : ''}.json`;
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), dry, ROOT_X, BRANCH_X, SEED_X, KRIS_TARGET, changes, sheets }, null, 1));
  const fmt = (a: Partial<A>) => ATTRS.map((k) => a[k] ?? 0).join('/');
  console.log(`${dry ? 'DRY ' : ''}rebase: ${changes.length} blocks (${changes.filter((c) => c.global).length} global) → ${file}`);
  for (const c of changes.filter((c) => c.campaignId === 'cms5z4j6z0000zg48z5vzl2jn' || c.type === 'seed')) console.log(`  ${c.type} ${c.name}${c.global ? ' [global]' : ''}: ${fmt(c.before)} → ${fmt(c.after)}  kv ${c.kvBefore} → ${c.kvAfter}`);
  for (const s of sheets) console.log(`  SHEET ${s.name}: ${fmt(s.was)} → ${fmt(s.now)}  mean ${s.mean.toFixed(1)}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
