/**
 * Replay Violet's recall on HW7 line 1 with her real memories, mood and sheet — as of the moment of the line
 * (memories written during the run itself are left out, since they did not exist yet).
 * Run from app/: npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/violet-recall-replay.ts ["cue"] [before-ISO]
 */
import { prisma } from '@/lib/db';
import { scoreCandidate, wisdomThreshold, wisdomBudget, witImmediateProbability, witPasses, stemmedJaccard, spreadBudget } from '@/daya/recall';
import { climb, ladderCompare, RUNG_RANK } from '@/daya/ladder';
import { classifyDomains } from '@/daya/domains';
import { parseChain } from '@/daya/chain';

const CUE = process.argv[2] ?? 'He wipes his eyes from the tears he was crying in the car. He knocks on the door.';
const BEFORE = new Date(process.argv[3] ?? '2026-10-25T09:22:00Z');

async function main() {
  const ch = await prisma.character.findFirst({ where: { name: { contains: 'Violet' } }, select: { id: true, data: true } });
  const ent = await prisma.dayaEntity.findFirst({ where: { characterId: ch!.id }, select: { id: true } });
  const affect = await prisma.dayaAffect.findUnique({ where: { entityId: ent!.id } });
  const mood = affect ? { morale: affect.morale, stress: affect.stress, grief: affect.grief } : { morale: 0, stress: 0, grief: 0 };
  const sheet = JSON.parse(ch!.data || '{}') as { attributes?: Record<string, { level: number; current: number; augmentPositive: number; augmentNegative: number }> };
  const w = sheet.attributes?.wisdom, wt = sheet.attributes?.wit;
  const soulState = {
    wisdomMax: w ? w.level + w.augmentPositive - w.augmentNegative : 10, wisdomCur: w ? w.current : 10,
    witMax: wt ? wt.level + wt.augmentPositive - wt.augmentNegative : 10, witCur: wt ? wt.current : 10,
  };
  const camp = await prisma.campaign.findFirst({ select: { currentCycle: true } });
  const nowCycle = camp?.currentCycle ?? 0;
  const theta = wisdomThreshold(soulState.wisdomMax);
  const budget = wisdomBudget(soulState.wisdomMax, soulState.wisdomCur);
  console.log('CUE:', CUE, '| memories before', BEFORE.toISOString());
  console.log('mood', mood, 'soul', soulState, 'cycle', nowCycle);
  console.log('theta', theta.toFixed(3), 'budget', budget, 'witP', witImmediateProbability(soulState.witMax).toFixed(2));
  console.log('cue domains', classifyDomains(CUE).all);

  const rows = (await prisma.dayaMemoryEntry.findMany({ where: { entityId: ent!.id } })).filter((r) => r.realTime < BEFORE && !(r.classification ?? '').includes('failed recall attempt') && r.noticed !== false);
  const goals = await prisma.goal.findMany({ where: { characterId: ch!.id, status: 'ACTIVE' }, select: { id: true, description: true } });
  const cueDomains = classifyDomains(CUE).all;
  const scored = rows.map((r) => {
    const m = { id: r.id, content: r.content, valence: r.valence, arousal: r.arousal, salience: r.salience, entityRefs: JSON.parse(r.entityRefs || '[]') as string[], narrativeCycle: r.narrativeCycle, domain: r.domain ?? null, domains: JSON.parse(r.domains || '[]') as string[], chain: parseChain(r.chain) };
    const s = scoreCandidate(m, CUE, [], mood, nowCycle, [], false);
    const l = climb({ id: m.id, content: m.content, valence: m.valence, arousal: m.arousal, domain: m.domain, domains: m.domains, chain: m.chain }, { cue: CUE, cueRefs: [], goals, situation: { threatened: false, frequencyLow: false }, cueDomains });
    return { m, s, l };
  });
  const passing = scored
    .filter((x) => Number.isFinite(x.s.score) && (x.s.score >= theta || (RUNG_RANK[x.l.rung] >= RUNG_RANK.goals && x.s.score >= theta * 0.5)))
    .sort((a, b) => ladderCompare({ ...a.l, score: a.s.score }, { ...b.l, score: b.s.score }));
  const line = (x: typeof scored[number]) => `${x.s.score.toFixed(3)} rel=${x.s.relevance.toFixed(2)} jac=${stemmedJaccard(CUE, x.m.content).toFixed(3)} sal=${x.m.salience.toFixed(2)} rung=${x.l.rung}/${x.l.strength.toFixed(2)} words=${x.l.words.toFixed(2)} :: ${x.m.content.replace(/\s+/g, ' ').slice(0, 80)}`;
  console.log(`\nPASSING the gate (${passing.length}), ladder order:`);
  for (const x of passing) console.log('  ' + line(x));
  const chosen = spreadBudget(passing, (x) => x.l.rung, budget);
  console.log(`\nWITHIN BUDGET ${budget}, spread down the ladder:`);
  for (const x of chosen) console.log(`  ${witPasses(ent!.id, x.m.id, nowCycle, soulState.witMax) ? 'SURFACES NOW' : 'deferred (wit)'} :: ` + line(x));
}
main().finally(() => prisma.$disconnect());
