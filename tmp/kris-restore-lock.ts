/** Recover the lock paints a dev reload orphaned (2026-10-17 12:28 UTC): the files landed, the designer never committed them. */
import { prisma } from '../app/src/lib/db';
const ID = 'cmvcbw49u0001h448qanzbhs3';
const base = { imagePath: `/portraits/${ID}/faces/d5dbeb04-794a-4ad7-9063-989b5760d620.png`, text: 'Locked from 3 photos', kind: 'base', seed: 1651649745, at: '2026-10-17T12:28:43.000Z' };
(async () => {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: ID } });
  const d = JSON.parse(c.data);
  if (d.identity?.designer) { console.log('designer already set — not overwriting'); process.exit(0); }
  d.identity = { ...d.identity, designer: { baseImagePath: base.imagePath, layers: [base] } };
  await prisma.character.update({ where: { id: ID }, data: { data: JSON.stringify(d) } });
  console.log('restored');
  process.exit(0);
})();
