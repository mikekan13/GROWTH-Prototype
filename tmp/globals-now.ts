import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const counts: any[] = await p.$queryRawUnsafe(`SELECT type, isGlobal, COUNT(*) as n FROM ForgeItem WHERE type IN ('seed','root','branch') GROUP BY type, isGlobal`);
  console.log(counts.map((c) => `${c.type} global=${c.isGlobal} n=${Number(c.n)}`).join(' | '));
  const seeds: any[] = await p.$queryRawUnsafe(`SELECT id, name, isGlobal, campaignId, karmicValue, sourceGlobalId, data FROM ForgeItem WHERE type='seed'`);
  for (const s of seeds) { const d = JSON.parse(s.data ?? '{}'); console.log('SEED', s.id, s.name, 'global', s.isGlobal, 'camp', s.campaignId, 'kv', Number(s.karmicValue), 'src', s.sourceGlobalId, JSON.stringify(d.attributes), 'FD', d.baseFateDie, 'keys', Object.keys(d).join(',')); }
  const rb: any[] = await p.$queryRawUnsafe(`SELECT id, type, name, isGlobal, campaignId, karmicValue, data FROM ForgeItem WHERE type IN ('root','branch') AND (isGlobal = 1 OR campaignId IS NULL)`);
  for (const s of rb) { const d = JSON.parse(s.data ?? '{}'); console.log('GLOBAL', s.type, s.name, 'kv', Number(s.karmicValue), JSON.stringify(d.attributes)); }
  const links: any[] = await p.$queryRawUnsafe(`SELECT f.type, f.name, COUNT(l.id) as n FROM CharacterBlockLink l JOIN ForgeItem f ON f.id = l.forgeItemId WHERE f.type IN ('seed','root','branch') GROUP BY f.id`);
  console.log('linked blocks:', links.map((l) => `${l.type}:${l.name}×${Number(l.n)}`).join(' | '));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
