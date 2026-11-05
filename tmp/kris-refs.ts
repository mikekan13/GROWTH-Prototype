import { prisma } from '../app/src/lib/db';
const ID = 'cmvcbw49u0001h448qanzbhs3';
const add = ['addbac67', '218d506b', 'df2d3dde'].map(f => `/uploads/references/cmrep1oh300002g48ue1bn5rg/kristopher-${f}.jpg`);
(async () => {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: ID } });
  const d = JSON.parse(c.data);
  d.identity = { ...d.identity, referencePhotos: [...new Set([...(d.identity?.referencePhotos ?? []), ...add])] };
  await prisma.character.update({ where: { id: ID }, data: { data: JSON.stringify(d) } });
  console.log(d.identity.referencePhotos.length);
  process.exit(0);
})();
