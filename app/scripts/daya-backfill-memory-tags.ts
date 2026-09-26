/**
 * Backfill domain + chain tags onto DayaMemoryEntry rows written before the
 * write-time classifier existed (Mike 2026-09-23; readiness pass 09-26).
 *
 * For every row with no domain and no domains: run the ten-domain keyword
 * classifier on the content, and build a chain from what the row already
 * knows — its truthRef, its entityRefs, and which of the owner's ACTIVE
 * goals the content touches. Nothing is invented: rows the classifier can't
 * place stay domain=null but get domains='[]' → chain filled, so they stop
 * matching as "untagged".
 *
 * Usage: npx tsx scripts/daya-backfill-memory-tags.ts [--dry] [--character <id>] [--rechain-goals]
 *   --rechain-goals: instead of the untagged set, revisit EVERY row (of the
 *   character, or all) and add any of the owner's ACTIVE goals its content
 *   touches to chain.goalIds — for memories written before the goals existed.
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { prisma } from '../src/lib/db';
import { classifyDomains, pillarOfDomain } from '../src/daya/domains';
import { makeChain, parseChain, goalsTouched } from '../src/daya/chain';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const charIdx = args.indexOf('--character');
const onlyCharacter = charIdx >= 0 ? args[charIdx + 1] : null;
const rechainGoals = args.includes('--rechain-goals');

(async () => {
  const rows = await prisma.dayaMemoryEntry.findMany({
    where: {
      ...(rechainGoals ? {} : { domain: null, domains: '[]' }),
      ...(onlyCharacter ? { entity: { characterId: onlyCharacter } } : {}),
    },
    select: { id: true, entityId: true, content: true, truthRef: true, entityRefs: true, chain: true, source: true },
  });
  console.log(`${rows.length} ${rechainGoals ? 'memory rows to re-chain against goals' : 'untagged memory rows'}${onlyCharacter ? ` for character ${onlyCharacter}` : ''}${dry ? ' (dry run)' : ''}`);

  const goalsByEntity = new Map<string, Array<{ id: string; description: string }>>();
  async function goalsFor(entityId: string) {
    if (!goalsByEntity.has(entityId)) {
      const entity = await prisma.dayaEntity.findUnique({ where: { id: entityId }, select: { characterId: true } });
      const goals = entity
        ? await prisma.goal.findMany({ where: { characterId: entity.characterId, status: 'ACTIVE' }, select: { id: true, description: true } })
        : [];
      goalsByEntity.set(entityId, goals);
    }
    return goalsByEntity.get(entityId)!;
  }

  const tally: Record<string, number> = {};
  let placed = 0;
  for (const row of rows) {
    const cls = classifyDomains(row.content);
    let refs: string[] = [];
    try { refs = JSON.parse(row.entityRefs ?? '[]'); } catch { /* keep empty */ }
    const prior = parseChain(row.chain);
    const chain = makeChain({
      ...prior,
      truthRefs: [...prior.truthRefs, ...(row.truthRef ? [row.truthRef] : [])],
      entities: [...prior.entities, ...refs],
      goalIds: [...prior.goalIds, ...goalsTouched(row.content, await goalsFor(row.entityId))],
    });
    if (rechainGoals) {
      if (chain.goalIds.length > prior.goalIds.length) {
        placed++;
        if (!dry) await prisma.dayaMemoryEntry.update({ where: { id: row.id }, data: { chain: JSON.stringify(chain) } });
      }
      continue;
    }
    if (cls.primary) { placed++; tally[cls.primary] = (tally[cls.primary] ?? 0) + 1; }
    if (!dry) {
      await prisma.dayaMemoryEntry.update({
        where: { id: row.id },
        data: {
          domain: cls.primary,
          domains: JSON.stringify(cls.all),
          pillar: pillarOfDomain(cls.primary),
          chain: JSON.stringify(chain),
        },
      });
    }
  }
  if (rechainGoals) console.log(`${placed}/${rows.length} rows gained goal links in their chain`);
  else { console.log(`placed ${placed}/${rows.length} into a primary domain; ${rows.length - placed} unplaced (domains=[] but chain filled)`); console.log('primary-domain tally:', tally); }
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
