/** Mike 2026-10-17: "Yes you should delete them" — the six "(old genesis)" NPCs. Archive, then delete. DRY=1 counts only. */
import { prisma } from '../app/src/lib/db';
import { writeFileSync } from 'fs';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const chars = await prisma.character.findMany({ where: { campaignId: C, status: 'RETIRED', name: { endsWith: '(old genesis)' } } });
  const ids = chars.map(c => c.id);
  const p = prisma as any;
  const w = { characterId: { in: ids } };
  const daya = await p.dayaEntity.findMany({ where: w });
  const dayaIds = daya.map((d: any) => d.id);
  const dump = {
    characters: chars,
    backstories: await p.characterBackstory.findMany({ where: w }),
    changeLogs: await p.changeLog.findMany({ where: w }),
    portraits: await p.portraitGeneration.findMany({ where: w }),
    personaLocks: await p.personaLock.findMany({ where: w }),
    goals: await p.goal.findMany({ where: w }),
    godheads: await p.godHead.findMany({ where: w }),
    daya,
    dayaMemories: dayaIds.length ? await p.dayaMemoryEntry.findMany({ where: { entityId: { in: dayaIds } } }) : [],
    edges: await prisma.entityRelationship.findMany({ where: { OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }] } }),
    heldItems: await prisma.campaignItem.findMany({ where: { holderId: { in: ids } } }),
  };
  const counts = Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, (v as unknown[]).length]));
  console.log(chars.map(c => c.name).join(' | '));
  console.log(JSON.stringify(counts));
  if (process.env.DRY) process.exit(0);
  writeFileSync('data/archive/old-genesis-npcs-deleted-2026-10-17.json', JSON.stringify(dump, null, 1));
  await prisma.$transaction(async (tx: any) => {
    if (dayaIds.length) await tx.dayaMemoryEntry.deleteMany({ where: { entityId: { in: dayaIds } } });
    await tx.dayaEntity.deleteMany({ where: w });
    for (const m of ['characterBackstory', 'changeLog', 'portraitGeneration', 'personaLock', 'goal']) await tx[m].deleteMany({ where: w });
    await tx.campaignItem.updateMany({ where: { holderId: { in: ids } }, data: { holderId: null } });
    await tx.entityRelationship.deleteMany({ where: { OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }] } });
    await tx.character.deleteMany({ where: { id: { in: ids } } });
  });
  console.log('deleted', ids.length);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
