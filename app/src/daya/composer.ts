/**
 * THE COMPOSER — the local simulation assembling one being's moment from the pieces its agents returned
 * (SIMULATION-COMPOSER-DESIGN-2026-11-03).
 *
 * The local model never does the heavy cognition here. It places ORDERS (daya/orders.ts) — perception, mood, recall,
 * voice — each a narrow, nameless cloud call carrying only what this being can know, and it holds the pieces together:
 * it decides, in a short structured plan, what goes through the being now (the gist), whether it would break in, and why.
 * The voice agent then gives the gist the being's own voice. The composer has the final say on what goes on the page.
 *
 * Flow per beat:  perception order → (mood order ∥ recall order) → LOCAL plan → voice order → the thought.
 * Every piece has a fallback, so a failed order thins the beat instead of breaking it.
 */
import { z } from 'zod';
import { chat, type DayaClientOverrides } from './model-client';
import { placeOrder, type Piece } from './orders';

export interface BeatPlan {
  /** What goes through the being now: plain first-person notes, about what is new and what it means to it. */
  gist: string;
  impulse: 'speak' | 'act' | 'stay';
  /** What holds it, in a few words, when it stays. */
  why?: string;
}

const PLAN_SCHEMA = z.object({
  gist: z.string(),
  impulse: z.enum(['speak', 'act', 'stay']),
  why: z.string().optional().nullable(),
});

export interface ComposeArgs {
  campaignId: string;
  entityId: string;
  name: string;
  identity: string;
  voice: string;
  desires: string;
  /** How it felt a moment ago (the last felt brief). */
  feltBefore: string;
  /** The world's truth this beat, as the perception envelope gives it (place + what happened). */
  envelope: string;
  event: string;
  senses: string[];
  own: boolean;
  /** Memory candidates the local recall scored for this cue. */
  memories: Array<{ text: string; age?: string }>;
  /** What has been going through its mind (its recent thoughts). */
  innerSoFar: string;
  recent: string[];
  held: string[];
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
  thought: string;
}

/** The perception order: what reaches the being, plain; the world's event itself when the order fails. */
export async function orderPerception(a: { envelope: string; event: string; senses: string[]; own: boolean }, ctx: { campaignId: string; entityId: string }, overrides: DayaClientOverrides = {}): Promise<string> {
  const surroundings = a.envelope.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 14);
  const per = await placeOrder({ kind: 'perception', brief: { senses: a.senses, surroundings, event: a.event, own: a.own } }, ctx, overrides);
  if (per?.nothing) return 'Nothing new reaches you.';
  return per?.reaches?.trim() || a.event;
}

/** The local composer's prompt: the being whole, the pieces, a structured answer. Pure. */
export function composerPrompt(a: Omit<ComposeArgs, 'campaignId' | 'entityId' | 'envelope' | 'event' | 'senses' | 'own' | 'memories' | 'feltBefore' | 'voice' | 'recent'>, pieces: { perceived: string; felt: string; wakes: Array<{ text: string; why: string }> }): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (none)');
  return [
    `You are the simulation, composing one moment of ${a.name}. Your agents have done the work below; you hold the pieces together and decide what goes through ${a.name} now.`,
    '',
    `Who ${a.name} is: ${a.identity}`,
    `What ${a.name} wants these days: ${a.desires || '(nothing named)'}`,
    `What ${a.name} has on them:\n${list(a.held)}`,
    `What the world holds true here:\n${list(a.facts)}`,
    '',
    `PERCEPTION (what just reached ${a.name}): ${pieces.perceived}`,
    `MOOD (how ${a.name} feels now): ${pieces.felt}`,
    `MEMORY (what woke, and what it means now):\n${list(pieces.wakes.map((w) => `${w.text} — ${w.why}`))}`,
    `What has been going through ${a.name}'s mind: ${a.innerSoFar || '(nothing yet)'}`,
    a.sinceOwn ? `It has been ${a.sinceOwn} since ${a.name} last said or did anything.` : '',
    '',
    'Decide:',
    `- "gist": what goes through ${a.name} now, as plain first-person notes, 1 to 3 short sentences. Start from what is NEW in the perception and what it means to ${a.name} — the people, days and things of their own life. Only what the pieces and facts give; what ${a.name} does not know, they do not know. Thought only: no deed and no words said aloud.`,
    // Composer replay 2 (2026-11-03): the plan had Kristopher "already left a voicemail" and "went inside and the pizza is fine" — he was in his car the whole time.
    // Session 2 live (2026-11-03): with the phone still ringing, Kristopher's plan had "she didn't pick up".
    `- Something still going (a ringing, a knocking, a voice) is still going: ${a.name} never thinks it has ended or gone unanswered for good unless the perception says it stopped.`,
    `- The gist lives in THIS moment. Nothing happens in it that has not happened in the perception, the facts or a memory: ${a.name} has not gone anywhere, done anything, received anything or been told anything unless one of those says so. Where they are is where the facts put them. A wish or a plan is said as one ("I should go in"), never as done.`,
    `- "impulse": "speak" if ${a.name} would say something now, "act" if they would do something now, "stay" if they let it sit.`,
    '- "why": when staying, what holds them, in a few words.',
    'Answer with JSON only: {"gist": string, "impulse": "speak"|"act"|"stay", "why"?: string}',
  ].filter(Boolean).join('\n');
}

/** The plan out of the local answer; null when it does not parse. Pure. */
export function parsePlan(text: string): BeatPlan | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = PLAN_SCHEMA.safeParse(JSON.parse(m[0]));
    if (!p.success || !p.data.gist.trim()) return null;
    return { gist: p.data.gist.trim(), impulse: p.data.impulse, ...(p.data.why ? { why: p.data.why } : {}) };
  } catch {
    return null;
  }
}

/**
 * One being's moment, composed. Places the orders, composes locally, voices the gist. Returns null only when the local
 * plan fails (the caller then keeps the being's earlier state); a failed order falls back to what the composer already has.
 */
export async function composeBeat(a: ComposeArgs, overrides: DayaClientOverrides = {}): Promise<ComposedBeat | null> {
  const ctx = { campaignId: a.campaignId, entityId: a.entityId };
  const t0 = Date.now();
  const perceived = a.perceived ?? (await orderPerception({ envelope: a.envelope, event: a.event, senses: a.senses, own: a.own }, ctx, overrides));
  const fragments = a.memories.slice(0, 8).map((m, i) => ({ i, text: m.text, ...(m.age ? { age: m.age } : {}) }));
  const [mood, rec] = await Promise.all([
    placeOrder({ kind: 'mood', brief: { felt: a.feltBefore, perceived, temperament: a.identity.slice(0, 400) } }, ctx, overrides),
    fragments.length ? placeOrder({ kind: 'recall', brief: { cue: perceived, fragments, recent: a.recent } }, ctx, overrides) : Promise.resolve(null as Piece<'recall'> | null),
  ]);
  const felt = mood?.felt?.trim() || a.feltBefore;
  const wakes = (rec?.wakes ?? []).filter((w) => fragments[w.i]).slice(0, 3).map((w) => ({ text: `${fragments[w.i].age ? `${fragments[w.i].age}: ` : ''}${fragments[w.i].text}`, why: w.why }));
  const tPieces = Date.now();

  let plan: BeatPlan | null = null;
  try {
    const prompt = composerPrompt(a, { perceived, felt, wakes });
    const raw = (await chat({ tier: 'L1', subsystem: 'composer', contentClass: 'fiction', entityId: a.entityId, campaignId: a.campaignId, messages: [{ role: 'system', content: prompt }], maxTokens: 220, temperature: 0.4 }, overrides)).text;
    plan = parsePlan(raw);
    if (!plan) console.warn(`[composer] ${a.name}: the local plan did not parse: ${raw.slice(0, 160)}`);
  } catch (err) {
    console.warn(`[composer] ${a.name}: local plan failed:`, err instanceof Error ? err.message : err);
  }
  if (!plan) return null;
  const tPlan = Date.now();

  // A VOICE, NOT A FORMULA (session 2 live, 2026-11-03: card after card of Violet's opened "I think I …").
  const avoidOpenings = [...new Set(a.recent.map(openingOf).filter(Boolean))];
  let voiced = await placeOrder({ kind: 'voice', brief: { gist: plan.gist, voice: a.voice, recent: a.recent, avoidOpenings } }, ctx, overrides);
  if (voiced?.thought && avoidOpenings.includes(openingOf(voiced.thought))) {
    console.log(`[composer] ${a.name}: the voice opened like a recent thought ("${openingOf(voiced.thought)}") - once more`);
    voiced = (await placeOrder({ kind: 'voice', brief: { gist: plan.gist, voice: a.voice, recent: a.recent, avoidOpenings: [...avoidOpenings, openingOf(voiced.thought)] } }, ctx, overrides)) ?? voiced;
  }
  const thought = voiced?.thought?.trim() || plan.gist;
  console.log(`[composer] ${a.name}: pieces ${tPieces - t0}ms · plan ${tPlan - tPieces}ms · voice ${Date.now() - tPlan}ms · impulse ${plan.impulse}`);
  // THE PIECES ON THE RECORD (session 2 live #2, 2026-11-03): a card went wrong and the log showed only timings, so nothing said
  // which piece carried the fault. Each piece, cut short, so a replay can be read from the server log alone.
  const cut = (s: string, n = 160) => s.replace(/\s+/g, ' ').slice(0, n);
  console.log(`[composer] ${a.name} pieces · perceived: ${cut(perceived)} · felt: ${cut(felt, 100)} · wakes: ${wakes.map((w) => cut(w.text, 60)).join(' | ') || '(none)'} · recent: ${a.recent.map((r) => cut(r, 50)).join(' | ') || '(none)'}`);
  console.log(`[composer] ${a.name} plan · gist: ${cut(plan.gist)}${plan.why ? ` · why: ${cut(plan.why, 60)}` : ''} · thought: ${cut(thought)}`);
  return { perceived, felt, wakes, plan, thought };
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
