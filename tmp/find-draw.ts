import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const rows: any[] = await p.$queryRawUnsafe(`SELECT id, createdAt, length(content) as len FROM CopilotMessage WHERE content LIKE '%outlineFt%' ORDER BY createdAt`);
  for (const r of rows) console.log(r.id, r.createdAt, Number(r.len));
  const cols: any[] = await p.$queryRawUnsafe(`PRAGMA table_info(CopilotMessage)`);
  console.log('cols', cols.map((c) => c.name).join(','));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
