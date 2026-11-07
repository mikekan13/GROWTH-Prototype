/**
 * STRIKE (Michael 2026-11-07: "Everything. Strike them from the record."): the rain voicemail (one message, typed twice) and the
 * "london fog" TEXT — messages Violet never read — and what grew from them. The in-person london fog at the coffee shop is real and stays.
 * The first line (him in his car waiting for rain) is CORRECTED: the voicemail sentence is cut, the scene stays.
 * Dry run lists; --apply snapshots every touched row to data/archive, then corrects and deletes.
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/strike-unread-messages-2026-11-07.ts [--apply]   (from app/)
 */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const FIRST = 0.009830815298085063;          // corrected, kept
const STRUCK = [0.009830973847044983, 0.00983129094496482, 0.009831417784132754, 0.009915670701433616, 0.009915829250393535];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
const CUT_FROM = ' He debated on texting her';
const STRUCK_WORDS = /just saw (some )?rain|still want to get to know me|I text Violet: I'm getting a london fog|getting a london fog\. Does that sound good|Two blue ticks/i;

async function main() {
  const apply = process.argv.includes('--apply');
  const evs = await prisma.campaignEvent.findMany({ where: { campaignId: C }, select: { id: true, type: true, payload: true, characterName: true } });
  const cyc = (e: { payload: string }) => { try { const c = JSON.parse(e.payload).cycle; return typeof c === 'number' ? c : null; } catch { return null; } };
  const first = evs.find((e) => cyc(e) !== null && near(cyc(e)!, FIRST))!;
  const lines = evs.filter((e) => cyc(e) !== null && STRUCK.some((c) => near(c, cyc(e)!)));
  const thoughts = evs.filter((e) => e.type === 'being_thought' && (() => { try { return /Your 2 messages reached Violet's phone/.test(String(JSON.parse(e.payload).heard ?? '')); } catch { return false; } })());
  const canonAll = await prisma.canonEvent.findMany({ where: { campaignId: C } });
  const canonStruck = canonAll.filter((c) => STRUCK.some((s) => near(s, c.cycle)));
  const canonFirst = canonAll.filter((c) => near(c.cycle, FIRST) || c.narration.startsWith('Kristopher sits in his car. He would usually be asleep right now on his day off, but he\'s waiting for rain. He\'s waiting for the moment that he can go on the coffee date. The rain hits his windshield and he immediately opens his phone. He debated'));
  const struckCanonIds = new Set(canonStruck.map((c) => c.id));
  const mems = await prisma.dayaMemoryEntry.findMany({ where: { OR: [{ truthRef: { in: [...struckCanonIds, ...canonFirst.map((c) => c.id)] } }, { content: { contains: 'rain' } }, { content: { contains: 'london fog' } }, { content: { contains: 'unread messages' } }, { content: { contains: 'blue ticks' } }] } });
  const memFirst = mems.filter((m) => m.content.includes('I sit in my car') && m.content.includes('waiting for rain'));
  const memStrike = mems.filter((m) => !memFirst.includes(m) && ((m.truthRef && struckCanonIds.has(m.truthRef)) || STRUCK_WORDS.test(m.content) || /three unread messages sit on it/i.test(m.content)));

  console.log('CORRECT (voicemail sentence cut, scene kept):');
  console.log('  table line', first.id, '· canon', canonFirst.map((c) => c.id).join(', '), '· memory', memFirst.map((m) => m.id).join(', '));
  console.log(`STRIKE table lines ${lines.length}:`); for (const e of lines) console.log('  -', JSON.parse(e.payload).description);
  console.log(`STRIKE thoughts ${thoughts.length} (Kristopher: "Your 2 messages reached Violet's phone…")`);
  console.log(`STRIKE canon ${canonStruck.length}:`); for (const c of canonStruck) console.log('  -', c.narration.slice(0, 100));
  console.log(`STRIKE memories ${memStrike.length}:`); for (const m of memStrike) console.log('  -', m.content.replace(/\s+/g, ' ').slice(0, 140));
  const kept = mems.filter((m) => !memFirst.includes(m) && !memStrike.includes(m) && /london fog/i.test(m.content));
  console.log(`KEPT (the in-person london fog) ${kept.length}`);
  if (!apply) { console.log('(dry run)'); return; }

  writeFileSync(`data/archive/strike-unread-messages-${Date.now()}.json`, JSON.stringify({ first, canonFirst, memFirst, lines, thoughts, canonStruck, memStrike }, null, 1));
  // CORRECT the first line everywhere it lives.
  const p = JSON.parse(first.payload);
  p.description = p.description.split(CUT_FROM)[0];
  p.speech = [];
  p.thoughts = (p.thoughts ?? []).filter((t: { sentence?: string }) => !String(t.sentence ?? '').includes('voicemail'));
  if (typeof p.seedNarration === 'string') p.seedNarration = p.seedNarration.split(CUT_FROM)[0];
  p.corrected = { at: new Date().toISOString(), by: 'Michael 2026-11-07', what: 'the unread rain voicemail struck from the record' };
  await prisma.campaignEvent.update({ where: { id: first.id }, data: { payload: JSON.stringify(p) } });
  for (const c of canonFirst) {
    const d = JSON.parse(c.detail);
    if (d.split) { d.split.speech = []; d.split.thoughts = (d.split.thoughts ?? []).filter((t: { sentence?: string }) => !String(t.sentence ?? '').includes('voicemail')); }
    await prisma.canonEvent.update({ where: { id: c.id }, data: { narration: c.narration.split(/ ?He debated|phonehe debated/)[0].replace(/phone$/, 'phone.').replace(/\.?$/, '.'), detail: JSON.stringify(d) } });
  }
  for (const m of memFirst) await prisma.dayaMemoryEntry.update({ where: { id: m.id }, data: { content: m.content.split(' I debated on texting her')[0] } });
  // STRIKE the rest.
  await prisma.campaignEvent.deleteMany({ where: { id: { in: [...lines, ...thoughts].map((e) => e.id) } } });
  if (memStrike.length) await prisma.dayaMemoryEntry.deleteMany({ where: { id: { in: memStrike.map((m) => m.id) } } });
  if (canonStruck.length) await prisma.canonEvent.deleteMany({ where: { id: { in: [...struckCanonIds] } } });
  console.log('done (snapshot in data/archive)');
}
main().finally(() => prisma.$disconnect());
