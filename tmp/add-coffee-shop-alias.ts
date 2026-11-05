/** Finding 96 (2026-11-05): the coffee shop is "Extra Space Coffee" in Michael's lines; the Location is "the coffee shop on Broadway".
 *  Adds the alias to the Location's data.aliases[] (persists through the GM rollback — Locations are not in the snapshot).
 *    node --env-file=.env --env-file=.env.local --import tsx ../tmp/add-coffee-shop-alias.ts [--apply]  (from app/) */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const ALIASES = ['Extra Space Coffee', 'Extra Space'];
(async () => {
  const apply = process.argv.includes('--apply');
  const loc = await prisma.location.findFirstOrThrow({ where: { campaignId: C, name: 'the coffee shop on Broadway' }, select: { id: true, data: true } });
  const d = JSON.parse(loc.data ?? '{}');
  const have: string[] = Array.isArray(d.aliases) ? d.aliases : [];
  const next = [...have, ...ALIASES.filter((a) => !have.some((h) => h.toLowerCase() === a.toLowerCase()))];
  console.log('aliases:', have, '→', next);
  if (!apply) { console.log('(dry run; pass --apply)'); process.exit(0); }
  d.aliases = next;
  await prisma.location.update({ where: { id: loc.id }, data: { data: JSON.stringify(d) } });
  console.log('written'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
