// Finding 68 / #41 vehicle travel, 2026-11-05: "the lot gate" - a car leaves the lot behind the hotel by a drawn way off the map.
// DRY RUN by default; `--apply` writes. 1 ft = 20 world units (UNITS_PER_FT in lib/spatial/types.ts; a 5 ft square = 100), so 12 ft = 240.
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';

const ID = 'cmvx8qwny0052vg48nwda5s23';
const GATE_UNITS = 12 * 20;
type P = { x: number; y: number };

(async () => {
  const loc = await prisma.location.findUniqueOrThrow({ where: { id: ID }, select: { name: true, data: true } });
  const d = JSON.parse(loc.data ?? '{}');
  const pts: P[] = d.footprint?.points ?? [];
  if (pts.length < 3) { console.log('no footprint on', loc.name); process.exit(1); }
  const openings: Array<{ id: string; kind: string; a: P; b: P; name?: string; between?: string[] }> = Array.isArray(d.openings) ? d.openings : [];
  console.log('before', JSON.stringify(openings));

  // The edge farthest from the hotel back door: the back door is the opening of this lot that joins it to a room other than
  // "outside" (the hotel). If none is drawn, the south-most edge (largest y = south on screen).
  const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const edges = pts.map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length] })).filter((e) => Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) >= GATE_UNITS);
  if (!edges.length) { console.log('no footprint edge is 12 ft wide'); process.exit(1); }
  const back = openings.find((o) => (o.between ?? []).some((b) => b.toLowerCase() !== 'outside' && b.toLowerCase() !== loc.name.toLowerCase()));
  let edge: { a: P; b: P }; let why: string;
  if (back) {
    const m = mid(back.a, back.b);
    edge = edges.slice().sort((x, y) => Math.hypot(mid(y.a, y.b).x - m.x, mid(y.a, y.b).y - m.y) - Math.hypot(mid(x.a, x.b).x - m.x, mid(x.a, x.b).y - m.y))[0];
    why = `farthest edge from "${back.name ?? back.id}"`;
  } else {
    edge = edges.slice().sort((x, y) => mid(y.a, y.b).y - mid(x.a, x.b).y)[0];
    why = 'south-most edge (no hotel back door drawn on this lot)';
  }
  const m = mid(edge.a, edge.b);
  const L = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y), ux = (edge.b.x - edge.a.x) / L, uy = (edge.b.y - edge.a.y) / L;
  const a = { x: Math.round(m.x - ux * GATE_UNITS / 2), y: Math.round(m.y - uy * GATE_UNITS / 2) };
  const b = { x: Math.round(m.x + ux * GATE_UNITS / 2), y: Math.round(m.y + uy * GATE_UNITS / 2) };
  const nums = openings.map((o) => Number(/^op-(\d+)$/.exec(o.id)?.[1])).filter((n) => Number.isFinite(n));
  const id = `op-${(nums.length ? Math.max(...nums) : openings.length) + 1}`;
  if (openings.some((o) => o.name === 'the lot gate')) { console.log('"the lot gate" already exists - nothing to do'); process.exit(0); }
  const gate = { id, kind: 'door', a, b, between: [loc.name, 'outside'], state: 'open', name: 'the lot gate' };
  console.log(`gate on ${why}:`, JSON.stringify(gate));
  d.openings = [...openings, gate];
  console.log('after ', JSON.stringify(d.openings));
  if (process.argv.includes('--apply')) { await prisma.location.update({ where: { id: ID }, data: { data: JSON.stringify(d) } }); console.log('written'); }
  else console.log('(dry run - pass --apply to write)');
  process.exit(0);
})();
