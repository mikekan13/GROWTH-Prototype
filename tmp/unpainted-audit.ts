import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn', CAR = 'cmvcfyn460009zc48xhwl6kb8';
(async () => {
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE', sourceForgeItemId: { not: null } }, select: { id: true, name: true, data: true, story: true, sourceForgeItemId: true, holderId: true } });
  const archs = new Map((await prisma.forgeItem.findMany({ where: { id: { in: [...new Set(items.map((i) => i.sourceForgeItemId!))] } }, select: { id: true, name: true, data: true } })).map((a) => [a.id, a]));
  const unpainted: string[] = [];
  for (const it of items) {
    const d = JSON.parse(it.data || '{}'); const a = archs.get(it.sourceForgeItemId!); const ad = a ? JSON.parse(a.data || '{}') : {};
    if (d.description && ad.description && d.description === ad.description && it.name !== a!.name) unpainted.push(`${it.name} ← "${a!.name}"${it.story ? ' (has story)' : ''}`);
  }
  console.log(`painted instances still wearing the catalogue blurb: ${unpainted.length}\n ` + unpainted.join('\n '));
  // The Fusion: its description is its own story.
  const car = items.find((i) => i.id === CAR)!;
  writeFileSync(`data/archive/fusion-description-${Date.now()}.json`, JSON.stringify(car, null, 2));
  const cd = JSON.parse(car.data || '{}');
  cd.description = car.story ?? cd.description;
  await prisma.campaignItem.update({ where: { id: CAR }, data: { data: JSON.stringify(cd) } });
  console.log('Fusion description →', cd.description);
  process.exit(0);
})();
