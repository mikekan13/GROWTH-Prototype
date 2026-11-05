import { prisma } from '../app/src/lib/db';
const K = 'cmvcbw49u0001h448qanzbhs3';
(async () => { const c = await prisma.character.findUniqueOrThrow({ where: { id: K } }); const d = JSON.parse(c.data);
  d.canvasX = -150; d.canvasY = 650; d.canvasPlacedAt = Date.now(); // one 5-ft square out from the door, still on the landing
  await prisma.character.update({ where: { id: K }, data: { data: JSON.stringify(d) } }); console.log('moved'); process.exit(0); })();
