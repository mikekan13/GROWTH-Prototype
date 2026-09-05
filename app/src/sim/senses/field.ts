/**
 * Senses contract v0 — the raw sensory field a branch receives at Intention.
 *
 * Mike 09-05: senses are raw input determined by BODY PARTS (eyesight range,
 * low-light, hearing, taste, non-human senses). Raw input is passive, full-
 * field, free: "if I sit in my room and look at my desk, I see it all."
 * NOTICING is conscious effort — a skill check, an action. Involuntary
 * salience (a bang, sudden movement) pops out for free.
 *
 * v0 filters by body only coarsely: an entity with no sighted head region is
 * told so. Everything else at the scene is in the field (theater-of-mind
 * encounter; no grid positions yet). The field is deliberately plain text —
 * it is what the branch's Spirit prompt reads and what gets ledgered as the
 * perception memory, so it must contain nothing the body could not sense.
 */
import type { Participant, RoundLogEntry } from '../round/types';

export interface SensoryField {
  forParticipantId: string;
  /** Plain-text field, second person, present tense. */
  text: string;
  /** Participants visible to this entity (v0: all not-downed others at the scene). */
  visible: Array<{ id: string; name: string; side: string; downed: boolean }>;
  /** Free involuntary salience — what popped out last round (downs, hits on self, hits near self). */
  salient: string[];
}

export interface FieldInput {
  self: Participant;
  participants: Participant[];
  round: number;
  /** Last round's log — what this entity witnessed (v0: everything at the scene). */
  lastRoundLog: RoundLogEntry[];
  /** GM's scene setup narration, if any (Stage 1: "GM narrates and gives the players the setup"). */
  sceneNarration?: string | null;
  /** Coarse body capability flags derived from anatomy (v0). */
  body?: { canSee: boolean; canHear: boolean };
}

export function buildSensoryField(input: FieldInput): SensoryField {
  const { self, participants, round, lastRoundLog } = input;
  const canSee = input.body?.canSee ?? true;
  const canHear = input.body?.canHear ?? true;
  const others = participants.filter(p => p.id !== self.id);
  const visible = canSee ? others.map(p => ({ id: p.id, name: p.name, side: p.side, downed: p.downed })) : [];

  const salient: string[] = [];
  for (const l of lastRoundLog) {
    if (l.kind === 'downed') salient.push(l.text);
    else if (l.kind === 'damage' && l.targetId === self.id) salient.push(`You are hit: ${l.text}`);
    else if (l.kind === 'negate' && l.actorId === self.id) salient.push(l.text);
  }

  const lines: string[] = [];
  if (input.sceneNarration) lines.push(input.sceneNarration.trim());
  lines.push(`Round ${round}.`);
  if (!canSee && !canHear) {
    lines.push('You cannot see or hear. You feel the ground and the air.');
  } else {
    if (canSee) {
      const allies = visible.filter(v => v.side === self.side && !v.downed).map(v => v.name);
      const foes = visible.filter(v => v.side !== self.side && !v.downed).map(v => v.name);
      const down = visible.filter(v => v.downed).map(v => v.name);
      if (foes.length) lines.push(`Against you: ${foes.join(', ')}.`);
      if (allies.length) lines.push(`With you: ${allies.join(', ')}.`);
      if (down.length) lines.push(`Down: ${down.join(', ')}.`);
      if (!foes.length && !allies.length) lines.push('No one else stands here.');
    } else {
      lines.push('You cannot see. You hear movement around you.');
    }
    if (canHear && round > 1) {
      const heard = lastRoundLog.filter(l => l.kind === 'check' || l.kind === 'damage' || l.kind === 'downed').slice(-6).map(l => l.text);
      if (heard.length) lines.push('What just happened: ' + heard.join(' '));
    }
  }
  if (self.downed) lines.push('You are down.');
  if (salient.length) lines.push('What grabs you: ' + salient.join(' '));

  return { forParticipantId: self.id, text: lines.join('\n'), visible, salient };
}
