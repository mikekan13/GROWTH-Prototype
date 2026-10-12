/**
 * What JEWL's dispatch loop may put in front of a lane (the wall, Mike
 * 2026-10-12). Pure.
 *
 * Inside the wall (local lane) JEWL sees the whole history as written. On a
 * cloud lane it sees fiction only: table/real rows are dropped, a split
 * ambient line crosses as its icText (never the raw transcript), and every
 * text passes the tone filter (awaited: the first send crosses softened). Tool results — the other way DB text re-enters
 * the model's context — are scrubbed the same way at one choke point.
 */
import type { ContentClass } from '@/ai/network/types';
import { scrubForCloud, hasTableMarker, WITHHELD } from '@/ai/network/table-guard';
import { toneFilterAsync, type ToneFilterContext } from '@/ai/network/tone-filter';
import { rowContentClass, AMBIENT_USERNAME, UI_USERNAME } from './content-class';

export interface HistoryRow {
  role: string;
  content: string;
  username: string | null;
  createdAt: Date;
  contentClass?: string | null;
  icText?: string | null;
  actions?: string | null;
}

export interface LaneHistoryLine {
  role: 'user' | 'assistant';
  text: string;
}

export interface LaneHistory {
  lines: LaneHistoryLine[];
  /** True when any row in the window was table/real (whatever the lane). */
  sawNonFiction: boolean;
}

/** The history lines a lane may see. */
export async function historyForLane(rows: HistoryRow[], crossesWall: boolean, ctx?: ToneFilterContext): Promise<LaneHistory> {
  let sawNonFiction = false;
  const lines: Array<LaneHistoryLine | Promise<LaneHistoryLine>> = [];
  for (const m of rows) {
    const cls: ContentClass = rowContentClass(m);
    if (cls !== 'fiction') sawNonFiction = true;
    const stamp = m.createdAt.toISOString();
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    if (!crossesWall) {
      const tag = m.username ? `[${stamp}] [${m.username}]` : `[${stamp}]`;
      lines.push({ role, text: `${tag}: ${m.content}` });
      continue;
    }
    if (cls !== 'fiction') continue;
    // A split mic line crosses as its in-character words, under a neutral tag.
    const spoken = m.username === AMBIENT_USERNAME || m.username === UI_USERNAME;
    const who = spoken ? 'spoken at the table' : m.username;
    const body = (m.icText && m.icText.trim()) ? m.icText : m.content;
    if (hasTableMarker(body)) continue;
    const tag = who ? `[${stamp}] [${who}]` : `[${stamp}]`;
    lines.push(toneFilterAsync(`${tag}: ${body}`, ctx).then((text) => ({ role, text })));
  }
  return { lines: await Promise.all(lines), sawNonFiction };
}

/** A tool result's content as a lane may see it (the tool-result choke point). */
export async function toolResultForLane(content: string, crossesWall: boolean, ctx?: ToneFilterContext): Promise<string> {
  if (!crossesWall) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return hasTableMarker(content) ? WITHHELD : toneFilterAsync(content, ctx);
  }
  return toneFilterAsync(JSON.stringify(scrubForCloud(parsed)), ctx);
}

type Block = { type: string; text?: string; content?: string; input?: unknown };

/** Every text a message array carries (for the wall's final check). */
export function messageTexts(messages: Array<{ content: Block[] }>): string[] {
  const out: string[] = [];
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === 'text' && typeof b.text === 'string') out.push(b.text);
      else if (b.type === 'tool_result' && typeof b.content === 'string') out.push(b.content);
      else if (b.type === 'tool_use') out.push(JSON.stringify(b.input ?? {}));
    }
  }
  return out;
}
