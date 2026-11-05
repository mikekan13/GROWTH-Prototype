import { prisma } from '../app/src/lib/db';
import { writeFileSync } from 'fs';
(async () => {
  const rows = await prisma.location.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, name: true, data: true } });
  const out: Record<string, unknown> = {};
  for (const r of rows) { const d = JSON.parse(r.data ?? '{}'); out[r.id] = { name: r.name, footprint: d.footprint, openings: d.openings, footprintAt: d.footprintAt }; }
  writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log('dumped', rows.length, 'locations →', process.argv[2]);
  process.exit(0);
})();
