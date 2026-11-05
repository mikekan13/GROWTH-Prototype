import { prisma } from '../app/src/lib/db';
(async () => {
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gte: new Date('2026-11-03T08:22:50Z') } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, type: true, characterName: true, payload: true } });
  for (const e of ev) {
    const p = JSON.parse(e.payload);
    const t = e.createdAt.toISOString().slice(11, 19);
    if (e.type === 'being_thought') { console.log(`\n${t} [${e.characterName} — card]`); for (const s of (p.segments ?? [])) console.log(`   (${s.kind}) ${String(s.text).replace(/\s+/g, ' ')}`); if (!(p.segments ?? []).length) console.log('   thought:', String(p.thought ?? '').replace(/\s+/g, ' ')); continue; }
    const text = String(p.description ?? p.message ?? p.text ?? '').replace(/\s+/g, ' ');
    console.log(`\n${t} [${e.type}/${p.eventType ?? p.kind ?? ''} ${e.characterName ?? ''}${p.built ? ' built' : ''}] ${text}`);
    if (p.narration && p.narration !== text) console.log('   narration:', String(p.narration).replace(/\s+/g, ' '));
  }
  process.exit(0);
})();
