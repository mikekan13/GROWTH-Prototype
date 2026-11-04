/**
 * THE TABLE TEST ASSERTS (GROUNDED-BEATS-PLAN-2026-11-03 §4) — RULES over a replayed session, never golden prose.
 * Each assert is a pure function over a RunTranscript (transcript.ts); runAsserts runs all twelve in order.
 */
import { absentThingsFor } from '@/daya/absent-things';
import { placesAbsentThing } from '@/daya/voice-filter';
import type { AssertResult, LedgerAt, RunCard, RunTranscript } from './transcript';

// 2026-11-03: a small local splitter — table-prose's pulls the whole prose module into the test run.
const ABBR_RE = /\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|vs|etc)\.$/i;
export function splitSentences(text: string): string[] {
  const rough = (text ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["”')\]]*)\s+/).filter(Boolean);
  const out: string[] = [];
  for (const piece of rough) {
    const prev = out.at(-1);
    if (prev !== undefined && ABBR_RE.test(prev)) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString();
const where = (c: RunCard) => `${c.characterName} @ ${iso(c.at)} (line ${c.lineIndex})`;
const result = (id: string, title: string, evidence: string[], measure?: AssertResult['measure']): AssertResult =>
  ({ id, title, pass: evidence.length === 0, evidence, ...(measure ? { measure } : {}) });
const fold = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The ledger that stood after the card's line, or the latest one before it. Null when none. */
function ledgerFor(t: RunTranscript, lineIndex: number): LedgerAt | null {
  const exact = t.ledger.find((l) => l.lineIndex === lineIndex);
  if (exact) return exact;
  const earlier = t.ledger.filter((l) => l.lineIndex < lineIndex).sort((a, b) => b.lineIndex - a.lineIndex);
  return earlier[0] ?? null;
}

/** A1 — a thought or action must not place a thing the ledger puts out of the being's reach. */
export function absentThing(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const c of t.cards) {
    const led = ledgerFor(t, c.lineIndex);
    if (!led) continue;
    const me = led.beings.find((b) => b.characterId === c.characterId);
    const locationId = me?.locationId ?? null;
    const roomMates = led.beings.filter((b) => b.characterId !== c.characterId && locationId !== null && b.locationId === locationId).map((b) => b.characterId);
    const absent = absentThingsFor(led.items, { characterId: c.characterId, locationId, roomMates });
    const held = led.items.filter((i) => i.holderId === c.characterId).map((i) => i.name);
    for (const seg of c.segments) {
      if (seg.kind !== 'thought' && seg.kind !== 'action') continue;
      for (const s of splitSentences(seg.text)) if (placesAbsentThing(s, absent, held)) ev.push(`${where(c)} ${seg.kind}: "${s}"`);
    }
  }
  return result('A1', 'absentThing', ev);
}

// Assert heuristic: wording that speaks a still-going signal as over.
const ENDED_RE = /\b(didn'?t|did not|won'?t|will not|isn'?t going to|is not going to|never) (pick|answer|picked)|\b(went|goes|go) to voicemail|\b(stopped|stops) ringing|\b(hung|hangs) up|\bline (is|was|'s) dead|\bno (one|answer)\b/i;

/** A2 — while a signal is live, the being who set or holds it does not think of it as ended. */
export function stillGoing(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const c of t.cards) {
    const led = ledgerFor(t, c.lineIndex);
    if (!led) continue;
    const now = led.cycle ?? Number.POSITIVE_INFINITY;
    const live = led.items.filter((i) => i.signal && i.signal.since <= now && now < (i.signal.until ?? Number.POSITIVE_INFINITY) && (i.signal.by === c.characterId || i.holderId === c.characterId));
    if (!live.length) continue;
    for (const seg of c.segments) {
      if (seg.kind !== 'thought') continue;
      for (const s of splitSentences(seg.text)) if (ENDED_RE.test(s)) ev.push(`${where(c)} speaks "${live[0].name}" as ended while live: "${s}"`);
    }
  }
  return result('A2', 'stillGoing', ev);
}

/** A3 — the recent thoughts a card held come from this run's session, never an older one. */
export function sessionBound(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  let without = 0;
  const foreign = new Set<string>();
  for (const e of t.events) if (e.type === 'being_thought' && e.sessionId && e.sessionId !== t.sessionId) foreign.add(fold(e.text));
  for (const c of t.cards) {
    if (!c.pieces) { without++; continue; }
    const rs = c.pieces.recentSessionId;
    if (rs && rs !== t.sessionId) ev.push(`${where(c)} recent drawn from session ${rs}, run is ${t.sessionId}`);
    for (const r of c.pieces.recent ?? []) if (foreign.has(fold(r))) ev.push(`${where(c)} recent is an older session's thought: "${r}"`);
  }
  return result('A3', 'sessionBound', ev, { label: 'cards_without_pieces', value: without });
}

const PLACEHOLDER_RE = /\b(Person|Place|Thing|Item|Location)-[A-Z]\b/;

/** A4 — no wall placeholder (Person-A) leaks into anything the table wrote. */
export function noPlaceholder(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const c of t.cards) for (const seg of c.segments) { const m = seg.text.match(PLACEHOLDER_RE); if (m) ev.push(`${where(c)} ${seg.kind} has "${m[0]}": "${seg.text.slice(0, 120)}"`); }
  for (const e of t.events) {
    for (const [label, txt] of [['event', e.text], ['narration', e.narration ?? '']] as const) {
      const m = txt.match(PLACEHOLDER_RE);
      if (m) ev.push(`${e.characterName ?? 'table'} @ ${iso(e.at)} ${label} has "${m[0]}": "${txt.slice(0, 120)}"`);
    }
  }
  return result('A4', 'noPlaceholder', ev);
}

// Assert heuristic (2026-11-03): a small, obvious set of first-person completed deeds. Not exhaustive; false negatives are fine.
const DEED_RE = /\bI (picked up|answered|hung up|opened|closed|texted|called|dialed|walked|went|left|put down|set down|grabbed|took)\b/i;

/** A5 — a thought does not state a completed deed of its own unless the Watcher declared it. */
export function noDeed(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const c of t.cards) {
    for (const seg of c.segments) {
      if (seg.kind !== 'thought') continue;
      for (const s of splitSentences(seg.text)) {
        const m = s.match(DEED_RE);
        if (!m) continue;
        const stem = m[1].split(' ')[0].toLowerCase().slice(0, 4);
        const first = c.characterName.split(' ')[0].toLowerCase();
        const declared = t.events.some((e) => (e.type === 'game_event' || e.eventType === 'declaration')
          && (e.characterId === c.characterId || fold(e.text).includes(first)) && fold(e.text).includes(stem))
          // Day 6: a deed the being itself chose and carded (an action segment of its own earlier card) is declared too.
          || t.cards.some((k) => k.characterId === c.characterId && k.at <= c.at && k.segments.some((sg) => sg.kind === 'action' && fold(sg.text).includes(stem)));
        if (!declared) ev.push(`${where(c)} thought states a deed nobody declared ("${m[1]}"): "${s}"`);
      }
    }
  }
  return result('A5', 'noDeed', ev);
}

/** A6 — lines the script expects withheld are withheld with a note; no other line is. */
export function unheldUseWithheld(t: RunTranscript, expectWithheld: number[] = ((t.script as unknown as { expectWithheld?: number[] }).expectWithheld ?? [])): AssertResult {
  const ev: string[] = [];
  t.lineResults.forEach((r, i) => {
    const line = t.script.steps[i]?.line ?? '';
    const expected = expectWithheld.includes(i);
    if (expected && !r.withheld) ev.push(`line ${i} should have been withheld: "${line}"`);
    else if (expected && !(r.note ?? '').trim()) ev.push(`line ${i} withheld without a note: "${line}"`);
    else if (!expected && r.withheld) ev.push(`line ${i} withheld but not expected${r.note ? ` (note: "${r.note}")` : ''}: "${line}"`);
  });
  return result('A6', 'unheldUseWithheld', ev);
}

const HANGUP_RE = /\bhangs? up\b|\bputs? (the|his|her) phone down\b/;

/** A7 — the first of several contradiction checks: after a hang-up line, the signal that being set is gone within 30 s. */
export function watcherLineStands(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  t.script.steps.forEach((step, i) => {
    if (!HANGUP_RE.test(step.line.replace(/["“][^"”]*["”]?/g, ' '))) return;
    const at = t.lineAt[i];
    if (at === undefined) return;
    const named = (name: string) => step.line.toLowerCase().includes(name.split(' ')[0].toLowerCase());
    const seen = new Set<string>();
    const after = ledgerFor(t, i);
    for (const led of after ? [after] : []) {
      for (const it of led.items) {
        const sg = it.signal;
        const now = led.cycle ?? Number.POSITIVE_INFINITY;
        if (!sg || sg.since > now || (sg.until ?? Number.POSITIVE_INFINITY) <= now) continue;
        if (sg.state === 'received') continue; // a delivered message is not ended by hanging up
        const setter = led.beings.find((b) => b.characterId === sg.by);
        const anyNamed = led.beings.some((b) => named(b.name));
        if (anyNamed && !(setter && named(setter.name))) continue;
        const key = `${it.id}:${sg.since}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ev.push(`line ${i} "${step.line}" @ ${iso(at)}: "${it.name}" set by ${setter?.name ?? sg.by} still live until cycle ${sg.until ?? '∞'} (ledger of line ${led.lineIndex})`);
      }
    }
  });
  return result('A7', 'watcherLineStands', ev);
}

/** A8 — every card lands within 25 s of its line. */
export function timing(t: RunTranscript, limitMs = 25_000): AssertResult {
  const ev = t.cards.filter((c) => c.msAfterLine > limitMs).map((c) => `${where(c)} came ${c.msAfterLine} ms after its line`);
  const sorted = t.cards.map((c) => c.msAfterLine).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
  return result('A8', 'timing', ev, { label: 'p95_ms_after_line', value: p95 });
}

/** A9 — cloud budget: measure only, but a stray placeholder at the wall fails. */
export function cloudBudget(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  const total = t.wall.reduce((n, w) => n + w.bytesIn, 0);
  const by = new Map<string, { n: number; bytes: number }>();
  for (const w of t.wall) {
    const e = by.get(w.caller) ?? { n: 0, bytes: 0 };
    e.n++; e.bytes += w.bytesIn; by.set(w.caller, e);
    if ((w.strayPlaceholders ?? 0) > 0) ev.push(`wall call by ${w.caller} @ ${iso(w.at)} had ${w.strayPlaceholders} stray placeholder(s)`);
  }
  const info = [`info: ${t.wall.length} wall calls, ${total} bytes in`, ...[...by].map(([k, v]) => `info: ${k}: ${v.n} calls, ${v.bytes} bytes`)];
  const r = result('A9', 'cloudBudget', ev, { label: 'wall_bytes_in', value: total });
  r.evidence = [...ev, ...info];
  return r;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, name: string) => new RegExp(`(^|[^a-z0-9])${escRe(name)}([^a-z0-9]|$)`, 'i').test(text);

/** A10 — a being does not reach for the same remembered person on most of its cards. */
export function memoryNotEveryCard(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const r of t.roster) {
    const cards = t.cards.filter((c) => c.characterId === r.characterId);
    if (cards.length < 4) continue;
    for (const name of r.knownNames) {
      if (!name.trim() || fold(name) === fold(r.name)) continue;
      const n = cards.filter((c) => c.segments.some((s) => mentions(s.text, name))).length;
      if (n > cards.length / 2) ev.push(`${r.name} names "${name}" on ${n} of ${cards.length} cards`);
    }
  }
  return result('A10', 'memoryNotEveryCard', ev);
}

/** A11 — a thought names only people the being itself knows. */
export function knownPeopleOnly(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  const everyone = [...new Set(t.roster.flatMap((r) => [r.name, ...r.knownNames]).filter((n) => n.trim().length >= 3))];
  for (const c of t.cards) {
    const own = t.roster.find((r) => r.characterId === c.characterId);
    const ownKnown = [c.characterName, ...(own?.knownNames ?? [])].map(fold);
    const knows = (n: string) => ownKnown.some((k) => k === fold(n) || k.includes(fold(n)) || fold(n).includes(k));
    for (const seg of c.segments) {
      if (seg.kind !== 'thought') continue;
      for (const s of splitSentences(seg.text)) {
        const stranger = everyone.find((n) => !knows(n) && mentions(s, n));
        if (stranger) ev.push(`${where(c)} thought names "${stranger}", unknown to them: "${s}"`);
      }
    }
  }
  return result('A11', 'knownPeopleOnly', ev);
}

// Assert heuristic: wording that speaks a sound as happening now (past forms like "stopped", "rang", "was ringing" do not match).
const SOUND_NOW_RE = /\b(?:is|are|keeps?|still)\s+(ringing|chiming|buzzing|knocking|vibrating|humming)\b|\b(rings|chimes|buzzes|knocks|vibrates)\b(?!\s+(?:ago|then|that night|two days))|\bthe (ringing|chiming|knocking|buzzing) (?:is|continues|goes on)\b/i;
const SOUND_ROOTS: Array<[string, RegExp]> = [['ring', /^ring/], ['chim', /^chim/], ['buzz', /^buzz/], ['knock', /^knock/], ['vibrat', /^vibrat/], ['hum', /^hum/]];

/** A12 — a thought speaks of a sound happening now only if the card's record references it. */
export function soundReferenced(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  let without = 0;
  for (const c of t.cards) {
    if (!c.pieces) { without++; continue; }
    const record = fold(`${c.pieces.perceived ?? ''} ${c.pieces.gist ?? ''}`);
    for (const seg of c.segments) {
      if (seg.kind !== 'thought') continue;
      for (const s of splitSentences(seg.text)) {
        const m = SOUND_NOW_RE.exec(s);
        if (!m) continue;
        const word = fold(m[1] ?? m[2] ?? m[3] ?? '');
        const root = SOUND_ROOTS.find(([, re]) => re.test(word))?.[0];
        if (root && !record.includes(root)) ev.push(`${where(c)} thought speaks a sound the record never references ("${root}"): "${s}"`);
      }
    }
  }
  return result('A12', 'soundReferenced', ev, { label: 'cards_without_pieces', value: without });
}

// ── Day 6 (2026-11-04, sessions 3–5: "a hard fail on phones") ──────────────────────────────────────────────────────────────

type ScriptExpect = { expectSignal?: number[]; expectHeard?: Array<{ line: number; by: string }> };
const expectOf = (t: RunTranscript): ScriptExpect => (t.script as unknown as ScriptExpect);
const lineOf = (t: RunTranscript, at: number): number => t.lineAt.reduce((acc, lt, idx) => (lt <= at ? idx : acc), -1);
const declarations = (t: RunTranscript) => t.events.filter((e) => e.type === 'game_event' && e.eventType === 'declaration').map((e) => ({ ...e, lineIndex: lineOf(t, e.at) }));
const perceivedSomething = (c: { pieces?: { perceived?: string } }) => !!c.pieces?.perceived && !/^nothing (new )?reach/i.test(c.pieces.perceived.trim());

/** A14 — a call or a message is a THING in the ledger: after the lines the script names, a device someone else holds carries a live signal. */
export function signalBound(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const i of expectOf(t).expectSignal ?? []) {
    const led = t.ledger.find((l) => l.lineIndex === i);
    if (!led) { ev.push(`L${i + 1}: no ledger snapshot`); continue; }
    const live = led.items.filter((it) => it.signal?.text && it.holderId && it.signal.by && it.signal.by !== it.holderId);
    if (!live.length) ev.push(`L${i + 1}: no signal on any held device after the line (${t.script.steps[i]?.line.slice(0, 60)}…)`);
  }
  return result('A14', 'signalBound', ev);
}

/** A15 — one deed, one sound: a line never writes the same world event twice (finding 13: two rings in one second). */
export function oneSoundPerLine(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  const seen = new Map<string, number>();
  for (const d of declarations(t)) {
    const key = `${d.lineIndex}|${d.text.trim().toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seen) if (n > 1) { const [li, text] = key.split('|'); ev.push(`L${Number(li) + 1}: "${text}" ×${n}`); }
  return result('A15', 'oneSoundPerLine', ev);
}

/** A18 — a Watcher line that goes through a being ("Violet realizes…", "Time to decide") yields a card from that being (finding 21). */
export function promptYieldsCard(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const d of declarations(t)) {
    const thoughts = Array.isArray(d.payload.thoughts) ? (d.payload.thoughts as Array<{ actorId?: string; actorLabel?: string; text?: string; sentence?: string }>) : [];
    for (const th of thoughts) {
      if (!th.actorId) continue;
      // The seed→page card: the Watcher's sentence built into the being's own words on the declaration itself counts as its card.
      const builtHere = !!th.text && !!th.sentence && th.text.trim() !== th.sentence.trim() && th.text.length > th.sentence.length * 0.8;
      if (builtHere) continue;
      if (!t.cards.some((c) => c.characterId === th.actorId && c.lineIndex === d.lineIndex)) ev.push(`L${d.lineIndex + 1}: ${th.actorLabel ?? th.actorId} was addressed and posted no card`);
    }
  }
  return result('A18', 'promptYieldsCard', ev);
}

/** A19 — a possession as subject ("Her phone rings again") is a world event the holder PERCEIVES, never the holder's deed (finding 22). */
export function possessionNotDeed(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const d of declarations(t)) {
    const acts = Array.isArray(d.payload.actions) ? (d.payload.actions as Array<{ actorId?: string; actorLabel?: string; text?: string; owned?: boolean }>) : [];
    for (const a of acts.filter((x) => x.owned && x.actorId)) {
      const mine = t.cards.filter((c) => c.characterId === a.actorId && c.lineIndex === d.lineIndex);
      if (!mine.length) { ev.push(`L${d.lineIndex + 1}: "${a.text}" — ${a.actorLabel} posted no card for what happened to their thing`); continue; }
      for (const c of mine) {
        if (!perceivedSomething(c)) ev.push(`L${d.lineIndex + 1}: ${a.actorLabel} perceived nothing of "${a.text}" (perceived: ${c.pieces?.perceived ?? '—'})`);
        if (c.segments.some((s) => s.kind === 'action' && a.text && s.text.toLowerCase().includes(a.text.toLowerCase().slice(0, 24)))) ev.push(`L${d.lineIndex + 1}: "${a.text}" carded as ${a.actorLabel}'s deed`);
      }
    }
  }
  return result('A19', 'possessionNotDeed', ev);
}

/** A20 — under a thing still going in its own hands, a being does not stay more than three beats running (finding 23: thirty stays). */
export function staysBounded(t: RunTranscript, maxRun = 4): AssertResult {
  const ev: string[] = [];
  const byBeing = new Map<string, typeof t.cards>();
  for (const c of [...t.cards].sort((a, b) => a.at - b.at)) byBeing.set(c.characterId, [...(byBeing.get(c.characterId) ?? []), c]);
  let worst = 0;
  for (const [, cards] of byBeing) {
    let run = 0;
    for (const c of cards) {
      const going = !!c.pieces?.gist && /\bgoing:/.test(c.pieces.gist);
      run = going && c.pieces?.impulse === 'stay' ? run + 1 : 0;
      worst = Math.max(worst, run);
      if (run === maxRun + 1) ev.push(`${c.characterName}: ${run} stays running while something of theirs was still going (L${c.lineIndex + 1})`);
    }
  }
  return result('A20', 'staysBounded', ev, { label: 'longest_stay_run', value: worst });
}

/** A21 — a connected call is a channel: after the lines the script names, the named being heard what was said (finding 24). */
export function lineCarries(t: RunTranscript): AssertResult {
  const ev: string[] = [];
  for (const h of expectOf(t).expectHeard ?? []) {
    const cards = t.cards.filter((c) => c.lineIndex === h.line && c.characterName.toLowerCase().startsWith(h.by.toLowerCase()));
    if (!cards.length) { ev.push(`L${h.line + 1}: ${h.by} posted no card`); continue; }
    if (!cards.some(perceivedSomething)) ev.push(`L${h.line + 1}: ${h.by} perceived nothing (${cards.map((c) => c.pieces?.perceived ?? '—').join(' | ')})`);
  }
  return result('A21', 'lineCarries', ev);
}

export function runAsserts(t: RunTranscript): AssertResult[] {
  return [absentThing(t), stillGoing(t), sessionBound(t), noPlaceholder(t), noDeed(t), unheldUseWithheld(t), watcherLineStands(t), timing(t), cloudBudget(t), memoryNotEveryCard(t), knownPeopleOnly(t), soundReferenced(t),
    signalBound(t), oneSoundPerLine(t), promptYieldsCard(t), possessionNotDeed(t), staysBounded(t), lineCarries(t)];
}

/** A compact markdown report: one table, then each failing assert's evidence (12 lines at most each). */
export function summarize(results: AssertResult[]): string {
  const real = (r: AssertResult) => r.evidence.filter((e) => !e.startsWith('info:'));
  const lines = ['| id | assert | result | evidence | measure |', '|---|---|---|---|---|'];
  for (const r of results) lines.push(`| ${r.id} | ${r.title} | ${r.pass ? 'pass' : 'FAIL'} | ${real(r).length} | ${r.measure ? `${r.measure.label}=${r.measure.value}` : ''} |`);
  for (const r of results.filter((x) => !x.pass)) {
    lines.push('', `**${r.id} ${r.title}**`, ...real(r).slice(0, 12).map((e) => `- ${e}`));
    if (real(r).length > 12) lines.push(`- ...and ${real(r).length - 12} more`);
  }
  return lines.join('\n');
}
