import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const ID = 'cmw2pf7px00000048wnu8n97u';
(async () => {
  const loc = await prisma.location.findUniqueOrThrow({ where: { id: ID }, select: { name: true, data: true } });
  const d = JSON.parse(loc.data ?? '{}');
  const before = JSON.stringify(d.openings);
  for (const o of d.openings ?? []) {
    const b: string[] = Array.isArray(o.between) ? o.between : [];
    if (!b.some((x) => x.toLowerCase() === 'outside')) o.between = [b[0] ?? loc.name, 'outside'];
  }
  console.log('before', before.slice(0, 200)); console.log('after ', JSON.stringify(d.openings).slice(0, 200));
  if (process.argv.includes('--apply')) { await prisma.location.update({ where: { id: ID }, data: { data: JSON.stringify(d) } }); console.log('written'); }
  process.exit(0);
})();
