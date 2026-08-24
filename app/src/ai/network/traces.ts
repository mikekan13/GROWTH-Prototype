/**
 * ai/network/traces — fine-tune corpus capture.
 *
 * Ruling (Mike 2026-08-23): the dev-era Claude dispatches ARE the training
 * data for the GROWTH fine-tune — every tool-loop is Sonnet demonstrating
 * the behavior the local model must learn (rules operation, canvas driving).
 * So every dispatch appends one JSONL record with the FULL loop: system
 * prompt (deduped by hash), messages incl. tool_use/tool_result blocks,
 * outcome, and the flags needed to keep the training set on the right side
 * of the wall (maturity/privacy tags ride along).
 *
 * Storage: app/traces/YYYY-MM-DD.jsonl + traces/systems/<hash>.txt
 * (system prompts are ~50K tokens and near-identical across a day — stored
 * once per hash, referenced by id). Directory is gitignored; it is corpus,
 * not code. Writes are fire-and-forget.
 */

import 'server-only';
import { createHash } from 'crypto';
import { appendFile, mkdir, writeFile, access } from 'fs/promises';
import path from 'path';

const TRACES_DIR = path.join(process.cwd(), 'traces');
const SYSTEMS_DIR = path.join(TRACES_DIR, 'systems');

export interface TraceRecord {
  ts: string;
  caller: string;
  source?: string;            // JewlPrompt source (GM_TEXT, JEWL_WORK_CYCLE, …)
  lane: string;
  model: string;
  campaignId?: string;
  systemRef: string;          // hash id of the system prompt file
  toolNames: string[];        // registry snapshot by name (schemas live in git)
  messages: unknown[];        // the FULL final messages array of the loop
  outcome: {
    finalText: string;
    stopReason?: string;
    toolCallCount: number;
    rounds?: number;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  };
  flags: { maturityFlags?: string[]; privacy?: string };
}

async function ensureDirs(): Promise<void> {
  await mkdir(SYSTEMS_DIR, { recursive: true });
}

async function persistSystemPrompt(systemPrompt: string): Promise<string> {
  const hash = createHash('sha256').update(systemPrompt).digest('hex').slice(0, 16);
  const file = path.join(SYSTEMS_DIR, `${hash}.txt`);
  try {
    await access(file);
  } catch {
    await writeFile(file, systemPrompt, 'utf8');
  }
  return hash;
}

export interface RecordTraceInput {
  caller: string;
  source?: string;
  lane: string;
  model: string;
  campaignId?: string;
  systemPrompt: string;
  toolNames: string[];
  messages: unknown[];
  outcome: TraceRecord['outcome'];
  flags?: TraceRecord['flags'];
}

/** Append one dispatch trace. Fire-and-forget — never throws. */
export function recordTrace(input: RecordTraceInput): void {
  void (async () => {
    await ensureDirs();
    const systemRef = await persistSystemPrompt(input.systemPrompt);
    const record: TraceRecord = {
      ts: new Date().toISOString(),
      caller: input.caller,
      source: input.source,
      lane: input.lane,
      model: input.model,
      campaignId: input.campaignId,
      systemRef,
      toolNames: input.toolNames,
      messages: input.messages,
      outcome: input.outcome,
      flags: input.flags ?? {},
    };
    const day = record.ts.slice(0, 10);
    await appendFile(
      path.join(TRACES_DIR, `${day}.jsonl`),
      JSON.stringify(record) + '\n',
      'utf8',
    );
  })().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[ai/network] trace write failed:', err);
  });
}
