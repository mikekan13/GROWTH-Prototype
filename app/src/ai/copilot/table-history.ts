/**
 * Table-chat history hygiene (2026-10-12). Pure.
 *
 * Measured 2026-10-12: table chat on the local 27B carried 19 history rows ≈
 * 21k tokens, mostly 10–15k-char genesis/work-cycle "user" rows (the cycle
 * brief) that are JEWL's work orders, not conversation. Table chat now sees:
 *
 *   1. conversational rows only — work-cycle briefs, their replies, genesis
 *      reports ('[genesis]') are out (they live in the Log / work session);
 *   2. each row clipped (long tool-result dumps and pasted walls of text);
 *   3. the newest rows that fit a token budget (default 6k);
 *   4. older conversational rows folded into ONE rolling paragraph, stored on
 *      the campaign and rewritten only when it changes. v1 is deterministic
 *      and extractive — no model call.
 *      TODO(local-summary): replace with a local-model summary (inside the
 *      wall) once the table lane has spare capacity between turns.
 *
 * Withheld rows never reach here (withoutWithheld upstream), and the lane's
 * own wall (historyForLane) still decides what a cloud lane may see. The
 * summary is built from FICTION rows only, so it may cross on a cloud lane
 * (still through contextForLane's marker check + tone filter).
 */
import { estimateTokens } from '@/ai/network/local-window';
import { hasTableMarker } from '@/ai/network/table-guard';
import { rowContentClass } from './content-class';
import type { HistoryRow } from './cloud-history';

export interface ChatRow extends HistoryRow {
  metadata?: string | null;
}

/** Default token budget for table-chat history. */
export const TABLE_HISTORY_BUDGET = 6_000;
/** A row longer than this is clipped in table chat. */
export const TABLE_ROW_MAX_CHARS = 1_200;
/** The rolling summary's ceiling. */
export const SUMMARY_MAX_CHARS = 1_200;
/** How many rows table chat fetches before filtering. */
export const TABLE_HISTORY_FETCH = 60;

const GENESIS_USERNAME = '[genesis]';
const SYSTEM_USERNAME = '[system]';
const WORK_SOURCES = new Set(['JEWL_WORK_CYCLE']);
const WORK_KINDS = new Set(['WORK_CYCLE', 'GENESIS']);
const PER_LINE_OVERHEAD = 6;
const FRAGMENT_SEP = ' | ';

function sourceOf(actions: string | null | undefined): string | null {
  if (!actions) return null;
  try {
    const a = JSON.parse(actions) as { source?: unknown };
    return typeof a?.source === 'string' ? a.source : null;
  } catch { return null; }
}

function dispatchKindOfRow(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { dispatchKind?: unknown };
    return typeof m?.dispatchKind === 'string' ? m.dispatchKind : null;
  } catch { return null; }
}

/**
 * Drop genesis/work-cycle rows. Rows are chronological (oldest first). A
 * legacy assistant reply (no dispatchKind stamp) that directly follows a
 * work-cycle brief is that cycle's reply and goes with it.
 */
export function conversationalRows<R extends ChatRow>(rows: R[]): R[] {
  const out: R[] = [];
  let prevWasWorkPrompt = false;
  for (const r of rows) {
    const kind = dispatchKindOfRow(r.metadata);
    const isWorkPrompt = r.role !== 'assistant' && WORK_SOURCES.has(sourceOf(r.actions) ?? '');
    const isWork =
      isWorkPrompt ||
      r.username === GENESIS_USERNAME ||
      (kind !== null && WORK_KINDS.has(kind)) ||
      (r.role === 'assistant' && kind === null && prevWasWorkPrompt);
    prevWasWorkPrompt = isWorkPrompt;
    if (!isWork) out.push(r);
  }
  return out;
}

/** Clip a row's content for table chat. */
export function clipRow<R extends ChatRow>(r: R, max = TABLE_ROW_MAX_CHARS): R {
  if (r.content.length <= max) return r;
  const cut = r.content.length - max;
  return { ...r, content: `${r.content.slice(0, max)}… [clipped ${cut} chars]` };
}

function rowTokens(r: ChatRow): number {
  // The history line carries a timestamp + username tag (cloud-history).
  return estimateTokens(r.content) + PER_LINE_OVERHEAD + 12;
}

/**
 * Split chronological rows into the newest ones that fit `budgetTokens`
 * (kept, chronological) and everything older (older, chronological).
 */
export function selectTableHistory<R extends ChatRow>(rows: R[], budgetTokens = TABLE_HISTORY_BUDGET): { kept: R[]; older: R[] } {
  let used = 0;
  let i = rows.length;
  while (i > 0) {
    const t = rowTokens(rows[i - 1]);
    if (used + t > budgetTokens) break;
    used += t;
    i--;
  }
  return { kept: rows.slice(i), older: rows.slice(0, i) };
}

/** The whole table-chat history pipeline for chronological rows. */
export function tableChatHistory<R extends ChatRow>(rows: R[], budgetTokens = TABLE_HISTORY_BUDGET): { kept: R[]; older: R[] } {
  return selectTableHistory(conversationalRows(rows).map(r => clipRow(r)), budgetTokens);
}

function firstSentence(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(flat);
  const s = m ? m[1] : flat;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** One summary fragment per fiction, human-or-JEWL row (system prompts and table/real rows are skipped). */
function fragmentOf(r: ChatRow): string | null {
  if (rowContentClass(r) !== 'fiction') return null;
  if (r.username === SYSTEM_USERNAME) return null;
  const body = r.content.trim();
  if (!body || hasTableMarker(body)) return null;
  const who = r.role === 'assistant' ? 'JEWL' : (r.username || 'GM');
  return `${who}: ${firstSentence(body)}`;
}

/**
 * Fold newly-aged-out rows into the rolling summary: previous fragments +
 * one per new row, oldest fragments dropped first to stay under the cap.
 * Deterministic. Returns the previous text unchanged when nothing new folds.
 */
export function rollSummary(prev: string | null | undefined, older: ChatRow[], maxChars = SUMMARY_MAX_CHARS): string {
  const frags = prev ? prev.split(FRAGMENT_SEP).filter(Boolean) : [];
  for (const r of older) {
    const f = fragmentOf(r);
    if (f) frags.push(f);
  }
  while (frags.length > 1 && frags.join(FRAGMENT_SEP).length > maxChars) frags.shift();
  const out = frags.join(FRAGMENT_SEP);
  return out.length > maxChars ? out.slice(out.length - maxChars) : out;
}

/** Rows older than the kept window that the stored summary has not yet folded. */
export function rowsToFold<R extends ChatRow>(older: R[], through: Date | null | undefined): R[] {
  return through ? older.filter(r => r.createdAt > through) : older;
}

/** The context-block section carrying the summary. */
export function formatSummaryBlock(summary: string | null | undefined): string {
  return summary ? `=== EARLIER TABLE CHAT (rolling summary, oldest first) ===\n${summary}` : '';
}
