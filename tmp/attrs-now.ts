import { prisma } from '../app/src/lib/db';
(async () => {
  for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) {
    const c = await prisma.character.findUnique({ where: { id }, select: { name: true, data: true } });
    const d = JSON.parse((c as any)?.data ?? '{}');
    const attrs = d.attributes ?? d.sheet?.attributes ?? d;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(attrs ?? {})) if (v && typeof v === 'object' && 'level' in (v as any)) out[k] = (v as any).level; else if (typeof v === 'number') out[k] = v;
    console.log(c?.name, JSON.stringify(out), Object.keys(out).length ? '' : 'keys: ' + Object.keys(d).slice(0, 12).join(','));
  }
  process.exit(0);
})();
