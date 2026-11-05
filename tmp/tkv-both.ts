import { prisma } from '../app/src/lib/db';
import { calculateCharacterTKV } from '../app/src/lib/kv-calculator';
(async () => {
  for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) {
    const c = await prisma.character.findUnique({ where: { id }, select: { name: true, data: true } });
    const sheet = JSON.parse((c as any).data);
    const t = calculateCharacterTKV(sheet) as any;
    console.log(c?.name, 'TKV', t.total, JSON.stringify(Object.fromEntries(Object.entries(t).filter(([k, v]) => k !== 'total' && typeof v === 'number'))));
  }
  process.exit(0);
})();
