import { prisma } from '../app/src/lib/db';
const since = new Date(process.argv[2] ?? '2026-10-29T11:28:00Z');
(async () => {
  const p = prisma as any;
  const cols: any[] = await p.$queryRawUnsafe(`PRAGMA table_info(DayaModelCall)`);
  console.log('cols:', cols.map((c) => c.name).join(','));
  const rows: any[] = await p.dayaModelCall.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: 'asc' } });
  for (const r of rows) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) { if (['id', 'createdAt', 'prompt', 'response', 'systemPrompt', 'messages', 'input', 'output'].includes(k)) continue; if (v != null && v !== '' && typeof v !== 'object') o[k] = typeof v === 'string' ? v.slice(0, 60) : v; }
    console.log(String(r.createdAt).slice(11, 23), JSON.stringify(o));
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
