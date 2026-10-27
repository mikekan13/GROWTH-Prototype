/**
 * The ROLL CARD, per reader (Mike 2026-10-26: "These will be perception based on viewpoint").
 *
 * A roll is stored whole (types/terminal RollPayload) and cut to the reader before it leaves the server:
 *   watcher  everything, DR included
 *   actor    the readout (event, skill, SD, hint, Effort, FD, total, result) — never the DR
 *   'full'   a being that SAW it: the same readout, never the DR
 *   'event'  a being that only HEARD it: the event sentence and who — no numbers
 *   none     not in the visibility map: the card is not theirs at all (null)
 * Pure, client-safe.
 */
import type { RollPayload, RollSeen } from '@/types/terminal';

export type RollReader = { kind: 'watcher' } | { kind: 'character'; characterId: string | null };

/** How much of the card this reader perceived; null = none. */
export function rollSeenBy(p: RollPayload, reader: RollReader): 'watcher' | RollSeen | null {
  if (reader.kind === 'watcher') return 'watcher';
  if (!reader.characterId) return null;
  if (reader.characterId === p.actorId) return 'full';
  return p.visibility?.[reader.characterId] ?? null;
}

/** The payload cut to the reader, or null when the reader perceived nothing of it. */
export function rollForViewer(p: RollPayload, reader: RollReader): RollPayload | null {
  const seen = rollSeenBy(p, reader);
  if (!seen) return null;
  if (seen === 'watcher') return { ...p, view: 'watcher' };
  if (seen === 'full') {
    const rest: RollPayload = { ...p, view: 'full' };
    delete rest.visibility;
    delete rest.dr;
    delete rest.drBy;
    return rest;
  }
  return {
    kind: 'roll', rollId: p.rollId, event: p.event, actorId: p.actorId, actorName: p.actorName,
    isSkilled: p.isSkilled, governor: '', effort: 0, total: 0, success: false, chosenBy: p.chosenBy, cycle: p.cycle, view: 'event',
  };
}

/** How the Effort was chosen, in words (for the card and the novel); null when the owner chose it. */
export function chosenNote(p: Pick<RollPayload, 'chosenBy' | 'actorName'>): string | null {
  if (p.chosenBy === 'ai-timeout') return `(chosen for ${p.actorName} — no answer in time)`;
  if (p.chosenBy === 'ai') return '(Effort chosen by the sim)';
  return null;
}

/** The colour of the Terminal's hint as the sheet words it. Never the DR. */
export const HINT_WORD: Record<'blue' | 'purple' | 'red', string> = { blue: 'favourable', purple: 'moderate', red: 'perilous' };
