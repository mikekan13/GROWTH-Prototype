/**
 * DAYA affect — event-driven mood vector for AI-controlled characters
 * (the persona harness beneath AI-controlled character sheets).
 *
 * Three drives, moved ONLY by real game events touching things the character
 * actually has (Frequency, goals, their own advancement), never set directly:
 *   morale — confidence / anticipation of gain          (-1..1)
 *   stress — threat activation                          (0..1)
 *   grief  — accumulated loss register                  (0..1)
 *
 * Drives decay toward baseline on the campaign clock (homeostasis). Every
 * update writes a first-person HistoryEntry beat from the character's own
 * perspective (r-2026-06-09-07 — every character logs its own experience).
 * Prompt assembly (JEWL table state, npc_speak) renders the current state so
 * an AI-voiced character's condition shapes behavior — the state is caused
 * by events, never performed.
 *
 * DayaAffect hangs off DayaEntity (not Character directly), so applying an
 * event first ensures a DayaEntity row exists for the character.
 *
 * All entry points are fire-and-forget safe: disposition must never break
 * the mutation that triggered it.
 */
import { prisma } from '@/lib/db';
import { writeHistory, currentCycleOf } from '@/services/history';

export type DispositionEvent =
  | { kind: 'frequency_depleted'; amount: number; current: number; max: number }
  | { kind: 'frequency_restored'; amount: number }
  | { kind: 'death_save_survived' }
  | { kind: 'goal_completed'; goalName?: string }
  | { kind: 'goal_failed'; goalName?: string }
  | { kind: 'goal_abandoned'; goalName?: string }
  | { kind: 'advancement'; frequencySpent: number };

/** Launch defaults — tunable, not canon numbers (r-2026-07-23-09 pattern). */
export const DISPOSITION_TUNING = {
  /** cycles for a drive to decay halfway back to baseline */
  halfLifeCycles: 3,
};

interface Drives { morale: number; stress: number; grief: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Event → drive deltas + a first-person beat. Pure; unit-testable. */
export function evaluateEvent(ev: DispositionEvent, d: Drives): { deltas: Drives; beat: string } {
  switch (ev.kind) {
    case 'frequency_depleted': {
      // Fear scales with how close to the edge the hit leaves them.
      const frac = ev.max > 0 ? ev.amount / ev.max : 0;
      const nearDeath = ev.max > 0 ? 1 - ev.current / ev.max : 0;
      return {
        deltas: { morale: -frac * 0.5, stress: frac * 0.6 + nearDeath * 0.3, grief: 0 },
        beat: ev.current <= 0
          ? 'Everything went dark at the edges — I am at death’s door.'
          : `Something vital drained out of me${nearDeath > 0.6 ? ' — I can feel how little is left' : ''}.`,
      };
    }
    case 'frequency_restored':
      return {
        deltas: { morale: 0.2, stress: -0.3, grief: 0 },
        beat: 'Strength came back to me. I can breathe again.',
      };
    case 'death_save_survived':
      // Relief and scarring at once: stress partially releases, grief marks the brush.
      return {
        deltas: { morale: 0.1, stress: -0.4, grief: 0.25 },
        beat: 'Death looked at me and let go. I survived — but I will not forget being held.',
      };
    case 'goal_completed':
      return {
        deltas: { morale: 0.5, stress: -0.15, grief: 0 },
        beat: `I did it${ev.goalName ? ` — ${ev.goalName}` : ''}. It was mine to do and I did it.`,
      };
    case 'goal_failed':
      return {
        deltas: { morale: -0.4, stress: 0.15, grief: 0.3 },
        beat: `I failed${ev.goalName ? ` — ${ev.goalName}` : ''}. Part of me went with it.`,
      };
    case 'goal_abandoned':
      return {
        deltas: { morale: -0.15, stress: -0.1, grief: 0.2 },
        beat: `I let it go${ev.goalName ? ` — ${ev.goalName}` : ''}. Lighter, and smaller.`,
      };
    case 'advancement':
      // Voluntary spending of the self to grow: investment, not wound.
      return {
        deltas: { morale: 0.3, stress: 0.05, grief: 0 },
        beat: 'I traded a piece of what keeps me alive for what I can now do. Worth it.',
      };
  }
}

/** Exponential decay toward baseline (0) across elapsed campaign cycles. */
export function decayDrives(d: Drives, elapsedCycles: number): Drives {
  if (elapsedCycles <= 0) return d;
  const k = Math.pow(0.5, elapsedCycles / DISPOSITION_TUNING.halfLifeCycles);
  return { morale: d.morale * k, stress: d.stress * k, grief: d.grief * k };
}

/** Ensure a DayaEntity row exists for this character (create-if-missing). */
async function ensureDayaEntity(characterId: string): Promise<{ id: string }> {
  return prisma.dayaEntity.upsert({
    where: { characterId },
    create: { characterId },
    update: {},
    select: { id: true },
  });
}

/**
 * Apply one real event to a character's affect. Fire-and-forget safe:
 * catches everything and logs — never throws into the calling mutation.
 */
export async function applyDispositionEvent(characterId: string, ev: DispositionEvent): Promise<void> {
  try {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, name: true, campaignId: true },
    });
    if (!character) return;

    const cycle = character.campaignId ? await currentCycleOf(character.campaignId) : 0;
    const entity = await ensureDayaEntity(character.id);

    const row = await prisma.dayaAffect.upsert({
      where: { entityId: entity.id },
      create: { entityId: entity.id, lastCycle: cycle },
      update: {},
    });

    const decayed = decayDrives(row, Math.max(0, cycle - row.lastCycle));
    const { deltas, beat } = evaluateEvent(ev, decayed);
    const next: Drives = {
      morale: clamp(decayed.morale + deltas.morale, -1, 1),
      stress: clamp(decayed.stress + deltas.stress, 0, 1),
      grief: clamp(decayed.grief + deltas.grief, 0, 1),
    };

    await prisma.dayaAffect.update({
      where: { entityId: entity.id },
      data: { ...next, lastCycle: cycle },
    });

    if (character.campaignId) {
      await writeHistory(character.campaignId, cycle, [{
        subjectType: 'character',
        subjectId: characterId,
        type: 'narrative_event',
        summary: beat,
        details: JSON.stringify({ event: ev.kind, disposition: next }),
        actorId: characterId,
        visibility: 'gm',
      }]);
    }
  } catch (err) {
    console.error('[daya-affect] applyDispositionEvent failed (non-fatal):', err);
  }
}

export async function getDisposition(characterId: string) {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
  if (!entity) return null;
  return prisma.dayaAffect.findUnique({ where: { entityId: entity.id } });
}

/**
 * One-line natural-language condition for prompt assembly. Returns null when
 * the character is at baseline (no line = no noise in the prompt).
 */
export function renderDispositionLine(d: Drives | null): string | null {
  if (!d) return null;
  const words: string[] = [];
  if (d.stress >= 0.7) words.push('badly shaken, on a hair trigger');
  else if (d.stress >= 0.35) words.push('tense and wary');
  if (d.grief >= 0.6) words.push('carrying heavy grief');
  else if (d.grief >= 0.25) words.push('quietly mourning something');
  if (d.morale >= 0.5) words.push('confident, appetite for more');
  else if (d.morale >= 0.2) words.push('encouraged');
  else if (d.morale <= -0.5) words.push('defeated, avoiding risk');
  else if (d.morale <= -0.2) words.push('discouraged');
  if (words.length === 0) return null;
  return words.join('; ');
}
