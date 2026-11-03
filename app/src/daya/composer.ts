/**
 * THE COMPOSER — the local simulation assembling one being's moment from the pieces its agents returned
 * (SIMULATION-COMPOSER-DESIGN-2026-11-03; GROUNDED-BEATS-PLAN-2026-11-03 §3).
 *
 * The local model never does the heavy cognition here. It places ORDERS (daya/orders.ts) — perception, mood, recall, voice —
 * each a narrow, nameless cloud call carrying only what this being can know. Since the grounded-beats ruling (Michael
 * 2026-11-03: "only what they can reference") the composer does not write either: it CHOOSES. The beat is a RECORD of
 * resolved references — what reached the being, how it feels, what is still going, what is near it, which memories woke
 * (with their ages), what it pictures — and the local plan picks, by number, which of those the being is thinking about now.
 * A reference that is not on the list cannot be chosen; nothing enters the record that the ledger did not offer. The voice
 * agent renders the record and nothing else. The composer has the final say on what goes on the page.
 *
 * Flow per beat:  perception order → (mood order ∥ recall order) → candidates (code) → LOCAL choice → the record → voice order.
 * Every piece has a fallback, so a failed order thins the beat instead of breaking it. An EMPTY record (nothing reached the
 * being, nothing going, nothing chosen) is no beat at all: the caller posts no card.
 */
import { z } from 'zod';
import { chat, type DayaClientOverrides } from './model-client';
import { placeOrder, type Piece } from './orders';

export type Impulse = 'speak' | 'act' | 'stay';

/** Something still going that this being knows of: a signal it can hear, or one it set off itself. */
export interface GoingRef { text: string; mine: boolean; holder: string }

/** THE BEAT RECORD — every field is a resolved reference; the voice may say nothing outside it. */
export interface BeatRecord {
  /** What just reached the being, as the perception agent judged it; null when nothing new did. */
  perceived: string | null;
  felt: string;
  going: GoingRef[];
  /** Things in its hands or its room, and people in view: the only things it may place "here". */
  near: string[];
  /** Memories that woke, with their age and what they mean now — THEN, never now. */
  remember: Array<{ text: string; age?: string; why: string }>;
  /** What the being is thinking about: entries of near / going / remember, as the composer chose them. */
  about: string[];
  /** A picture of what has not happened (ruling 2, 2026-11-03): allowed, marked, voiced as imagined. */
  imagine?: string;
  impulse: Impulse;
  why?: string;
}

export interface BeatPlan { gist: string; impulse: Impulse; why?: string }

export interface ComposeArgs {
  campaignId: string;
  entityId: string;
  name: string;
  /** Who the being is NOW, a few sentences (the standing self, ruling 3). The chronology is memory, not prompt. */
  identity: string;
  voice: string;
  desires: string;
  feltBefore: string;
  envelope: string;
  event: string;
  senses: string[];
  own: boolean;
  /** Memory candidates the local recall scored for this cue. */
  memories: Array<{ text: string; age?: string }>;
  innerSoFar: string;
  recent: string[];
  /** Things in its hands (names, as the ledger has them). */
  held: string[];
  /** Things in its room not in anyone's hands, and people in view. */
  near?: string[];
  going?: GoingRef[];
  facts: string[];
  sinceOwn?: string | null;
  /** Already perceived (the perception order was placed before the memory was stored): skip that order. */
  perceived?: string;
}

export interface ComposedBeat {
  perceived: string;
  felt: string;
  wakes: Array<{ text: string; why: string }>;
  plan: BeatPlan;
  record: BeatRecord;
  thought: string;
  /** Nothing reached the being, nothing is going, and it chose nothing to think about: post no card. */
  empty: boolean;
}

const NOTHING = /^nothing (new )?reach/i;

/** The perception order: what reaches the being, plain; the world's event itself when the order fails. */
export async function orderPerception(a: { envelope: string; event: string; senses: string[]; own: boolean }, ctx: { campaignId: string; entityId: string }, overrides: DayaClientOverrides = {}): Promise<string> {
  const surroundings = a.envelope.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 14);
  const per = await placeOrder({ kind: 'perception', brief: { senses: a.senses, surroundings, event: a.event, own: a.own } }, ctx, overrides);
  if (per?.nothing) return 'Nothing new reaches you.';
  return per?.reaches?.trim() || a.event;
}

// ── The standing self ───────────────────────────────────────────────────────

const standingSelves = new Map<string, { from: string; self: string }>();

/**
 * THE STANDING SELF (ruling 3, Michael 2026-11-03): who the being is NOW, a few sentences, derived once from its identity
 * narrative by the local model and kept. The chronology (4,000 characters, every name in its life) stops riding in every
 * prompt: it is memory, and only recall wakes it. Falls back to the first paragraph of the narrative when the call fails.
 */
export async function standingSelfOf(entityId: string, name: string, identity: string, overrides: DayaClientOverrides = {}): Promise<string> {
  const hit = standingSelves.get(entityId);
  if (hit && hit.from === identity) return hit.self;
  const fallback = identity.split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/).slice(0, 3).join(' ').slice(0, 500);
  if (identity.length < 600) return identity;
  let self = fallback;
  try {
    const prompt = [
      `From the account below, write who ${name} is NOW, as a few plain sentences (3 to 5): age and where they live, what they do with their days, how they carry themselves, what weighs on them these days.`,
      'No other person\'s name. No dates. No events: nothing that happened, only who this is. Plain words, no metaphors. Answer with the sentences only.',
      '',
      identity,
    ].join('\n');
    const raw = (await chat({ tier: 'L1', subsystem: 'composer', contentClass: 'fiction', entityId, messages: [{ role: 'system', content: prompt }], maxTokens: 220, temperature: 0.2 }, overrides)).text.trim();
    if (raw.length > 40) self = raw.replace(/\s+/g, ' ').slice(0, 700);
  } catch (err) {
    console.warn(`[composer] ${name}: standing self failed, using the narrative's head:`, err instanceof Error ? err.message : err);
  }
  standingSelves.set(entityId, { from: identity, self });
  console.log(`[composer] ${name}: standing self derived (${self.length} chars)`);
  return self;
}

// ── Candidates and the choice ───────────────────────────────────────────────

export interface Candidates {
  near: string[];
  going: GoingRef[];
  remember: Array<{ text: string; age?: string; why: string }>;
}

/** The numbered lists the local model chooses from. Pure. */
export function candidateLines(c: Candidates): string[] {
  const out: string[] = [];
  c.near.forEach((n, i) => out.push(`N${i + 1}: ${n}`));
  c.going.forEach((g, i) => out.push(`G${i + 1}: ${g.text}${g.mine ? ' (you set this off)' : ''}`));
  c.remember.forEach((m, i) => out.push(`M${i + 1}: ${m.age ? `${m.age}: ` : ''}${m.text} — ${m.why}`));
  return out;
}

/** The local composer's prompt: the being whole, the pieces, a choice by number. Pure. */
export function chooserPrompt(a: { name: string; identity: string; desires: string; innerSoFar: string; sinceOwn?: string | null }, perceived: string | null, felt: string, c: Candidates): string {
  const lines = candidateLines(c);
  return [
    `You are the simulation, composing one moment of ${a.name}. Your agents have done the work below; you only CHOOSE what ${a.name} is thinking about now, from the list. You write nothing.`,
    '',
    `Who ${a.name} is: ${a.identity}`,
    `What ${a.name} wants these days: ${a.desires || '(nothing named)'}`,
    `What has been going through ${a.name}'s mind: ${a.innerSoFar || '(nothing yet)'}`,
    a.sinceOwn ? `It has been ${a.sinceOwn} since ${a.name} last said or did anything.` : '',
    '',
    `WHAT JUST REACHED ${a.name.toUpperCase()}: ${perceived ?? 'nothing new'}`,
    `HOW ${a.name.toUpperCase()} FEELS: ${felt}`,
    `WHAT ${a.name.toUpperCase()} COULD BE THINKING ABOUT (N = here with them, G = still going, M = remembered, then):`,
    lines.length ? lines.join('\n') : '(nothing)',
    '',
    'Choose:',
    `- "about": the codes (up to 3) ${a.name} is thinking about now. Start from what just reached them, if anything did. Only codes from the list; nothing else exists for ${a.name} right now.`,
    // Table test run 2 (2026-11-03): with nothing new, Violet thought about her key ring and her shirts, card after card.
    `- When NOTHING reached ${a.name} and nothing is still going, the usual answer is nothing at all: "about": [] and no picture. A thing merely in their hands is not a thought. Choose something only when a memory or a picture truly presses on them in this quiet.`,
    `- "imagine": a picture of what has NOT happened that ${a.name} holds right now, one short sentence, or null. Built only from what is on the list and what reached them; it is a picture, never a thing done, and it knows nothing the list does not.`,
    `- "impulse": "speak" if ${a.name} would say something now, "act" if they would do something now, "stay" if they let it sit.`,
    '- "why": when staying, what holds them, in a few words.',
    'Answer with JSON only: {"about": string[], "imagine": string|null, "impulse": "speak"|"act"|"stay", "why"?: string}',
  ].filter(Boolean).join('\n');
}

const CHOICE_SCHEMA = z.object({
  about: z.array(z.string()).default([]),
  imagine: z.string().nullable().optional(),
  impulse: z.enum(['speak', 'act', 'stay']),
  why: z.string().nullable().optional(),
});
export interface Choice { about: string[]; imagine?: string; impulse: Impulse; why?: string }

/** The choice out of the local answer, with every code resolved against the candidates; null when it does not parse. Pure. */
export function parseChoice(text: string, c: Candidates): Choice | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = CHOICE_SCHEMA.safeParse(JSON.parse(m[0]));
    if (!p.success) return null;
    const valid = new Set(candidateLines(c).map((l) => l.split(':')[0]));
    const about = [...new Set(p.data.about.map((x) => x.trim().toUpperCase()).filter((x) => valid.has(x)))].slice(0, 3);
    const imagine = p.data.imagine?.trim();
    return { about, ...(imagine ? { imagine } : {}), impulse: p.data.impulse, ...(p.data.why ? { why: p.data.why } : {}) };
  } catch {
    return null;
  }
}

/** The record from the choice: codes become the things they name. Pure. */
export function resolveRecord(choice: Choice, perceived: string | null, felt: string, c: Candidates): BeatRecord {
  const about = choice.about.map((code) => {
    const n = Number(code.slice(1)) - 1;
    if (code.startsWith('N')) return c.near[n];
    if (code.startsWith('G')) return c.going[n]?.text;
    if (code.startsWith('M')) return c.remember[n]?.text;
    return undefined;
  }).filter((x): x is string => !!x);
  const remember = choice.about.filter((x) => x.startsWith('M')).map((x) => c.remember[Number(x.slice(1)) - 1]).filter(Boolean);
  return { perceived, felt, going: c.going, near: c.near, remember, about, ...(choice.imagine ? { imagine: choice.imagine } : {}), impulse: choice.impulse, ...(choice.why ? { why: choice.why } : {}) };
}

/** A record with nothing in it is no beat. Pure. */
export function recordIsEmpty(r: BeatRecord): boolean {
  return r.perceived === null && r.going.length === 0 && r.about.length === 0 && !r.imagine;
}

/** The record in a line, for the row and the log. Pure. */
export function recordGist(r: BeatRecord): string {
  const parts = [
    r.perceived ? `reached: ${r.perceived}` : 'nothing new',
    r.going.length ? `going: ${r.going.map((g) => g.text).join('; ')}` : '',
    r.about.length ? `about: ${r.about.join('; ')}` : 'about nothing in particular',
    r.imagine ? `pictures: ${r.imagine}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

// ── The beat ────────────────────────────────────────────────────────────────

/**
 * One being's moment, composed. Places the orders, builds the candidates, chooses locally, voices the record. Returns null
 * only when the local choice fails (the caller then keeps the being's earlier state); a failed order falls back to what the
 * composer already has. `empty` is true when there is nothing to think: the caller posts no card.
 */
export async function composeBeat(a: ComposeArgs, overrides: DayaClientOverrides = {}): Promise<ComposedBeat | null> {
  const ctx = { campaignId: a.campaignId, entityId: a.entityId };
  const t0 = Date.now();
  const self = await standingSelfOf(a.entityId, a.name, a.identity, overrides);
  const perceivedRaw = a.perceived ?? (await orderPerception({ envelope: a.envelope, event: a.event, senses: a.senses, own: a.own }, ctx, overrides));
  const perceived = NOTHING.test(perceivedRaw.trim()) ? null : perceivedRaw;
  const fragments = a.memories.slice(0, 8).map((m, i) => ({ i, text: m.text, ...(m.age ? { age: m.age } : {}) }));
  const going = (a.going ?? []).slice(0, 4);
  // A QUIET BEAT (run 2, 2026-11-03: every quiet beat cost three cloud orders and a local choice, ~20 s, to think about a key ring).
  // Nothing reached the being and nothing is going: only recall is asked. If no memory wakes, the beat is empty and nothing else is called.
  const quiet = perceived === null && going.length === 0;
  const recOnly = quiet && fragments.length ? await placeOrder({ kind: 'recall', brief: { cue: 'Nothing new; the moment goes on in quiet.', fragments, recent: a.recent } }, ctx, overrides) : null;
  if (quiet && !(recOnly?.wakes ?? []).some((w) => fragments[w.i] && fragments[w.i].age)) {
    console.log(`[composer] ${a.name}: quiet beat, nothing woke — no beat (${Date.now() - t0}ms)`);
    const record: BeatRecord = { perceived: null, felt: a.feltBefore, going: [], near: a.held, remember: [], about: [], impulse: 'stay' };
    return { perceived: perceivedRaw, felt: a.feltBefore, wakes: [], plan: { gist: recordGist(record), impulse: 'stay' }, record, thought: '', empty: true };
  }
  const [mood, rec] = await Promise.all([
    placeOrder({ kind: 'mood', brief: { felt: a.feltBefore, perceived: perceived ?? 'Nothing new reaches you.', temperament: self } }, ctx, overrides),
    recOnly ? Promise.resolve(recOnly) : fragments.length ? placeOrder({ kind: 'recall', brief: { cue: perceived ?? 'Nothing new; the moment goes on.', fragments, recent: a.recent } }, ctx, overrides) : Promise.resolve(null as Piece<'recall'> | null),
  ]);
  const felt = mood?.felt?.trim() || a.feltBefore;
  // THE REPLAY, again (run 2): recall surfaced the perception just stored ("Your phone chimes once") as a memory that woke. A fragment
  // with no age that reads like what just reached the being is the moment itself, not a memory.
  const isNow = (f: { text: string; age?: string }) => !f.age && !!perceived && (f.text.includes(perceived.slice(0, 40)) || perceived.includes(f.text.slice(0, 40)));
  const wakes = (rec?.wakes ?? []).filter((w) => fragments[w.i] && !isNow(fragments[w.i])).slice(0, 3).map((w) => ({ text: fragments[w.i].text, ...(fragments[w.i].age ? { age: fragments[w.i].age } : {}), why: w.why }));
  const candidates: Candidates = { near: [...a.held, ...(a.near ?? [])].slice(0, 12), going, remember: wakes };
  const tPieces = Date.now();

  let choice: Choice | null = null;
  try {
    const prompt = chooserPrompt({ ...a, identity: self }, perceived, felt, candidates);
    const raw = (await chat({ tier: 'L1', subsystem: 'composer', contentClass: 'fiction', entityId: a.entityId, campaignId: a.campaignId, messages: [{ role: 'system', content: prompt }], maxTokens: 160, temperature: 0.3 }, overrides)).text;
    choice = parseChoice(raw, candidates);
    if (!choice) console.warn(`[composer] ${a.name}: the local choice did not parse: ${raw.slice(0, 160)}`);
  } catch (err) {
    console.warn(`[composer] ${a.name}: local choice failed:`, err instanceof Error ? err.message : err);
  }
  if (!choice) return null;
  const record = resolveRecord(choice, perceived, felt, candidates);
  const plan: BeatPlan = { gist: recordGist(record), impulse: record.impulse, ...(record.why ? { why: record.why } : {}) };
  const tPlan = Date.now();
  const wakesOut = record.remember.map((m) => ({ text: `${m.age ? `${m.age}: ` : ''}${m.text}`, why: m.why }));

  if (recordIsEmpty(record)) {
    console.log(`[composer] ${a.name}: nothing reached, nothing going, nothing chosen — no beat (pieces ${tPieces - t0}ms · choice ${tPlan - tPieces}ms)`);
    return { perceived: perceivedRaw, felt, wakes: wakesOut, plan, record, thought: '', empty: true };
  }

  // A VOICE, NOT A FORMULA (session 2 live, 2026-11-03: card after card of Violet's opened "I think I …").
  const avoidOpenings = [...new Set(a.recent.map(openingOf).filter(Boolean))];
  let voiced = await placeOrder({ kind: 'voice', brief: { record, voice: a.voice, recent: a.recent, avoidOpenings } }, ctx, overrides);
  if (voiced?.thought && avoidOpenings.includes(openingOf(voiced.thought))) {
    console.log(`[composer] ${a.name}: the voice opened like a recent thought ("${openingOf(voiced.thought)}") - once more`);
    voiced = (await placeOrder({ kind: 'voice', brief: { record, voice: a.voice, recent: a.recent, avoidOpenings: [...avoidOpenings, openingOf(voiced.thought)] } }, ctx, overrides)) ?? voiced;
  }
  const thought = voiced?.thought?.trim() || '';
  console.log(`[composer] ${a.name}: pieces ${tPieces - t0}ms · choice ${tPlan - tPieces}ms · voice ${Date.now() - tPlan}ms · impulse ${record.impulse}`);
  // THE PIECES ON THE RECORD (table test, 2026-11-03): each piece, cut short, so a run can be read from the log alone.
  const cut = (s: string, n = 160) => s.replace(/\s+/g, ' ').slice(0, n);
  console.log(`[composer] ${a.name} pieces · perceived: ${cut(perceivedRaw)} · felt: ${cut(felt, 100)} · going: ${record.going.map((g) => cut(g.text, 60)).join(' | ') || '(none)'} · near: ${record.near.slice(0, 6).join(' | ') || '(none)'} · wakes: ${wakesOut.map((w) => cut(w.text, 60)).join(' | ') || '(none)'}`);
  console.log(`[composer] ${a.name} record · ${cut(plan.gist, 220)} · thought: ${cut(thought)}`);
  return { perceived: perceivedRaw, felt, wakes: wakesOut, plan, record, thought, empty: false };
}

/**
 * ROLLOUT GUARD — not a feature and not a setting. On by default: beings are composed from orders. BEING_COMPOSER=off
 * returns to the single listening monologue (the shape the design replaces). Delete with the old path once the composer
 * has carried a live session.
 */
export function composerOn(): boolean {
  return process.env.BEING_COMPOSER !== 'off';
}

/** The first three words of a thought, lowercased and bare ("i think i"), the unit a formula repeats. Pure. */
export function openingOf(text: string): string {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).slice(0, 3).join(' ');
}
