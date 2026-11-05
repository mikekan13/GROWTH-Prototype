import { prisma } from '../app/src/lib/db';
(async () => {
  for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) {
    const c = await prisma.character.findUniqueOrThrow({ where: { id } }); const d = JSON.parse(c.data);
    if (id === 'cmvcbw49u0001h448qanzbhs3') { delete d.identity.underclothing; if (!d.identity.gender) d.identity.gender = 'Male'; await prisma.character.update({ where: { id }, data: { data: JSON.stringify(d) } }); }
    console.log(c.name, 'gender', JSON.stringify(d.identity?.gender), 'under', JSON.stringify(d.identity?.underclothing));
  }
  process.exit(0);
})();
