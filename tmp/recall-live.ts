/** Call recall() itself for Violet on the knock and show rungs + intentions. From app/: npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/recall-live.ts */
import { prisma } from '@/lib/db';
import { recall } from '@/daya/recall';

const CUE = process.argv[2] ?? 'He wipes his eyes from the tears he was crying in the car. He knocks on the door.';

async function main() {
  const ch = await prisma.character.findFirst({ where: { name: { contains: 'Violet' } }, select: { id: true, data: true, campaignId: true } });
  const ent = await prisma.dayaEntity.findFirst({ where: { characterId: ch!.id }, select: { id: true } });
  const affect = await prisma.dayaAffect.findUnique({ where: { entityId: ent!.id } });
  const mood = affect ? { morale: affect.morale, stress: affect.stress, grief: affect.grief } : { morale: 0, stress: 0, grief: 0 };
  const sheet = JSON.parse(ch!.data || '{}') as { attributes?: Record<string, { level: number; current: number; augmentPositive: number; augmentNegative: number }> };
  const w = sheet.attributes?.wisdom, wt = sheet.attributes?.wit;
  const soulState = { wisdomMax: w ? w.level + w.augmentPositive - w.augmentNegative : 10, wisdomCur: w ? w.current : 10, witMax: wt ? wt.level + wt.augmentPositive - wt.augmentNegative : 10, witCur: wt ? wt.current : 10 };
  const camp = await prisma.campaign.findUnique({ where: { id: ch!.campaignId! }, select: { currentCycle: true } });
  const nowCycle = camp?.currentCycle ?? 0;
  const goals = await prisma.goal.findMany({ where: { characterId: ch!.id, status: 'ACTIVE' }, select: { id: true, description: true } });
  const r = await recall({ entityId: ent!.id, cue: CUE, mood, soulState, thornBlocks: [], nowCycle, goals, situation: { threatened: false, frequencyLow: false } });
  console.log('cycle', nowCycle.toFixed(5), '| surfaced', r.surfaced.length, '| deferred', r.deferred.length);
  for (const s of r.surfaced) {
    const m = await prisma.dayaMemoryEntry.findUnique({ where: { id: s.memoryId }, select: { content: true } });
    console.log(`  [${s.rung}] ${s.score.toFixed(3)} :: ${m?.content.replace(/\s+/g, ' ').slice(0, 100)}`);
  }
  console.log('intentions:', JSON.stringify(r.intentions ?? []));
  console.log('failedFeel:', r.failedFeel);
}
main().finally(() => prisma.$disconnect());
