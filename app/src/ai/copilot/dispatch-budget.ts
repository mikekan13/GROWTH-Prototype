/**
 * The dispatch's context budget (2026-10-12). Pure.
 *
 * Before every JEWL dispatch the runtime logs
 *   [ctx] kind=<> system=<>k tools=<>k history=<>k ctx=<>k total=<>k budget=<>k
 * and holds the total to the lane's budget. A local lane (32k window) gets
 * window − 8k (room to answer); a cloud lane is effectively unbounded here.
 * Over budget → drop the OLDEST history lines first (792fd2c's order; the
 * system block, tools, context and the newest prompt are never touched here —
 * the transport's fitToLocalWindow still trims tool results mid-loop).
 */
import { estimateTokens, localMaxModelLen } from '@/ai/network/local-window';

/** Room left for the model's answer on a local lane. */
export const LOCAL_ANSWER_RESERVE = 8_192;
/** Cloud lanes: no practical ceiling at this layer (log only). */
export const CLOUD_BUDGET = 180_000;
const PER_LINE_OVERHEAD = 6;

export function laneBudget(provider: string, env: Record<string, string | undefined> = process.env): number {
  return provider === 'openai-compat' ? localMaxModelLen(env) - LOCAL_ANSWER_RESERVE : CLOUD_BUDGET;
}

export interface CtxParts {
  system: string;
  tools: string;
  history: string[];
  ctx: string;
  prompt: string;
}

export interface CtxMeasure {
  system: number;
  tools: number;
  history: number;
  ctx: number;
  prompt: number;
  total: number;
}

function lineTokens(s: string): number {
  return estimateTokens(s) + PER_LINE_OVERHEAD;
}

export function measureCtx(p: CtxParts): CtxMeasure {
  const system = estimateTokens(p.system);
  const tools = estimateTokens(p.tools);
  const history = p.history.reduce((n, l) => n + lineTokens(l), 0);
  const ctx = estimateTokens(p.ctx);
  const prompt = lineTokens(p.prompt);
  return { system, tools, history, ctx, prompt, total: system + tools + history + ctx + prompt };
}

const k = (n: number) => `${(n / 1000).toFixed(1)}k`;

export function formatCtxLine(kind: string, m: CtxMeasure, budget: number): string {
  return `[ctx] kind=${kind} system=${k(m.system)} tools=${k(m.tools)} history=${k(m.history)} ctx=${k(m.ctx)} total=${k(m.total)} budget=${k(budget)}`;
}

/**
 * How many of the OLDEST history lines to drop so the total fits the
 * budget (all of them if even that is not enough — `fits` says so).
 */
export function trimHistoryToBudget(p: CtxParts, budget: number): { drop: number; measure: CtxMeasure; fits: boolean } {
  let m = measureCtx(p);
  let drop = 0;
  let total = m.total;
  while (total > budget && drop < p.history.length) {
    total -= lineTokens(p.history[drop]);
    drop++;
  }
  if (drop) m = measureCtx({ ...p, history: p.history.slice(drop) });
  return { drop, measure: m, fits: m.total <= budget };
}
