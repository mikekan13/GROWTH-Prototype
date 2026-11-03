/**
 * THE TABLE TEST — run one script against the dev server on a restored world, gather the transcript, run the asserts, report
 * (GROUNDED-BEATS-PLAN-2026-11-03 §4). Michael 2026-11-03: "We need this system able to handle everything we could throw at it."
 *
 *   cd app && node --env-file=.env --env-file=.env.local --import tsx table-test/run.ts table-test/scripts/the-call.json [--keep] [--no-pod-stop]
 *
 * Needs the dev server on :3000 (boot.ps1 -NoWhisper). Starts a game session (which starts the text pod), plays the lines at
 * the Watcher's pace, waits for the table to settle, reads everything back, rolls the world back to the script's snapshot
 * (every row since `from`, every non-session thought), and stops the pod unless told not to (a batch runs several scripts).
 * The report lands in tmp/table-test/<script>-<ts>.md and the raw transcript beside it as JSON.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- a runner over the raw prisma client and untyped payloads, like the harness it replaces */
import '../scripts/_server-only-shim'; // first: the pod module (and the db) carry 'server-only'
import crypto from 'node:crypto';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../src/lib/db';
import type { RunTranscript, TableScript, RunEvent, RunCard, LedgerAt, WallCall, BeatPieces } from './transcript';
import { runAsserts, summarize } from './asserts';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const BASE = process.env.TABLE_TEST_BASE ?? 'http://localhost:3000';
const LOG = process.env.TABLE_TEST_LOG ?? 'C:/Projects/GRO.WTH/logs/dev-server.out.log';
const OUT = 'C:/Projects/GRO.WTH/tmp/table-test';
const SETTLE_S = Number(process.env.TABLE_TEST_SETTLE ?? 60);
const p = prisma as any;

function post(path: string, token: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path); const payload = JSON.stringify(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), cookie: `session_token=${token}` }, timeout: 0 }, (r) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => resolve({ status: r.statusCode ?? 0, body: d }));
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fold = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ── The world ────────────────────────────────────────────────────────────────

async function snapshot() {
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, data: true } });
  const edges = await p.entityRelationship.findMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true, holderId: true, locationId: true, status: true, data: true, history: true } });
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } });
  const factIds = await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true, supersededById: true } });
  return { chars, edges, items, cycle: camp.currentCycle, factIds };
}
type Snap = Awaited<ReturnType<typeof snapshot>>;

/** Roll the world back: every row since `from`, every non-session thought, places/points/holders/clock from the snapshot. */
async function restore(s: Snap, from: Date, sessionId: string | null) {
  const entityIds = (await p.dayaEntity.findMany({ where: { characterId: { in: s.chars.map((c: any) => c.id) } }, select: { id: true } })).map((e: any) => e.id);
  const win = { gte: from };
  const canon = await p.canonEvent.findMany({ where: { campaignId: C, createdAt: win }, select: { id: true } }).catch(() => []);
  if (canon.length) { await p.canonRevision.deleteMany({ where: { canonEventId: { in: canon.map((c: any) => c.id) } } }).catch(() => undefined); await p.canonEvent.deleteMany({ where: { id: { in: canon.map((c: any) => c.id) } } }); }
  await prisma.campaignEvent.deleteMany({ where: { campaignId: C, createdAt: win } });
  // NON-SESSION PROSE IS NEVER CANON (Michael 2026-11-03).
  await prisma.campaignEvent.deleteMany({ where: { campaignId: C, type: 'being_thought', sessionId: null } });
  await p.dayaMemoryEntry.deleteMany({ where: { entityId: { in: entityIds }, realTime: win } });
  await p.dayaIntention.deleteMany({ where: { entityId: { in: entityIds }, createdAt: win } }).catch(() => undefined);
  await p.historyEntry.deleteMany({ where: { campaignId: C, realTime: win } }).catch(() => undefined);
  const keep = new Set(s.factIds.map((f: any) => f.id));
  const now = await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true } });
  const added = now.filter((f: any) => !keep.has(f.id)).map((f: any) => f.id);
  for (const f of s.factIds) await p.worldFact.update({ where: { id: f.id }, data: { supersededById: f.supersededById } }).catch(() => undefined);
  if (added.length) await p.worldFact.deleteMany({ where: { id: { in: added } } });
  await p.familiarityChange.deleteMany({ where: { createdAt: win } }).catch(() => undefined);
  await p.reconciliation.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => undefined);
  await p.lastKnown.deleteMany({ where: { updatedAt: win } }).catch(() => undefined);
  await p.copilotMessage.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => undefined);
  for (const c of s.chars) await prisma.character.update({ where: { id: c.id }, data: { data: c.data } });
  await p.entityRelationship.deleteMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  for (const e of s.edges) { const { id, ...rest } = e; await p.entityRelationship.create({ data: { id, ...rest } }).catch(() => undefined); }
  const have = new Set(s.items.map((i: any) => i.id));
  const madeIds = (await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true } })).filter((i) => !have.has(i.id)).map((i) => i.id);
  if (madeIds.length) await prisma.campaignItem.deleteMany({ where: { id: { in: madeIds } } });
  for (const it of s.items) await prisma.campaignItem.update({ where: { id: it.id }, data: { holderId: it.holderId, locationId: it.locationId, status: it.status, data: it.data, history: it.history } }).catch(() => undefined);
  await prisma.campaign.update({ where: { id: C }, data: { currentCycle: s.cycle } });
  if (sessionId) await p.gameSession.deleteMany({ where: { id: sessionId } }).catch(() => undefined);
}

async function ledgerAt(lineIndex: number): Promise<LedgerAt> {
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE' }, select: { id: true, name: true, holderId: true, locationId: true, status: true, data: true } });
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, name: true } });
  const edges = await p.entityRelationship.findMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: 'CHARACTER' }, select: { sourceId: true, targetId: true } });
  const where = new Map<string, string>(edges.map((e: any) => [e.sourceId, e.targetId]));
  return {
    lineIndex, at: Date.now(),
    items: items.map((i) => { let signal = null; try { signal = (JSON.parse(i.data ?? '{}') as any).signal ?? null; } catch { /* none */ } return { id: i.id, name: i.name, holderId: i.holderId, locationId: i.locationId, status: i.status, signal }; }),
    beings: chars.map((c) => ({ characterId: c.id, name: c.name, locationId: where.get(c.id) ?? null })),
  };
}

function parseWall(lines: string[], t0: number): WallCall[] {
  // The wall logs have no timestamps; they are placed in order between the run's start and end.
  const out: WallCall[] = [];
  let pending: WallCall | null = null;
  for (const l of lines) {
    const m = l.match(/^\[wall→cloud\] caller=(\S+) lane=(\S+) .*?bytes_in=(\d+)/);
    if (m) { pending = { at: t0, caller: m[1], lane: m[2], bytesIn: Number(m[3]) }; out.push(pending); continue; }
    const t = l.match(/^\[wall→translator\] caller=(\S+) names_swapped=(\d+)(?:.*?stray_placeholders=(\d+))?/);
    if (t) { const last = [...out].reverse().find((w) => w.caller === t[1] && w.namesSwapped === undefined); if (last) { last.namesSwapped = Number(t[2]); if (t[3]) last.strayPlaceholders = Number(t[3]); } }
  }
  return out;
}

// ── The run ──────────────────────────────────────────────────────────────────

async function main() {
  const scriptPath = process.argv[2];
  if (!scriptPath) throw new Error('usage: run.ts <script.json> [--keep] [--no-pod-stop]');
  const keep = process.argv.includes('--keep');
  const noPodStop = process.argv.includes('--no-pod-stop');
  const script = JSON.parse(readFileSync(scriptPath, 'utf8')) as TableScript & { expectWithheld?: number[] };
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: camp.gmUserId, token, expiresAt: new Date(Date.now() + 3 * 3600_000) } });
  const snap = await snapshot();
  const snapFile = `${OUT}/snapshot-${Date.now()}.json`;
  writeFileSync(snapFile, JSON.stringify(snap));
  const logStart = existsSync(LOG) ? readFileSync(LOG, 'utf8').length : 0;
  const from = new Date(Date.now() - 1000);
  const startedAt = Date.now();
  let sessionId: string | null = null;
  const lineAt: number[] = [];
  const lineResults: RunTranscript['lineResults'] = [];
  const ledger: LedgerAt[] = [];
  try {
    const s = await post(`/api/campaigns/${C}/sessions`, token, { action: 'start' });
    sessionId = (() => { try { const j = JSON.parse(s.body); return j.session?.id ?? j.id ?? null; } catch { return null; } })();
    console.log(`[table-test] ${script.name}: session ${s.status} ${sessionId ?? s.body.slice(0, 120)}`);
    // The pod has to be hot before the first line; the session start resumes it. Wait for vLLM to list its model (cold start ~4 min).
    const lane = (process.env.DAYA_L1_URL ?? '').replace(/\/+$/, '');
    const key = process.env.DAYA_L1_API_KEY ?? process.env.DAYA_L1_KEY ?? '';
    for (let i = 0; i < 90 && lane; i++) {
      try {
        const c = new AbortController(); const tm = setTimeout(() => c.abort(), 8000);
        const r = await fetch(`${lane}${lane.endsWith('/v1') ? '' : '/v1'}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: c.signal });
        clearTimeout(tm);
        if (r.ok) { console.log(`[table-test] lane ready after ${i * 5}s`); break; }
      } catch { /* not yet */ }
      if (i === 89) console.warn('[table-test] lane never answered; playing anyway');
      await sleep(5000);
    }
    ledger.push(await ledgerAt(-1));
    for (const [i, st] of script.steps.entries()) {
      lineAt.push(Date.now());
      let rr = await post(`/api/campaigns/${C}/table`, token, { message: st.line });
      let j: any = {}; try { j = JSON.parse(rr.body); } catch { /* text */ }
      const tk = j.held?.id ?? j.reconciliation?.id ?? j.ticket?.id ?? null;
      if (tk) {
        // JEWL asked a continuity question: the Watcher confirms, as Michael does, and the line is played.
        await post(`/api/campaigns/${C}/reconcile`, token, { action: 'confirm', ticketId: tk, answer: 'Yes, that is what happens.' });
        rr = await post(`/api/campaigns/${C}/table`, token, { message: st.line, confirmTicketId: tk });
        try { j = JSON.parse(rr.body); } catch { /* text */ }
      }
      const withheld = rr.status === 422 || !!j.withheld;
      const note = j.withheld ?? j.note ?? (Array.isArray(j.notes) ? j.notes.join(' | ') : undefined) ?? j.error;
      lineResults.push({ status: rr.status, withheld, ...(note ? { note: String(note) } : {}), body: rr.body.slice(0, 600) });
      console.log(`[table-test] line ${i + 1}/${script.steps.length} ${rr.status}${withheld ? ' WITHHELD: ' + String(note).slice(0, 100) : ''}`);
      await sleep(st.waitS * 1000);
      ledger.push(await ledgerAt(i));
    }
    console.log(`[table-test] settling ${SETTLE_S}s`);
    await sleep(SETTLE_S * 1000);
    const endedAt = Date.now();

    // Read it all back.
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: from } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, type: true, characterId: true, characterName: true, sessionId: true, payload: true } });
    const events: RunEvent[] = []; const cards: RunCard[] = [];
    for (const r of rows) {
      let pl: any = {}; try { pl = JSON.parse(r.payload); } catch { /* skip */ }
      const at = +r.createdAt;
      const text = fold(pl.description ?? pl.message ?? pl.thought ?? pl.text ?? '');
      events.push({ at, type: r.type, eventType: pl.eventType ?? pl.kind, characterId: r.characterId, characterName: r.characterName, sessionId: r.sessionId, text, narration: pl.narration ?? null, payload: pl });
      if (r.type === 'being_thought') {
        const lineIndex = lineAt.reduce((acc, t, idx) => (t <= at ? idx : acc), -1);
        cards.push({ at, lineIndex, characterId: r.characterId ?? '', characterName: r.characterName ?? '', segments: (pl.segments ?? []).map((s: any) => ({ kind: s.kind, text: fold(s.text) })), thought: fold(pl.thought), ...(pl.pieces ? { pieces: { ...(pl.pieces as BeatPieces), recentSessionId: pl.pieces.recentSessionId ?? r.sessionId } } : {}), msAfterLine: lineIndex >= 0 ? at - lineAt[lineIndex] : 0 });
      }
    }
    const ents = await p.dayaEntity.findMany({ where: { characterId: { in: snap.chars.map((c: any) => c.id) } }, select: { id: true, characterId: true, character: { select: { name: true } } } });
    const memories: RunTranscript['memories'] = [];
    const roster: RunTranscript['roster'] = [];
    const allNames = (await prisma.character.findMany({ where: { campaignId: C }, select: { name: true } })).map((c) => c.name);
    for (const e of ents) {
      const mem = await p.dayaMemoryEntry.findMany({ where: { entityId: e.id, realTime: { gte: from } }, orderBy: { realTime: 'asc' }, select: { source: true, content: true, realTime: true } });
      for (const m of mem) memories.push({ characterId: e.characterId, characterName: e.character.name, source: m.source, content: fold(m.content), at: +m.realTime });
      // Who this being knows: a name from the roster, or a capitalised two-word name, that its memory ledger carries.
      const all = await p.dayaMemoryEntry.findMany({ where: { entityId: e.id }, select: { content: true } });
      const corpus = all.map((m: any) => m.content).join('\n');
      const known = new Set<string>();
      for (const n of allNames) if (n !== e.character.name && corpus.includes(n)) known.add(n);
      for (const m of corpus.matchAll(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g)) known.add(m[1]);
      roster.push({ characterId: e.characterId, name: e.character.name, knownNames: [...known] });
    }
    const log = existsSync(LOG) ? readFileSync(LOG, 'utf8').slice(logStart).split(/\r?\n/).filter(Boolean) : [];
    const transcript: RunTranscript = { script, sessionId, startedAt, endedAt, lineAt, lineResults, events, cards, ledger, memories, wall: parseWall(log, startedAt), log, roster };

    const results = runAsserts(transcript);
    const ts = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `${OUT}/${script.name}-${ts}`;
    writeFileSync(`${base}.json`, JSON.stringify(transcript, null, 1));
    const red = results.filter((r) => !r.pass).length;
    const head = `# table test · ${script.name} · ${new Date(startedAt).toISOString()}\n\n${red === 0 ? 'GREEN' : `RED (${red} of ${results.length})`} · ${cards.length} cards · ${script.steps.length} lines · ${Math.round((endedAt - startedAt) / 1000)} s · cloud ${transcript.wall.length} calls, ${transcript.wall.reduce((a, w) => a + w.bytesIn, 0)} bytes in\n\n`;
    const cardsMd = cards.map((c) => `- ${new Date(c.at).toISOString().slice(11, 19)} L${c.lineIndex + 1} **${c.characterName}** (${c.msAfterLine} ms): ${c.segments.length ? c.segments.map((s) => `(${s.kind}) ${s.text}`).join(' ') : c.thought}${c.pieces ? `\n    - pieces · perceived: ${c.pieces.perceived.slice(0, 140)} · felt: ${c.pieces.felt.slice(0, 80)} · wakes: ${c.pieces.wakes.map((w) => w.text.slice(0, 50)).join(' | ') || '(none)'} · gist: ${c.pieces.gist.slice(0, 140)}` : ''}`).join('\n');
    const linesMd = script.steps.map((s, i) => `${i + 1}. ${s.line.slice(0, 160)}${lineResults[i]?.withheld ? `  ← WITHHELD: ${lineResults[i].note}` : ''}`).join('\n');
    writeFileSync(`${base}.md`, head + summarize(results) + '\n\n## The lines\n' + linesMd + '\n\n## The cards\n' + cardsMd + '\n');
    console.log(`\n${head}${summarize(results)}\n\nreport ${base}.md`);
  } finally {
    if (keep) { await prisma.session.deleteMany({ where: { token } }); console.log('[table-test] KEPT: session left open, record standing'); }
    else {
      await restore(snap, from, sessionId);
      await prisma.session.deleteMany({ where: { token } });
      console.log('[table-test] rolled back: places, points, holders, record, clock, session');
    }
    if (!noPodStop) {
      // The pod never runs unattended (feedback 2026-10-30): the batch's last run stops it.
      try { const { stopTextPod } = await import('../src/daya/text-pod'); await stopTextPod('table test done'); } catch (e) { console.warn('[table-test] pod stop failed:', e instanceof Error ? e.message : e); }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
