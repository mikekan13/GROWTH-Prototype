/**
 * THE TRAINING LOG (GROUNDED-BEATS-PLAN-2026-11-03; Michael 2026-11-03: "Will all of this also help us get data to help train
 * the model so that it is even better?").
 *
 * Every order the simulation places and every choice the composer makes is a labelled pair: inputs → output. Kept here, one
 * JSON line each, under data/training/ (local only, never committed, never across the wall: the lines carry real names). The
 * table test joins its asserts to these lines by `beatKey`, so a pair later carries whether the beat it fed passed. Enough of
 * them and the chooser (local already) can be fine-tuned on Claude's judgment, and the voice can come home from the cloud.
 *
 * Off when DAYA_TRAINING_LOG=off. Never throws: a line that fails to write is lost, the table does not notice.
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type TrainingKind = 'order_perception' | 'order_recall' | 'order_mood' | 'order_voice' | 'order_speech' | 'choice' | 'standing_self' | 'verdict';

export interface TrainingLine {
  kind: TrainingKind;
  at: string;
  campaignId?: string | null;
  entityId?: string | null;
  /** Joins the pieces of one beat, and the beat to the table test's verdicts: `${entityId}:${t0}`. */
  beatKey?: string | null;
  /** The model that answered (tier or model id), so pairs from different teachers can be told apart. */
  by?: string;
  input: unknown;
  output: unknown;
  /** Milliseconds the call took. */
  ms?: number;
}

const DIR = process.env.DAYA_TRAINING_DIR ?? path.join(process.cwd(), 'data', 'training');

export function trainingLogOn(): boolean {
  return process.env.DAYA_TRAINING_LOG !== 'off' && process.env.NODE_ENV !== 'test';
}

/** Append one pair. Files roll by kind and month. */
export function logTraining(line: Omit<TrainingLine, 'at'>): void {
  if (!trainingLogOn()) return;
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    appendFileSync(path.join(DIR, `${line.kind}-${month}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...line }) + '\n', 'utf8');
  } catch (err) {
    console.warn('[training-log] line lost:', err instanceof Error ? err.message : err);
  }
}

/** A verdict on a beat from the table test or from the Watcher: which asserts it passed, or what Michael said. Same file family. */
export function logVerdict(beatKey: string, verdict: { pass: boolean; failed?: string[]; note?: string; source: 'table-test' | 'watcher' }): void {
  logTraining({ kind: 'verdict', beatKey, input: { beatKey }, output: verdict });
}
