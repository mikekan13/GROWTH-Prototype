import { prisma } from '../app/src/lib/db';
(async () => {
  for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) {
    const c = await prisma.character.findUniqueOrThrow({ where: { id } });
    const d = JSON.parse(c.data);
    console.log(c.name, JSON.stringify(d.identity?.referencePhotos), Object.keys(d.identity ?? {}).join(','), 'updated', c.updatedAt.toISOString());
  }
  process.exit(0);
})();
