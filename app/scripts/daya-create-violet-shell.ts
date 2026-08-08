import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { createDefaultCharacter } from '../src/lib/defaults';

const INCUBATOR_ID = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const mike = await prisma.user.findFirst({ where: { OR: [{ email: 'admin@growth.local' }, { username: 'Mikekan13' }] } });
  if (!mike) { console.error('no Mike'); process.exit(1); }

  const existing = await prisma.character.findFirst({ where: { campaignId: INCUBATOR_ID, name: 'Violet' } });
  if (existing) { console.log(`= Violet shell already exists: ${existing.id}`); process.exit(0); }

  const data = createDefaultCharacter('Violet');

  // Introspect required fields by attempting a minimal create; log the created row.
  const char = await prisma.character.create({
    data: {
      name: 'Violet',
      campaign: { connect: { id: INCUBATOR_ID } },
      user: { connect: { id: mike.id } },
      data: JSON.stringify(data),
    } as any,
  });
  console.log(`+ Created Violet shell character: ${char.id}`);
  console.log(`  entityType=${(char as any).entityType} status=${(char as any).status}`);
  process.exit(0);
})().catch(async e => { console.error('ERR', e?.message || e); await prisma.$disconnect(); process.exit(1); });
