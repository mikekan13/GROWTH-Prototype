/**
 * ai/network/table-guard — table and real content never reach a cloud lane
 * (the wall, Mike 2026-10-12), including through tool results.
 *
 *   assertNoTableContent(items, caller) — the hard check route() runs on a
 *     cloud-bound payload: a CopilotMessage-shaped row of class table/real, a
 *     raw ambient row, or any text carrying the ambient / table-talk marker
 *     → WallViolationError. Logs the caller and the kind of hit, NEVER the text.
 *   scrubForCloud(value) — the soft filter for structured data (tool
 *     results): drops table/real rows, swaps a fiction row's raw content for
 *     its icText, withholds marked strings. What it returns passes the check.
 *
 * Pure; no imports beyond the network's own error type.
 */

import { WallViolationError } from './errors';

/** Markers that only ever ride on table content. */
const TABLE_MARKER_RE = /\[ambient\]|\[ui\]|"source"\s*:\s*"(?:TABLE_AMBIENT|TABLE_DROPPED|UI_ACTIVITY)"|"contentClass"\s*:\s*"(?:table|real)"/;
const TABLE_USERNAMES = new Set(['[ambient]', '[ui]']);
const TABLE_SOURCES = new Set(['TABLE_AMBIENT', 'TABLE_DROPPED', 'UI_ACTIVITY', 'GM_VOICE', 'PLAYER_VOICE']);

export const WITHHELD = '[withheld: table talk]';

export interface RowLike {
  contentClass?: unknown;
  username?: unknown;
  source?: unknown;
  actions?: unknown;
  icText?: unknown;
  content?: unknown;
}

export function hasTableMarker(text: string): boolean {
  return TABLE_MARKER_RE.test(text);
}

function sourceOf(row: RowLike): string | null {
  if (typeof row.source === 'string') return row.source;
  if (typeof row.actions === 'string') {
    try {
      const a = JSON.parse(row.actions) as { source?: unknown };
      if (typeof a?.source === 'string') return a.source;
    } catch { /* not JSON */ }
  }
  return null;
}

/** True when a row is table or real content (stamp first; legacy markers otherwise). */
export function isTableRow(row: RowLike): boolean {
  if (row.contentClass === 'table' || row.contentClass === 'real') return true;
  if (row.contentClass === 'fiction') return false;
  if (typeof row.username === 'string' && TABLE_USERNAMES.has(row.username)) return true;
  const src = sourceOf(row);
  return !!src && TABLE_SOURCES.has(src);
}

function looksLikeRow(v: object): boolean {
  return 'contentClass' in v || ('username' in v && ('content' in v || 'role' in v));
}

/** Throws WallViolationError if anything in `items` is table/real content. */
export function assertNoTableContent(items: Array<string | RowLike | null | undefined>, caller: string): void {
  items.forEach((item, i) => {
    if (item == null) return;
    if (typeof item === 'string') {
      if (hasTableMarker(item)) {
        console.warn(`[wall] blocked table content bound for cloud (caller=${caller}, item=${i}, kind=marker)`);
        throw new WallViolationError(`Task '${caller}' tried to send table content to a cloud lane (marker in item ${i}).`);
      }
      return;
    }
    if (isTableRow(item)) {
      console.warn(`[wall] blocked table content bound for cloud (caller=${caller}, item=${i}, kind=row)`);
      throw new WallViolationError(`Task '${caller}' tried to send a table/real row to a cloud lane (item ${i}).`);
    }
    for (const v of [item.content, item.icText]) {
      if (typeof v === 'string' && hasTableMarker(v)) {
        console.warn(`[wall] blocked table content bound for cloud (caller=${caller}, item=${i}, kind=marker)`);
        throw new WallViolationError(`Task '${caller}' tried to send table content to a cloud lane (marker in item ${i}).`);
      }
    }
  });
}

/**
 * A cloud-safe copy of structured data: table/real rows removed, a fiction
 * row's `content` replaced by its `icText`, marked strings withheld.
 */
export function scrubForCloud<T>(value: T): T {
  return scrub(value, 0) as T;
}

function scrub(v: unknown, depth: number): unknown {
  if (depth > 40) return WITHHELD;
  if (typeof v === 'string') return hasTableMarker(v) ? WITHHELD : v;
  if (Array.isArray(v)) {
    return v
      .filter((x) => !(x && typeof x === 'object' && !Array.isArray(x) && looksLikeRow(x) && isTableRow(x as RowLike)))
      .map((x) => scrub(x, depth + 1));
  }
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (looksLikeRow(obj) && isTableRow(obj as RowLike)) return WITHHELD;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(obj)) out[k] = scrub(x, depth + 1);
    if (looksLikeRow(obj) && typeof obj.icText === 'string' && obj.icText) out.content = scrub(obj.icText, depth + 1);
    return out;
  }
  return v;
}
