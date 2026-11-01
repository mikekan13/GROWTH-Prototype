/** Painted instances wearing the catalogue blurb (Michael 11-01): where the instance has its own story, that is its description. */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE', sourceForgeItemId: { not: null }, story: { not: null } }, select: { id: true, name: true, data: true, story: true, sourceForgeItemId: true } });
  const archs = new Map((await prisma.forgeItem.findMany({ where: { id: { in: [...new Set(items.map((i) => i.sourceForgeItemId!))] } }, select: { id: true, data: true } })).map((a) => [a.id, JSON.parse(a.data || '{}').description as string | undefined]));
  const changed: Array<{ id: string; name: string; before: string; after: string }> = [];
  for (const it of items) {
    const d = JSON.parse(it.data || '{}');
    const blurb = archs.get(it.sourceForgeItemId!);
    if (!it.story?.trim() || !blurb || d.description !== blurb) continue;
    changed.push({ id: it.id, name: it.name, before: d.description, after: it.story.trim() });
    d.description = it.story.trim();
    await prisma.campaignItem.update({ where: { id: it.id }, data: { data: JSON.stringify(d) } });
  }
  writeFileSync(`data/archive/repaint-descriptions-${Date.now()}.json`, JSON.stringify(changed, null, 2));
  console.log(`repainted ${changed.length}: ` + changed.map((c) => c.name).join('; '));
  process.exit(0);
})();
