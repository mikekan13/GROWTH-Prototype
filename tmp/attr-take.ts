/** Mike 17 Oct: set the record straight — "Take your time." was Kristopher. Canon gets a revision row (previous kept); the table event's speech is attributed. */
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3', GM = 'cmrep1oh300002g48ue1bn5rg';
(async () => {
  const p = prisma as any;
  const ce = await p.canonEvent.findUniqueOrThrow({ where: { id: 'cmvchx7mv0077sk48c4y6iien' } });
  const detail = { ...JSON.parse(ce.detail), speakerLabel: 'Kristopher', speakerId: K };
  const narration = 'Kristopher says: "Take your time."';
  await p.canonRevision.create({ data: { campaignId: C, canonEventId: ce.id, previous: JSON.stringify({ narration: ce.narration, detail: ce.detail }), narration, reason: 'GM: the line was Kristopher\'s (spoken by pronoun, the parser could not attribute it)', authoredBy: GM } });
  await p.canonEvent.update({ where: { id: ce.id }, data: { narration, actorId: K, detail: JSON.stringify(detail) } });
  const ev = await prisma.campaignEvent.findUniqueOrThrow({ where: { id: 'cmvchx7mr0076sk48womt4dco' } });
  const pl = JSON.parse(ev.payload);
  pl.speech = (pl.speech ?? []).map((s: any) => s.text === 'Take your time.' ? { ...s, speakerId: K, speakerLabel: 'Kristopher' } : s);
  await prisma.campaignEvent.update({ where: { id: ev.id }, data: { payload: JSON.stringify(pl), characterId: K, characterName: 'Kristopher' } });
  console.log('attributed');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
