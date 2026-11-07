/**
 * BACKFILL (Michael 2026-11-07: "that needs to be done if we're going to keep this the record"): the messages and the call of the KEPT
 * sessions of The Incubator, rebuilt from the record (CampaignEvent declarations) into WorldMessage. Every stamp is the cycle of the
 * event that shows it; each row's data names the event ids it came from. Ambiguities are FLAGGED in data.questions, never resolved
 * by guessing. Idempotent: deletes its own earlier rows (data.backfill === TAG) before writing.
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/backfill-messages-2026-11-07.ts [--apply]   (from app/)
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { localUnitsToCycles, type CalendarSpec } from '../app/src/types/time';

const TAG = 'backfill-2026-11-07';
const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const HER_PHONE = 'cmvaenwdc003jbc48s5iy48pq';
const WORK = 'cmvcfymq60003zc48bv2z54ri';
const MET = 0.009953976130150003; // "Violet walks inside" — they are together from here; threads were closed by hand after session 6

interface Msg {
  key: string; medium: string; from: string; fromThing: string | null; to: string; toThing: string;
  content: string; notice: string; sent: number; read?: number; replyTo?: string; settled?: { at: number; reason: string };
  evidence: number[]; questions?: string[];
}

const msgs: Msg[] = [
  { key: 'vm1', medium: 'voicemail', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: 'I just saw some rain. You still want to get to know me?', notice: "Violet's phone signals a new voicemail.", sent: 0.009830815298085063,
    evidence: [0.009830815298085063, 0.009830973847044983],
    questions: ['The Watcher typed a second voicemail a minute later ("Do you still want to get to know me? Because I just saw rain.") — the same voicemail restated (because the engine chimed the first as a text), or two voicemails?', 'Did Violet ever listen to this voicemail? The record shows no read.'] },
  { key: 'vm2', medium: 'voicemail', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: 'Do you still want to get to know me? Because I just saw rain.', notice: "Violet's phone signals a new voicemail.", sent: 0.00983129094496482,
    evidence: [0.00983129094496482, 0.009831417784132754], questions: ['Possibly the same voicemail as vm1, restated (see vm1).', 'Did Violet ever listen to it? The record shows no read.'] },
  { key: 'vm3', medium: 'voicemail', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: "Sorry if it is weird that I'm sending you voicemails... I guess I just wanted to hear your voice before I see you. Which sounds weird... Sorry. We can text if that makes you more comfortable?", notice: "Violet's phone chimes with a new voicemail from Kristopher.", sent: 0.009840677043392013, read: 0.009849682624315402,
    evidence: [0.009840677043392013, 0.009840803882559947, 0.00984099414131185, 0.009849682624315402, 0.00986617171614696], questions: ['The record shows this one read twice (0.0098497 and 0.0098662); the first is kept as the read time.'] },
  { key: 'tx1', medium: 'text', from: VIOLET, fromThing: HER_PHONE, to: KRIS, toThing: WORK, content: "Not weird at all. It's nice to hear it.", notice: 'Work phone chimes with an incoming text.', sent: 0.009857324684183488, read: 0.009873211289967355, replyTo: 'vm3',
    evidence: [0.009857324684183488, 0.009857483233143408, 0.009873211289967355] },
  { key: 'tx2', medium: 'text', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: 'Okay. Good.', notice: "Violet's phone chimes with an incoming text.", sent: 0.009873655227055128, read: 0.009880345993163703, replyTo: 'tx1',
    evidence: [0.009873655227055128, 0.009873813776015048, 0.009880345993163703] },
  { key: 'vm4', medium: 'voicemail', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: "I hope you're on your way because I'm almost at the coffee shop...", notice: "Violet's phone receives a voicemail notification.", sent: 0.009880631381291556, read: 0.00988798805303179,
    evidence: [0.009880631381291556, 0.00988075822045949, 0.00988798805303179] },
  { key: 'tx3', medium: 'text', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: 'Should I go ahead and order for you?', notice: "Violet's phone chimes with an incoming text.", sent: 0.00989001747971875, read: 0.009914877956634023,
    evidence: [0.00989001747971875, 0.00989017602867867, 0.009914877956634023], questions: ['The record shows Violet reading this AFTER her "Yes please." answer to it (her own read died that session); the read stamp is as recorded.'] },
  { key: 'tx4', medium: 'text', from: VIOLET, fromThing: HER_PHONE, to: KRIS, toThing: WORK, content: 'Yes please.', notice: 'Work phone chimes with an incoming text.', sent: 0.009892839651205305, read: 0.009892839651205305, replyTo: 'tx3',
    evidence: [0.009892839651205305], questions: ['Sent time unknown: the Watcher declared "Kristopher sees her text \'Yes please.\'" at 0.0098928; sent and read are both stamped then.'] },
  { key: 'tx5', medium: 'text', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: 'Well... What should I order you?', notice: "Violet's phone chimes with a text from Kristopher.", sent: 0.009892839651205305, read: 0.009907965221981563, replyTo: 'tx4',
    evidence: [0.009892839651205305, 0.009892998200165225, 0.009907965221981563], questions: ['The engine read it merged with "Yes please." (the merged-quote fault); the words here are his alone.'] },
  { key: 'vm5', medium: 'voicemail', from: VIOLET, fromThing: HER_PHONE, to: KRIS, toThing: WORK, content: "I am leaving right now. I'll be there in ten minutes. You have my uptmost interest.", notice: 'Work phone sounds with a voicemail notification.', sent: 0.009900735389409264, read: 0.009923312761301704, replyTo: 'vm4',
    evidence: [0.009900735389409264, 0.009900893938369184, 0.009901052487329103, 0.009923312761301704] },
  { key: 'tx6', medium: 'text', from: KRIS, fromThing: WORK, to: VIOLET, toThing: HER_PHONE, content: "I'm getting a london fog. Does that sound good to you?", notice: "Violet's phone chimes with a text from Kristopher.", sent: 0.009915670701433616,
    evidence: [0.009915670701433616, 0.009915829250393535], questions: ['Did Violet read it before walking in? The record shows no read.'] },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const tsRow = await prisma.timescale.findFirst({ where: { campaignId: CAMPAIGN } });
  if (!tsRow) throw new Error('no timescale');
  const ts = { unitsPerMetaCycle: tsRow.unitsPerMetaCycle, calendar: tsRow.calendar ? JSON.parse(tsRow.calendar) as CalendarSpec : null };
  const cyclesToSeconds = (c: number) => (c / localUnitsToCycles(1, 'hour', ts)) * 3600;
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: CAMPAIGN, type: { in: ['game_event', 'chat'] } }, select: { id: true, payload: true } });
  const byCycle = new Map<string, string[]>();
  for (const e of events) { try { const c = JSON.parse(e.payload).cycle; if (typeof c === 'number') byCycle.set(c.toFixed(12), [...(byCycle.get(c.toFixed(12)) ?? []), e.id]); } catch { /* skip */ } }
  const evIds = (cs: number[]) => cs.flatMap((c) => byCycle.get(c.toFixed(12)) ?? []);
  // Settling: a reply settles what it answers (as the engine would); everything still open settles at the meeting (they sat together; threads closed by hand).
  const replied = new Map<string, number>();
  for (const m of msgs) if (m.replyTo) replied.set(m.replyTo, m.sent);
  // THE CALL of session 2 (11-04): rang 21:19, answered 21:24, ended with "Goodbye Violet... I'll see you tomorrow." (22:33).
  const callStart = 0.007986032324974971, callAnswered = 0.0079869519089425, callEnd = 0.008033692142326566;
  const callSeconds = Math.round(cyclesToSeconds(callEnd - callAnswered));
  console.log(`${msgs.length} messages + 1 call (${callSeconds} s); evidence events found: ${evIds(msgs.flatMap((m) => m.evidence)).length}`);
  for (const m of msgs) console.log(`  ${m.key} ${m.medium} ${m.from === KRIS ? 'K→V' : 'V→K'} sent ${m.sent.toFixed(7)} read ${m.read?.toFixed(7) ?? '—'} settle ${(replied.get(m.key) ?? MET).toFixed(7)} ${replied.has(m.key) ? 'replied' : 'met'} "${m.content.slice(0, 40)}"${m.questions ? ` [${m.questions.length} Q]` : ''}`);
  if (!apply) { console.log('(dry run — pass --apply)'); return; }
  const old = await prisma.worldMessage.findMany({ where: { campaignId: CAMPAIGN, data: { contains: TAG } }, select: { id: true } });
  if (old.length) await prisma.worldMessage.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  const ids = new Map<string, string>();
  for (const m of msgs) {
    const settledAt = replied.get(m.key) ?? MET;
    const row = await prisma.worldMessage.create({ data: {
      campaignId: CAMPAIGN, medium: m.medium, senderId: m.from, senderThingId: m.fromThing, recipientId: m.to, recipientThingId: m.toThing,
      content: m.content, notice: m.notice, sentCycle: m.sent, deliveredCycle: m.sent, noticedCycle: m.sent, readCycle: m.read ?? null,
      settledCycle: settledAt, settledReason: replied.has(m.key) ? 'replied' : 'met', replyToId: m.replyTo ? ids.get(m.replyTo) ?? null : null,
      data: JSON.stringify({ backfill: TAG, key: m.key, sourceEvents: evIds(m.evidence), ...(m.questions ? { questions: m.questions } : {}), ...(!replied.has(m.key) ? { settledNote: 'they met in person at the coffee shop; threads were closed by hand after session 6' } : {}) }),
    } });
    ids.set(m.key, row.id);
  }
  await prisma.worldMessage.create({ data: {
    campaignId: CAMPAIGN, medium: 'call', senderId: KRIS, senderThingId: null, recipientId: VIOLET, recipientThingId: HER_PHONE, contentKind: 'sound',
    content: 'A phone call: Kristopher dialed the number on the five-dollar bill; Violet answered; they agreed to coffee tomorrow.', notice: "Violet's phone rings.",
    sentCycle: callStart, deliveredCycle: callStart, noticedCycle: callStart, readCycle: callAnswered, settledCycle: callEnd, settledReason: 'ended', durationSeconds: callSeconds,
    data: JSON.stringify({ backfill: TAG, key: 'call1', answeredCycle: callAnswered, sourceEvents: evIds([callStart, 0.0079869519089425, callEnd]), questions: ['Which of his two phones did he dial from? The record says only "his phone".'] }),
  } });
  console.log(`wrote ${msgs.length + 1} rows (replaced ${old.length})`);
}
main().finally(() => prisma.$disconnect());
