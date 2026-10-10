/**
 * Listening — the machinery between the two halves of the split being loop
 * (U2b, TABLE-RHYTHM-DESIGN-2026-10-01 §1/§6). The table's rhythm is the clock:
 * a being listens while someone else has the floor and answers at the ask.
 *
 * Three pieces, all free of I/O and unit-tested on their own:
 *   - the listening state: what a being carries from listening to the answer;
 *   - the listen queue: one listen in flight per being, later chunks joined
 *     into the next one, so listening keeps pace with a few-second cadence;
 *   - the speech gate: turns the answering call's token stream into a growing
 *     spoken line, with the embodiment seal checked on the words BEFORE they
 *     are shown, and a retract when a hit only shows once the words are out.
 *
 * The orchestration that calls the models lives in ensemble.ts.
 */
import { sealLint, hasHardHit } from './seal';
import type { BeingSpeakingPhase } from '@/types/campaign-events';

// ── Tunables ─────────────────────────────────────────────────────────────────

/** At the ask, how long the answer waits for a listen still in flight before going on without it. [PLACEHOLDER] */
export const ANSWER_LISTEN_CAP_MS = 1500;
/** The felt-state brief is reused across chunks for this long; mood does not turn every few seconds. [PLACEHOLDER] */
export const SOUL_REFRESH_MS = 30_000;
/** How many perceived stretches a being holds between answers. */
export const HEARD_KEEP = 8;

// ── Listening state ──────────────────────────────────────────────────────────

export interface ListeningState {
  locationId: string | null;
  /** The place as the being took it in on arriving (the first, full perception). */
  standingScene: string;
  /** What has reached it since it last spoke, oldest first, already through the mirror. */
  heard: string[];
  /** The latest listening monologue. Never stored as memory; it is thought, not event. */
  innerState: string;
  feltStateBrief: string;
  feltAt: number;
  recallBlock: string;
  desiresBlock: string;
  updatedAt: number;
}

// In-process, per being. A restart means the next listen starts a fresh state.
const states = new Map<string, ListeningState>();

export function getListening(characterId: string): ListeningState | undefined {
  return states.get(characterId);
}

export function setListening(characterId: string, state: ListeningState): void {
  states.set(characterId, state);
}

export function forgetListening(characterId?: string): void {
  if (characterId) states.delete(characterId);
  else states.clear();
}

/** Fold one perceived stretch into the state. A full take of a place replaces the standing scene and starts the heard list over. Pure. */
export function foldPerception(
  state: ListeningState | undefined,
  perceived: { prose: string; standing: 'full' | 'new'; locationId: string | null },
  now: number,
): ListeningState {
  const base: ListeningState = state ?? {
    locationId: perceived.locationId, standingScene: '', heard: [], innerState: '', feltStateBrief: '', feltAt: 0, recallBlock: '', desiresBlock: '', updatedAt: now,
  };
  if (perceived.standing === 'full' || base.locationId !== perceived.locationId || !base.standingScene) {
    return { ...base, locationId: perceived.locationId, standingScene: perceived.prose, heard: [], updatedAt: now };
  }
  return { ...base, heard: [...base.heard, perceived.prose].slice(-HEARD_KEEP), updatedAt: now };
}

// ── Listen queue ─────────────────────────────────────────────────────────────

interface Lane<T> {
  inFlight: T[];
  pending: Array<{ item: T; done: () => void }>;
  running: Promise<void> | null;
}

/**
 * One listen at a time per key. Items pushed while a batch runs wait and are
 * handed to the worker together as the next batch. A worker that throws does
 * not stall the lane.
 */
export class ListenQueue<T> {
  private lanes = new Map<string, Lane<T>>();

  constructor(private readonly worker: (key: string, batch: T[]) => Promise<void>) {}

  /** Resolves when the batch that carried this item has been worked (or the item was taken back). */
  push(key: string, item: T): Promise<void> {
    const lane = this.lane(key);
    const settled = new Promise<void>((resolve) => { lane.pending.push({ item, done: resolve }); });
    if (!lane.running) lane.running = this.drain(key, lane);
    return settled;
  }

  /** Resolves once nothing is in flight or waiting for this key. */
  async idle(key: string): Promise<void> {
    for (let running = this.lanes.get(key)?.running; running; running = this.lanes.get(key)?.running) await running;
  }

  /** What is being worked right now (a copy). */
  inFlight(key: string): T[] {
    return [...(this.lanes.get(key)?.inFlight ?? [])];
  }

  /** Take back everything that has not started yet; the caller now owns it. */
  takePending(key: string): T[] {
    const lane = this.lanes.get(key);
    if (!lane) return [];
    const taken = lane.pending.splice(0);
    for (const entry of taken) entry.done();
    return taken.map((entry) => entry.item);
  }

  private lane(key: string): Lane<T> {
    let lane = this.lanes.get(key);
    if (!lane) { lane = { inFlight: [], pending: [], running: null }; this.lanes.set(key, lane); }
    return lane;
  }

  private async drain(key: string, lane: Lane<T>): Promise<void> {
    // Yield once so items pushed in the same tick travel together.
    await Promise.resolve();
    while (lane.pending.length) {
      const batch = lane.pending.splice(0);
      lane.inFlight = batch.map((entry) => entry.item);
      try {
        await this.worker(key, lane.inFlight);
      } catch (err) {
        console.error('[daya/listening] listen batch failed (non-fatal):', err);
      }
      lane.inFlight = [];
      for (const entry of batch) entry.done();
    }
    lane.running = null;
  }
}

/** Wait for `work`, but no longer than `capMs`. true = it finished in time. */
export async function settledWithin(work: Promise<unknown>, capMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const capped = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), capMs); });
  try {
    return await Promise.race([work.then(() => true as const, () => true as const), capped]);
  } finally {
    clearTimeout(timer);
  }
}

// ── The line as it is spoken (what U2c puts on the wire) ─────────────────────

/** A being's line growing at the table — the shape is defined once, with the stream events it travels as. */
export type BeingSpeakingEvent = BeingSpeakingPhase;

// ── Speech gate ──────────────────────────────────────────────────────────────

export type GateKind = 'speak' | 'act' | 'attend' | 'rest';

export interface GateResult {
  kind: GateKind;
  /** Speech: the words shown. Act/attend: the content of the line. Rest: ''. */
  content: string;
  /** Everything the model sent, untouched. */
  raw: string;
  /** Set when the seal stopped the line; `content` is then what had been shown before the stop. */
  retracted: { rule: string } | null;
  /** true once any speech was handed to `onSpeech`. */
  shown: boolean;
}

const DIRECTIVE_RE = /^(say|do|attend|rest)\s*:\s*/i;
const BARE_REST_RE = /^rest\s*[.!]?\s*$/i;
// Could still turn into "Say:" / "Do:" / "Attend:" / "Rest" once more text arrives.
const DIRECTIVE_PREFIX_RE = /^(?:s|sa|say|d|do|a|at|att|atte|atten|attend|r|re|res|rest)\s*$/i;

/**
 * Feed it the answering call's text as it arrives (`push` is the model
 * client's onToken: it returns false to stop the generation). It works out
 * whether the line is speech, strips the `Say:` label, and hands speech to
 * `onSpeech` a whole word at a time — each stretch seal-checked before it is
 * shown. A line that is not speech (Do / Attend / Rest) shows nothing. The
 * line ends at the first line break; later text is ignored. Call `end()` when
 * the stream is over.
 */
export function createSpeechGate(onSpeech: (delta: string, whole: string) => void): { push: (delta: string) => boolean; end: () => GateResult } {
  let raw = '';
  let mode: 'undecided' | 'speech' | 'silent' | 'closed' = 'undecided';
  let kind: GateKind = 'speak';
  let body = '';      // the line after its label
  let shown = '';     // speech already handed out
  let retracted: { rule: string } | null = null;

  const release = (upTo: number) => {
    const candidate = body.slice(0, upTo);
    if (candidate.length <= shown.length) return true;
    const hits = sealLint(candidate);
    if (hasHardHit(hits)) {
      retracted = { rule: hits.find((h) => h.severity === 'HARD')!.pattern };
      mode = 'closed';
      return false;
    }
    const delta = candidate.slice(shown.length);
    shown = candidate;
    onSpeech(delta, shown);
    return true;
  };

  const decide = (final: boolean) => {
    const text = raw.replace(/^\s+/, '');
    const firstLine = text.split('\n')[0];
    const lineOver = text.includes('\n') || final;
    const labeled = DIRECTIVE_RE.exec(firstLine);
    if (labeled) {
      const verb = labeled[1].toLowerCase();
      kind = verb === 'say' ? 'speak' : verb === 'do' ? 'act' : verb === 'attend' ? 'attend' : 'rest';
      mode = kind === 'speak' ? 'speech' : 'silent';
      return labeled[0].length;
    }
    if (BARE_REST_RE.test(firstLine)) {
      if (!lineOver) return -1; // "Rest." so far — it may yet be the start of a sentence
      kind = 'rest';
      mode = 'silent';
      return firstLine.length;
    }
    if (!lineOver && (DIRECTIVE_PREFIX_RE.test(firstLine) || firstLine === '')) return -1; // not enough to tell yet
    // No label: a reply that is only speech is treated as speech (parseSpiritOutput's leniency).
    kind = 'speak';
    mode = 'speech';
    return 0;
  };

  // `body` is recomputed from `raw` each time, so a label split across pieces is handled once.
  let labelLength = -1;
  const recompute = (final: boolean): boolean => {
    if (mode === 'closed') return false;
    const text = raw.replace(/^\s+/, '');
    if (mode === 'undecided') {
      labelLength = decide(final);
      if (labelLength < 0) return true;
    }
    const rest = text.slice(labelLength).replace(/^[^\S\n]+/, '');
    const lineBreak = rest.indexOf('\n');
    body = lineBreak >= 0 ? rest.slice(0, lineBreak) : rest;
    const lineOver = lineBreak >= 0 || final;
    if (mode === 'speech') {
      // Only whole words go out: a word still arriving is neither shown nor checked.
      const boundary = lineOver ? body.replace(/\s+$/, '').length : body.search(/\s\S*$/);
      if (boundary > 0 && !release(boundary)) return false;
    }
    // The line is over: anything after it is ignored, but the stream is left to finish so its usage is metered.
    if (lineOver) mode = 'closed';
    return true;
  };

  return {
    /** false only when the seal stopped the line — the one case where the generation itself should stop. */
    push(delta: string): boolean {
      raw += delta;
      if (mode === 'closed') return retracted === null;
      return recompute(false);
    },
    end(): GateResult {
      if (mode !== 'closed') recompute(true);
      const content = kind === 'speak' ? shown.trim() : kind === 'rest' ? '' : body.trim();
      // A line that says nothing is the being letting it pass.
      const settled: GateKind = kind === 'speak' && !content && !retracted ? 'rest' : kind;
      return { kind: settled, content, raw, retracted, shown: shown.length > 0 };
    },
  };
}
