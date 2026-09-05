import { prisma } from '../src/lib/db';

(async () => {
  const t = await prisma.character.findFirst({
    where: { name: 'Tara Almswood' },
    select: {
      id: true,
      name: true,
      status: true,
      entityType: true,
      campaignId: true,
      userId: true,
      data: true,
      godHead: {
        select: {
          id: true,
          name: true,
          aiActionMode: true,
          domain: true,
          pillar: true,
          temperature: true,
          defaultModel: true,
          systemPrompt: true,
        },
      },
    },
  });
  if (!t) {
    console.log('NOT FOUND');
    await prisma.$disconnect();
    return;
  }
  console.log('META:', JSON.stringify({
    id: t.id,
    status: t.status,
    entityType: t.entityType,
    campaignId: t.campaignId,
    userId: t.userId,
    godHead_id: t.godHead?.id,
    godHead_pillar: t.godHead?.pillar,
    aiActionMode: t.godHead?.aiActionMode,
    defaultModel: t.godHead?.defaultModel,
    systemPrompt_len: t.godHead?.systemPrompt?.length ?? null,
    data_len: t.data?.length ?? null,
  }, null, 2));
  try {
    const d = JSON.parse(t.data);
    console.log('DATA_KEYS:', JSON.stringify(Object.keys(d), null, 2));
    console.log('IDENTITY:', JSON.stringify(d.identity, null, 2));
    console.log('CREATION:', JSON.stringify(d.creation, null, 2));
  } catch (e) {
    console.log('data not JSON');
  }
  await prisma.$disconnect();
})();
