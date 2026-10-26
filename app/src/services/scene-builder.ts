/**
 * Scene builder — the Watcher's line is a SEED the engine builds up from world data
 * (Mike 2026-10-25, ruling "the truth record reads like a novel, built from data").
 *
 *   "If the GM types 'He knocks on the door' as the opening then it should actually set the stage. Describe the
 *    scene. Things like when he looks at the receipt it should tell what he reads on it."
 *   "Its listening monologue would be the place you actually expand the thought… a blend of the action beat I took
 *    and 'the salt stings' etc. Basically we should have had one card for him and then another prose line that sets
 *    up the scene for Violet. Then Violet's card."
 *   "Really the local model is just compiling — it's like the editor and security."
 *
 * Two builds, both through the wall (ai/network, fiction class, the cloud writes):
 *   buildScene     — the seed + the voiced being's own listening monologue + the world's facts → a block of scene
 *                    narration and ONE card per voiced character (acts third person present, thoughts the inner voice,
 *                    speech verbatim), every segment naming the seed sentence it derives from.
 *   buildBeingCard — another being's listening monologue + what reached it + its own place → a prose line setting
 *                    its side of the scene and its card split into ((thought)) / ::act:: / "speech".
 *
 * Derive, never invent: the prompt is held to the seed and the facts; a deterministic compile pass (the floor the
 * local editor will stand on) drops any sentence that brings in a proper name the world does not know and pins every
 * segment to a real seed sentence. Nothing here throws outward: on a failure the seed stands as it was parsed.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { routedChatText } from '@/ai/network/chat';
import { actorMap, mapFactLines, whereOthersStand, whereaboutsLines } from '@/services/world-apply';
import { factsForActor, splitHeld, heldLines } from '@/daya/facts-for-actor';
import { presentCycle, type FeedTimescale } from '@/lib/feed-segments';
import type { CalendarSpec } from '@/types/time';
import { splitSentences, type ProseAction, type ProseQuote, type ProseThought } from '@/services/table-prose';
import { cueCoverage } from '@/daya/ladder';

export function sceneBuilderOn(): boolean {
  return process.env.SCENE_BUILDER !== 'off';
}

/** How long the table waits for the cloud before the seed stands as parsed. */
export const SCENE_BUILD_TIMEOUT_MS = 30_000;

export interface SeedParts {
  full: string;
  narration: string | null;
  actions: ProseAction[];
  thoughts: ProseThought[];
  quotes: ProseQuote[];
}

export interface BuiltSegment {
  kind: 'action' | 'thought' | 'speech';
  text: string;
  /** The seed sentence this derives from (verbatim) — a viewer's feed shows only what reached them. */
  sentence: string;
}

export interface BuiltCard { actorId: string; actorLabel: string; segments: BuiltSegment[] }

export interface BuiltScene {
  scene: string | null;
  cards: BuiltCard[];
  source: 'cloud' | 'seed';
}

export interface WorldName { id: string; name: string }

// ── Facts: what the builder may draw from ──────────────────────────────────────

export async function clockLine(campaignId: string): Promise<string | null> {
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true, defaultTimescaleId: true } });
  if (!camp) return null;
  let ts: FeedTimescale | null = null;
  if (camp.defaultTimescaleId) {
    const row = await prisma.timescale.findUnique({ where: { id: camp.defaultTimescaleId } });
    if (row) {
      let calendar: CalendarSpec | null = null;
      try { calendar = row.calendar ? (JSON.parse(row.calendar) as CalendarSpec) : null; } catch { calendar = null; }
      ts = { unitsPerMetaCycle: row.unitsPerMetaCycle, calendar, unitName: row.unitName };
    }
  }
  const shown = presentCycle(camp.currentCycle, ts);
  return `[clock] ${clockInWords(shown)}${lightSuffix(shown)}`;
}

/**
 * The light is a FACT, not something a being or the builder may invent (HW8 2026-10-25, Mike: daylight, dusk and "grey
 * light" at a quarter past seven in October). After dark from 18:00 to 07:00 October–March, from 21:00 to 06:00
 * April–September. Pure.
 */
export function lightOf(hour: number, monthIndex0: number): 'after dark' | 'daylight' {
  const h = ((hour % 24) + 24) % 24;
  const winter = monthIndex0 >= 9 || monthIndex0 <= 2;
  return winter ? (h >= 18 || h < 7 ? 'after dark' : 'daylight') : (h >= 21 || h < 6 ? 'after dark' : 'daylight');
}
const MONTH_INDEX = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** " — after dark" / " — daylight" for a shown cycle ("17th Oct, Y2026 · 19:16 · …"); empty when the hour or month cannot be read. Pure. */
function lightSuffix(shown: string): string {
  const hm = shown.match(/\b(\d{1,2}):(\d{2})\b/);
  const dm = shown.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/);
  const mi = dm ? MONTH_INDEX.indexOf(dm[1].slice(0, 3).toLowerCase()) : -1;
  if (!hm || mi < 0) return '';
  return ` — ${lightOf(Number(hm[1]), mi)}`;
}

/**
 * A being card's scene must not give the hour the page already gave (HW8 2026-10-25: "Half past seven on a mid-October
 * evening, Violet stands…" six times in one run). When the scene opens with a clock phrase and the same phrase is already
 * on the page, that phrase is stripped and the rest kept, capitalised. Pure.
 */
const LEADING_CLOCK_RE = /^((?:(?:a little after|about half past|coming up on|just before)\s+\w+|\w+ o'clock)\b.*?(?:morning|afternoon|evening|night)[^,;:]*)[,;:]\s*/i;
export function withoutRepeatedHour(scene: string, page: string[]): string {
  const m = scene.match(LEADING_CLOCK_RE);
  if (!m || !page.length) return scene;
  const phrase = m[1].trim().toLowerCase();
  if (!page.some((p) => p.toLowerCase().includes(phrase))) return scene;
  const rest = scene.slice(m[0].length);
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
}

type CardSeg = { kind: 'action' | 'thought' | 'speech'; text: string };
const ECHO_FLOOR = 0.7;
/**
 * Each sentence of a monologue goes to ONE segment: a thought whose sentences all echo an act of the same card is the
 * same sentence said twice ("His fingers twitch toward the door." + "My fingers twitch, ready to knock, but I hold.") and
 * is dropped. Pure.
 */
export function dropEchoedThoughts<T extends CardSeg>(segments: T[]): T[] {
  const acts = segments.filter((s) => s.kind === 'action').map((s) => s.text);
  if (!acts.length) return segments;
  return segments.filter((s) => {
    if (s.kind !== 'thought') return true;
    const sentences = splitSentences(s.text);
    if (!sentences.length) return true;
    const echoed = sentences.every((sent) => acts.some((a) => Math.max(cueCoverage(sent, a), cueCoverage(a, sent)) >= ECHO_FLOOR));
    return !echoed;
  });
}

/**
 * A thought that begins lowercase or with a present participle ("Wanting to verify the ink is still there.") is the
 * dangling tail of a sentence whose head became an act: it goes back onto that act. Pure.
 */
export function reattachDanglers<T extends CardSeg>(segments: T[]): T[] {
  const out: T[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    const first = s.text.trim().split(/\s+/)[0] ?? '';
    const word = first.replace(/[^A-Za-z]/g, '');
    const participle = /^[A-Z]?[a-z]+ing$/.test(word) && !/^(?:nothing|something|anything|everything|morning|evening|thing|king|ring|spring|sing|bring|string)$/i.test(word);
    const dangling = s.kind === 'thought' && (/^[a-z]/.test(first) || participle);
    if (dangling && prev && prev.kind === 'action') {
      const tail = s.text.trim();
      out[out.length - 1] = { ...prev, text: `${prev.text.trim().replace(/[.!?…]+$/, '')}, ${tail.charAt(0).toLowerCase()}${tail.slice(1)}` };
      continue;
    }
    out.push(s);
  }
  return out;
}

const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const MONTH_NAMES: Record<string, string> = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
/**
 * "17th Oct, Y2026 · 19:16 · 0.002 cyc" → "a little after seven in the evening, mid October". A novel gives the hour
 * in words and never reads the calendar out (HW8 2026-10-25, Mike: "the weird way it presented the date and time" —
 * "the evening of 17 October 2026, nineteen sixteen"). Pure.
 */
export function clockInWords(shown: string): string {
  const hm = shown.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!hm) return shown;
  const h = Number(hm[1]);
  const m = Number(hm[2]);
  const word = (x: number) => HOUR_WORDS[((x % 24) + 24) % 12];
  const hour = m < 5 ? `${word(h)} o'clock` : m < 20 ? `a little after ${word(h)}` : m < 40 ? `about half past ${word(h)}` : m < 55 ? `coming up on ${word(h + 1)}` : `just before ${word(h + 1)}`;
  const partOf = h < 5 || h >= 21 ? 'at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening';
  const dm = shown.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/);
  let when = '';
  if (dm) {
    const day = Number(dm[1]);
    const month = MONTH_NAMES[dm[2].slice(0, 3).toLowerCase()] ?? dm[2];
    when = `, ${day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late'} ${month}`;
  }
  return `${hour} ${partOf}${when}`;
}

const INNER_VOICE_FLOOR = 0.3;
/**
 * A thought on the page comes from the being's inner voice this beat — its listening monologue and what the seed said it
 * thought — or not at all (HW8 2026-10-25: the card carried "Am I still the man who built, or the one who broke?" and
 * nothing kept what the being had actually thought). Sentences the voice does not carry are dropped; null when none is
 * left or there is no voice. Pure.
 */
export function fromInnerVoice(text: string, voice: string): string | null {
  const have = voice.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!have) return null;
  const kept = splitSentences(text).filter((s) => {
    const bare = s.replace(/[.!?…]+$/, '').trim();
    if (bare.split(/\s+/).length <= 3) return have.includes(bare.toLowerCase());
    return cueCoverage(s, voice) >= INNER_VOICE_FLOOR;
  });
  return kept.length ? kept.join(' ') : null;
}

/** "Violet's Apartment — Fourth-Floor Walkup Studio" → "Violet's Apartment": the name before its qualifier (as the tagger reads it). Pure. */
export function nameHead(name: string): string {
  const m = name.match(/^(.+?)(?:\s+[—–-]\s+|:\s+|\s+\()/u);
  return (m ? m[1] : name).trim() || name;
}

function locationLines(loc: { name: string; data: string | null } | null, tag: string): string[] {
  if (!loc) return [];
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(loc.data ?? '{}') as Record<string, unknown>; } catch { d = {}; }
  const desc = typeof d.description === 'string' ? d.description.replace(/\s+/g, ' ').trim() : '';
  return [`[${tag}] ${nameHead(loc.name)}${desc ? `: ${desc.slice(0, 700)}` : ''}`];
}

const PAGE_MEMORY = 3;
/** The scene blocks already on the page — the last built declarations — so the builder sets only what is new. Never throws. */
export async function pageSoFar(campaignId: string): Promise<string[]> {
  try {
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'game_event', payload: { contains: '"built":true' } }, orderBy: { createdAt: 'desc' }, take: PAGE_MEMORY, select: { payload: true } });
    return rows.reverse().map((r) => { try { const p = JSON.parse(r.payload) as { narration?: string | null }; return typeof p.narration === 'string' ? p.narration.trim() : ''; } catch { return ''; } }).filter(Boolean);
  } catch { return []; }
}

// A bare speech tag is not an act ("He speaks." / "Kristopher says,"): the quote beside it is the record (HW8 run 2).
const SPEECH_TAG_ACT_RE = /^(?:\w[\w'’-]*\s+)?(?:he|she|they|\w+)\s+(?:speaks|says|asks|replies|answers|calls out|whispers|mutters|adds|continues)(?:\s+(?:again|softly|quietly|gently|at last|finally|up))?[.!,:]?$/i;
/** True when a built act is only a speech tag. Pure. */
export function isSpeechTagAct(text: string): boolean {
  return SPEECH_TAG_ACT_RE.test(text.trim());
}

/**
 * The world as the builder may see it for these actors: the clock, the room and its home, the doors, who is where,
 * what each actor holds, the actors' established facts, their freshest memories. Lines, tagged. Never throws.
 */
export async function sceneFacts(campaignId: string, actorIds: string[]): Promise<{ lines: string[]; names: WorldName[] }> {
  const lines: string[] = [];
  const names: WorldName[] = [];
  try {
    const clock = await clockLine(campaignId);
    if (clock) lines.push(clock);
    const chars = await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } });
    names.push(...chars.map((c) => ({ id: c.id, name: c.name })));
    const locs = await prisma.location.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true, data: true } });
    names.push(...locs.map((l) => ({ id: l.id, name: l.name })));
    const allFacts = await prisma.worldFact.findMany({ where: { campaignId, supersededById: null }, select: { subjectKey: true, fact: true } });
    const seenRooms = new Set<string>();
    for (const actorId of actorIds) {
      const me = chars.find((c) => c.id === actorId);
      if (!me) continue;
      const map = await actorMap(actorId);
      if (map) {
        if (!seenRooms.has(map.roomId)) {
          seenRooms.add(map.roomId);
          lines.push(...locationLines(locs.find((l) => l.id === map.roomId) ?? null, `place · ${me.name} stands in`));
          if (map.home.id !== map.roomId && !seenRooms.has(map.home.id)) { seenRooms.add(map.home.id); lines.push(...locationLines(locs.find((l) => l.id === map.home.id) ?? null, 'place · part of')); }
        }
        lines.push(...mapFactLines(map));
        lines.push(...whereaboutsLines(map.roomName, await whereOthersStand(campaignId, actorId, map)));
      }
      const held = await prisma.campaignItem.findMany({ where: { campaignId, holderId: actorId, status: { notIn: ['DESTROYED', 'CONSUMED', 'LOST'] } }, select: { name: true, data: true } });
      for (const l of heldLines(splitHeld(held), { written: false })) lines.push(`[${me.name} holds] ${l}`);
      for (const it of held) {
        let d: Record<string, unknown> = {};
        try { d = JSON.parse(it.data ?? '{}') as Record<string, unknown>; } catch { d = {}; }
        const desc = typeof d.description === 'string' ? d.description.replace(/\s+/g, ' ').trim() : '';
        const text = typeof d.text === 'string' ? d.text.replace(/\s+/g, ' ').trim() : '';
        if (desc) lines.push(`[item] ${it.name}: ${desc.slice(0, 300)}`);
        if (text) lines.push(`[item · what is written on ${it.name}] ${text.slice(0, 400)}`);
      }
      // THE WALL (ruling-cloud-soul-local-spirit-privacy-wall; Kristopher = real-person data): a character's
      // established facts and its memories do NOT go to the cloud builder. Only facts about the place he stands in
      // ride along (the stage); what he is, what he has lived, stays inside until the translator name-swap exists.
      const room = (await actorMap(actorId))?.roomName?.toLowerCase() ?? null;
      const placeFacts = factsForActor(allFacts, { actorName: me.name, otherNames: chars.filter((c) => c.id !== actorId).map((c) => c.name), intent: '' })
        .filter((f) => room && f.fact.toLowerCase().includes(room) && !/\bis in\b.*\binside\b/i.test(f.fact));
      for (const f of placeFacts.slice(0, 8)) lines.push(`[fact · the place] ${f.fact}`);
    }
  } catch (err) {
    console.warn('[scene-builder] facts could not all be read (non-fatal):', err instanceof Error ? err.message : err);
  }
  return { lines, names };
}

// ── The compile pass (deterministic floor) ─────────────────────────────────────

const CAP_WORD_RE = /\b[A-Z][a-z]{2,}\b/g;
const SENTENCE_STARTERS = new Set(['The', 'She', 'He', 'They', 'It', 'His', 'Her', 'Their', 'There', 'This', 'That', 'Then', 'And', 'But', 'Only', 'Behind', 'Inside', 'Outside', 'Beyond', 'Above', 'Below', 'Under', 'Over', 'Somewhere', 'Nothing', 'Something', 'Someone', 'Nobody', 'Everything', 'Lord', 'Jesus', 'Christ', 'God', 'Son', 'Tonight', 'Today', 'Now', 'Still', 'Even', 'For', 'With', 'From', 'When', 'Once', 'If', 'As', 'In', 'On', 'At', 'By', 'To', 'Of', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Hawaiian', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

/** The capitalised words the world and the seed know, so a sentence bringing in a stranger's name can be dropped. */
function knownWords(known: string[]): Set<string> {
  const out = new Set<string>(SENTENCE_STARTERS);
  for (const k of known) for (const w of k.match(CAP_WORD_RE) ?? []) out.add(w);
  return out;
}

/**
 * Keep the sentences whose proper names the world knows (from the seed, the facts, the names). Pure.
 * A sentence's first word is only a capital because it opens the sentence when the word itself is ordinary — a
 * starter, or a word the seed and the facts use in lower case ("Scuffed tile…"); a stranger's name opening a
 * sentence ("Marcus watches from the stair.") is still a stranger's name.
 */
export function onlyDerived(text: string, known: string[]): string {
  const words = knownWords(known);
  const lower = new Set(known.join(' ').toLowerCase().match(/[a-z']+/g) ?? []);
  const kept = splitSentences(text).filter((s) => {
    const caps = s.match(CAP_WORD_RE) ?? [];
    return caps.every((w, i) => {
      if (words.has(w) || words.has(w.replace(/'s$/, ''))) return true;
      return i === 0 && s.startsWith(w) && lower.has(w.toLowerCase());
    });
  });
  return kept.join(' ');
}

/** The seed sentence a built segment derives from: as given when it is one, else the one it shares most words with. Pure. */
export function pinToSeed(from: string | undefined, text: string, seedSentences: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  if (from) {
    const f = norm(from);
    const hit = seedSentences.find((s) => norm(s) === f) ?? seedSentences.find((s) => norm(s).includes(f) || f.includes(norm(s)));
    if (hit) return hit;
  }
  let best = seedSentences[0] ?? text;
  let bestScore = -1;
  for (const s of seedSentences) {
    const score = Math.max(cueCoverage(s, text), cueCoverage(text, s));
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function stripFences(raw: string): string {
  return raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function parseJson<T>(raw: string): T | null {
  const t = stripFences(raw);
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)) as T; } catch { return null; }
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// ── The seed → the page ──────────────────────────────────────────────────────

const SCENE_SYSTEM = `You build up a game master's seed line into a page of a novel, from DATA ONLY.

Rules — all of them, every time:
- DERIVE, NEVER INVENT. Every sentence you write must be supported by the SEED or by a FACT line given. Do not add objects, people, weather, sounds, furniture, feelings, bodily details or events that are in neither ("the skin around them still raw" is an invention unless a fact says so). If the facts are thin, write less.
- SCENE: 0 to 4 sentences that set the stage from the facts — the place, the hour, the door and its state, what the actor holds, what is written on a thing he reads. THE PAGE REMEMBERS ITSELF: when ALREADY ON THE PAGE is given, do not describe again what it already set (the room, its light, its fixtures, a thing's text) — write only what is NEW this beat: a changed hour, a changed door, a thing now held or read for the first time, who moved; when nothing changed, one short sentence or an empty scene. Never restate the actor's acts or thoughts in the scene. Use the world's names EXACTLY as given in NAMES (so the record can tag them). The hour as the [clock] line gives it, in words — never the calendar date, never a year, never digits. Light only from the facts: no daylight, dusk or sun unless a fact says so (an evening in autumn is dark; a lamp lights a room only if a fact lists it lit).
- A thing the seed names that is not in the FACTS does not exist on the page: the actor reaches for it and does not find it, or the sentence stays as the seed put it. Never describe what it looks like or what is written on it.
- ONE CARD PER ACTOR named in the seed, segments in the SEED's order:
  - action: third person, present tense, the actor as "He"/"She" or by name: "He wipes his eyes." Only acts the seed states. An ATTEMPT is not its outcome: "looking for the receipt" never becomes "finds the receipt", "reaches for the handle" never opens the door, "listens" never hears — the outcome is the Watcher's or the world's to give, never yours. Never count or number events (first/second/third knock) unless the seed or the monologue counts them. Never add a movement the text does not state (rising, turning, stepping) to get from one act to the next. A thought that looks FORWARD to an act ("the knock is coming") goes BEFORE that act in the card, never after it. Backstory inside a seed act ("from the tears he was crying in the car") is not an act — it belongs in the scene as a fact a bystander could see (red eyes), or nowhere.
  - thought: the actor's INNER VOICE, strictly first person ("I", "my"), free indirect, as he would think it — never "he"/"his" inside a thought, never reported ("He thinks it is odd" is wrong; "Only one apartment on the whole floor. Odd." is right). A prayer in his head is the prayer itself. When a MONOLOGUE is given for an actor, blend it into his thoughts — it is his inner voice this beat; keep what the seed said he thought and let the monologue colour and extend it. A sentence of the monologue in which the actor PHYSICALLY does something ("the receipt crinkles in my fist", "my thumb rubs the ink", "my hand hovers") is not a thought: make it a small action segment in third person ("The receipt crinkles in his fist.") — unless it contradicts or undoes an act the seed states (the seed knocked: no hovering hand, no "I don't knock"), in which case drop it. A bare speech tag ("He speaks.") is never a segment: the speech segment is the record of it.
  - speech: the words exactly as the seed quotes them.
- Every segment carries "from": the SEED sentence it derives from, verbatim.
- Output JSON only: {"scene": string, "cards": [{"actorId": string, "segments": [{"kind": "action"|"thought"|"speech", "text": string, "from": string}]}]}`;

function seedBlock(seed: SeedParts): string {
  const lines = [`SEED (as the Watcher wrote it):\n${seed.full}`, '', 'SEED PARTS (the table\'s parse):'];
  if (seed.narration) lines.push(`- narration: ${seed.narration}`);
  for (const a of seed.actions) lines.push(`- act of ${a.actorLabel} [${a.actorId}]: ${a.text}`);
  for (const t of seed.thoughts) lines.push(`- thought of ${t.actorLabel} [${t.actorId}]: ${t.text}  (sentence: ${t.sentence})`);
  for (const q of seed.quotes) lines.push(`- speech of ${q.speakerLabel}${q.speakerId ? ` [${q.speakerId}]` : ''}: "${q.text}"`);
  return lines.join('\n');
}

/**
 * The seed, the voiced beings' monologues and the facts → the scene and one card per actor. On any failure or a
 * timeout the seed stands as parsed (source 'seed'). Never throws.
 */
export async function buildScene(
  campaignId: string,
  seed: SeedParts,
  monologues: Map<string, string>,
  facts: { lines: string[]; names: WorldName[] },
  opts: { timeoutMs?: number } = {},
): Promise<BuiltScene> {
  const fallback = (): BuiltScene => ({
    scene: seed.narration,
    cards: cardsFromSeed(seed),
    source: 'seed',
  });
  if (!sceneBuilderOn()) return fallback();
  const actorIds = new Set<string>([...seed.actions.map((a) => a.actorId), ...seed.thoughts.map((t) => t.actorId), ...seed.quotes.flatMap((q) => (q.speakerId ? [q.speakerId] : []))]);
  if (!seed.narration && actorIds.size === 0) return fallback();
  const seedSentences = splitSentences(seed.full);
  const page = await pageSoFar(campaignId);
  const user = [
    seedBlock(seed),
    '',
    `NAMES (use exactly): ${facts.names.map((n) => `${n.name} [${n.id}]`).join('; ')}`,
    '',
    'FACTS:',
    ...(facts.lines.length ? facts.lines : ['(none beyond the seed)']),
    ...(monologues.size ? ['', ...[...monologues].map(([id, m]) => `MONOLOGUE of [${id}] this beat (its inner voice, first person):\n${m}`)] : []),
    ...(page.length ? ['', 'ALREADY ON THE PAGE (the scene blocks of the last beats — do not set these again):', ...page.map((p) => `- ${p}`)] : []),
  ].join('\n');
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      routedChatText(
        { caller: 'scene-builder', lane: 'judgment', campaignId, contentClass: 'fiction' },
        { system: SCENE_SYSTEM, user, maxTokens: 1200, temperature: 0.4 },
      ),
      opts.timeoutMs ?? SCENE_BUILD_TIMEOUT_MS,
      'scene build',
    );
    const parsed = parseJson<{ scene?: unknown; cards?: Array<{ actorId?: unknown; segments?: Array<{ kind?: unknown; text?: unknown; from?: unknown }> }> }>(res.text);
    if (!parsed) throw new Error('no JSON in the builder\'s answer');
    const known = [seed.full, ...facts.lines, ...facts.names.map((n) => n.name), ...[...monologues.values()]];
    const scene = typeof parsed.scene === 'string' ? onlyDerived(parsed.scene.trim(), known) : '';
    for (const [id, m] of monologues) console.log(`[scene-builder] inner voice of ${id}: ${m.replace(/\s+/g, ' ').slice(0, 400)}`);
    const labelOf = (id: string) => seed.actions.find((a) => a.actorId === id)?.actorLabel ?? seed.thoughts.find((t) => t.actorId === id)?.actorLabel ?? seed.quotes.find((q) => q.speakerId === id)?.speakerLabel ?? facts.names.find((n) => n.id === id)?.name ?? id;
    const cards: BuiltCard[] = [];
    for (const c of parsed.cards ?? []) {
      if (typeof c.actorId !== 'string' || !actorIds.has(c.actorId)) continue;
      const segments: BuiltSegment[] = [];
      for (const s of c.segments ?? []) {
        if (typeof s.text !== 'string' || !s.text.trim()) continue;
        const kind = s.kind === 'action' || s.kind === 'thought' || s.kind === 'speech' ? s.kind : null;
        if (!kind) continue;
        const text = kind === 'speech' ? s.text.trim() : onlyDerived(s.text.trim(), known);
        if (!text) continue;
        if (kind === 'action' && isSpeechTagAct(text)) continue;
        segments.push({ kind, text, sentence: pinToSeed(typeof s.from === 'string' ? s.from : undefined, text, seedSentences) });
      }
      // A thought is the being's own voice or nothing (fromInnerVoice). When the voice spoke and the builder lost all
      // of it, the monologue itself stands as the thought, where the builder had put one.
      const voice = [monologues.get(c.actorId) ?? '', ...seed.thoughts.filter((t) => t.actorId === c.actorId).map((t) => t.text)].join(' ').trim();
      const vetted: BuiltSegment[] = [];
      let firstThoughtAt = -1;
      let keptThought = false;
      for (const s of segments) {
        if (s.kind !== 'thought') { vetted.push(s); continue; }
        if (firstThoughtAt < 0) firstThoughtAt = vetted.length;
        const kept = fromInnerVoice(s.text, voice);
        if (kept) { vetted.push({ ...s, text: kept }); keptThought = true; }
        else console.log(`[scene-builder] dropped a thought the voice of ${labelOf(c.actorId)} never had: ${s.text.slice(0, 160)}`);
      }
      if (firstThoughtAt >= 0 && !keptThought && voice) {
        const at = segments.find((s) => s.kind === 'thought')!;
        vetted.splice(firstThoughtAt, 0, { kind: 'thought', text: voice, sentence: at.sentence });
      }
      if (vetted.length) cards.push({ actorId: c.actorId, actorLabel: labelOf(c.actorId), segments: vetted });
    }
    // Every actor the seed voiced keeps a card: one the builder dropped falls back to the seed's own parts.
    for (const fromSeed of cardsFromSeed(seed)) if (!cards.some((c) => c.actorId === fromSeed.actorId)) cards.push(fromSeed);
    console.log(`[scene-builder] built in ${Date.now() - t0}ms: scene ${scene ? splitSentences(scene).length : 0} sentence(s), ${cards.length} card(s), ${cards.reduce((n, c) => n + c.segments.length, 0)} segment(s)`);
    return { scene: scene || seed.narration, cards, source: 'cloud' };
  } catch (err) {
    console.warn(`[scene-builder] the seed stands as parsed (${Date.now() - t0}ms):`, err instanceof Error ? err.message : err);
    return fallback();
  }
}

/** The seed's own parts as cards (what the table showed before the builder). Pure. */
export function cardsFromSeed(seed: SeedParts): BuiltCard[] {
  const cards = new Map<string, BuiltCard>();
  const push = (id: string, label: string, seg: BuiltSegment) => {
    const c = cards.get(id) ?? { actorId: id, actorLabel: label, segments: [] };
    c.segments.push(seg);
    cards.set(id, c);
  };
  for (const a of seed.actions) push(a.actorId, a.actorLabel, { kind: 'action', text: a.text, sentence: a.text });
  for (const t of seed.thoughts) push(t.actorId, t.actorLabel, { kind: 'thought', text: t.text, sentence: t.sentence });
  for (const q of seed.quotes) if (q.speakerId) push(q.speakerId, q.speakerLabel, { kind: 'speech', text: q.text, sentence: q.text });
  return [...cards.values()];
}

// ── Another being's side of the beat ─────────────────────────────────────────

const BEING_SYSTEM = `You set down one being's side of a beat in a novel, from DATA ONLY.

Given what reached the being (HEARD), the being's own listening monologue (its inner voice, first person), and FACTS about where it is:
- SCENE: 1 or 2 sentences, third person, setting its side of the stage from the facts — where it is, the hour, what reached it. Never invent objects, people, sounds or events that are in neither the monologue nor the facts. Use the world's names exactly as given. The hour as the [clock] line gives it, in words — never the calendar date, never digits. Light only from the facts: no daylight, dusk, sun or "last light" unless a fact says so (an evening in autumn is dark; a lamp lights a room only if a fact lists it lit). If the page already gave the hour or the room (ALREADY ON THE PAGE), do not give them again: one sentence of what is new for this being this beat (what reached it, what changed), or an empty scene.
- Never count or number events (first/second/third knock) unless the monologue or HEARD counts them. Never add a movement the text does not state (rising, turning, stepping) to get from one act to the next. A thought that looks FORWARD to an act ("the knock is coming") goes BEFORE that act in the card, never after it.
- SEGMENTS, in the monologue's order, splitting it. Each sentence of the monologue goes to exactly ONE segment. A sentence that is a physical doing is an action and is NOT also a thought. Never split a sentence: a participle clause stays with its sentence.
  - thought: its inner voice, first person, as it thinks it (keep its words; trim nothing that matters).
  - action: only what the monologue says the being PHYSICALLY does now (a hand toward the lock, holding still, a step back) — third person present: "She holds still." Perceptions and feelings are thoughts, not acts.
  - speech: only words the monologue says it says ALOUD, verbatim.
- DERIVE, NEVER INVENT.
- Output JSON only: {"scene": string, "segments": [{"kind": "action"|"thought"|"speech", "text": string}]}`;

export interface BuiltBeingCard { scene: string | null; segments: Array<{ kind: 'action' | 'thought' | 'speech'; text: string }> }

/** A being's monologue → its scene line and its card. Null on failure (the monologue stands as one thought). Never throws. */
export async function buildBeingCard(
  campaignId: string,
  being: { id: string; name: string },
  heard: string,
  monologue: string,
  facts: { lines: string[]; names: WorldName[] },
  opts: { timeoutMs?: number } = {},
): Promise<BuiltBeingCard | null> {
  if (!sceneBuilderOn() || !monologue.trim()) return null;
  const page = await pageSoFar(campaignId);
  const user = [
    `BEING: ${being.name} [${being.id}]`,
    `HEARD (what reached it this beat): ${heard}`,
    `MONOLOGUE (its inner voice):\n${monologue}`,
    '',
    `NAMES (use exactly): ${facts.names.map((n) => `${n.name} [${n.id}]`).join('; ')}`,
    'FACTS:',
    ...(facts.lines.length ? facts.lines : ['(none)']),
    ...(page.length ? ['', 'ALREADY ON THE PAGE (the last scene blocks — never restate the hour, the room\'s fixtures or anything here):', ...page.map((p) => `- ${p}`)] : []),
  ].join('\n');
  const t0 = Date.now();
  try {
    const res = await withTimeout(
      routedChatText(
        { caller: 'scene-builder', lane: 'judgment', campaignId, contentClass: 'fiction' },
        { system: BEING_SYSTEM, user, maxTokens: 700, temperature: 0.3 },
      ),
      opts.timeoutMs ?? SCENE_BUILD_TIMEOUT_MS,
      'being card build',
    );
    const parsed = parseJson<{ scene?: unknown; segments?: Array<{ kind?: unknown; text?: unknown }> }>(res.text);
    if (!parsed) throw new Error('no JSON in the builder\'s answer');
    const known = [heard, monologue, ...facts.lines, ...facts.names.map((n) => n.name)];
    const scene = typeof parsed.scene === 'string' ? withoutRepeatedHour(onlyDerived(parsed.scene.trim(), known), page) : '';
    let segments: BuiltBeingCard['segments'] = [];
    for (const s of parsed.segments ?? []) {
      if (typeof s.text !== 'string' || !s.text.trim()) continue;
      const kind = s.kind === 'action' || s.kind === 'thought' || s.kind === 'speech' ? s.kind : null;
      if (!kind) continue;
      const text = kind === 'speech' ? s.text.trim() : onlyDerived(s.text.trim(), known);
      if (text) segments.push({ kind, text });
    }
    segments = reattachDanglers(dropEchoedThoughts(segments));
    if (!segments.length) segments.push({ kind: 'thought', text: monologue.trim() });
    console.log(`[scene-builder] ${being.name}'s card built in ${Date.now() - t0}ms: ${segments.length} segment(s)`);
    return { scene: scene || null, segments };
  } catch (err) {
    console.warn(`[scene-builder] ${being.name}'s monologue stands as one thought (${Date.now() - t0}ms):`, err instanceof Error ? err.message : err);
    return null;
  }
}
