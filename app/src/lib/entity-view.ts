/**
 * Entity view (2026-10-12, Mike): clicking an entity in Tapestry > Entities
 * opens "everything about this entity", split into three sections. This file
 * holds the UI-free rules: lifecycle (born / awaiting image) and which section
 * opens first. Pure — no React, no fetch.
 */

export type EntitySection = 'appearance' | 'sheet' | 'persona';

export const ENTITY_SECTIONS: { key: EntitySection; label: string }[] = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'sheet', label: 'Sheet' },
  { key: 'persona', label: 'Persona' },
];

/** What CharacterTab knows about the open entity, reported up to EntityView. */
export interface EntityStateReport {
  characterId: string | null;
  name: string;
  entityType?: string | null;
  status?: string | null;
  /** GenesisProgress.state of the latest genesis/completion session, if any. */
  genesisState?: string | null;
  genesisRunning: boolean;
  /** Completion from the genesis progress (preferred) or the sheet facts. */
  completion?: { genesis: 'pending' | 'born'; image: 'pending' | 'locked' | 'done'; done?: boolean } | null;
  genomeStage?: 'story' | 'gestating' | 'ready' | null;
  hasBust: boolean;
}

export interface EntityLifecycle {
  born: boolean;
  awaitingImage: boolean;
  hasImage: boolean;
}

/** Born = genesis finished (or the character is live). Awaiting image = born, official portrait not done. */
export function entityLifecycle(r: EntityStateReport): EntityLifecycle {
  if (!r.characterId) return { born: false, awaitingImage: false, hasImage: r.hasBust };
  const born = r.completion?.genesis === 'born'
    || (r.genesisState === 'done' && !r.genesisRunning)
    || r.genomeStage === 'ready'
    || r.status === 'ACTIVE';
  const hasImage = r.completion ? r.completion.image === 'done' || r.hasBust : r.hasBust;
  const awaitingImage = born && (r.completion ? r.completion.image !== 'done' : !r.hasBust);
  return { born, awaitingImage, hasImage };
}

/** Creation → Sheet (the creation path). Born + awaiting image → Appearance. Born + image → Sheet. */
export function defaultEntitySection(l: EntityLifecycle): EntitySection {
  if (!l.born) return 'sheet';
  return l.awaitingImage ? 'appearance' : 'sheet';
}

/** Sections that are reachable but not yet meaningful before birth. */
export function isAfterBirthSection(section: EntitySection, l: EntityLifecycle): boolean {
  return !l.born && section !== 'sheet';
}

/**
 * A portrait failure as ONE plain line (paused serverless endpoint, network
 * down, non-JSON proxy page) instead of a raw stack / HTML / JSON dump.
 * Messages already written for people pass through (trimmed to one line).
 */
export function portraitErrorLine(raw: string | null | undefined): string {
  const msg = (raw ?? '').trim();
  if (!msg) return 'The portrait engine did not answer. Try again in a moment.';
  if (/paused|unreachable|not responding|did not start|endpoint health|serverless queue failed|no workers|throttl|timed out|fetch failed|failed to fetch|networkerror|econnrefused|econnreset|enotfound|etimedout|socket hang up|\b50[234]\b|bad gateway|service unavailable|gateway time-?out|unexpected token|not valid json|json\.parse|unexpected end of json/i.test(msg)) {
    return 'The portrait engine is paused or unreachable right now. Nothing was lost; try again later.';
  }
  const firstLine = msg.split('\n')[0].trim();
  return firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine;
}
