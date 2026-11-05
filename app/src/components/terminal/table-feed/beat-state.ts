/**
 * Nothing shown is rewritten (Michael, 2026-11-05): "the rewrites should happen off screen and the final cards printed once done."
 * Pure reducers for the client's side of a being's beat:
 *   - thinking cards: one per being, shown from the first sign it is processing until its final card/line lands (or 90 s);
 *   - speaking lines: partials are never text; only a FINAL line is held for display; a retract of a never-shown line is a no-op,
 *     a retract of a shown line is refused with a console.warn (the server cause is what needs fixing);
 *   - card rows: a row not yet built is held; a re-pushed row can only APPEND segments, never edit printed ones.
 */
import type { BeingSpeakingPhase } from '@/types/campaign-events';

export const THINKING_MAX_MS = 90_000;
export const DISSOLVE_MS = 400;

export type ThinkingStage = 'thinking' | 'voicing';
export interface ThinkingCard {
  characterId: string;
  name: string;
  stage: ThinkingStage;
  /** Defining pillar when an event carries one; the card is Terminal teal otherwise. */
  pillar?: 'body' | 'spirit' | 'soul';
  at: number;
  dissolving?: boolean;
}

export const PILLAR_COLOR: Record<'body' | 'spirit' | 'soul' | 'terminal', string> = {
  body: '#f7525f', spirit: '#582a72', soul: '#002f6c', terminal: '#22ab94',
};

export type ThinkingAction =
  | { type: 'listening'; characterId: string; name?: string; at: number; pillar?: ThinkingCard['pillar'] }
  | { type: 'speaking'; phase: BeingSpeakingPhase; at: number }
  | { type: 'done'; characterId: string; posted?: boolean }
  | { type: 'card'; characterIds: string[] }
  | { type: 'expire'; now: number }
  | { type: 'remove'; characterId: string; at?: number }
  | { type: 'clear' };

const withCard = (cards: ThinkingCard[], c: ThinkingCard) => [...cards.filter(x => x.characterId !== c.characterId), c];
const dissolve = (cards: ThinkingCard[], ids: Set<string>) =>
  cards.some(c => ids.has(c.characterId) && !c.dissolving) ? cards.map(c => (ids.has(c.characterId) ? { ...c, dissolving: true } : c)) : cards;

export function reduceThinking(cards: ThinkingCard[], a: ThinkingAction): ThinkingCard[] {
  switch (a.type) {
    case 'listening': {
      const old = cards.find(c => c.characterId === a.characterId);
      return withCard(cards, { characterId: a.characterId, name: a.name || old?.name || 'someone present', stage: old?.stage ?? 'thinking', pillar: a.pillar ?? old?.pillar, at: old && !old.dissolving ? old.at : a.at });
    }
    case 'speaking': {
      const p = a.phase;
      if (!p.characterId) return cards;
      const old = cards.find(c => c.characterId === p.characterId);
      if (p.phase === 'final') {
        // rest / empty: the being stayed silent — the card dissolves. A spoken final: the line takes its place.
        return dissolve(cards, new Set([p.characterId]));
      }
      if (p.phase === 'retract') return cards; // still off screen; the card keeps breathing
      const name = p.phase === 'start' ? p.characterName : old?.name;
      return withCard(cards, { characterId: p.characterId, name: name || old?.name || 'someone present', stage: 'voicing', pillar: old?.pillar, at: old && !old.dissolving ? old.at : a.at });
    }
    case 'done': return a.posted === false ? dissolve(cards, new Set([a.characterId])) : cards;
    case 'card': return dissolve(cards, new Set(a.characterIds));
    case 'expire': return cards.filter(c => (c.dissolving ? false : a.now - c.at < THINKING_MAX_MS));
    case 'remove': return cards.filter(c => !(c.characterId === a.characterId && (a.at === undefined || c.at === a.at || c.dissolving)));
    case 'clear': return [];
  }
}

// ── speaking lines: final only ───────────────────────────────────────────────

export interface HeldLine {
  utteranceId: string;
  characterId: string;
  characterName: string;
  /** 'speaking' = being composed OFF screen (never rendered); 'final' = the finished line, printed once. */
  state: 'speaking' | 'final';
  /** Only ever set by a final. Partials never put text here. */
  text: string;
  startedAt: number;
  finalAt?: number;
}

export interface SpeakingResult {
  lines: Map<string, HeldLine>;
  /** The line to drop after `ms` (the safety net for a final whose chat row never arrives, or 0 for a rest). */
  schedule: { id: string; ms: number } | null;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function reduceSpeaking(
  prev: Map<string, HeldLine>,
  d: BeingSpeakingPhase,
  now: number,
  finalSafetyMs: number,
  warn: (msg: string) => void = (m) => console.warn(m),
): SpeakingResult {
  const next = new Map(prev);
  const cur = next.get(d.utteranceId);
  let schedule: SpeakingResult['schedule'] = null;
  switch (d.phase) {
    case 'start':
      next.set(d.utteranceId, { utteranceId: d.utteranceId, characterId: d.characterId, characterName: d.characterName, text: '', state: 'speaking', startedAt: now });
      break;
    case 'partial':
      // Composing is off screen: remember the line exists, never its words.
      if (!cur) next.set(d.utteranceId, { utteranceId: d.utteranceId, characterId: d.characterId, characterName: '', text: '', state: 'speaking', startedAt: now });
      break;
    case 'retract':
      if (cur?.state === 'final') warn(`[being-speaking] retract for an already-shown line ignored: utteranceId=${d.utteranceId} reason=${d.reason} rule=${d.rule} — the server withdrew a line it had already finalised`);
      // A line that was never shown is withdrawn off screen: nothing to undo.
      break;
    case 'final':
      if (d.action === 'rest' || !norm(d.text)) { next.delete(d.utteranceId); schedule = { id: d.utteranceId, ms: 0 }; }
      else {
        const base = cur ?? { utteranceId: d.utteranceId, characterId: d.characterId, characterName: '', text: '', state: 'speaking' as const, startedAt: now };
        // A final already shown is never replaced by a second final.
        if (cur?.state === 'final') { warn(`[being-speaking] second final for a shown line ignored: utteranceId=${d.utteranceId}`); break; }
        next.set(d.utteranceId, { ...base, text: d.text, state: 'final', finalAt: now });
        schedule = { id: d.utteranceId, ms: finalSafetyMs };
      }
      break;
  }
  return { lines: next, schedule };
}

// ── card rows: held until built, append-only after ──────────────────────────

interface CardSeg { kind: string; text: string; narrated?: string; source?: string }
interface CardLike { id: string; payload?: unknown }
type Payload = { kind?: string; thought?: string; scene?: string | null; segments?: CardSeg[] } & Record<string, unknown>;

const pl = (e: CardLike): Payload | null => (e.payload && typeof e.payload === 'object' ? (e.payload as Payload) : null);

/**
 * A being_thought row is created the moment the thought is sealed and its card is built (scene + segments) a moment later on
 * the same row. Until it is built the row is not printed (it would be replaced) — unless it is older than THINKING_MAX_MS
 * (history, or a builder that never finished), when it is printed as it stands.
 */
export function isCardPending(payload: unknown, ageMs: number): boolean {
  const p = payload as Payload | null;
  if (!p || p.kind !== 'being_thought') return false;
  if (p.segments?.length || (p.scene && String(p.scene).trim())) return false;
  return ageMs < THINKING_MAX_MS;
}

const sameText = (a: string, b: string) => a.trim() === b.trim();

/**
 * A row re-pushed under the same id may only GROW. Printed segments keep their kind, text and narrated form; segments that are
 * new are appended; anything that would edit or remove printed text is dropped (console.warn so the cause can be found).
 * Returns the payload to keep.
 */
export function reconcileCardPayload(prev: unknown, incoming: unknown, id = '', warn: (m: string) => void = (m) => console.warn(m)): unknown {
  const a = prev as Payload | null, b = incoming as Payload | null;
  if (!a || !b || a.kind !== 'being_thought' || b.kind !== 'being_thought') return incoming;
  const printed = a.segments ?? [];
  if (!printed.length) {
    // Nothing was printed from segments; a held (pending) row may be replaced freely.
    return incoming;
  }
  const inc = b.segments ?? [];
  const kept: CardSeg[] = printed.map(s => ({ ...s }));
  let edited = false;
  for (const s of inc) {
    const i = printed.findIndex(x => x.kind === s.kind && sameText(x.text, s.text));
    if (i < 0) {
      // Not a printed segment: new text — append unless it is a reworded version of printed text at the same index.
      kept.push({ ...s });
    }
  }
  // Printed text rewritten in place shows up as printed segments missing from the incoming row.
  for (const s of printed) if (!inc.some(x => x.kind === s.kind && sameText(x.text, s.text))) edited = true;
  // A reworded segment arrives as "new" next to a missing one: drop it (it is the same slot rewritten).
  let result = kept;
  if (edited) {
    const missing = printed.filter(s => !inc.some(x => x.kind === s.kind && sameText(x.text, s.text)));
    const extras = kept.slice(printed.length);
    const survivors = extras.slice(missing.length); // pair each missing printed segment with one reworded newcomer
    result = [...printed.map(s => ({ ...s })), ...survivors];
    warn(`[card] re-pushed row tried to rewrite printed text — kept the printed segments: id=${id}`);
  }
  return { ...b, scene: a.scene || b.scene, thought: a.thought || b.thought, segments: result };
}

/** mergeEvents-compatible: replace by id, but a being_thought can only grow. */
export function mergeKeepingPrinted<T extends CardLike>(prev: T | undefined, incoming: T, warn?: (m: string) => void): T {
  if (!prev) return incoming;
  const payload = reconcileCardPayload(pl(prev), pl(incoming), incoming.id, warn);
  return payload === pl(incoming) ? incoming : { ...incoming, payload };
}
