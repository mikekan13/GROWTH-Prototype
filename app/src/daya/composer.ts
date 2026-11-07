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
import { logTraining } from './training-log';

export type Impulse = 'speak' | 'act' | 'stay';

/** Something still going that this being knows of: a signal it can hear, or one it set off itself. */
/** Day 6 (2026-11-04): a going thing carries its state, the other party and any words, from the ledger. */
export interface GoingRef { text: string; mine: boolean; holder: string; state?: 'ringing' | 'connected' | 'received' | 'read'; other?: string; words?: string; /** the sounding thing's name, as the ledger has it */ thing?: string }

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
  /** Its own acts and words from the table's last lines this session, latest first (finding 17, 2026-11-04): it knows these. */
  did?: string[];
  /** Day 6 (2026-11-04, finding 23): what the being DOES now, chosen from the list of acts it could take — set only when impulse is act. */
  act?: string;
  /** THE TRAITS LANE (2026-11-04): its Nectars, Thorns and Blossoms as standing truths — they colour the reading, they are never news. */
  traits?: string[];
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
  /** The being's own acts and words in this session, latest first, as the table said them (finding 17, 2026-11-04). */
  did?: string[];
  /** Day 6 (2026-11-04, finding 21): the Watcher addressed this being's own moment; it owes a card — the quiet-beat rule is off. */
  prompted?: boolean;
  /** Day 6 (2026-11-04, finding 23): memories that woke in its last cards — recent thoughts, not wakes. */
  recentWakes?: string[];
  /** THE SHEET (ruling 13, 2026-11-05): what the being IS and CAN DO, as lines it is aware of — traits, its things' abilities, its spells (daya/capabilities). */
  traits?: string[];
  /** RULING 13: capabilities it could USE now (from its things, the thing it is in, its spells) — each becomes an act on its list. */
  canDo?: Array<{ name: string; via?: string }>;
  /** Finding 63 (2026-11-05): the pair for a DUE meeting (leaveForLine) — first on the list, it is what presses on the being. */
  leave?: { label: string; deed: string } | null;
  /** RULING 13: beings in view and what SHOWS of them (their outward traits — Ageless Face is what others see). */
  others?: Array<{ name: string; outward: string[] }>;
  facts: string[];
  sinceOwn?: string | null;
  /** Already perceived (the perception order was placed before the memory was stored): skip that order. */
  perceived?: string;
  /** A standing beat: the world as it stands, nothing new in it (run 3, 2026-11-03: the perception agent rewrote the standing beat as a scene, and it read as news). */
  standing?: boolean;
}

/**
 * A thing as the being would say it, not as the ledger labels it (run 3: "I can see Personal phone sitting dark"). Its own
 * things are "my …" with a leading her/his dropped; a thing elsewhere keeps its name, lowercased unless it is a proper name.
 * Derived from the name alone - no list of things. Pure.
 */
export function naturalName(name: string, mine: boolean): string {
  const bare = name.trim().replace(/^(?:the|her|his|their|a|an)\s+/i, '');
  // A capitalised word past the first is a proper name inside the label ("Chess Pizza polo"): the label stands as written.
  // Otherwise only the label's first letter was the ledger's ("Personal phone" → "personal phone").
  const properInside = /\s[A-Z][a-z]/.test(bare);
  const said = properInside ? bare : bare.charAt(0).toLowerCase() + bare.slice(1);
  return mine ? `my ${said}` : `the ${said}`;
}

export interface ComposedBeat {
  /** Joins this beat's orders and choice in the training log, and the card to the table test's verdict. */
  beatKey: string;
  perceived: string;
  felt: string;
  wakes: Array<{ text: string; why: string }>;
  plan: BeatPlan;
  record: BeatRecord;
  thought: string;
  /** Nothing reached the being, nothing is going, and it chose nothing to think about: post no card. */
  empty: boolean;
  /** FINDING 70: the words the being's own act carried (a quoted text) — the write-back sends THESE instead of composing new ones. */
  actWords?: string;
}

const NOTHING = /^nothing (new )?reach/i;

/** The perception order: what reaches the being, plain; the world's event itself when the order fails. */
export async function orderPerception(a: { envelope: string; event: string; senses: string[]; own: boolean; others?: Array<{ name: string; outward: string[] }> }, ctx: { campaignId: string; entityId: string }, overrides: DayaClientOverrides = {}): Promise<string> {
  const surroundings = a.envelope.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 14);
  const per = await placeOrder({ kind: 'perception', brief: { senses: a.senses, surroundings, event: a.event, own: a.own, ...(a.others?.length ? { others: a.others } : {}) } }, ctx, overrides);
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
  /** Day 6 (2026-11-04, finding 23: 30 stays, 1 act): the acts the being COULD take now, derived from what is going and what it holds. */
  acts?: string[];
  /** The same acts as deeds the table runs and cards ("answers the phone"), index for index. */
  deeds?: string[];
}

/**
 * THE ACTS A BEING COULD TAKE NOW, from the ledger alone (Day 6, 2026-11-04, finding 23: a phone rang thirty times in her hand and
 * "act" was never chosen — the list offered things, signals and memories, and "act" had no object). A held signal offers its own
 * answers; the one who set it off can end it; and there is always leaving things be. Pure.
 */
export function actsFor(going: GoingRef[], held: string[]): string[] {
  return actPairsFor(going, held).map((p) => p.label);
}

/** Finding 63 (2026-11-05): a due plan's pair goes FIRST on the acts (the thing pressing on them), never twice. Pure. */
export function withDuePair(pairs: Array<{ label: string; deed: string }>, leave?: { label: string; deed: string } | null): Array<{ label: string; deed: string }> {
  return leave ? [leave, ...pairs.filter((p) => p.label !== leave.label)] : pairs;
}

/** Finding 63 (2026-11-05): the place a chosen "leaves for X" deed goes to, or null. Pure. */
export function leavesForPlace(act: string | undefined | null): string | null {
  const m = /^leaves for (.+?)s*$/i.exec((act ?? '').trim());
  return m ? m[1].trim() : null;
}

/** The acts with their deeds: `label` is what the chooser reads ("answer it"); `deed` is what the table runs and cards ("answers the phone"). Pure. */
export function actPairsFor(going: GoingRef[], held: string[]): Array<{ label: string; deed: string }> {
  const out: Array<{ label: string; deed: string }> = [];
  const bare = (name?: string) => (name ?? 'phone').replace(/^(?:the|her|his|their|my|a|an)\s+/i, '').toLowerCase();
  for (const g of going) {
    const who = g.other ?? (g.mine ? g.holder : 'whoever it is');
    const thing = bare(g.thing);
    if (!g.mine) {
      if (g.state === 'connected') out.push({ label: 'hang up', deed: `hangs up the ${thing}` });
      else if (g.state === 'received') out.push({ label: 'read the message', deed: `reads the message on the ${thing}` }, { label: `write back to ${who}`, deed: `writes back to ${who} on the ${thing}` });
      else if (g.state === 'read') out.push({ label: `write back to ${who}`, deed: `writes back to ${who} on the ${thing}` }, { label: 'leave the message unanswered for now', deed: `puts the ${thing} down without answering` });
      else out.push({ label: 'answer it', deed: `answers the ${thing}` }, { label: 'decline it and let it go', deed: `declines the call and lets the ${thing} go quiet` }, { label: 'silence it and leave it', deed: `silences the ${thing} and leaves it` });
    } else {
      if (g.state === 'connected') out.push({ label: 'hang up', deed: `hangs up on ${who}` });
      else if (g.state === 'received' || g.state === 'read') out.push({ label: `write ${who} again`, deed: `writes ${who} again` });
      else out.push({ label: 'hang up', deed: `hangs up before ${who} answers` });
    }
  }
  out.push(held.length ? { label: 'put down what you are holding and go on with what you were doing', deed: 'puts down what they are holding and goes on with what they were doing' } : { label: 'go on with what you were doing', deed: 'goes on with what they were doing' });
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true))).slice(0, 6);
}

/**
 * FINDING 70 (2026-11-05, third table test): Violet chose to ACT and her card said `Type "Extra Space. In ten." and hit send before she can
 * second-guess the number.` — no offered deed matched the write-back, so no words path ran, nothing was sent, and her read message stayed
 * unanswered while the card showed a text the world never recorded. When a message is live for the being (read / received, not its own)
 * and the act (or the thought the voice wrote for it) carries a QUOTED string or the verbs type/send/text/reply/write, it IS the write-back:
 * the deed becomes the offered one and the quoted words travel with it. Pure; null when it is not a write-back.
 */
export function asWriteBack(actText: string | undefined | null, going: GoingRef[], thought?: string | null): { to: string; thing: string; deed: string; words?: string } | null {
  const target = going.find((g) => !g.mine && (g.state === 'read' || g.state === 'received'));
  const bare = (name?: string) => (name ?? 'phone').replace(/^(?:the|her|his|their|my|a|an)\s+/i, '').toLowerCase();
  const quoted = (s?: string | null): string | undefined => {
    const m = s ? /["“]([^"“”]{2,280})["”]/.exec(s) : null;
    return m?.[1].trim() || undefined;
  };
  const verbs = /\b(?:type[sd]?|typing|send(?:s|ing)?|text(?:s|ing)?|repl(?:y|ies|ying)|writ(?:e|es|ing)|tap(?:s|ping)?\s+out)\b/i;
  const act = (actText ?? '').trim();
  const offered = /^writes?\s+(?:back\s+to\s+)?(.+?)(?:\s+again|\s+on\s+the\s+.+)?\s*$/i.exec(act);
  if (offered) {
    const to = offered[1].trim();
    const thing = /\bon the (.+?)\s*$/i.exec(act)?.[1] ?? bare(target?.thing);
    const w = quoted(act) ?? (verbs.test(thought ?? '') ? quoted(thought) : undefined);
    return { to, thing, deed: act, ...(w ? { words: w } : {}) };
  }
  if (!target || !act) return null;
  // The offered signal deeds that are NOT a write-back stay what they are (a deliberate "put it down without answering").
  if (/^(?:reads the message|puts the .+ down without answering|hangs up|answers|declines|silences|puts down what|goes on with|leaves for)/i.test(act)) return null;
  const words = quoted(act) ?? (verbs.test(thought ?? '') || verbs.test(act) ? quoted(thought) : undefined);
  if (!quoted(act) && !verbs.test(act) && !(verbs.test(thought ?? '') && quoted(thought))) return null;
  const to = target.other ?? 'whoever it is';
  const thing = bare(target.thing);
  return { to, thing, deed: `writes back to ${to} on the ${thing}`, ...(words ? { words } : {}) };
}

/** The numbered lists the local model chooses from. Pure. */
export function candidateLines(c: Candidates): string[] {
  const out: string[] = [];
  c.near.forEach((n, i) => out.push(`N${i + 1}: ${n}`));
  c.going.forEach((g, i) => out.push(`G${i + 1}: ${g.text}${g.mine ? ' (you set this off)' : ''}`));
  c.remember.forEach((m, i) => out.push(`M${i + 1}: ${m.age ? `${m.age}: ` : ''}${m.text} — ${m.why}`));
  (c.acts ?? []).forEach((a, i) => out.push(`A${i + 1}: ${a}`));
  return out;
}

/** The local composer's prompt: the being whole, the pieces, a choice by number. Pure. */
export function chooserPrompt(a: { name: string; identity: string; desires: string; innerSoFar: string; sinceOwn?: string | null; did?: string[]; traits?: string[] }, perceived: string | null, felt: string, c: Candidates): string {
  const lines = candidateLines(c);
  return [
    `You are the simulation, composing one moment of ${a.name}. Your agents have done the work below; you only CHOOSE what ${a.name} is thinking about now, from the list. You write nothing.`,
    '',
    `Who ${a.name} is: ${a.identity}`,
    // THE TRAITS LANE (2026-11-04): what it IS, standing — a Thorn or a Nectar bends how a moment reads, and what it would do.
    a.traits?.length ? `What ${a.name} IS, always (its Nectars and Thorns; they colour every reading, they are never news): ${a.traits.join(' | ')}` : '',
    `What ${a.name} wants these days: ${a.desires || '(nothing named)'}`,
    `What has been going through ${a.name}'s mind: ${a.innerSoFar || '(nothing yet)'}`,
    // Finding 17 (2026-11-04): Kristopher did not know what he had just texted. Its own acts and words are its own knowledge.
    a.did?.length ? `What ${a.name} just did or said, latest first (its own; it knows these words): ${a.did.join(' | ')}` : '',
    a.sinceOwn ? `It has been ${a.sinceOwn} since ${a.name} last said or did anything.` : '',
    '',
    `WHAT JUST REACHED ${a.name.toUpperCase()}: ${perceived ?? 'nothing new'}`,
    `HOW ${a.name.toUpperCase()} FEELS: ${felt}`,
    `WHAT ${a.name.toUpperCase()} COULD BE THINKING ABOUT (N = here with them, G = still going, M = remembered, then) AND COULD DO (A):`,
    lines.length ? lines.join('\n') : '(nothing)',
    '',
    'Choose:',
    `- "about": the codes (up to 3) ${a.name} is thinking about now. Start from what just reached them, if anything did. Only codes from the list; nothing else exists for ${a.name} right now.`,
    // Table test run 2 (2026-11-03): with nothing new, Violet thought about her key ring and her shirts, card after card.
    `- When NOTHING reached ${a.name} and nothing is still going, the usual answer is nothing at all: "about": [] and no picture. A thing merely in their hands is not a thought. Choose something only when a memory or a picture truly presses on them in this quiet.`,
    `- "imagine": a picture ${a.name} holds right now of what they cannot see or know - what someone elsewhere may be doing, what may come next - one short sentence, or null. Built only from what is on the list and what reached them; it is a picture, never a thing seen or done, and it knows nothing the list does not.`,
    `- "impulse": "speak" if ${a.name} would say something now, "act" if they would do something now, "stay" if they let it sit. Something still going in their own hands asks for an answer sooner or later: a person who lets it go on and on is choosing that, and says why. A message they have READ and not answered, from someone they know, asks for an answer NOW: a player at the table writes back or decides not to — staying is choosing to leave the other waiting, and says why. A plan of theirs is DUE (a place they said they would be): a player at the table gets up and goes, or decides not to — staying is choosing to be late, and says why.`,
    `- "act": when the impulse is "act", the A code of what ${a.name} does now (required then; only codes from the list).`,
    '- "why": what holds them when they stay, or what moves them when they act, in a few words.',
    'Answer with JSON only: {"about": string[], "imagine": string|null, "impulse": "speak"|"act"|"stay", "act"?: string, "why"?: string}',
  ].filter(Boolean).join('\n');
}

const CHOICE_SCHEMA = z.object({
  about: z.array(z.string()).default([]),
  imagine: z.string().nullable().optional(),
  impulse: z.enum(['speak', 'act', 'stay']),
  act: z.string().nullable().optional(),
  why: z.string().nullable().optional(),
});
export interface Choice { about: string[]; imagine?: string; impulse: Impulse; act?: string; why?: string }

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
    const actCode = p.data.act?.trim().toUpperCase();
    const act = actCode && /^A\d+$/.test(actCode) && valid.has(actCode) ? actCode : undefined;
    // An "act" with nothing chosen to do is a stay (the table runs only an act it can name).
    const impulse = p.data.impulse === 'act' && !act ? 'stay' : p.data.impulse;
    return { about, ...(imagine ? { imagine } : {}), impulse, ...(act && impulse === 'act' ? { act } : {}), ...(p.data.why ? { why: p.data.why } : {}) };
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
  const actIdx = choice.act ? Number(choice.act.slice(1)) - 1 : -1;
  const act = actIdx >= 0 ? c.deeds?.[actIdx] ?? c.acts?.[actIdx] : undefined;
  return { perceived, felt, going: c.going, near: c.near, remember, about, ...(choice.imagine ? { imagine: choice.imagine } : {}), impulse: choice.impulse, ...(act ? { act } : {}), ...(choice.why ? { why: choice.why } : {}) };
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
    r.act ? `does: ${r.act}` : '',
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
  const t0 = Date.now();
  const beatKey = `${a.entityId}:${t0}`;
  const ctx = { campaignId: a.campaignId, entityId: a.entityId, beatKey };
  const self = await standingSelfOf(a.entityId, a.name, a.identity, overrides);
  const perceivedRaw = a.perceived ?? (await orderPerception({ envelope: a.envelope, event: a.event, senses: a.senses, own: a.own }, ctx, overrides));
  // Day 6 (2026-11-04, finding 21): a Watcher line about the being's own moment ("Violet realizes… Time to decide") is a prompt —
  // what reached it is the Watcher's words, never "nothing new"; it owes a card.
  // A WATCHER LINE THROUGH THE BEING IS A BEAT (finding 45, 2026-11-05: "Violet looks at the message a moment longer" → "quiet beat, nothing
  // woke — no beat"): its own doing, as told to it, is what reached it — never a quiet beat.
  const moved = a.prompted || a.own;
  // 2026-11-06 (session 5 cross-wire): the perception order rewrote ANOTHER being's act from this being's viewpoint and made it the actor —
  // Violet "heard" "I take the work phone out of my pocket" (Kristopher's deed) and Kristopher "heard" "I type 'Yes please.' and hit send"
  // (Violet's). What reached a being about someone else is never in the first person: fall back to the event as narrated.
  // 2026-11-07: "I hear him say…" is the being's own sensing and stands; a sentence where the being DOES someone else's deed is the leak.
  const firstPersonLeak = !a.own && takesOverTheDeed(perceivedRaw);
  if (firstPersonLeak) console.warn(`[composer] perception came back in the first person for someone else's deed — kept the event as told: ${perceivedRaw.slice(0, 100)}`);
  const perceivedSafe = firstPersonLeak ? a.event : perceivedRaw;
  const perceived = a.standing || (!moved && NOTHING.test(perceivedSafe.trim())) ? null : (moved && NOTHING.test(perceivedSafe.trim()) ? a.event : perceivedSafe);
  const fragments = a.memories.slice(0, 8).map((m, i) => ({ i, text: m.text, ...(m.age ? { age: m.age } : {}) }));
  const going = (a.going ?? []).slice(0, 4);
  // A QUIET BEAT (run 2, 2026-11-03: every quiet beat cost three cloud orders and a local choice, ~20 s, to think about a key ring).
  // Nothing reached the being and nothing is going: only recall is asked. If no memory wakes, the beat is empty and nothing else is called.
  const quiet = perceived === null && going.length === 0 && !a.leave;
  const recOnly = quiet && fragments.length ? await placeOrder({ kind: 'recall', brief: { cue: 'Nothing new; the moment goes on in quiet.', fragments, recent: a.recent } }, ctx, overrides) : null;
  if (quiet && !(recOnly?.wakes ?? []).some((w) => fragments[w.i] && fragments[w.i].age)) {
    console.log(`[composer] ${a.name}: quiet beat, nothing woke — no beat (${Date.now() - t0}ms)`);
    const record: BeatRecord = { perceived: null, felt: a.feltBefore, going: [], near: a.held.map((h) => naturalName(h, true)), remember: [], about: [], impulse: 'stay' };
    return { beatKey, perceived: perceivedRaw, felt: a.feltBefore, wakes: [], plan: { gist: recordGist(record), impulse: 'stay' }, record, thought: '', empty: true };
  }
  // Day 5 (2026-11-04): the mood order runs BESIDE the local choice, not before it (~3 s a beat). The chooser reads how the being
  // felt a moment ago; the voice gets the fresh mood, which is ready by then.
  const moodP = placeOrder({ kind: 'mood', brief: { felt: a.feltBefore, perceived: perceived ?? 'Nothing new reaches you.', temperament: self } }, ctx, overrides);
  const rec = recOnly ? recOnly : fragments.length ? await placeOrder({ kind: 'recall', brief: { cue: perceived ?? 'Nothing new; the moment goes on.', fragments, recent: a.recent } }, ctx, overrides) : null;
  const feltBefore = a.feltBefore;
  // THE REPLAY, again (run 2): recall surfaced the perception just stored ("Your phone chimes once") as a memory that woke. A fragment
  // with no age that reads like what just reached the being is the moment itself, not a memory.
  const isNow = (f: { text: string; age?: string }) => !f.age && !!perceived && (f.text.includes(perceived.slice(0, 40)) || perceived.includes(f.text.slice(0, 40)));
  // Day 6 (2026-11-04, finding 23): a memory that woke in the being's last cards is a recent thought, not a wake (Rosemary on the
  // porch steps, six cards of seven).
  const recentWake = (f: { text: string }) => (a.recentWakes ?? []).some((w) => w.slice(0, 60) === f.text.slice(0, 60));
  const wakes = (rec?.wakes ?? []).filter((w) => fragments[w.i] && !isNow(fragments[w.i]) && !recentWake(fragments[w.i])).slice(0, 3).map((w) => ({ text: fragments[w.i].text, ...(fragments[w.i].age ? { age: fragments[w.i].age } : {}), why: w.why }));
  // RULING 13 (2026-11-05): what the being CAN DO with its things, the thing it is in, its spells — on the list beside the signal acts.
  const bareVia = (v?: string) => (v ?? '').replace(/^(?:the|her|his|their|my|a|an)\s+/i, '').toLowerCase();
  const capPairs = (a.canDo ?? []).slice(0, 6).map((cd) => ({ label: `use ${cd.name}${cd.via ? ` (${bareVia(cd.via)})` : ''}`, deed: `uses ${cd.name}${cd.via ? ` with the ${bareVia(cd.via)}` : ''}` }));
  const pairs = withDuePair([...actPairsFor(going, a.held), ...capPairs], a.leave);
  const candidates: Candidates = { near: [...a.held.map((h) => naturalName(h, true)), ...(a.near ?? []).map((n) => naturalName(n, false))].slice(0, 12), going, remember: wakes, acts: pairs.map((p) => p.label), deeds: pairs.map((p) => p.deed) };
  const tPieces = Date.now();

  let choice: Choice | null = null;
  try {
    const prompt = chooserPrompt({ ...a, identity: self }, perceived, feltBefore, candidates);
    const raw = (await chat({ tier: 'L1', subsystem: 'composer', contentClass: 'fiction', entityId: a.entityId, campaignId: a.campaignId, messages: [{ role: 'system', content: prompt }], maxTokens: 160, temperature: 0.3 }, overrides)).text;
    choice = parseChoice(raw, candidates);
    if (!choice) console.warn(`[composer] ${a.name}: the local choice did not parse: ${raw.slice(0, 160)}`);
    // THE TRAINING LOG (2026-11-03): the chooser's pair — the one the local model will be taught on.
    logTraining({ kind: 'choice', campaignId: a.campaignId, entityId: a.entityId, beatKey, by: 'L1', input: { prompt, perceived, felt: feltBefore, candidates }, output: { raw, choice }, ms: Date.now() - tPieces });
  } catch (err) {
    console.warn(`[composer] ${a.name}: local choice failed:`, err instanceof Error ? err.message : err);
  }
  if (!choice) return null;
  const felt = (await moodP)?.felt?.trim() || a.feltBefore;
  const record = resolveRecord(choice, perceived, felt, candidates);
  if (a.traits?.length) record.traits = a.traits;
  if (a.did?.length) record.did = a.did.slice(0, 4);
  const plan: BeatPlan = { gist: recordGist(record), impulse: record.impulse, ...(record.why ? { why: record.why } : {}) };
  const tPlan = Date.now();
  const wakesOut = record.remember.map((m) => ({ text: `${m.age ? `${m.age}: ` : ''}${m.text}`, why: m.why }));

  if (recordIsEmpty(record)) {
    console.log(`[composer] ${a.name}: nothing reached, nothing going, nothing chosen — no beat (pieces ${tPieces - t0}ms · choice ${tPlan - tPieces}ms)`);
    return { beatKey, perceived: perceivedRaw, felt, wakes: wakesOut, plan, record, thought: '', empty: true };
  }

  // A VOICE, NOT A FORMULA (session 2 live, 2026-11-03: card after card of Violet's opened "I think I …").
  const avoidOpenings = [...new Set(a.recent.map(openingOf).filter(Boolean))];
  let voiced = await placeOrder({ kind: 'voice', brief: { record, voice: a.voice, recent: a.recent, avoidOpenings } }, ctx, overrides);
  if (voiced?.thought && avoidOpenings.includes(openingOf(voiced.thought))) {
    console.log(`[composer] ${a.name}: the voice opened like a recent thought ("${openingOf(voiced.thought)}") - once more`);
    voiced = (await placeOrder({ kind: 'voice', brief: { record, voice: a.voice, recent: a.recent, avoidOpenings: [...avoidOpenings, openingOf(voiced.thought)] } }, ctx, overrides)) ?? voiced;
  }
  const thought = voiced?.thought?.trim() || '';
  // FINDING 70: a free act on a live read/received message is the write-back; its quoted words ride along (the table composes only when there are none).
  let actWords: string | undefined;
  if (record.impulse === 'act') {
    const wb = asWriteBack(record.act, going, thought);
    if (wb) {
      if (wb.deed !== record.act) console.log(`[composer] ${a.name}: act "${(record.act ?? '').slice(0, 80)}" is the write-back — normalised to "${wb.deed}"${wb.words ? ' with its own words' : ''}`);
      record.act = wb.deed;
      actWords = wb.words;
    }
  }
  console.log(`[composer] ${a.name}: pieces ${tPieces - t0}ms · choice ${tPlan - tPieces}ms · voice ${Date.now() - tPlan}ms · impulse ${record.impulse}`);
  // THE PIECES ON THE RECORD (table test, 2026-11-03): each piece, cut short, so a run can be read from the log alone.
  const cut = (s: string, n = 160) => s.replace(/\s+/g, ' ').slice(0, n);
  console.log(`[composer] ${a.name} pieces · perceived: ${cut(perceivedRaw)} · felt: ${cut(felt, 100)} · going: ${record.going.map((g) => cut(g.text, 60)).join(' | ') || '(none)'} · near: ${record.near.slice(0, 6).join(' | ') || '(none)'} · wakes: ${wakesOut.map((w) => cut(w.text, 60)).join(' | ') || '(none)'}`);
  console.log(`[composer] ${a.name} record · ${cut(plan.gist, 220)} · thought: ${cut(thought)}`);
  return { beatKey, perceived: perceivedRaw, felt, wakes: wakesOut, plan, record, thought, empty: false, ...(actWords ? { actWords } : {}) };
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

/** The being's own senses and stance — "I hear…", "I see…": a first-person sentence led by one of these is perception, not a deed. */
const SENSING = /^(?:hear|heard|see|saw|watch|watched|notice|noticed|feel|felt|smell|smelled|taste|tasted|catch|caught|sense|sensed|can|cannot|can't|could|couldn't|don't|do|am|was|'m|think|thought|wonder|know|knew|realize|realise|look|looked|glance|glanced|listen|listened|register)$/i;
const OTHER = /\b(?:he|she|they|him|her|them|his|hers|their|someone|somebody)\b|(?:^|\s)[A-Z][a-z]{2,}/;

/**
 * 2026-11-07 (session 5 cross-wire, session 6 perspective flips): does a perception of SOMEONE ELSE's doing put the being in the
 * actor's place? A sentence (quotes aside) that opens on I/My with a verb that is not sensing, and names no one else, is the being
 * doing the other's deed ("I type 'Yes please' and hit send"). Pure.
 */
export function takesOverTheDeed(text: string): boolean {
  const plain = text.replace(/"[^"]*"|“[^”]*”/g, '""');
  for (const sentence of plain.split(/(?<=[.!?…])\s+/)) {
    const m = /^\s*(?:I|My)\b(?:'m|'ve|'ll|'d)?\s+(\S+)/.exec(sentence);
    if (!m) continue;
    const verb = m[1].replace(/[^A-Za-z']/g, '');
    if (SENSING.test(verb)) continue;
    if (OTHER.test(sentence.replace(/^\s*(?:I|My)\b/, ''))) continue;
    return true;
  }
  return false;
}
