/**
 * Genesis player gates (Mike 2026-10-16): APPEARANCE and PORTRAIT are settled
 * by a person at the designer, not by JEWL. A genesis session that reaches a
 * gate waits (`blocked`, a fixed reason) with no model call; the designer's
 * save and the portrait lock reopen it, and the walk goes on.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { gateBlockedReason, isGateBlocked, isGateStage, type GenesisGateStage } from '@/lib/genesis-stages';
import { detectMissingStages } from './genesis-stages';

/** Is this gate satisfied for the character right now? */
export async function gateSatisfied(characterId: string, stage: GenesisGateStage): Promise<boolean> {
  const missing = await detectMissingStages(characterId);
  return !missing.has(stage);
}

function characterIdOf(goal: string): string | null {
  const m = /\[([^\]\s]+)\]/.exec(goal);
  return m ? m[1] : null;
}

/**
 * The work loop reached a gate stage: pass it (status done → the walk moves
 * on) when the evidence is there, otherwise hold the session with the gate's
 * reason. Idempotent: a session already holding stays held without a write.
 */
export async function holdOrPassGate(sessionId: string): Promise<'passed' | 'held' | 'skipped'> {
  const session = await prisma.dayaWorkSession.findUnique({ where: { id: sessionId } });
  if (!session || !isGateStage(session.stage)) return 'skipped';
  const characterId = characterIdOf(session.goal);
  if (!characterId) return 'skipped';
  const { updateWorkSession } = await import('./daya-work-session');
  if (await gateSatisfied(characterId, session.stage)) {
    await updateWorkSession({ sessionId, status: 'done', progressNote: `[system] ${session.stage.toLowerCase()} approved at the designer` });
    return 'passed';
  }
  if (session.status === 'blocked' && isGateBlocked(session.blockedReason)) return 'held';
  await updateWorkSession({ sessionId, status: 'blocked', blockedReason: gateBlockedReason(session.stage) });
  return 'held';
}

/**
 * The designer saved or the portrait was locked: any genesis session of this
 * character holding at a gate whose evidence now exists goes back to work.
 * Best-effort; never throws into the save path.
 */
export async function reopenGenesisGates(characterId: string): Promise<number> {
  try {
    const held = await prisma.dayaWorkSession.findMany({
      where: { status: 'blocked', goal: { contains: `[${characterId}]` } },
    });
    let reopened = 0;
    for (const s of held) {
      if (!isGateStage(s.stage) || !isGateBlocked(s.blockedReason)) continue;
      if (!(await gateSatisfied(characterId, s.stage))) continue;
      const { updateWorkSession } = await import('./daya-work-session');
      await updateWorkSession({ sessionId: s.id, status: 'active', progressNote: `[system] ${s.stage.toLowerCase()} approved — resuming` });
      reopened++;
    }
    if (reopened) {
      const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
      kickWorkLoop();
    }
    return reopened;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[genesis-gates] reopen failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}
