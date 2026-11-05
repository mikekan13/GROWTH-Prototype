/** Mike 17 Oct: "just give him slightly higher values doesn't need to be perfect for the hello world" (the scale conversation comes later). */
import { prisma } from '../app/src/lib/db';
const K = 'cmvcbw49u0001h448qanzbhs3';
const bump: Record<string, number> = { clout: 9, celerity: 10, constitution: 15, flow: 15, focus: 18, willpower: 20, wisdom: 20, wit: 14 };
(async () => {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: K } }); const d = JSON.parse(c.data);
  for (const [k, v] of Object.entries(bump)) d.attributes[k] = { ...d.attributes[k], level: v, current: v };
  await prisma.character.update({ where: { id: K }, data: { data: JSON.stringify(d) } });
  const vio = JSON.parse((await prisma.character.findUniqueOrThrow({ where: { id: 'cms60ndtn0000kw48ioq10i68' } })).data).attributes;
  console.log('violet augs', JSON.stringify(Object.fromEntries(Object.entries(vio).map(([k, v]: any) => [k, v.augmentPositive ?? null]))));
  process.exit(0);
})();
