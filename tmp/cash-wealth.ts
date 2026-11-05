import { prisma } from '../app/src/lib/db';
async function main() {
  for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) {
    const c = await prisma.character.findUnique({ where: { id }, select: { name: true, data: true } });
    const d = JSON.parse(c!.data); console.log('--- wealth of', c!.name, JSON.stringify(d.wealth ?? null));
  }
  const lk = await prisma.lastKnown.findMany({ where: { subjectId: 'cmvalc1df00a0m048hqiwi5ar' } });
  console.log('lastKnown rows for the cash item:', lk.length);
  const routines = await prisma.dayaRoutine.findMany({ where: { name: { contains: 'izza' } }, select: { id: true, entityId: true, name: true, ends: true, trigger: true, lastRunCycle: true } }).catch((e) => { console.log('routine err', e.message.split('\n')[0]); return []; });
  for (const r of routines as any[]) console.log('--- routine', r.name, r.entityId.slice(-6), 'trigger=', String(r.trigger).slice(0, 200), '\nends=', String(r.ends).slice(0, 900));
}
main().finally(() => prisma.$disconnect());
