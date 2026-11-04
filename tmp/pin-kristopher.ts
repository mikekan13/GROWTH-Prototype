import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { stampBeingPoint } from '../app/src/services/spatial-world';
const K = 'cmvcbw49u0001h448qanzbhs3', LOT = 'cmvx8qwny0052vg48nwda5s23', P = { x: 525, y: 3325 };
async function main() {
  await stampBeingPoint(K, P);
  const n = await (prisma as any).lastKnown.updateMany({ where: { subjectId: K, roomId: LOT }, data: { x: P.x, y: P.y } });
  const k = await prisma.character.findUnique({ where: { id: K }, select: { data: true } });
  const d = JSON.parse(k!.data); console.log('kristopher at', d.canvasX, d.canvasY, '| lastKnown rows moved', n.count);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
