import { prisma } from '../app/src/lib/db';
(async () => { const items = await prisma.campaignItem.findMany({ where: { holderId: 'cmvcbw49u0001h448qanzbhs3' }, select: { name: true, data: true } });
  for (const i of items) { const d = JSON.parse(i.data); console.log(i.name, '|', d.equippedTo ?? '-', '| desc:', (d.description ?? '').slice(0, 90), '| story:', (d.story ?? d.localStory ?? '').slice(0, 60), '| keys', Object.keys(d).join(',')); } process.exit(0); })();
