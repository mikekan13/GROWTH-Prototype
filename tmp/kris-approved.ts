import { prisma } from '../app/src/lib/db';
(async () => { const c = await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } }); const d = JSON.parse(c.data).identity?.designer; console.log(d?.approvedImagePath, '|', d?.bodyImagePath); process.exit(0); })();
