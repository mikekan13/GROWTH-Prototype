import { prisma } from '../app/src/lib/db';

async function main() {
  const locs = await prisma.location.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, type: true, data: true } });
  for (const l of locs) {
    const d = JSON.parse(l.data || '{}') as Record<string, unknown>;
    const desc = typeof d.description === 'string' ? d.description : '';
    console.log(`${l.id} | ${l.name} | ${l.type} | aliases=${JSON.stringify(d.aliases ?? null)} | desc=${desc.replace(/\s+/g, ' ').slice(0, 220)}`);
  }
  const ev = await prisma.gameEvent.findFirst({ where: { payload: { contains: '"eventType":"declaration"' } }, orderBy: { timestamp: 'desc' }, select: { payload: true, timestamp: true } });
  if (ev) {
    const p = JSON.parse(ev.payload) as Record<string, unknown>;
    console.log('\nLAST DECLARATION', ev.timestamp.toISOString());
    console.log('raw:', p.raw ?? p.description);
    console.log('narration:', p.narration);
  }
}
main().finally(() => prisma.$disconnect());
