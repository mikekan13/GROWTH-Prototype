import { prisma } from '../app/src/lib/db';
import { stampBeingPoint } from '../app/src/services/spatial-world';
const K = 'cmvcbw49u0001h448qanzbhs3', CAR = 'cmvcfyn460009zc48xhwl6kb8';
(async () => {
  const edge = await prisma.entityRelationship.findFirst({ where: { sourceId: CAR, relationshipType: 'located_at' }, select: { targetId: true, data: true } });
  const room = edge ? await prisma.location.findUnique({ where: { id: edge.targetId }, select: { name: true, data: true } }) : null;
  const fp = room ? JSON.parse(room.data || '{}').footprint : null;
  console.log('car edge →', room?.name, 'pos:', edge?.data);
  let pos: { x: number; y: number } | null = null;
  try { const d = edge?.data ? JSON.parse(edge.data) : null; pos = d?.pos ?? d?.position ?? null; } catch { pos = null; }
  let world: { x: number; y: number } | null = null;
  if (pos && fp?.points?.length) {
    const xs = fp.points.map((p: { x: number }) => p.x), ys = fp.points.map((p: { y: number }) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    world = { x: minX + pos.x * (maxX - minX), y: minY + pos.y * (maxY - minY) };
  }
  if (!world) { world = { x: 500, y: 3300 }; console.log('no edge position; using the drawn spot (25,75) ft → world', world); }
  console.log('car world point:', JSON.stringify(world));
  if (process.argv.includes('--fix')) { await stampBeingPoint(K, world); console.log('Kristopher stamped at the car'); }
  process.exit(0);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
