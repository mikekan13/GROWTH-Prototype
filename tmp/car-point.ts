import { prisma } from '../app/src/lib/db';
(async () => {
  const car = await prisma.campaignItem.findUnique({ where: { id: 'cmvcfyn460009zc48xhwl6kb8' }, select: { data: true } });
  const cd = JSON.parse(car!.data || '{}'); console.log('car:', JSON.stringify({ canvasX: cd.canvasX, canvasY: cd.canvasY, mapShape: cd.mapShape ? 'yes' : 'no', rotation: cd.rotation }));
  const k = await prisma.character.findUnique({ where: { id: 'cmvcbw49u0001h448qanzbhs3' }, select: { data: true } });
  const kd = JSON.parse(k!.data || '{}'); console.log('kris:', JSON.stringify({ canvasX: kd.canvasX, canvasY: kd.canvasY, at: kd.canvasPlacedAt }));
  const locs = await prisma.location.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { name: true, status: true } });
  console.log('statuses:', locs.map((l) => `${l.name}=${l.status}`).join('; '));
  process.exit(0);
})();
