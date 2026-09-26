/**
 * L1 keep-warm while a session is hot (Mike 2026-09-26: "For right now we
 * keep it live while a session is hot").
 *
 * The serverless text lane scales to zero after ~120 s idle, so a being's
 * first response after any quiet stretch at the table took ~5 minutes. While
 * a campaign has an ACTIVE GameSession we probe the lane every 60 s — the
 * same max_tokens:1 request `warmL1` uses — which keeps one worker up. The
 * loop stops itself the moment the session ends (or the campaign has no
 * active session any more), so nothing burns between sessions.
 *
 * Cost: one worker for the length of a session. Mike's call, 09-26.
 *
 * Timers live on globalThis so dev HMR doesn't double them; a dev-server
 * restart drops them, and `ensureKeepalive` (called when the TABLE tab
 * loads its roster) brings them back for any session still open.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { warmL1 } from './l1-warm';

export const KEEPALIVE_INTERVAL_MS = Number(process.env.DAYA_L1_KEEPALIVE_MS ?? 60_000);

type Registry = Map<string, { timer: ReturnType<typeof setInterval>; probes: number }>;
const g = globalThis as unknown as { __l1Keepalive?: Registry };
const registry: Registry = g.__l1Keepalive ?? (g.__l1Keepalive = new Map());

async function hasActiveSession(campaignId: string): Promise<boolean> {
  const active = await prisma.gameSession.findFirst({ where: { campaignId, endedAt: null }, select: { id: true } });
  return !!active;
}

async function tick(campaignId: string) {
  const entry = registry.get(campaignId);
  if (!entry) return;
  try {
    if (!(await hasActiveSession(campaignId))) {
      stopKeepalive(campaignId);
      console.log(`[l1-keepalive] session over for ${campaignId} — lane released`);
      return;
    }
    const status = await warmL1();
    entry.probes++;
    if (entry.probes % 10 === 1 || status !== 'ready') console.log(`[l1-keepalive] ${campaignId} probe #${entry.probes}: ${status}`);
  } catch (err) {
    console.warn('[l1-keepalive] probe failed (kept going)', err);
  }
}

/** Start (idempotent) the keep-warm loop for a campaign whose session just opened. */
export function startKeepalive(campaignId: string): void {
  if (registry.has(campaignId)) return;
  const timer = setInterval(() => void tick(campaignId), KEEPALIVE_INTERVAL_MS);
  // Never hold the process open just for this.
  (timer as unknown as { unref?: () => void }).unref?.();
  registry.set(campaignId, { timer, probes: 0 });
  console.log(`[l1-keepalive] ${campaignId} lane kept warm every ${KEEPALIVE_INTERVAL_MS / 1000}s while the session is hot`);
  void tick(campaignId);
}

export function stopKeepalive(campaignId: string): void {
  const entry = registry.get(campaignId);
  if (!entry) return;
  clearInterval(entry.timer);
  registry.delete(campaignId);
}

/** After a server restart the timers are gone but the session may still be open — re-arm if so. */
export async function ensureKeepalive(campaignId: string): Promise<boolean> {
  if (registry.has(campaignId)) return true;
  if (!(await hasActiveSession(campaignId))) return false;
  startKeepalive(campaignId);
  return true;
}

export function keepaliveStatus(campaignId: string): { active: boolean; probes: number } {
  const entry = registry.get(campaignId);
  return { active: !!entry, probes: entry?.probes ?? 0 };
}
