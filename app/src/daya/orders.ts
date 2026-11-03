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
}
export interface RecallBrief {
  /** What the being just took in. */
  cue: string;
  /** Candidate memories (already scored locally), each with its age in words. */
  fragments: Array<{ i: number; text: string; age?: string }>;
}
export interface MoodBrief {
  /** How the being felt a moment ago, in words. */
  felt: string;
  /** What just reached it, as it perceived it. */
  perceived: string;
  /** Its standing temperament (from its sheet / persona), in words. */
  temperament: string;
}
export interface VoiceBrief {
  /** What the being is thinking, decided by the composer: plain gist, first person or notes. */
  gist: string;
  /** How this being speaks and thinks (voice notes). */
  voice: string;
  /** Its recent thoughts: never repeat their sentences or images. */
  recent: string[];
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
  const names = 'Names appear as placeholders (Person-A, Place-B, Thing-C). Keep every placeholder exactly as written.';
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
          b.own ? 'This was the being\'s own doing: it knows it as its own act ("I …").' : '',
          'At most 4 sentences. If nothing reaches the being, say so with "nothing": true and an empty "reaches".',
          names,
          `${JSON_ONLY} {"reaches": string, "nothing"?: boolean}`,
        ].filter(Boolean).join('\n'),
        user: [`Senses working: ${b.senses.join(', ') || 'none'}`, 'Surroundings:', lines(b.surroundings), '', `What just happened: ${b.event}`].join('\n'),
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
          names,
          `${JSON_ONLY} {"wakes": [{"i": number, "why": string}]}`,
        ].join('\n'),
        user: [`Just took in: ${b.cue}`, 'Memories:', ...b.fragments.map((f) => `[${f.i}]${f.age ? ` (${f.age})` : ''} ${f.text}`)].join('\n'),
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
          'You give one being\'s thought its own voice, in a simulation. You are one part of a larger system: the content of the thought is decided; you only voice it.',
          'Write the thought as it goes through this being, first person, in its way of speaking: plain, particular, full sentences that run on like thought does. Keep every fact of the gist and add none: no event, deed, place, message or object that is not in the gist.',
          'The way of speaking is a voice, not a formula: do not open sentences the same way twice, and do not lean on one stock phrase.',
          'No metaphors for silence, weight, breath, light or dark. Never repeat a sentence or an image from its recent thoughts. Under 60 words.',
          names,
          `${JSON_ONLY} {"thought": string}`,
        ].join('\n'),
        user: [`How this being speaks and thinks: ${b.voice}`, 'Recent thoughts (do not repeat):', lines(b.recent.slice(0, 4)), '', `The thought: ${b.gist}`].join('\n'),
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

// ── Placing an order ────────────────────────────────────────────────────────

/**
 * Place one order on the cloud tier. The wall translates it (every proper name of the campaign swapped for a placeholder
 * in ai/network/chat, and back in the answer), tones it and screens the answer. Null on any failure (logged).
 */
export async function placeOrder<O extends Order>(
  order: O,
  ctx: { campaignId: string; entityId: string },
  overrides: DayaClientOverrides = {},
): Promise<Piece<O['kind']> | null> {
  const t0 = Date.now();
  try {
    const { system, user, maxTokens } = orderPrompt(order);
    const res = await chat({ tier: 'C', subsystem: `order_${order.kind}`, contentClass: 'fiction', campaignId: ctx.campaignId, entityId: ctx.entityId, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature: order.kind === 'voice' ? 0.8 : 0.3 }, overrides);
    const piece = parsePiece(order.kind, res.text);
    if (!piece) console.warn(`[orders] ${order.kind}: the answer did not parse (${Date.now() - t0}ms)`);
    return piece as Piece<O['kind']> | null;
  } catch (err) {
    console.warn(`[orders] ${order.kind} failed (${Date.now() - t0}ms):`, err instanceof Error ? err.message : err);
    return null;
  }
}
