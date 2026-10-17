/**
 * GPU SPEND GUARD (Mike 2026-10-17, after a $100 top-up vanished in two days:
 * "We can't have this happen again"). Every call that wakes a RunPod GPU
 * (the local text lane, the beings, the keep-alive probe, a portrait job)
 * asks first. The truth is RunPod's own billing for TODAY (UTC), cached a few
 * minutes:
 *   - outside a live session: blocked once today's spend reaches the cap
 *     (GPU_DAILY_BUDGET_USD, default $3);
 *   - while a session is live: allowed up to 2× the cap, then blocked too.
 * If billing can't be read the call goes ahead (logged) — the guard must never
 * take the table down on its own.
 */
import { prisma } from '@/lib/db';
import { GpuBudgetError } from '@/lib/errors';

const CACHE_MS = 3 * 60 * 1000;
const SESSION_CACHE_MS = 60 * 1000;

export function dailyBudgetUsd(): number {
  const v = Number(process.env.GPU_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

export type GpuVerdict = { allowed: boolean; spent: number; limit: number; inSession: boolean };

/** The decision, pure. */
export function gpuVerdict(spent: number | null, cap: number, inSession: boolean): GpuVerdict {
  const limit = inSession ? cap * 2 : cap;
  if (spent == null) return { allowed: true, spent: 0, limit, inSession };
  return { allowed: spent < limit, spent, limit, inSession };
}

type Cache = { at: number; usd: number | null };
const g = globalThis as unknown as { __gpuSpend?: Cache; __gpuSession?: { at: number; live: boolean } };

/** Today's RunPod spend in USD (endpoints + pods + volumes), UTC day. Null when unreadable. */
export async function spentTodayUsd(now = Date.now()): Promise<number | null> {
  if (g.__gpuSpend && now - g.__gpuSpend.at < CACHE_MS) return g.__gpuSpend.usd;
  const key = process.env.RUNPOD_API_KEY;
  if (!key) return null;
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  let total = 0;
  try {
    for (const [kind, grouping] of [['endpoints', 'endpointId'], ['pods', 'podId']] as const) {
      const url = `https://rest.runpod.io/v1/billing/${kind}?bucketSize=day&startTime=${encodeURIComponent(start.toISOString())}&grouping=${grouping}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`billing ${kind} ${r.status}`);
      const rows = await r.json() as Array<{ amount?: number; time?: string }> | { data?: Array<{ amount?: number }> };
      for (const row of Array.isArray(rows) ? rows : rows.data ?? []) total += Number(row.amount ?? 0) || 0;
    }
    g.__gpuSpend = { at: now, usd: Math.round(total * 100) / 100 };
  } catch (err) {
    console.warn('[gpu-budget] billing unreadable — not blocking:', err instanceof Error ? err.message : err);
    g.__gpuSpend = { at: now, usd: null };
  }
  return g.__gpuSpend.usd;
}

async function anySessionLive(now = Date.now()): Promise<boolean> {
  if (g.__gpuSession && now - g.__gpuSession.at < SESSION_CACHE_MS) return g.__gpuSession.live;
  let live = false;
  try { live = !!(await prisma.gameSession.findFirst({ where: { endedAt: null }, select: { id: true } })); } catch { live = false; }
  g.__gpuSession = { at: now, live };
  return live;
}

export async function gpuStatus(): Promise<GpuVerdict> {
  const [spent, inSession] = await Promise.all([spentTodayUsd(), anySessionLive()]);
  return gpuVerdict(spent, dailyBudgetUsd(), inSession);
}

/** Throw before waking a GPU when today's budget is spent. `what` names the caller for the log. */
export async function assertGpuBudget(what: string): Promise<void> {
  const v = await gpuStatus();
  if (v.allowed) return;
  console.warn(`[gpu-budget] BLOCKED ${what}: $${v.spent.toFixed(2)} spent today, limit $${v.limit.toFixed(2)}${v.inSession ? ' (session)' : ''}`);
  throw new GpuBudgetError(
    `GPU budget reached (${what}): $${v.spent.toFixed(2)} of $${v.limit.toFixed(2)} today`,
    `Today's GPU budget is used up ($${v.spent.toFixed(2)} of $${v.limit.toFixed(2)}). It resets at midnight UTC — or raise GPU_DAILY_BUDGET_USD.`,
  );
}

/** Test hook. */
export function _resetGpuBudgetCache(): void { g.__gpuSpend = undefined; g.__gpuSession = undefined; }
