import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const ents = await p.dayaEntity.findMany({ where: { character: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' } }, select: { id: true, status: true, character: { select: { id: true, name: true } } } });
  for (const e of ents) console.log('entity', e.character.name, e.status, e.id);
  const ints = await p.dayaIntention.findMany({ orderBy: { createdAt: 'asc' } });
  for (const i of ints) console.log('intention', i.characterId?.slice(-6) ?? i.entityId?.slice(-6), i.status ?? '', '|', String(i.text ?? i.title ?? i.cue ?? JSON.stringify(i)).replace(/\s+/g,' ').slice(0, 160));
  const routines = await p.dayaRoutine.findMany();
  for (const r of routines) console.log('routine', (r.characterId ?? r.entityId ?? '').slice(-6), r.status ?? r.state ?? '', '|', String(r.name ?? r.title ?? '').slice(0, 60), '| cue:', String(r.cue ?? r.trigger ?? '').slice(0, 80));
  const goals = await p.goal.findMany({ where: { character: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' } }, select: { characterId: true, status: true, title: true } }).catch((e: any) => { console.log('goal query', e.message.split('\n')[0]); return []; });
  for (const g of goals) console.log('goal', g.characterId.slice(-6), g.status, '|', String(g.title).slice(0, 80));
  const clock = await p.campaign.findUnique({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } });
  console.log('clock currentCycle', clock?.currentCycle);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
