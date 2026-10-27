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
import { createCampaignEvent } from '@/services/campaign-event';
import type { ListenImpulse } from '@/daya/prompts/roles/spirit';

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
}

/** Never throws: a record that fails to write is logged, the table does not notice. */
export async function recordBeingThought(campaignId: string, by: { userId: string; username: string }, r: BeingThoughtRecord): Promise<void> {
  try {
    await createCampaignEvent({
      campaignId,
      type: 'being_thought',
      actor: 'system',
      actorUserId: by.userId,
      actorName: by.username,
      characterId: r.characterId,
      characterName: r.characterName,
      payload: {
        kind: 'being_thought',
        heard: r.heard.slice(0, 2000),
        thought: (r.thought ?? '').slice(0, 4000),
        impulse: r.impulse,
        canonEventId: r.canonEventId,
        ...(r.cycle !== undefined ? { cycle: r.cycle } : {}),
        ...(r.scene ? { scene: r.scene.slice(0, 1200) } : {}),
        ...(r.segments?.length ? { segments: r.segments.map((s) => ({ kind: s.kind, text: s.text.slice(0, 1500), ...(s.narrated ? { narrated: s.narrated.slice(0, 1500) } : {}) })) } : {}),
      },
    });
  } catch (err) {
    console.warn('[being-thought] record failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}
