/**
 * U2 live run — the measurement harness for the split table loop (R1 / U2d).
 *
 * WHAT IT MEASURES
 *   The table path (`speakProse`, and with --voice `hearSpoken`) in both
 *   positions of the rollout switch, on the same inputs, on one page:
 *     split loop : listen stages, and at the ask waitMs, ttftMs, firstWordMs,
 *                  lineMs, tokensOut, complete/capped/none, retracted/revoiced
 *     serial loop: wall time and model calls per stage for the same inputs
 *   Scenarios, each to ONE being and to the PARTY:
 *     A  narration, then (once the listening has settled) a separate ask
 *     B  narration + ask in one message (the capped path)
 *     C  an ask on its own
 *   Timings and counts only. Lines are never printed unless --show-lines,
 *   which is safe here ONLY because the beings are invented (see below).
 *
 * PRE-FLIGHT — read before running
 *   - It runs in ITS OWN PROCESS. It sets TABLE_SPLIT_LOOP for itself and
 *     flips it between passes. It does NOT need the dev server, does NOT need
 *     a dev-server restart, and does NOT touch .env.local. The dev server may
 *     stay up — BUT both write the same SQLite file. Run it only when nobody
 *     else is writing (Mike not mid-session, no other session's script or
 *     headless test running): on 2026-10-06 a dry run that overlapped other
 *     writers ended in "Operation has timed out" on its own writes and left
 *     its throwaway campaign behind, and the same contention can hit the dev
 *     server's requests. That makes the run a COORDINATED event for the
 *     database, even though it needs no restart. If it is interrupted or
 *     reports leftovers: `--cleanup` (database only, safe to repeat).
 *   - It never reads or writes the Incubator campaign. It builds a throwaway
 *     campaign `__U2_LIVE_RUN__` (one room, two invented beings: Mara, Oren),
 *     and deletes it before and after. Anything it could not delete is listed.
 *   - Real mode (--go) talks to the real lane: RunPod serverless, BILLABLE.
 *     Warm: the whole run is about 3–5 minutes. Cold: the first call queues
 *     about 340 s while a worker starts (also billed), so allow 10–12 minutes.
 *     Whether it was warm is shown by the probe line at the top of the output
 *     (under ~5 s = warm). It also makes cloud calls (tagger, recall, JEWL's
 *     read): a few dozen small ones.
 *   - SHUTDOWN: nothing to do. No GameSession is opened on the typed path and
 *     this script starts no keep-warm; the lane idles to zero by itself 120 s
 *     after the last request. (--voice opens a GameSession row in the
 *     THROWAWAY campaign only, as data — no keep-warm — and deletes it.)
 *     If the dev server has a live session, its own keep-warm is unaffected.
 *   - Without --go or --dry it prints this and exits. It will not spend by accident.
 *
 * MODES
 *   npx tsx scripts/u2-live-run.ts --dry            no spend: a local fake of the lane AND of the
 *                                                    cloud API; any other outbound call is refused
 *   npx tsx scripts/u2-live-run.ts --go             the real run (needs the orchestrator's go)
 *   npx tsx scripts/u2-live-run.ts --go --voice [f] the mic path: transcript chunks (one per line in
 *                                                    file f, else a built-in sample) through hearSpoken
 *   --show-lines   also print what the invented beings said
 *   --cadence-ms N spacing of --voice chunks (default 3000)
 */
import './_server-only-shim';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined; };
const DRY = has('--dry');
const GO = has('--go');
const VOICE = has('--voice');
const SHOW_LINES = has('--show-lines');
/** Only remove a throwaway campaign an interrupted run left behind; talks to nothing but the database. */
const CLEANUP_ONLY = has('--cleanup');
const CADENCE_MS = Number(valueOf('--cadence-ms') ?? 3000);

const CAMPAIGN = '__U2_LIVE_RUN__';
/** The model names the fakes answer under — how a dry run's ledger rows are found again. */
const DRY_MODELS = ['dry-lane', 'dry-cloud'];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ── Dry mode: a fake lane and a fake cloud, and nothing else allowed out ─────

const TAGGER_JSON = JSON.stringify({ valence: 0, arousal: 0.2, salience: 0.3, entityRefs: [], classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'dry run' } });

function laneReply(prompt: string): string {
  if (prompt.includes('Answer now')) return 'Say: Not tonight.';
  if (prompt.includes('Nobody is waiting on you')) return 'Something is off. Stay by the wall.';
  if (prompt.includes('Output ONLY JSON')) return '{"intent":"steps back from the door","subjectKeys":[],"effortContext":"casual"}';
  if (prompt.includes('Content envelope')) return 'You take in the room around you, quiet and close.';
  if (prompt.includes('monologue freely')) return 'It is quiet in here.\nSay: Not tonight.';
  return 'Steady, a little tired.';
}

async function startFakes(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      let body: { messages?: Array<{ content: unknown }>; stream?: boolean } = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* empty */ }
      const url = req.url ?? '';
      if (url.endsWith('/chat/completions')) {
        const prompt = (body.messages ?? []).map((m) => String(m.content)).join('\n');
        const text = laneReply(prompt);
        await sleep(120); // a little prefill time, so the timings are not all zero
        if (body.stream) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const pieces = text.match(/\s*\S+/g) ?? [text];
          for (const piece of pieces) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }], usage: null })}\n\n`);
            await sleep(25);
          }
          res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: pieces.length } })}\n\n`);
          res.end('data: [DONE]\n\n');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 900, completion_tokens: 20 } }));
        return;
      }
      if (url.includes('/v1/messages')) {
        await sleep(80);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'msg_dry', type: 'message', role: 'assistant', model: 'dry-cloud', content: [{ type: 'text', text: TAGGER_JSON }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 50, output_tokens: 20 } }));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const refused: string[] = [];
function fenceOutbound(): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      refused.push(host);
      throw new Error(`[u2-live-run --dry] outbound call to ${host} refused`);
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

// ── The run ──────────────────────────────────────────────────────────────────

const NARRATION = [
  'The desk lamp flickers twice and goes out.',
  'Somewhere down the hall a door closes, slowly.',
  'The blinds stir, though the window is shut.',
  'A floorboard gives a single creak outside the room.',
];
const VOICE_SAMPLE = [
  'The desk lamp flickers twice and goes out.',
  'Somewhere down the hall a door closes, slowly.',
  'Mara, the room has gone very quiet.',
  'What do you do?',
  'The blinds stir, though the window is shut.',
  'What do you all do?',
];

interface Row { pass: 'split' | 'serial'; scenario: string; message: 'narration' | 'ask' | 'narration+ask' | 'chunk'; wallMs: number; note: string; from: Date; to: Date }

function printPreflight(): void {
  const header = readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\n?/, '').replace(/^ \* ?/gm, '');
  console.log(header);
  console.log('Nothing was run. Add --dry (no spend) or --go (the real, billable run).');
}

async function main(): Promise<void> {
  if (!DRY && !GO && !CLEANUP_ONLY) { printPreflight(); return; }
  if (DRY && GO) throw new Error('Pick one of --dry and --go.');

  let fakes: Awaited<ReturnType<typeof startFakes>> | null = null;
  if (DRY) {
    fakes = await startFakes();
    fenceOutbound();
    process.env.DAYA_L1_URL = `${fakes.url}/v1`;
    process.env.DAYA_L1_MODEL = 'dry-lane';
    // The cloud tier's default model too: a fake call must never be metered under a real model's name.
    process.env.DAYA_C_MODEL = 'dry-cloud';
    process.env.ANTHROPIC_BASE_URL = fakes.url;
    process.env.ANTHROPIC_API_URL = fakes.url;
    process.env.ANTHROPIC_API_KEY = 'dry-run';
    for (const key of ['DAYA_L1_PROVIDER', 'DAYA_L1_API_KEY', 'AI_LOCAL_API_KEY', 'RUNPOD_API_KEY']) delete process.env[key];
  }
  process.env.DAYA_ENABLED = 'enabled';
  // A cold worker takes ~340 s to start and the model client's default timeout is 240 s: the first real run
  // died on exactly that. The probe is allowed the whole cold start, plus some.
  if (GO && !process.env.DAYA_L1_TIMEOUT_MS) process.env.DAYA_L1_TIMEOUT_MS = '540000';

  const { prisma } = await import('../src/lib/db');
  const { seedDayaRoom } = await import('./seed-daya-room');
  const table = await import('../src/services/table-speak');
  const { forgetListening } = await import('../src/daya/listening');
  const { forgetScene } = await import('../src/daya/perceive');
  const { chat } = await import('../src/daya/model-client');
  type TableTiming = import('../src/services/table-speak').TableTiming;

  const leftovers: string[] = [];
  // The dev server shares this SQLite file; a busy moment is retried rather than left behind.
  const wipe = async (label: string, work: () => Promise<unknown>) => {
    for (let attempt = 1; ; attempt++) {
      try { await work(); return; } catch (err) {
        if (attempt < 4) { await sleep(1500 * attempt); continue; }
        leftovers.push(`${label}: ${(err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(-160)}`);
        return;
      }
    }
  };
  async function cleanup(): Promise<void> {
    // A dry run meters its fake calls like real ones, in two ledgers. Every one of them is recorded under a
    // model name only the fakes use, so they can always be found again — whether or not the campaign still exists.
    await wipe('dry-run model calls', () => prisma.dayaModelCall.deleteMany({ where: { model: { in: DRY_MODELS } } }));
    await wipe('dry-run cost ledger rows', () => prisma.aiCall.deleteMany({ where: { model: { in: DRY_MODELS } } }));
    const campaign = await prisma.campaign.findFirst({ where: { name: CAMPAIGN } });
    if (!campaign) return;
    const id = campaign.id;
    const chars = await prisma.character.findMany({ where: { campaignId: id }, select: { id: true } });
    for (const c of chars) {
      const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
      if (entity) {
        await wipe('model calls', () => prisma.dayaModelCall.deleteMany({ where: { entityId: entity.id } }));
        await wipe('memories', () => prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } }));
        await wipe('affect', () => prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } }));
        await wipe('believed sheet', () => prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } }));
        await wipe('entity', () => prisma.dayaEntity.delete({ where: { id: entity.id } }));
      }
      await wipe('goals', () => prisma.goal.deleteMany({ where: { characterId: c.id } }));
      await wipe('history', () => prisma.historyEntry.deleteMany({ where: { subjectId: c.id } }));
    }
    await wipe('probe calls', () => prisma.dayaModelCall.deleteMany({ where: { subsystem: 'u2-probe' } }));
    await wipe('relationships', () => prisma.entityRelationship.deleteMany({ where: { campaignId: id } }));
    await wipe('canon revisions', () => prisma.canonRevision.deleteMany({ where: { campaignId: id } }));
    await wipe('reconciliations', () => prisma.reconciliation.deleteMany({ where: { campaignId: id } }));
    await wipe('canon', () => prisma.canonEvent.deleteMany({ where: { campaignId: id } }));
    await wipe('events', () => prisma.campaignEvent.deleteMany({ where: { campaignId: id } }));
    await wipe('sessions', () => prisma.gameSession.deleteMany({ where: { campaignId: id } }));
    await wipe('copilot log', () => prisma.copilotMessage.deleteMany({ where: { campaignId: id } }));
    await wipe('locations', () => prisma.location.deleteMany({ where: { campaignId: id } }));
    await wipe('world facts', () => prisma.worldFact.deleteMany({ where: { campaignId: id } }));
    await wipe('characters', () => prisma.character.deleteMany({ where: { campaignId: id } }));
    await wipe('members', () => prisma.campaignMember.deleteMany({ where: { campaignId: id } }));
    await wipe('campaign', () => prisma.campaign.delete({ where: { id } }));
  }

  const timings: Array<TableTiming & { at: number }> = [];
  const lines: string[] = [];
  const stop = table.watchTableTimings((t) => { timings.push({ ...t, at: Date.now() }); });
  const quiet = console.log;
  // The table logs each measurement as a line; the report below prints them once, in a table.
  console.log = (...parts: unknown[]) => { if (typeof parts[0] === 'string' && parts[0].startsWith('[table-timing]')) return; quiet(...parts); };
  // Failures inside the loop are logged and swallowed there (they must never break the table).
  // Here they are the finding: keep the first line of each, and say so at the end.
  const problems: string[] = [];
  const realError = console.error;
  const realWarn = console.warn;
  const note = (level: string) => (...parts: unknown[]) => {
    if (parts.some((p) => String(p).includes('DeprecationWarning'))) return; // node's own notices are not findings
    problems.push(`${level}: ${parts.map((p) => (p instanceof Error ? p.message : String(p))).join(' ').replace(/\s+/g, ' ').trim().slice(0, 400)}`);
  };
  console.error = note('error');
  console.warn = note('warn');

  // Progress on stderr-free stdout, with the clock: if the run stalls, the last line says where.
  const startedAt = Date.now();
  const step = (what: string) => quiet(`[u2 +${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${what}`);

  step('removing any earlier throwaway campaign');
  await cleanup();
  if (CLEANUP_ONLY) {
    stop();
    console.log = quiet;
    console.error = realError;
    console.warn = realWarn;
    quiet(leftovers.length ? `CLEANUP left something behind in campaign ${CAMPAIGN}:\n  ${leftovers.join('\n  ')}` : `no throwaway campaign ${CAMPAIGN} remains.`);
    await prisma.$disconnect();
    return;
  }
  try {
    step('seeding the throwaway campaign');
    const { campaign } = await seedDayaRoom(CAMPAIGN);
    const gm = await prisma.user.findUniqueOrThrow({ where: { id: campaign.gmUserId } });
    const actor = { userId: gm.id, username: gm.username, role: gm.role };
    const room = await prisma.location.create({
      data: { campaignId: campaign.id, name: 'Bedroom', type: 'building', createdBy: gm.id, data: JSON.stringify({ description: 'A small bedroom, blinds drawn.', environment: 'Still air, a faint hum from the hall.', features: [], tags: [] }) },
    });
    const sheet = JSON.stringify({ attributes: { frequency: { level: 10, current: 8 }, wisdom: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 }, wit: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 } } });
    const beings: Array<{ id: string; name: string; entityId: string }> = [];
    for (const [name, who] of [['Mara', 'A ferry pilot who trusts water more than people.'], ['Oren', 'A night clerk who notices everything and says little.']] as const) {
      const character = await prisma.character.create({ data: { name, entityType: 'NPC', userId: gm.id, campaignId: campaign.id, data: sheet, status: 'ACTIVE' } });
      const entity = await prisma.dayaEntity.upsert({
        where: { characterId: character.id },
        create: { characterId: character.id, status: 'ACTIVE', personaProfile: JSON.stringify({ identityNarrative: who, voiceNotes: 'Dry, short sentences.' }) },
        update: { status: 'ACTIVE' },
        select: { id: true },
      });
      await prisma.entityRelationship.create({ data: { campaignId: campaign.id, sourceId: character.id, sourceType: 'NPC', targetId: room.id, targetType: 'LOCATION', relationshipType: 'located_at' } });
      beings.push({ id: character.id, name, entityId: entity.id });
    }
    const nameOf = (id: string) => beings.find((b) => b.id === id)?.name ?? id;

    // Is the lane warm? One token, timed. (Cold: this is the call that waits out the worker's start.)
    step('probing the lane');
    const probeAt = Date.now();
    await chat({ tier: 'L1', subsystem: 'u2-probe', messages: [{ role: 'user', content: 'ok' }], maxTokens: 1 });
    const probeMs = Date.now() - probeAt;
    quiet(`\nlane probe: ${probeMs} ms — ${DRY ? 'DRY RUN (fake lane, fake cloud)' : probeMs < 5000 ? 'warm' : 'it was COLD; warm now'}`);

    const rows: Row[] = [];
    const settle = async (since: number, want: number, capMs: number) => {
      // Against the fakes everything answers in milliseconds; a long wait there only hides a failure.
      const until = Date.now() + (DRY ? Math.min(capMs, 10_000) : capMs);
      while (Date.now() < until && timings.filter((t) => t.kind === 'listen' && t.at >= since).length < want) await sleep(100);
      await sleep(400); // the bookkeeping behind an answer (memory rows, truth pointers)
    };
    const say = async (pass: Row['pass'], scenario: string, kind: Row['message'], message: string): Promise<void> => {
      const from = new Date();
      step(`${pass} ${scenario}: ${kind}`);
      const result = await table.speakProse(campaign.id, actor, { message });
      const wallMs = Date.now() - from.getTime();
      const note = result.held ? 'HELD by JEWL — nothing written' : result.responses.map((r) => `${r.characterName}:${r.status}${r.actionKind ? `/${r.actionKind}` : r.detail ? `/${r.detail}` : ''}`).join(' ');
      rows.push({ pass, scenario, message: kind, wallMs, note, from, to: new Date() });
    };
    const fresh = () => { forgetListening(); forgetScene(); table.forgetSpokenTable(); };

    if (VOICE) {
      // ── The mic path: transcript chunks through hearSpoken, spaced like the recorder ──
      process.env.TABLE_SPLIT_LOOP = 'on';
      fresh();
      await prisma.gameSession.create({ data: { campaignId: campaign.id, number: 1, name: 'u2 live run' } });
      const file = valueOf('--voice');
      const chunks = file ? readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : VOICE_SAMPLE;
      quiet(`voice: ${chunks.length} chunks, ${CADENCE_MS} ms apart${file ? ` (from ${file})` : ' (built-in sample)'}`);
      for (const [i, chunk] of chunks.entries()) {
        const from = new Date();
        const fed = await table.hearSpoken(campaign.id, { ...actor, runsCampaign: true }, chunk);
        rows.push({ pass: 'split', scenario: `chunk ${i + 1}`, message: 'chunk', wallMs: Date.now() - from.getTime(), note: fed.fed ? `heard ${fed.heard} asked ${fed.asked} ignored ${fed.ignored.length}${fed.holding ? ' holding' : ''}` : `NOT FED (${fed.why})`, from, to: new Date() });
        await sleep(CADENCE_MS);
      }
      await settle(0, chunks.length * beings.length, 60_000);
      await sleep(6000); // answers were not awaited: give the last ones time to land
    } else {
      // ── The typed path, switch ON ──
      process.env.TABLE_SPLIT_LOOP = 'on';
      fresh();
      for (const [target, askOne, askAll] of [['one', 'Mara, what do you do?', ''], ['party', '', 'What do you all do?']] as const) {
        const ask = askOne || askAll;
        const want = beings.length;
        let mark = Date.now();
        await say('split', `A ${target}`, 'narration', NARRATION[0]);
        await settle(mark, want, 90_000);
        await say('split', `A ${target}`, 'ask', ask);
        await settle(Date.now(), 0, 0);
        mark = Date.now();
        await say('split', `B ${target}`, 'narration+ask', `${NARRATION[1]} ${ask}`);
        await settle(mark, want, 90_000);
        await say('split', `C ${target}`, 'ask', ask);
        await settle(Date.now(), 0, 0);
      }

      // ── The same inputs, switch OFF (the serial loop) ──
      delete process.env.TABLE_SPLIT_LOOP;
      fresh();
      for (const [target, ask] of [['one', 'Mara, what do you do?'], ['party', 'What do you all do?']] as const) {
        await say('serial', `A ${target}`, 'narration', NARRATION[2]);
        await say('serial', `A ${target}`, 'ask', ask);
        await say('serial', `B ${target}`, 'narration+ask', `${NARRATION[3]} ${ask}`);
        await say('serial', `C ${target}`, 'ask', ask);
      }
    }

    // ── The report ──
    const calls = await prisma.dayaModelCall.findMany({ where: { entityId: { in: beings.map((b) => b.entityId) } }, select: { subsystem: true, tokensOut: true, createdAt: true, rationale: true } });
    // A message's calls are everything from its start until the next message starts: that includes the
    // listening it set off, which is still running when the POST has already returned.
    const callsIn = (from: Date, to: Date) => {
      const by = new Map<string, { n: number; out: number }>();
      for (const c of calls) {
        if (c.createdAt < from || c.createdAt >= to) continue;
        const slot = by.get(c.subsystem) ?? { n: 0, out: 0 };
        slot.n += 1; slot.out += c.tokensOut;
        by.set(c.subsystem, slot);
      }
      return [...by].map(([s, v]) => `${s}×${v.n}(${v.out})`).join(' ') || '—';
    };
    const pad = (v: unknown, n: number) => String(v ?? '—').padEnd(n);

    quiet('\n== MESSAGES ==  wall = the POST as the GM waits for it; calls = stage×count(tokens out) made during it');
    quiet(`${pad('pass', 7)}${pad('scenario', 11)}${pad('message', 15)}${pad('wall ms', 9)}${pad('result', 44)}calls`);
    const reportAt = new Date();
    rows.forEach((r, i) => quiet(`${pad(r.pass, 7)}${pad(r.scenario, 11)}${pad(r.message, 15)}${pad(r.wallMs, 9)}${pad(r.note, 44)}${callsIn(r.from, rows[i + 1]?.from ?? reportAt)}`));

    const answers = timings.filter((t): t is Extract<TableTiming, { kind: 'answer' }> & { at: number } => t.kind === 'answer');
    quiet('\n== ANSWERS (split loop) ==  first = ask received → first word shown; line = ask received → final line');
    quiet(`${pad('being', 7)}${pad('outcome', 9)}${pad('action', 8)}${pad('listen', 10)}${pad('wait', 7)}${pad('ttft', 7)}${pad('first', 7)}${pad('line', 7)}${pad('out', 5)}${pad('retracted', 10)}revoiced`);
    for (const a of answers) {
      const t = a.timings;
      quiet(`${pad(nameOf(a.characterId), 7)}${pad(a.outcome, 9)}${pad(a.action, 8)}${pad(t?.listen, 10)}${pad(t?.waitMs, 7)}${pad(t?.ttftMs, 7)}${pad(t?.firstWordMs, 7)}${pad(t?.lineMs, 7)}${pad(t?.tokensOut, 5)}${pad(t?.retracted, 10)}${t?.revoiced ?? '—'}`);
    }

    const listens = timings.filter((t): t is Extract<TableTiming, { kind: 'listen' }> & { at: number } => t.kind === 'listen');
    quiet('\n== LISTENS (split loop, off the clock) ==  soul — = the recent felt state was reused');
    quiet(`${pad('being', 7)}${pad('outcome', 12)}${pad('standing', 9)}${pad('perceive', 9)}${pad('ingest', 8)}${pad('recall', 8)}${pad('soul', 7)}${pad('spirit', 8)}total`);
    for (const l of listens) {
      const t = l.timings;
      quiet(`${pad(nameOf(l.characterId), 7)}${pad(l.outcome, 12)}${pad(t?.standing, 9)}${pad(t?.perceiveMs, 9)}${pad(t?.ingestMs, 8)}${pad(t?.recallMs, 8)}${pad(t?.soulMs, 7)}${pad(t?.spiritMs, 8)}${t?.totalMs ?? '—'}`);
    }

    const stopped = calls.filter((c) => (c.rationale ?? '').includes('stream stopped by consumer')).length;
    quiet(`\nstreams stopped by the seal: ${stopped} of ${calls.filter((c) => c.subsystem === 'spirit_answer').length} answer calls`);

    if (SHOW_LINES) {
      const said = await prisma.campaignEvent.findMany({ where: { campaignId: campaign.id, type: 'chat' }, orderBy: { createdAt: 'asc' }, select: { characterName: true, payload: true } });
      quiet('\n== LINES (invented beings — shown because --show-lines) ==');
      for (const e of said) { let m = ''; try { m = (JSON.parse(String(e.payload)) as { message?: string }).message ?? ''; } catch { /* not json */ } lines.push(`${e.characterName}: ${m}`); }
      for (const l of lines) quiet(l);
    }
    if (DRY) quiet(`\nDRY RUN: no spend. Outbound calls refused: ${refused.length}${refused.length ? ` (${[...new Set(refused)].join(', ')})` : ''}. Every number above is the fake lane's, not a measurement.`);
  } finally {
    stop();
    console.log = quiet;
    console.error = realError;
    console.warn = realWarn;
    if (problems.length) {
      const counted = new Map<string, number>();
      for (const p of problems) counted.set(p, (counted.get(p) ?? 0) + 1);
      quiet(`\n== PROBLEMS logged during the run (${problems.length}) ==`);
      for (const [text, n] of counted) quiet(`  ${n > 1 ? `${n}× ` : ''}${text}`);
    } else {
      quiet('\nno errors or warnings were logged during the run.');
    }
    await sleep(1500); // let the last fire-and-forget writes land before they are counted and removed
    await cleanup();
    if (leftovers.length) quiet(`\nCLEANUP left something behind in campaign ${CAMPAIGN} — run with --cleanup until this is gone:\n  ${leftovers.join('\n  ')}`);
    else quiet(`\nthrowaway campaign ${CAMPAIGN} removed.`);
    if (DRY) {
      try {
        const [calls, cost] = await Promise.all([
          prisma.dayaModelCall.count({ where: { model: { in: DRY_MODELS } } }),
          prisma.aiCall.count({ where: { model: { in: DRY_MODELS } } }),
        ]);
        quiet(calls + cost === 0 ? 'dry-run rows left in the two call ledgers: 0.' : `DRY-RUN ROWS LEFT in the ledgers (${calls} model calls, ${cost} cost rows) — run with --cleanup.`);
      } catch { quiet('could not count dry-run rows in the ledgers — run with --cleanup to be sure.'); }
    }
    await prisma.$disconnect();
    if (fakes) await fakes.close();
  }
}

// The table path starts timers that outlive it (stream heartbeats); exit explicitly so the run ends when the report does.
main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
