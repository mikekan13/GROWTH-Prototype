import { prisma } from '../app/src/lib/db';
import { loadWorldLevel } from '../app/src/services/spatial-world';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const FT = 20; // world units per foot
const area = (pts: { x: number; y: number }[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
const bbox = (pts: { x: number; y: number }[]) => { const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); return { w: (Math.max(...xs) - Math.min(...xs)) / FT, h: (Math.max(...ys) - Math.min(...ys)) / FT }; };
(async () => {
  const { map } = await loadWorldLevel(CAMP);
  const polys = [...(map.homes ?? []).map((h) => ({ ...h, kind: 'home' })), ...map.rooms.map((r) => ({ ...r, kind: 'room' }))];
  for (const r of polys) {
    const loc = await prisma.location.findUnique({ where: { id: r.id }, select: { name: true, data: true } });
    let d: any = {}; try { d = JSON.parse((loc as any)?.data ?? '{}'); } catch {}
    const text = [d.description, d.summary, d.notes].filter(Boolean).join(' ');
    const claims = (text.match(/\d[\d,]*(?:\.\d+)?\s*(?:sq\.? ?ft|square feet|sqft|ft²|feet|ft|')\s*(?:by|×|x)?\s*(?:\d[\d.]*\s*(?:ft|feet|'))?/gi) ?? []).slice(0, 6);
    const b = bbox(r.points);
    console.log(`${r.kind.toUpperCase()} ${r.name}: drawn ${Math.round(area(r.points) / FT / FT)} sq ft, bbox ${b.w.toFixed(1)} × ${b.h.toFixed(1)} ft, ${r.points.length} pts | text says: ${claims.join('; ') || '(no figures)'}`);
    if (text) console.log('   ', text.replace(/\s+/g, ' ').slice(0, 260));
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
