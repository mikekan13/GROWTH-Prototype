/**
 * THE WATCHER CAN READ A SILENCE (HW3 2026-10-24). Mike at close: "Did Violet
 * choose to not actually pay him?" — and nobody could say: the listening
 * monologue, where her four "stay"s on the knocks had their reasons, was never
 * persisted ("thought, not event"). It still is not a memory and not a feed
 * row. It is a record: one `being_thought` event per being per stretch, with
 * what it heard, what went through it and its impulse. The table ignores the
 * kind (feed-rows → []); the Watcher reads it from the record (events API
 * with `types=being_thought`, or the handoff scripts).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { ListenImpulse } from '@/daya/prompts/roles/spirit';
import type { TerminalEvent } from '@/types/terminal';

export interface BeingThoughtRecord {
  characterId: string;
  characterName: string;
  heard: string;
  thought: string | undefined;
  impulse: ListenImpulse;
  canonEventId: string | null;
  cycle?: number;
  /** Built up (scene-builder 2026-10-25): the being's side of the scene, and its monologue as a card. */
  scene?: string | null;
  segments?: Array<{ kind: 'action' | 'thought' | 'speech'; text: string; narrated?: string }>;
  /** ORDINARY COMPETENCE (2026-10-30): the player behind the character's decision on a routine step, for the Watcher's eyes. */
  player?: { decision: 'follow' | 'hold' | 'break'; reason: string; step: string; routine: string; roll?: { rollId: string; success: boolean | null; total?: number; dr: number; via: 'ai' | 'popup' } };
}

const segs = (segments: BeingThoughtRecord['segments']) => segments?.length ? segments.map((s) => ({ kind: s.kind, text: s.text.slice(0, 1500), ...(s.narrated ? { narrated: s.narrated.slice(0, 1500) } : {}) })) : undefined;

/** Every open terminal gets the row at once (speed, 2026-10-29: before this the beat waited for the next fetch). */
function pushRow(campaignId: string, ev: { id: string; createdAt: Date | string; sessionId?: string | null; actorUserId?: string | null; actorName?: string | null; characterId?: string | null; characterName?: string | null }, payload: Record<string, unknown>): void {
  const terminalEvent: TerminalEvent = {
    id: `ev-${ev.id}`, type: 'being_thought',
    timestamp: ev.createdAt instanceof Date ? ev.createdAt.toISOString() : String(ev.createdAt),
    campaignId, actor: 'system', actorUserId: ev.actorUserId ?? '', actorName: ev.actorName ?? 'Being',
    characterId: ev.characterId ?? undefined, characterName: ev.characterName ?? undefined,
    sessionId: ev.sessionId || undefined, payload: payload as unknown as TerminalEvent['payload'],
  };
  broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });
}

/**
 * THE CARD FOLLOWS THE THOUGHT (speed, 2026-10-29): the beat is recorded and pushed the moment the being has thought;
 * the built card lands on the same row later and the row is pushed again under the same id.
 */
export async function attachBeingCard(campaignId: string, eventId: string, card: { scene: string | null; segments: BeingThoughtRecord['segments'] }): Promise<void> {
  try {
    const ev = await prisma.campaignEvent.findUnique({ where: { id: eventId } });
    if (!ev) return;
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(ev.payload ?? '{}') as Record<string, unknown>; } catch { /* fresh */ }
    payload = { ...payload, ...(card.scene ? { scene: card.scene.slice(0, 1200) } : {}), ...(segs(card.segments) ? { segments: segs(card.segments) } : {}) };
    await prisma.campaignEvent.update({ where: { id: eventId }, data: { payload: JSON.stringify(payload) } });
    pushRow(campaignId, ev, payload);
  } catch (err) { console.warn('[being-thought] card not attached (the thought stands):', err instanceof Error ? err.message : err); }
}

/** Never throws: a record that fails to write is logged, the table does not notice. Returns the row's id for the card to follow. */
export async function recordBeingThought(campaignId: string, by: { userId: string; username: string }, r: BeingThoughtRecord): Promise<string | null> {
  try {
    const payload = {
        kind: 'being_thought' as const,
        heard: r.heard.slice(0, 2000),
        thought: (r.thought ?? '').slice(0, 4000),
        impulse: r.impulse,
        canonEventId: r.canonEventId,
        ...(r.cycle !== undefined ? { cycle: r.cycle } : {}),
        ...(r.scene ? { scene: r.scene.slice(0, 1200) } : {}),
        ...(segs(r.segments) ? { segments: segs(r.segments) } : {}),
        ...(r.player ? { player: { ...r.player, reason: r.player.reason.slice(0, 300) } } : {}),
    };
    const ev = await createCampaignEvent({
      campaignId,
      type: 'being_thought',
      actor: 'system',
      actorUserId: by.userId,
      actorName: by.username,
      characterId: r.characterId,
      characterName: r.characterName,
      payload,
    });
    pushRow(campaignId, ev, payload);
    return ev.id;
  } catch (err) {
    console.warn('[being-thought] record failed (non-fatal):', err instanceof Error ? err.message : err);
    return null;
  }
}
