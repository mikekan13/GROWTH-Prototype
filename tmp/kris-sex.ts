import { prisma } from '../app/src/lib/db';
const ID = 'cmvcbw49u0001h448qanzbhs3';
(async () => { const c = await prisma.character.findUniqueOrThrow({ where: { id: ID } }); const d = JSON.parse(c.data);
  delete d.identity.gender;
  d.identity.physicalDescription = { ...(d.identity.physicalDescription ?? {}), gender: 'Male' };
  await prisma.character.update({ where: { id: ID }, data: { data: JSON.stringify(d) } }); console.log('ok'); process.exit(0); })();
