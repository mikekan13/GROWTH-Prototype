import { prisma } from '../app/src/lib/db';
(async () => { for (const id of ['cmvcbw49u0001h448qanzbhs3','cms60ndtn0000kw48ioq10i68']) { const c = await prisma.character.findUniqueOrThrow({ where: { id } }); const a = JSON.parse(c.data).attributes ?? {};
  console.log(c.name, Object.entries(a).map(([k, v]: any) => `${k} ${v?.level ?? v?.current ?? JSON.stringify(v)}`).join(', ')); } process.exit(0); })();
