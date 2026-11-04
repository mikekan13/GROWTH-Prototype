/**
 * FIX THE SESSION 6 RECORD (2026-11-04, Michael: "fix the record where it needs fixing in their memories etc. We will keep this run").
 * Keeps the run. Closes the call in the ledger (he said goodbye, she set the phone face-down), deletes the memories that were
 * never experiences (recall-miss stubs, dream ticks, "nothing new"), the invented deeds (the bill in HER pocket, his name on
 * her screen, her acts copied into his first person), the duplicate "you are on the line" rows; rewrites the "faint sound
 * beyond the room" rows into what actually came through the line, "Christopher" into "I", her ringing phone out of her deeds;
 * marks the "Her phone continues to ring" action owned; records the date as a fact and an intention for both.
 * Backup of every touched row: data/archive/session6-record-fix-<ts>.json
 *   cd app && node --env-file=.env --env-file=.env.local --import tsx ../tmp/fix-session6-record.ts
 */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
import { withoutSignal } from '../app/src/services/item-signal';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET_E = 'cmv57ezn2000lds4859pxeux4';
const KRIS_E = 'cmvccodq2001tyc486jp89cwk';
const p = prisma as any;
let HER_PHONE: string | undefined;

const NOISE = [
  'Nothing new reaches you.',
  'Something in you reaches for it and finds only its edge.',
  'You know you know this — it stays just out of grasp.',
  "It's right there and it won't come.",
  'A dream tick ran.',
];
const DELETE_IDS = [
  'cmw2mqr4f00bs5o48ioyu4h2u', // V adjudication: thumb seeks a bill in a pocket that isn't there (invented deed)
  'cmw2mx3vi00gu5o48oxcl50yu', // V adjudication: thumb irons a bill's crease (she holds no bill)
  'cmw2mx5zp00h25o485y7d3mai', // K perception: her invented act in HIS first person, "his name lit up" on her screen
  'cmw2mqu0s00c25o48538wpuu1', // K perception: "a sound beyond the room" = her invented act
  'cmw2ocnxn01a05o48dyw02u2i', // K perception: her grip on her phone told as his
  'cmw2opox601kj5o48i3qz4v45', // K perception: her thumb on the receiver told as his
  'cmw2oqfkt01la5o489vwkx2pn', // V "dialogue" never spoken (heat-transfer monologue)
  'cmw2opunv01l55o48dp5dr762', // V perception: second rendering of her nod (floor tilts, air still — invented)
  'cmw2p110o01ub5o48oajfsr47', // V perception: second rendering of the phone set down (tight knot — invented)
  'cmw2o4xum013b5o48ixaljz4x', // K "own doing": you are on the line (duplicate 2)
  'cmw2on8zi01hy5o482970sf5l', // K (duplicate 3)
  'cmw2oqyoo01lx5o486xwi1dur', // K (duplicate 4)
  'cmw2mihol003q5o4897lgw7fl', // K "what you set off is still going" (duplicate)
];
const REWRITE: Record<string, string | ((s: string) => string)> = {
  cmw2mdq19000v5o48kpz5izaz: (s) => s.replace('Christopher sits in my car', 'I sit in my car'),
  cmw2mihxd003x5o48w6o72aaj: 'Your phone keeps ringing, almost pleading with you.',
  cmw2moewh00975o4860hp0cvo: 'Kristopher\'s voice comes through the line: "And you gave me your number on a five dollar bill? So I\'m not imagining that."',
  cmw2mryyr00cv5o48727ys6r3: 'Kristopher says nothing for a moment; you hear him breathing on the line.',
  cmw2n4gqb00ln5o48pah8qiik: 'You hold the silence. Violet says nothing; the line stays open between you.',
  cmw2oqvz201lp5o483965lvp3: 'You and Kristopher sit on the line, listening to each other breathe.',
  cmw2mof8j009a5o48sg6ox5al: 'Violet answered. You are on the line with her now: what you say reaches her, and what she says reaches you.',
  cmw2me2k4001w5o485k60lydu: "Violet's phone is ringing because you dialed it. Nobody has answered yet.",
  cmw2p0xcv01u05o48motquhup: 'The line goes quiet, then dead. The call has ended.',
  cmw2ntzmn012w5o4895qke9yq: 'You glance toward the window. Dark outside and cold-looking; the glass is dry. No rain.',
  cmw2p0jl001sr5o48ty970egi: (s) => s.split('\n').filter((l) => !l.startsWith('- Press my thumb')).join('\n'),
};

async function main() {
  HER_PHONE = (await prisma.campaignItem.findFirst({ where: { campaignId: C, name: 'Her phone', holderId: 'cms60ndtn0000kw48ioq10i68' }, select: { id: true } }))?.id;
  const backup: Record<string, unknown> = {};
  const noiseRows = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: [VIOLET_E, KRIS_E] }, content: { in: NOISE } } });
  const touched = await p.dayaMemoryEntry.findMany({ where: { id: { in: [...DELETE_IDS, ...Object.keys(REWRITE)] } } });
  backup.memories = [...noiseRows, ...touched];
  backup.phone = HER_PHONE ? await prisma.campaignItem.findUnique({ where: { id: HER_PHONE } }) : null;
  backup.action = await prisma.campaignEvent.findUnique({ where: { id: 'cmw2mibqy003b5o48f1idxw4d' } });
  writeFileSync(`data/archive/session6-record-fix-${Date.now()}.json`, JSON.stringify(backup, null, 1));

  // 1. the call is over
  if (HER_PHONE) {
    const row = await prisma.campaignItem.findUnique({ where: { id: HER_PHONE }, select: { data: true } });
    const d = JSON.parse(row!.data ?? '{}');
    await prisma.campaignItem.update({ where: { id: HER_PHONE }, data: { data: JSON.stringify(withoutSignal(d)) } });
  }
  // 2. memories
  const n1 = await p.dayaMemoryEntry.deleteMany({ where: { id: { in: noiseRows.map((r: any) => r.id) } } });
  const n2 = await p.dayaMemoryEntry.deleteMany({ where: { id: { in: DELETE_IDS } } });
  let n3 = 0;
  for (const [id, to] of Object.entries(REWRITE)) {
    const row = await p.dayaMemoryEntry.findUnique({ where: { id } });
    if (!row) { console.warn('missing', id); continue; }
    const content = typeof to === 'function' ? to(row.content) : to;
    if (content !== row.content) { await p.dayaMemoryEntry.update({ where: { id }, data: { content } }); n3++; }
  }
  // 3. the ringing phone was never her deed
  const ev = await prisma.campaignEvent.findUnique({ where: { id: 'cmw2mibqy003b5o48f1idxw4d' } });
  const pl = JSON.parse(ev!.payload);
  pl.actions = (pl.actions ?? []).map((a: any) => (a.actorLabel === 'Violet' ? { ...a, owned: true } : a));
  await prisma.campaignEvent.update({ where: { id: ev!.id }, data: { payload: JSON.stringify(pl) } });
  // 4. the date, as a fact and as each one's intention
  const cycle = (await prisma.campaign.findUnique({ where: { id: C }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  await p.worldFact.create({ data: { campaignId: C, subjectKey: 'kristopher_violet.coffee_date', establishedAtCycle: cycle,
    fact: 'Agreed on the phone Monday night, just before ten (mid October): Kristopher and Violet will meet for coffee tomorrow, Tuesday, at the coffee shop on Broadway. No hour was set ("when the rain starts"). He called from his car in the lot behind the hotel; she answered on the third ring in her apartment. The call ended with his "Goodbye Violet... I\'ll see you tomorrow."' } });
  for (const [entityId, line] of [[VIOLET_E, 'Tomorrow: coffee with Kristopher at the coffee shop on Broadway. I said yes on the phone. No hour was set — "when the rain starts".'], [KRIS_E, 'Tomorrow: coffee with Violet at the coffee shop on Broadway. She said yes. No hour was set — "when the rain starts".']] as const) {
    await p.dayaIntention.create({ data: { entityId, description: line, trigger: 'tomorrow', authority: 'self', narrativeCycle: cycle, status: 'PENDING' } });
  }
  console.log(`noise deleted ${n1.count} · wrong rows deleted ${n2.count} · rewritten ${n3} · call closed ${!!HER_PHONE} · fact + 2 intentions at cycle ${cycle}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
