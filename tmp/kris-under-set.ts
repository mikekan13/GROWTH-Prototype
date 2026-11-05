import { prisma } from '../app/src/lib/db';
const ID = 'cmvcbw49u0001h448qanzbhs3';
(async () => { const c = await prisma.character.findUniqueOrThrow({ where: { id: ID } }); const d = JSON.parse(c.data);
  d.identity = { ...d.identity, underclothing: 'only plain fitted dark grey boxer briefs and nothing else: bare chest, bare arms, bare legs, barefoot' };
  await prisma.character.update({ where: { id: ID }, data: { data: JSON.stringify(d) } }); console.log('set'); process.exit(0); })();
