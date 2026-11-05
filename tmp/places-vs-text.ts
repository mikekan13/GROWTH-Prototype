import { prisma } from '../app/src/lib/db';
import { loadWorldLevel, thingStanding } from '../app/src/services/spatial-world';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const FT = 20;
(async () => {
  const { map } = await loadWorldLevel(CAMP);
  const main = map.rooms.find((r) => r.name === 'Main Room')!;
  const xs = main.points.map((p) => p.x), ys = main.points.map((p) => p.y);
  const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const where = (p: { x: number; y: number }) => {
    const fx = (p.x - bb.x0) / (bb.x1 - bb.x0), fy = (p.y - bb.y0) / (bb.y1 - bb.y0);
    const h = fx < 0.34 ? 'W(left)' : fx > 0.66 ? 'E(right)' : 'mid';
    const v = fy < 0.34 ? 'N(top)' : fy > 0.66 ? 'S(bottom)' : 'mid';
    return `${v}/${h} (${(fx * 100).toFixed(0)}%,${(fy * 100).toFixed(0)}%)`;
  };
  console.log(`Main Room bbox ${((bb.x1 - bb.x0) / FT).toFixed(1)} × ${((bb.y1 - bb.y0) / FT).toFixed(1)} ft; N=top of map`);
  console.log('-- openings (portals):');
  for (const p of map.portals) { const mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }; console.log(`   ${p.name ?? p.id} [${p.state ?? 'open'}] between ${p.between.join(' / ')} at ${where(mid)}`); }
  const loc = await prisma.location.findUnique({ where: { id: 'cmv5x69xp004y1448l1sqlkjc' }, select: { data: true } });
  const d = JSON.parse((loc as any).data);
  console.log('-- openings in location data:', (d.openings ?? []).map((o: any) => `${o.name}:${o.kind ?? o.type ?? ''}:${o.state ?? ''}`).join(' | '));
  console.log('-- things standing in the Main Room (map position vs its own description):');
  const things = await prisma.campaignItem.findMany({ where: { campaignId: CAMP, holderId: null, locationId: { not: null }, status: 'ACTIVE' }, select: { id: true, name: true, data: true } });
  for (const t of things) {
    const s = await thingStanding(map, t.id);
    if (!s || s.room?.id !== main.id) continue;
    let desc = ''; try { desc = JSON.parse(t.data ?? '{}').description ?? ''; } catch {}
    const phrase = desc.match(/[^.]*\b(near|by the|beside|against|corner|wall|window|left|right|centre|center|front|rear|back|under|across|foot of|next to|anchors)\b[^.]*\./i)?.[0]?.trim() ?? '(no placement phrase)';
    console.log(`   ${t.name}: ${s.stored ? where(s.point) : 'NO POINT (laid out by canvas)'} | ${phrase.slice(0, 140)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
