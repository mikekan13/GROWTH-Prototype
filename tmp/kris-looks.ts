/** Kristopher's worn things, as they look (Mike's words, 17 Oct). */
import { prisma } from '../app/src/lib/db';
const looks: Record<string, string> = {
  'Chess Pizza polo': 'a blue Chess Pizza polo shirt with the red, white and blue Chess Pizza logo on the chest, collared, short-sleeved',
  'Chess Pizza visor': 'a blue Chess Pizza sun visor with the red, white and blue Chess Pizza logo on the front, open-topped, his hair knot above it',
  'Black cargo pants': 'black cargo pants with side pockets',
  'Orthodox prayer rope': 'a dark wool Orthodox prayer rope wrapped five times around his left wrist',
};
(async () => {
  for (const [name, look] of Object.entries(looks)) {
    const it = await prisma.campaignItem.findFirstOrThrow({ where: { holderId: 'cmvcbw49u0001h448qanzbhs3', name } });
    const d = JSON.parse(it.data); d.look = look;
    await prisma.campaignItem.update({ where: { id: it.id }, data: { data: JSON.stringify(d) } });
  }
  const c = await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } });
  const s = JSON.parse(c.data); s.identity.sex = 'Male';
  await prisma.character.update({ where: { id: c.id }, data: { data: JSON.stringify(s) } });
  console.log('ok'); process.exit(0);
})();
