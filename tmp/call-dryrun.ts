/**
 * DRY RUN OF THE CALL (2026-11-02): Michael's opening line through the real table route on the DEV server, as the GM.
 * Snapshots every place/point/holder first, runs the beat, waits, reports what each being got, then rolls EVERYTHING back
 * (events, canon, memories, intentions, facts, familiarity, reconciliations, signals, places, points, holders, clock, session).
 * Run: cd app && npx tsx ../tmp/call-dryrun.ts [waitSeconds]
 */
import crypto from 'node:crypto';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68', KRIS = 'cmvcbw49u0001h448qanzbhs3';
const BASE = 'http://localhost:3000';
const LINE = 'Kristopher sits in his car exhausted after his routine of grieving and delivering pizzas. He looks at the 5 dollar bill she gave him a couple nights before and puts the digits in his phone. He takes a deep breath and speaks out loud as he hits dial and his car speakers begin ringing. "Protect me Lord from anything not from you."';
const WAIT = Number(process.argv[2] ?? 120) * 1000;
const KEEP = process.env.KEEP === '1'; // the keeper: leave the session open and the record standing
const LOG = 'C:/Projects/GRO.WTH/logs/dev-server.out.log';
const p = prisma as any;
const NL = String.fromCharCode(10);

function post(path: string, token: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path); const payload = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), cookie: `session_token=${token}` }, timeout: 0 }, (r) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode ?? 0, body: d }));
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

async function snapshot() {
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, data: true } });
  const edges = await p.entityRelationship.findMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true, holderId: true, locationId: true, status: true, data: true, history: true } });
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } });
  const factIds = (await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true, supersededById: true } }));
  return { chars, edges, items, cycle: camp.currentCycle, factIds };
}

async function restore(s: Awaited<ReturnType<typeof snapshot>>, from: Date, sessionId: string | null) {
  const entityIds = (await p.dayaEntity.findMany({ where: { character: { campaignId: C } }, select: { id: true } })).map((e: any) => e.id);
  const win = { gte: from };
  const canon = await p.canonEvent.findMany({ where: { campaignId: C, createdAt: win }, select: { id: true } });
  if (canon.length) { await p.canonRevision.deleteMany({ where: { canonEventId: { in: canon.map((c: any) => c.id) } } }); await p.canonEvent.deleteMany({ where: { id: { in: canon.map((c: any) => c.id) } } }); }
  await prisma.campaignEvent.deleteMany({ where: { campaignId: C, createdAt: win } });
  await p.dayaMemoryEntry.deleteMany({ where: { entityId: { in: entityIds }, realTime: win } });
  await p.dayaIntention.deleteMany({ where: { entityId: { in: entityIds }, createdAt: win } });
  await p.historyEntry.deleteMany({ where: { campaignId: C, realTime: win } }).catch(() => undefined);
  // Facts have no timestamp: anything not in the snapshot is new; superseded links go back as they were.
  const known = new Map(s.factIds.map((f: any) => [f.id, f.supersededById]));
  const nowFacts = await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true, supersededById: true } });
  const added = nowFacts.filter((f: any) => !known.has(f.id)).map((f: any) => f.id);
  if (added.length) await p.worldFact.deleteMany({ where: { id: { in: added } } });
  for (const f of nowFacts) if (known.has(f.id) && known.get(f.id) !== f.supersededById) await p.worldFact.update({ where: { id: f.id }, data: { supersededById: known.get(f.id) ?? null } });
  await p.familiarityChange.deleteMany({ where: { createdAt: win } }).catch(() => undefined);
  await p.reconciliation.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => undefined);
  await p.lastKnown.deleteMany({ where: { updatedAt: win } }).catch(() => undefined);
  await p.copilotMessage.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => undefined);
  // Places, points, holders — back exactly as they were.
  await p.entityRelationship.deleteMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  for (const e of s.edges) { const { id: _i, ...rest } = e; void _i; await p.entityRelationship.create({ data: rest }); }
  for (const c of s.chars) await prisma.character.update({ where: { id: c.id }, data: { data: c.data } });
  const madeIds = (await prisma.campaignItem.findMany({ where: { campaignId: C, createdAt: win }, select: { id: true } })).map((x) => x.id);
  if (madeIds.length) await prisma.campaignItem.deleteMany({ where: { id: { in: madeIds } } });
  for (const it of s.items) await prisma.campaignItem.update({ where: { id: it.id }, data: { holderId: it.holderId, locationId: it.locationId, status: it.status, data: it.data, history: it.history } });
  if (sessionId) await p.gameSession.deleteMany({ where: { id: sessionId } });
  await prisma.campaign.update({ where: { id: C }, data: { currentCycle: s.cycle } });
}

async function main() {
  // RESTORE MODE: roll back a kept run from its snapshot. RESTORE=<snapshot json> FROM=<iso> SESSION=<id>
  if (process.env.RESTORE) {
    const snap = JSON.parse(readFileSync(process.env.RESTORE, 'utf8'));
    await restore(snap, new Date(process.env.FROM!), process.env.SESSION ?? null);
    console.log('restored from', process.env.RESTORE); return;
  }
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3 * 3600_000) } });
  const snap = await snapshot();
  writeFileSync(`data/archive/call-dryrun-snapshot-${Date.now()}.json`, JSON.stringify(snap, null, 1));
  const logStart = readFileSync(LOG, 'utf8').length;
  const from = new Date(Date.now() - 1000);
  let sessionId: string | null = null;
  try {
    const s = await post(`/api/campaigns/${C}/sessions`, token, { action: 'start' });
    sessionId = (() => { try { return JSON.parse(s.body).session?.id ?? JSON.parse(s.body).id ?? null; } catch { return null; } })();
    console.log(`session start ${s.status} ${sessionId ?? s.body.slice(0, 160)}`);
    // SCRIPT MODE: a whole session's lines, in order, at the Watcher's pace; then the transcript as the table shows it.
    if (process.env.SCRIPT) {
      const steps = JSON.parse(readFileSync(process.env.SCRIPT, 'utf8')) as Array<{ line: string; waitS: number }>;
      for (const [i, st] of steps.entries()) {
        let rr = await post(`/api/campaigns/${C}/table`, token, { message: st.line });
        const tk = (() => { try { const j = JSON.parse(rr.body); return j.held?.id ?? j.reconciliation?.id ?? j.ticket?.id ?? null; } catch { return null; } })();
        if (tk) { await post(`/api/campaigns/${C}/reconcile`, token, { action: 'confirm', ticketId: tk, answer: 'Yes, that is what happens.' }); rr = await post(`/api/campaigns/${C}/table`, token, { message: st.line, confirmTicketId: tk }); console.log(`  (line ${i + 1}: JEWL flagged it — confirmed)`); }
        console.log(`line ${i + 1} ${rr.status}`);
        await new Promise((res) => setTimeout(res, st.waitS * 1000));
      }
      const ev = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: from } }, orderBy: { createdAt: 'asc' }, select: { type: true, characterName: true, payload: true } });
      const out: string[] = [];
      for (const e of ev) {
        const pl = JSON.parse(e.payload);
        if (e.type === 'being_thought') { out.push(NL + `[${e.characterName}]`); for (const sg of (pl.segments ?? [])) out.push(`   ${sg.kind === 'thought' ? '((' + sg.text + '))' : sg.kind === 'speech' ? '"' + sg.text + '"' : '::' + sg.text + '::'}`); if (!(pl.segments ?? []).length && pl.thought) out.push(`   ((${pl.thought}))`); if (pl.scene) out.push(`   scene: ${pl.scene}`); continue; }
        const text = String(pl.description ?? pl.message ?? '').replace(/\s+/g, ' ');
        if (pl.eventType === 'session_start') continue;
        out.push(NL + `[${e.type === 'chat' ? (e.characterName ?? '') + ' says' : 'TABLE'}] ${text}` + (pl.narration && pl.narration !== text ? NL + `   built: ${String(pl.narration).replace(/\s+/g, ' ')}` : ''));
      }
      for (const [n, cid] of [['VIOLET', VIOLET], ['KRISTOPHER', KRIS]] as const) {
        const e = await p.dayaEntity.findUnique({ where: { characterId: cid }, select: { id: true } });
        const mem = await p.dayaMemoryEntry.findMany({ where: { entityId: e.id, realTime: { gte: from } }, orderBy: { realTime: 'asc' }, select: { source: true, content: true } });
        out.push(NL + `=== ${n} memories (${mem.length}) ===`, ...mem.map((m: any) => `[${m.source}] ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`));
      }
      const tf = `../tmp/replay-${Date.now()}.txt`;
      writeFileSync(tf, out.join(NL));
      console.log(NL + `=== TRANSCRIPT (${tf}) ===` + out.join(NL));
      return;
    }
    let r = await post(`/api/campaigns/${C}/table`, token, { message: LINE });
    console.log(`line ${r.status} ${r.body.slice(0, 300)}`);
    const ticket = (() => { try { const j = JSON.parse(r.body); return j.reconciliation?.id ?? j.ticket?.id ?? j.ticketId ?? null; } catch { return null; } })();
    if (ticket) {
      console.log(`JEWL raised a reconciliation ticket (${ticket}) — confirming as the Watcher would`);
      await post(`/api/campaigns/${C}/reconcile`, token, { action: 'confirm', ticketId: ticket, answer: 'Two days have passed. It is Monday night and he is calling her now.' }).then((x) => console.log(`confirm ${x.status} ${x.body.slice(0, 160)}`));
      r = await post(`/api/campaigns/${C}/table`, token, { message: LINE, confirmTicketId: ticket });
      console.log(`line (confirmed) ${r.status} ${r.body.slice(0, 200)}`);
    }
    await new Promise((res) => setTimeout(res, WAIT));
    // What happened.
    const log = readFileSync(LOG, 'utf8').slice(logStart).split('\n').filter((l) => /perception-reach|world-apply|table-speak\] (narrated|the world)|elsewhere|signal|reconcil|scene-builder\] (dropped|narrated)|voice-filter|adjudicator\] map refused|Error/.test(l));
    console.log('\n=== engine log ===\n' + log.map((l) => l.slice(0, 220)).join('\n'));
    const vEnt = await p.dayaEntity.findUnique({ where: { characterId: VIOLET }, select: { id: true } });
    const kEnt = await p.dayaEntity.findUnique({ where: { characterId: KRIS }, select: { id: true } });
    for (const [n, e] of [['VIOLET', vEnt], ['KRISTOPHER', kEnt]] as const) {
      const mem = await p.dayaMemoryEntry.findMany({ where: { entityId: e.id, realTime: { gte: from } }, orderBy: { realTime: 'asc' }, select: { source: true, content: true } });
      console.log(`\n=== ${n} memories (${mem.length}) ===\n` + mem.map((m: any) => `[${m.source}] ${m.content.replace(/\s+/g, ' ').slice(0, 240)}`).join('\n'));
    }
    const thoughts = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: from }, type: 'being_thought' }, orderBy: { createdAt: 'asc' }, select: { characterName: true, payload: true } });
    console.log('\n=== thoughts ===\n' + thoughts.map((t) => { const pl = JSON.parse(t.payload); return `${t.characterName}: ${String(pl.thought).replace(/\s+/g, ' ').slice(0, 260)}`; }).join('\n'));
    const phone = await prisma.campaignItem.findFirst({ where: { campaignId: C, name: 'Her phone' }, select: { data: true, holderId: true } });
    console.log('\nHer phone signal:', JSON.stringify(JSON.parse(phone!.data).signal ?? null), '| holder', phone!.holderId === VIOLET ? 'Violet' : phone!.holderId);
  } finally {
    if (process.env.KEEP === '1') { await prisma.session.deleteMany({ where: { token } }); console.log('\nKEPT: session left open, record standing'); }
    else {
      // No 'end': ending a session stops the text pod (by design); the restore removes the session row.
      await restore(snap, from, sessionId);
      await prisma.session.deleteMany({ where: { token } });
      console.log('\nrolled back: places, points, holders, record, clock, session');
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
