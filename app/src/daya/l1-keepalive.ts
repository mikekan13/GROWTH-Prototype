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
import { resumeTextPod, stopTextPod, textPodId } from './text-pod';

export const KEEPALIVE_INTERVAL_MS = Number(process.env.DAYA_L1_KEEPALIVE_MS ?? 60_000);

type Registry = Map<string, { timer: ReturnType<typeof setInterval>; probes: number }>;
const g = globalThis as unknown as { __l1Keepalive?: Registry };
const registry: Registry = g.__l1Keepalive ?? (g.__l1Keepalive = new Map());

async function hasActiveSession(campaignId: string): Promise<boolean> {
  const active = await prisma.gameSession.findFirst({ where: { campaignId, endedAt: null }, select: { id: true } });
  return !!active;
}

/** No table activity for this long → the keep-alive lets the lane sleep (it re-arms when the TABLE tab loads). */
export const KEEPALIVE_IDLE_MS = Number(process.env.DAYA_L1_KEEPALIVE_IDLE_MS ?? 20 * 60_000);

/** How long since anything happened at this table (feed event or JEWL chat), or since the session began. */
async function quietMs(campaignId: string): Promise<number> {
  const [ev, msg, sess] = await Promise.all([
    prisma.campaignEvent.findFirst({ where: { campaignId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.copilotMessage.findFirst({ where: { campaignId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.gameSession.findFirst({ where: { campaignId, endedAt: null }, select: { startedAt: true } }),
  ]);
  const last = Math.max(ev?.createdAt.getTime() ?? 0, msg?.createdAt.getTime() ?? 0, sess?.startedAt.getTime() ?? 0);
  return last ? Date.now() - last : 0;
}

async function tick(campaignId: string) {
  const entry = registry.get(campaignId);
  if (!entry) return;
  try {
    if (!(await hasActiveSession(campaignId))) {
      stopKeepalive(campaignId, 'session over');
      console.log(`[l1-keepalive] session over for ${campaignId} — lane released`);
      return;
    }
    // Spend guard (Mike 2026-10-17: "I have left the app open for days. It was
    // just eating gpus doing nothing"): release the lane when the day's GPU
    // budget is spent, or when the table has been quiet for KEEPALIVE_IDLE_MS.
    const { gpuStatus } = await import('@/services/gpu-budget');
    if (!(await gpuStatus()).allowed) {
      stopKeepalive(campaignId, 'GPU budget reached');
      console.warn(`[l1-keepalive] GPU budget reached — lane released for ${campaignId}`);
      return;
    }
    const quietFor = await quietMs(campaignId);
    if (quietFor > KEEPALIVE_IDLE_MS) {
      stopKeepalive(campaignId, `table quiet ${Math.round(quietFor / 60000)} min`);
      console.log(`[l1-keepalive] table quiet ${Math.round(quietFor / 60000)} min — lane released for ${campaignId}`);
      return;
    }
    // A pod lane (2026-10-30): the session keeps the pod up — resume it if it is not running (one cheap read a minute
    // when it is). The probe below then reports where the boot is.
    if (textPodId()) await resumeTextPod(`session hot at ${campaignId}`);
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

/**
 * Release the lane for a campaign. On a pod lane, once no campaign is keeping it warm, the pod is STOPPED (2026-10-30:
 * the session owns the pod; a release for any reason — session over, idle, budget — is a stop).
 */
export function stopKeepalive(campaignId: string, reason = 'released'): void {
  const entry = registry.get(campaignId);
  if (entry) {
    clearInterval(entry.timer);
    registry.delete(campaignId);
  }
  if (registry.size === 0 && textPodId()) void stopTextPod(`${reason} (${campaignId})`);
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
