import { prisma } from '../app/src/lib/db';
(async () => {
  const car = await prisma.campaignItem.findUnique({ where: { id: 'cmvcfyn460009zc48xhwl6kb8' }, select: { name: true, data: true, story: true, sourceForgeItemId: true, history: true } });
  const d = JSON.parse(car!.data || '{}');
  console.log('description:', d.description, '| look:', d.look, '| state:', d.state, '| story:', car!.story);
  console.log('history:', car!.history.slice(0, 300));
  if (car!.sourceForgeItemId) { const a = await prisma.forgeItem.findUnique({ where: { id: car!.sourceForgeItemId }, select: { name: true, data: true, isGlobal: true } }); console.log('archetype:', a?.name, a?.isGlobal ? '(global stock)' : '', JSON.parse(a?.data || '{}').description); }
  process.exit(0);
})();
