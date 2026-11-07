/**
 * ORDERS — the narrow, nameless pieces the simulation composer buys from the cloud (SIMULATION-COMPOSER-DESIGN-2026-11-03).
 *
 * Michael 2026-11-03: "the local model placed orders using the cloud model. Taking all the pieces and building a simulation.
 * Violet shouldn't be one llm chat that is running some prose … Agents running different tasks. Perception, memory recall,
 * voice." A being is several agents; each agent is one ORDER here: a small brief built from what THAT being can know, sent
 * to Claude through the wall (fiction only, tone filter, table guard, lawfulness) with every proper name swapped for a
 * placeholder (the translator), answered as a small JSON piece, mapped back. The composer — local — is the only thing that
 * ever holds all the pieces. Nothing sent is stored; only the returned piece is used.
 *
 * Pure prompt builders + parsers are exported for tests; placeOrder is the one impure entry point. Never throws: a failed
 * order returns null and the composer goes on without that piece.
 */
import { z } from 'zod';
import { chat, type DayaClientOverrides } from './model-client';
import { logTraining } from './training-log';


// ── The kinds ───────────────────────────────────────────────────────────────

export interface PerceptionBrief {
  /** The senses this being has working right now (from its body), e.g. ['sight', 'hearing']. */
  senses: string[];
  /** Where this being is: the lines of its own surroundings (room, light, what is near). */
  surroundings: string[];
  /** What just happened, as the world's truth (may name things the being cannot sense). */
  event: string;
  /** The event is the being's own doing (voiced for it): it knows it as its own act. */
  own: boolean;
  /** RULING 13 (2026-11-05): beings in view and what SHOWS of them — their outward traits (a face that reads fifteen years younger). */
  others?: Array<{ name: string; outward: string[] }>;
}
export interface RecallBrief {
  /** What the being just took in. */
  cue: string;
  /** Candidate memories (already scored locally), each with its age in words. */
  fragments: Array<{ i: number; text: string; age?: string }>;
  /** Its recent thoughts: a memory already in them wakes again only if this moment truly calls for it. */
  recent?: string[];
}
export interface MoodBrief {
  /** How the being felt a moment ago, in words. */
  felt: string;
  /** What just reached it, as it perceived it. */
  perceived: string;
  /** Its standing temperament (from its sheet / persona), in words. */
  temperament: string;
}
export interface VoiceRecord {
  perceived: string | null;
  felt: string;
  going: Array<{ text: string; mine: boolean; holder: string }>;
  near: string[];
  remember: Array<{ text: string; age?: string; why: string }>;
  about: string[];
  imagine?: string;
  impulse: 'speak' | 'act' | 'stay';
  why?: string;
  /** Its own acts and words this session, latest first (finding 17, 2026-11-04). */
  did?: string[];
  /** Day 6 (2026-11-04): what it does now, when its impulse is act. */
  act?: string;
  /** THE TRAITS LANE (2026-11-04): its Nectars, Thorns, Blossoms — standing truths that colour the voice, never announced. */
  traits?: string[];
}
export interface VoiceBrief {
  /** THE RECORD (GROUNDED-BEATS-PLAN-2026-11-03): what the being may think in - resolved references only. */
  record?: VoiceRecord;
  /** Older shape: a decided gist to voice (the fallback and the tests). */
  gist?: string;
  /** How this being speaks and thinks (voice notes). */
  voice: string;
  /** Its recent thoughts: never repeat their sentences or images. */
  recent: string[];
  /** Openings its recent thoughts already used ("I think I"): the thought must not begin with any of them. */
  avoidOpenings?: string[];
}

export type Order =
  | { kind: 'perception'; brief: PerceptionBrief }
  | { kind: 'recall'; brief: RecallBrief }
  | { kind: 'mood'; brief: MoodBrief }
  | { kind: 'voice'; brief: VoiceBrief }
  | { kind: 'speech'; brief: SpeechBrief };

export interface SpeechBrief {
  /** What the being means to say now, decided by the composer (its rough line). */
  meaning: string;
  /** How this being speaks. */
  voice: string;
  /** What was just said to it or around it (the last few lines), so the words answer them. */
  heard: string[];
}

export const PIECE_SCHEMAS = {
  perception: z.object({ reaches: z.string(), nothing: z.boolean().optional() }),
  recall: z.object({ wakes: z.array(z.object({ i: z.number().int(), why: z.string() })) }),
  mood: z.object({ felt: z.string() }),
  voice: z.object({ thought: z.string() }),
  speech: z.object({ words: z.string() }),
} as const;
export type Piece<K extends Order['kind']> = z.infer<(typeof PIECE_SCHEMAS)[K]>;

// ── Prompts (pure) ──────────────────────────────────────────────────────────

const JSON_ONLY = 'Answer with JSON only, no prose around it.';
const lines = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (none)');

/** The system + user text of an order. Placeholders (Person-A, Place-B …) stand for names; keep them exactly as written. */
export function orderPrompt(order: Order): { system: string; user: string; maxTokens: number } {
  // No example placeholders here (session 2 live, 2026-11-03: the model borrowed the example "Person-A" for someone unnamed, and it leaked onto the page).
  const names = 'Some names in the text may be replaced by placeholders: keep any you see exactly as written. Never invent a placeholder; refer to someone unnamed as he, she, they or someone.';
  switch (order.kind) {
    case 'perception': {
      const b = order.brief;
      return {
        maxTokens: 300,
        system: [
          'You work out what reaches one being through its senses, in a simulation. You are one part of a larger system: you only judge perception.',
          'Given the being\'s working senses, its surroundings and what just happened, write what reaches it, first person, as it takes it in.',
          'What just happened comes first and is never dropped, softened or turned into something else. Plain senses in plain words: no metaphors, no similes, no mood.',
          'Only what these senses can carry from where the being is. What someone elsewhere does cannot be sensed unless a sound, signal or voice carries it here. A ringing phone does not say who is calling.',
          // Table test 2026-11-03: Kristopher, in his car, "heard" the chime of the text he had just sent to a phone two miles away.
          'When what just happened is something the being itself set off ELSEWHERE (a call it placed, a message it sent, a knock it gave), it senses only what carries back to where it is: a call it placed rings in its own ear; a message it sent is only known to be sent; the other person is not heard. Say what it knows and what, if anything, it hears.',
          b.own ? 'This was the being\'s own doing: it knows it as its own act ("I …").' : '',
          // 2026-11-07 (session 5 cross-wire, session 6 perspective flips): "first person" was read as "the deed is mine".
          b.own ? '' : 'This was NOT the being\'s own doing. Whoever did it stays the one who did it: name them or call them he, she or they. "I", "me" and "my" are only the being\'s own senses and body ("I hear him say…", "I see her lift the cup"), never someone else\'s deed or words.',
          'At most 4 sentences. If nothing reaches the being, say so with "nothing": true and an empty "reaches".',
          names,
          `${JSON_ONLY} {"reaches": string, "nothing"?: boolean}`,
        ].filter(Boolean).join('\n'),
        user: [`Senses working: ${b.senses.join(', ') || 'none'}`, 'Surroundings:', lines(b.surroundings), ...(b.others?.some((o) => o.outward.length) ? ['', 'Others in view, and what SHOWS of them (true of them; what the being takes in of it is yours to write):', ...b.others.filter((o) => o.outward.length).map((o) => `- ${o.name}: ${o.outward.join('; ')}`)] : []), '', `What just happened: ${b.event}`].join('\n'),
      };
    }
    case 'recall': {
      const b = order.brief;
      return {
        maxTokens: 300,
        system: [
          'You judge which memories wake in one being, in a simulation. You are one part of a larger system: you only judge recall.',
          'Given what the being just took in and a list of its memories (with how long ago each was), pick the ones that would truly come to mind now — at most 3 — and say in a few plain words what each means to it NOW.',
          'Never invent a memory and never change one; an old memory stays old (say so if it matters). Pick none if none fit.',
          'A memory the being has already been thinking about (its recent thoughts) wakes again only if this moment truly calls for it; do not bring the same memory back beat after beat.',
          names,
          `${JSON_ONLY} {"wakes": [{"i": number, "why": string}]}`,
        ].join('\n'),
        user: [`Just took in: ${b.cue}`, ...(b.recent?.length ? ['Recent thoughts:', lines(b.recent.slice(0, 4))] : []), 'Memories:', ...b.fragments.map((f) => `[${f.i}]${f.age ? ` (${f.age})` : ''} ${f.text}`)].join('\n'),
      };
    }
    case 'mood': {
      const b = order.brief;
      return {
        maxTokens: 160,
        system: [
          'You judge how one being\'s feelings move, in a simulation. You are one part of a larger system: you only judge mood.',
          'Given how it felt, its temperament and what just reached it, say how it feels now: one or two plain sentences, second person ("You …"), body and mood. No metaphors.',
          names,
          `${JSON_ONLY} {"felt": string}`,
        ].join('\n'),
        user: [`A moment ago: ${b.felt}`, `Temperament: ${b.temperament}`, `What just reached it: ${b.perceived}`].join('\n'),
      };
    }
    case 'speech': {
      const b = order.brief;
      return {
        maxTokens: 120,
        system: [
          'You give the words one being says aloud their own voice, in a simulation. You are one part of a larger system: what it means to say is decided; you only word it.',
          'Write exactly what it says aloud now, one or two short sentences, the way this being talks. Keep the meaning and add no fact, no promise and no name it did not use. Never repeat back what was just said to it.',
          names,
          `${JSON_ONLY} {"words": string}`,
        ].join('\n'),
        user: [`How this being speaks: ${b.voice}`, 'Just heard:', lines(b.heard.slice(-3)), '', `What it means to say: ${b.meaning}`].join('\n'),
      };
    }
    case 'voice': {
      const b = order.brief;
      return {
        maxTokens: 220,
        system: [
          'You give one being\'s thought its own voice, in a simulation. You are one part of a larger system: WHAT the being is thinking is decided below; you only put it in its voice.',
          'Write the thought as it goes through this being, first person, in its way of speaking: plain, particular, full sentences that run on like thought does.',
          // THE RECORD (GROUNDED-BEATS-PLAN-2026-11-03 section 3b): nothing outside it.
          'Say only what the record gives. Nothing is here but what is HERE WITH IT. Nothing happens but what REACHED IT. What it REMEMBERS is then, with its age, never now. What it PICTURES is pictured - "I picture", "I imagine", "maybe", "probably" - never seen, heard or done (run 4: "I can see the screen lighting up" was a picture told as sight). Something STILL GOING is still going: never say it ended, was answered or was ignored. In a thought it does nothing and says nothing aloud. Nothing rings, chimes, knocks or sounds unless WHAT JUST REACHED IT or STILL GOING says so now. What IT JUST DID OR SAID is its own and done: it knows those words and may quote them; it never wonders what it said. A thing HERE WITH IT is known by its name alone: no writing on it, nothing inside it, no history, unless WHAT JUST REACHED IT or IT REMEMBERS says so (session 5: "my twenty and a five… her handwriting on them" — the handwriting was on another bill). When WHAT IT DOES NOW is given, the thought turns toward that doing and ends as it begins it.',
          'Things are given as the being would say them ("my phone", "the five-dollar bill"); say them that way, never as a label.',
          'The way of speaking is a voice, not a formula: do not open sentences the same way twice, and do not lean on one stock phrase.',
          'No metaphors for silence, weight, breath, light or dark. Never repeat a sentence or an image from its recent thoughts. Under 60 words.',
          names,
          `${JSON_ONLY} {"thought": string}`,
        ].join('\n'),
        user: [`How this being speaks and thinks: ${b.voice}`, 'Recent thoughts (do not repeat):', lines(b.recent.slice(0, 4)), ...(b.avoidOpenings?.length ? [`Do not begin with: ${b.avoidOpenings.map((o) => `"${o}"`).join(', ')}`] : []), '', ...recordLines(b)].join('\n'),
      };
    }
  }
}

/** The JSON piece out of a model answer, validated; null when it does not parse or fit. Pure. */
export function parsePiece<K extends Order['kind']>(kind: K, text: string): Piece<K> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = PIECE_SCHEMAS[kind].safeParse(JSON.parse(m[0]));
    return parsed.success ? (parsed.data as Piece<K>) : null;
  } catch {
    return null;
  }
}

/** The record as the voice order sees it; the older gist when there is no record. Pure. */
export function recordLines(b: VoiceBrief): string[] {
  const r = b.record;
  if (!r) return [`The thought: ${b.gist ?? ''}`];
  const remembered = r.remember.map((m) => `${m.age ? `${m.age}: ` : ''}${m.text} - ${m.why}`);
  return ['THE RECORD:',
    `WHAT JUST REACHED IT: ${r.perceived ?? 'nothing new'}`,
    `HOW IT FEELS: ${r.felt}`,
    r.did?.length ? `IT JUST DID OR SAID (its own, this session, latest first - it knows these words exactly and may quote them): ${r.did.join(' | ')}` : '',
    r.going.length ? `STILL GOING: ${r.going.map((g) => `${g.text}${g.mine ? ' (it set this off itself and knows it)' : ''}`).join('; ')}` : '',
    `HERE WITH IT (the only things it may place here): ${r.near.length ? r.near.join('; ') : 'nothing in particular'}`,
    r.remember.length ? 'IT REMEMBERS (then, not now):' : '',
    ...(r.remember.length ? [lines(remembered)] : []),
    r.imagine ? `IT PICTURES (has not happened): ${r.imagine}` : '',
    r.act ? `WHAT IT DOES NOW (its choice, this moment): ${r.act}` : '',
    r.traits?.length ? `WHAT IT IS, ALWAYS (its Nectars and Thorns: they colour how it reads this moment and what it reaches for — never named, never news, never a thought about itself): ${r.traits.join(' | ')}` : '',
    `IT IS THINKING ABOUT: ${r.about.length ? r.about.join('; ') : 'what just reached it, and how it feels'}`,
  ].filter(Boolean);
}

// ── Placing an order ────────────────────────────────────────────────────────

/**
 * Place one order on the cloud tier. The wall translates it (every proper name of the campaign swapped for a placeholder
 * in ai/network/chat, and back in the answer), tones it and screens the answer. Null on any failure (logged).
 */
export async function placeOrder<O extends Order>(
  order: O,
  ctx: { campaignId: string; entityId: string; beatKey?: string },
  overrides: DayaClientOverrides = {},
): Promise<Piece<O['kind']> | null> {
  const t0 = Date.now();
  try {
    const { system, user, maxTokens } = orderPrompt(order);
    const res = await chat({ tier: 'C', subsystem: `order_${order.kind}`, contentClass: 'fiction', campaignId: ctx.campaignId, entityId: ctx.entityId, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature: order.kind === 'voice' ? 0.8 : 0.3 }, overrides);
    const piece = parsePiece(order.kind, res.text);
    if (!piece) console.warn(`[orders] ${order.kind}: the answer did not parse (${Date.now() - t0}ms)`);
    // THE TRAINING LOG (2026-11-03): the brief and the piece, as a pair, with the real names (local only).
    logTraining({ kind: `order_${order.kind}`, campaignId: ctx.campaignId, entityId: ctx.entityId, beatKey: ctx.beatKey ?? null, by: 'C', input: { system, user, brief: order.brief }, output: { raw: res.text, piece }, ms: Date.now() - t0 });
    return piece as Piece<O['kind']> | null;
  } catch (err) {
    console.warn(`[orders] ${order.kind} failed (${Date.now() - t0}ms):`, err instanceof Error ? err.message : err);
    return null;
  }
}
