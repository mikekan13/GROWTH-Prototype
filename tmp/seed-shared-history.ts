/**
 * Shared history between Kristopher and Violet (HW8 run 2, 2026-10-25, Mike: "does he know her? He has delivered to
 * her before so would it be 'a figure' or would he recognize her voice"). The world already says it — the fact
 * `kristopher` ("delivers for the pizza place Violet orders from every evening… the driver who always stays a few
 * seconds longer"), her memories (six visits catalogued, hair up before he arrives), her sheet (dark brown hair with
 * violet-purple), the pizza ("her standing order"), the receipt (CUSTOMER: VIOLET) — but nothing was written on HIS
 * side and the familiarity ledger between them was empty. This DERIVES both from that data; it invents nothing.
 *
 *   familiarity  Kristopher → Violet: identity F3 (her first name is on every receipt), appearance F3 (six+ evenings
 *                at her door), history F1. Violet → Kristopher: identity F3 (her memories name him), appearance F3,
 *                history F2 ("I know the sound of his hesitation; I've cataloged it").
 *   memories     two for Kristopher, dated a week before play (Violet's timeline: play opens a week after her last
 *                memory), in his own words, from the facts above only.
 *
 * Idempotent: familiarity is written to the level (not grown twice); memories are skipped if present.
 * Kristopher = real-person canon: his facts are Mike's to correct — these are the campaign's own facts about him.
 */
import { prisma } from '@/lib/db';
import { writeFamiliarity, priorOf, scoreForLevel } from '@/services/familiarity';
import { writeMemoryEntry } from '@/daya/memory';

const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const DAY = 1 / 365.25;
const WEEK_BEFORE_PLAY = -7 * DAY;

const KRIS_MEMORIES: Array<{ source: string; content: string; valence: number; arousal: number; salience: number }> = [
  {
    source: 'deliveries / story-open',
    content: 'The fourth-floor walkup in the historic district, most evenings. One door on the whole floor. Her standing order, a large Hawaiian with black olives, the receipt always reading the same first name: Violet. Dark brown hair with violet-purple in it. She pays at the door.',
    valence: 0.3, arousal: 0.3, salience: 0.7,
  },
  {
    source: 'deliveries / story-open',
    content: 'I always stay a few seconds longer at her door than the delivery needs. I know I do it. I have not asked for anything, and she has not given me her number.',
    valence: 0.1, arousal: 0.35, salience: 0.75,
  },
];

async function seedFamiliarity(perceiverCharacterId: string, subjectId: string, levels: Record<string, number>, cycle: number) {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId: perceiverCharacterId }, select: { id: true } });
  if (!entity) throw new Error(`no DAYA entity for ${perceiverCharacterId}`);
  const subject = await prisma.character.findUnique({ where: { id: subjectId }, select: { entityType: true } });
  const subjectKind = subject?.entityType === 'NPC' ? 'NPC' : 'CHARACTER';
  const out: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const [aspectKind, level] of Object.entries(levels)) {
      const key = { perceiverId: entity.id, subjectId, aspectKind };
      const prior = await priorOf(tx, key);
      const score = scoreForLevel(level);
      await writeFamiliarity(tx, [{ ...key, campaignId: CAMP, subjectKind, score, source: 'seed', cycle, prior }]);
      out.push(`${aspectKind}=F${level}`);
    }
  });
  return out.join(' ');
}

async function main() {
  const camp = await prisma.campaign.findUnique({ where: { id: CAMP }, select: { currentCycle: true } });
  const cycle = camp?.currentCycle ?? 0;
  console.log('Kristopher → Violet:', await seedFamiliarity(KRIS, VIOLET, { identity: 3, appearance: 3, history: 1 }, cycle));
  console.log('Violet → Kristopher:', await seedFamiliarity(VIOLET, KRIS, { identity: 3, appearance: 3, history: 2 }, cycle));

  const kris = await prisma.dayaEntity.findUnique({ where: { characterId: KRIS }, select: { id: true } });
  if (!kris) throw new Error('no DAYA entity for Kristopher');
  for (const m of KRIS_MEMORIES) {
    const have = await prisma.dayaMemoryEntry.findFirst({ where: { entityId: kris.id, content: m.content }, select: { id: true } });
    if (have) { console.log('memory present:', m.content.slice(0, 60)); continue; }
    const row = await writeMemoryEntry({ entityId: kris.id, narrativeCycle: WEEK_BEFORE_PLAY, source: m.source, content: m.content, valence: m.valence, arousal: m.arousal, salience: m.salience, entityRefs: [VIOLET], skipDreamPressure: true });
    console.log('memory written:', row.id, m.content.slice(0, 60));
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
