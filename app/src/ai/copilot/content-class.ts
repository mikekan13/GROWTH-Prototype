/**
 * Content class of a CopilotMessage row (the wall, Mike 2026-10-12). Pure.
 *
 *   fiction — in-character text, JEWL's replies, system prompts for JEWL.
 *   table   — raw mic transcript ([ambient] / TABLE_AMBIENT / TABLE_DROPPED /
 *             voice prompts) and typed out-of-character chatter.
 *   real    — about the actual humans: [ui] activity breadcrumbs.
 *
 * Rows written since the content-class migration carry `contentClass`; older
 * rows (null) are inferred from their markers, failing toward table.
 */
import type { ContentClass } from '@/ai/network/types';
import { isOocTableTalk } from '@/services/table-talk';

export const AMBIENT_USERNAME = '[ambient]';
export const UI_USERNAME = '[ui]';

const TABLE_SOURCES = new Set(['TABLE_AMBIENT', 'TABLE_DROPPED', 'GM_VOICE', 'PLAYER_VOICE']);
const REAL_SOURCES = new Set(['UI_ACTIVITY']);
const CLASSES = new Set<ContentClass>(['fiction', 'table', 'real']);

export interface ClassedRow {
  contentClass?: string | null;
  username?: string | null;
  actions?: string | null;
}

function sourceOf(actions: string | null | undefined): string | null {
  if (!actions) return null;
  try {
    const a = JSON.parse(actions) as { source?: unknown };
    return typeof a?.source === 'string' ? a.source : null;
  } catch {
    return null;
  }
}

/** The row's effective class: its stamp, else inferred from its markers. */
export function rowContentClass(row: ClassedRow): ContentClass {
  if (row.contentClass && CLASSES.has(row.contentClass as ContentClass)) return row.contentClass as ContentClass;
  if (row.username === AMBIENT_USERNAME) return 'table';
  if (row.username === UI_USERNAME) return 'real';
  const src = sourceOf(row.actions);
  if (src && TABLE_SOURCES.has(src)) return 'table';
  if (src && REAL_SOURCES.has(src)) return 'real';
  return 'fiction';
}

/** A message a human typed: fiction unless the table-talk ooc rules fire. */
export function typedMessageClass(text: string): ContentClass {
  return isOocTableTalk(text) ? 'table' : 'fiction';
}

/** The class a JEWL prompt's own row is saved with, by source. */
export function promptContentClass(source: string, text: string): ContentClass {
  // Voice prompts carry a raw transcript. (A TABLE_AMBIENT *prompt* is the
  // classifier's own instruction to JEWL, not transcript — fiction below.)
  if (source === 'GM_VOICE' || source === 'PLAYER_VOICE') return 'table';
  if (REAL_SOURCES.has(source)) return 'real';
  if (source === 'GM_TEXT') return typedMessageClass(text);
  // Canvas gestures, mistake flags, autonomous ticks, work cycles, the
  // classifier's own dispatch: JEWL-facing instructions about the fiction.
  return 'fiction';
}
