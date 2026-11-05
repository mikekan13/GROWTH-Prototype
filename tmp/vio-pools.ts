import { prisma } from '../app/src/lib/db';
(async () => { for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) { const c = await prisma.character.findUniqueOrThrow({ where: { id } }); const a = JSON.parse(c.data).attributes;
  console.log(c.name, Object.entries(a).map(([k, v]: any) => `${k.slice(0, 3)} ${v.current}/${v.level}`).join(' · ')); } process.exit(0); })();
