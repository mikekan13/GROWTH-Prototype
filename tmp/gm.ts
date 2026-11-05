/**
 * CLAUDE AT THE WATCHER'S SEAT (Michael, 2026-11-05: "you become the GM, control Kristopher and move the scene along several
 * times, giving you more data and more tests; fix what you find wrong"). A stepping driver for :3001 (or :3000):
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/gm.ts start            — snapshot the world, open a session, wait for the lane
 *   node ... ../tmp/gm.ts line 50 "Kristopher sits in his car ..."                          — post one Watcher line, wait 50 s, print what came back
 *   node ... ../tmp/gm.ts read                                                              — print everything since the last line
 *   node ... ../tmp/gm.ts end                                                               — end the session, roll the world back to the snapshot, stop the pod
 * State: tmp/gm/state.json. Every run is a TEST: the world is rolled back after (the third test's world stays as it is).
 */
import '../app/scripts/_server-only-shim';
import http from 'node:http';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const BASE = process.env.GM_BASE ?? 'http://localhost:3001';
const OUT = 'C:/Projects/GRO.WTH/tmp/gm';
const STATE = `${OUT}/state.json`;
const p = prisma as any;
const names: Record<string, string> = { cms60ndtn0000kw48ioq10i68: 'Violet', cmvcbw49u0001h448qanzbhs3: 'Kristopher', cmvaeknss0009bc48s7ulk6ca: 'Rosemary' };

interface State { snapFile: string; from: string; token: string; sessionId: string | null; lastLineAt: string; lines: string[] }

function post(path: string, token: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path); const payload = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), cookie: `session_token=${token}` } }, (r) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode ?? 0, body: d }));
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fold = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (ch) => (ch === '—' || ch === '–' ? '-' : ch === '…' ? '...' : /[“”]/.test(ch) ? '"' : /[‘’]/.test(ch) ? "'" : '?'));

async function snapshot() {
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, data: true } });
  const edges = await p.entityRelationship.findMany({ where: { campaignId: C, relationshipType: { in: ['located_at', 'inside'] }, sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true, holderId: true, locationId: true, status: true, data: true, history: true } });
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } });
  const factIds = await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true, supersededById: true } });
  return { chars, edges, items, cycle: camp.currentCycle, factIds };
}

function load(): State { return JSON.parse(readFileSync(STATE, 'utf8')) as State; }
function save(s: State) { writeFileSync(STATE, JSON.stringify(s, null, 1)); }

async function printSince(sinceISO: string) {
  const rows = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gt: new Date(sinceISO) } }, orderBy: { createdAt: 'asc' } });
  for (const r of rows) {
    let pl: any = {}; try { pl = JSON.parse(r.payload); } catch { /* raw */ }
    const t = r.createdAt.toISOString().slice(11, 19);
    const who = names[r.characterId ?? ''] ?? r.characterName ?? '';
    if (r.type === 'game_event') {
      const acts = (pl.actions ?? []).map((a: any) => `${a.actorLabel}: ${a.text}${a.owned ? ' (owned)' : ''}`).join(' | ');
      const sp = (pl.speech ?? []).map((x: any) => `${x.speakerLabel ?? '?'}: "${x.text}"`).join(' | ');
      console.log(ascii(`[${t}] LINE ${fold(pl.description ?? pl.raw ?? pl.narration).slice(0, 220)}${acts ? `\n        acts: ${acts.slice(0, 300)}` : ''}${sp ? `\n        speech: ${sp.slice(0, 200)}` : ''}`));
    } else if (r.type === 'being_thought') {
      const segs = (pl.segments ?? []).map((s: any) => `[${s.kind}] ${fold(s.text)}`).join(' ');
      console.log(ascii(`[${t}] CARD ${who} (${pl.impulse ?? '?'}) heard=${fold(pl.heard).slice(0, 90)}\n        ${(segs || fold(pl.thought)).slice(0, 700)}`));
      if (pl.pieces?.perceived) console.log(ascii(`        perceived: ${fold(pl.pieces.perceived).slice(0, 160)} · going: ${(pl.pieces as any).going ?? ''}`));
    } else if (r.type === 'chat') {
      console.log(ascii(`[${t}] SAYS ${who}: ${fold(pl.message).slice(0, 300)}`));
    } else {
      console.log(ascii(`[${t}] ${r.type} ${who} ${fold(pl.text ?? pl.message ?? '').slice(0, 160)}`));
    }
  }
  if (!rows.length) console.log('(nothing new)');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  if (cmd === 'start') {
    const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 6 * 3600_000) } });
    const snap = await snapshot();
    const snapFile = `${OUT}/snapshot-${Date.now()}.json`;
    writeFileSync(snapFile, JSON.stringify(snap));
    const from = new Date(Date.now() - 1000).toISOString();
    const s = await post(`/api/campaigns/${C}/sessions`, token, { action: 'start' });
    let sessionId: string | null = null; try { const j = JSON.parse(s.body); sessionId = j.session?.id ?? j.id ?? null; } catch { /* none */ }
    save({ snapFile, from, token, sessionId, lastLineAt: new Date().toISOString(), lines: [] });
    console.log(`session ${s.status} ${sessionId ?? s.body.slice(0, 120)} · snapshot ${snapFile} · from ${from}`);
    // wait for the lane
    const lane = (process.env.DAYA_L1_URL ?? '').replace(/\/+$/, ''); const key = process.env.DAYA_L1_KEY ?? process.env.DAYA_API_KEY ?? '';
    for (let i = 0; i < 90 && lane; i++) {
      try { const c = new AbortController(); setTimeout(() => c.abort(), 4000); const r = await fetch(`${lane}${lane.endsWith('/v1') ? '' : '/v1'}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: c.signal }); if (r.ok) { console.log(`lane ready after ${i * 5}s`); break; } } catch { /* cold */ }
      await sleep(5000);
    }
    return;
  }
  if (cmd === 'line') {
    const st = load();
    const waitS = Number(rest[0]); const line = rest.slice(1).join(' ');
    if (!line.trim()) throw new Error('no line');
    const at = new Date().toISOString();
    let r = await post(`/api/campaigns/${C}/table`, st.token, { message: line });
    let j: any = {}; try { j = JSON.parse(r.body); } catch { /* text */ }
    // JEWL's continuity question (a ticket): the Watcher confirms, as Michael does, and the line is played.
    const tk = j.held?.id ?? j.reconciliation?.id ?? j.ticket?.id ?? null;
    if (tk) {
      console.log(ascii(`   ticket: ${fold(j.held?.question ?? j.reconciliation?.question ?? j.ticket?.question ?? JSON.stringify(j).slice(0, 300))}`));
      await post(`/api/campaigns/${C}/reconcile`, st.token, { action: 'confirm', ticketId: tk, answer: 'Yes, that is what happens.' });
      r = await post(`/api/campaigns/${C}/table`, st.token, { message: line, confirmTicketId: tk });
      try { j = JSON.parse(r.body); } catch { /* text */ }
    }
    const note = j.withheld ? ` WITHHELD: ${j.withheld}` : j.accepted ? ' accepted' : ` keys=${Object.keys(j).join(',')}`;
    console.log(ascii(`-> ${r.status}${note} - ${line.slice(0, 120)}`));
    st.lines.push(line); st.lastLineAt = at; save(st);
    await sleep(waitS * 1000);
    await printSince(at);
    return;
  }
  if (cmd === 'read') { const st = load(); await printSince(rest[0] ?? st.lastLineAt); return; }
  if (cmd === 'end') {
    const st = load();
    const e = await post(`/api/campaigns/${C}/sessions`, st.token, { action: 'end' });
    console.log(`session end ${e.status}`);
    const n = await prisma.campaignEvent.count({ where: { campaignId: C, createdAt: { gt: new Date(st.from) } } });
    console.log(`rows to roll back: ${n}`);
    execSync(`node --env-file=.env --env-file=.env.local --import tsx ../tmp/restore-world.ts "${st.snapFile}" ${st.from}`, { stdio: 'inherit', cwd: 'C:/Projects/GRO.WTH/app' });
    if (rest[0] === 'keep') console.log('pod kept warm'); else { try { execSync('node ../tmp/dev-pod.mjs stop', { stdio: 'inherit', cwd: 'C:/Projects/GRO.WTH/app' }); } catch { /* pod */ } }
    return;
  }
  throw new Error(`unknown command ${cmd}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
