/** Re-apply the hello-world level bump; keep Mike's current pool values. */
import { prisma } from '../app/src/lib/db';
const K = 'cmvcbw49u0001h448qanzbhs3';
const lv: Record<string, number> = { clout: 9, celerity: 10, constitution: 15, flow: 15, focus: 18, willpower: 20, wisdom: 20, wit: 14 };
(async () => {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: K } }); const d = JSON.parse(c.data);
  for (const [k, v] of Object.entries(lv)) d.attributes[k] = { ...d.attributes[k], level: v };
  await prisma.character.update({ where: { id: K }, data: { data: JSON.stringify(d) } });
  console.log(Object.entries(d.attributes).map(([k, v]: any) => `${k.slice(0, 3)} ${v.current}/${v.level}`).join(' · '));
  process.exit(0);
})();
