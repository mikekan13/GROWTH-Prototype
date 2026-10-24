/**
 * TIME JUMPS REQUIRE SIMULATION FOR ALL CHARACTERS (Mike 2026-10-24). A GM
 * line that states a span ("two hours go by", "3 days pass") moves the clock
 * (table-clock) — and the skipped stretch has to be LIVED by every character,
 * not just skipped over. HW3's "3 days go by" left Violet with the clock's
 * "about three days since you spoke" and nothing in the days; it was rolled
 * back for this.
 *
 * What runs, per awake being, when a stated span is long enough: WP12's
 * time-skip (daya/timeskip), framed with the span in words and the Watcher's
 * sentence — the being says what it found itself doing about its top goal in
 * that time, the adjudicator resolves it (facts + map effects), and the
 * result lands as a lived memory. Each being's stretch is posted to the table
 * as a `timeskip` game event so the Watcher sees what the world did with the
 * days. The table WAITS for it: a jump is a scene break, and the beings
 * should listen to the jump line having lived it.
 *
 * Not yet (flagged, Mike to rule): GM-voiced (DORMANT) characters — runTimeSkip
 * returns 'dormant' for them and that is posted; a being with no ACTIVE goal
 * ('no_active_vine') — posted too, nothing lived.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { isDayaEnabled } from '@/daya/events';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import { spanInWords, type ClockAdvance } from '@/services/table-clock';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';

/** Below this a stated span is a pause in the scene, not a stretch to live through. [PLACEHOLDER] */
export const TIMESKIP_MIN_SECONDS = 60 * 60;

export interface StatedStretch {
  seconds: number;
  span: string;
}

/** Pure: does this clock advance call for simulation? A stated span of at least TIMESKIP_MIN_SECONDS. */
export function statedStretchOf(adv: Pick<ClockAdvance, 'seconds' | 'source' | 'skipped'>): StatedStretch | null {
  if (adv.skipped || adv.source !== 'stated' || adv.seconds < TIMESKIP_MIN_SECONDS) return null;
  return { seconds: adv.seconds, span: spanInWords(adv.seconds) };
}

export interface StretchOutcome {
  characterId: string;
  name: string;
  status: string;
  line: string;
}

/**
 * Live the stretch for every awake being in the campaign (in parallel — one lane, the same as
 * parallel listeners) and post each outcome to the table. Never throws.
 */
export async function simulateStatedStretch(
  campaignId: string,
  actor: { userId: string; username: string; role: string },
  stretch: StatedStretch,
  narration: string,
): Promise<StretchOutcome[]> {
  if (!isDayaEnabled()) return [];
  let beings: Array<{ id: string; name: string; status: string }> = [];
  try {
    const rows = await prisma.dayaEntity.findMany({
      where: { character: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, status: { in: ['ACTIVE', 'DORMANT'] } },
      select: { status: true, character: { select: { id: true, name: true } } },
    });
    beings = rows.map((r) => ({ id: r.character.id, name: r.character.name, status: r.status }));
  } catch (err) {
    console.warn('[table-timeskip] could not list the beings (non-fatal):', err instanceof Error ? err.message : err);
    return [];
  }
  if (!beings.length) return [];
  console.log(`[table-timeskip] ${stretch.span} stated — living it for ${beings.map((b) => b.name).join(', ')}`);

  const frame = { span: stretch.span, narration: narration.trim() || undefined };
  // Loaded here, not at the top: daya/timeskip pulls the whole ensemble (handler registration) in with it,
  // and the table should not carry that on import.
  const { runTimeSkip } = await import('@/daya/timeskip');
  const outcomes = await Promise.all(beings.map(async (b): Promise<StretchOutcome> => {
    try {
      const r = await runTimeSkip(b.id, actor.role, {}, false, frame);
      const line = r.status === 'ok'
        ? `${b.name}, over ${stretch.span}: ${r.statedIntent ?? ''}${r.adjudication?.outcome ? ` — ${r.adjudication.outcome}` : ''}`.trim()
        : r.status === 'dormant'
          ? `${b.name}, over ${stretch.span}: voiced by the Watcher — nothing lived on its own (GM-voiced characters are not simulated yet)`
          : r.status === 'no_active_vine'
            ? `${b.name}, over ${stretch.span}: no active goal to live toward — nothing lived`
            : `${b.name}, over ${stretch.span}: not lived (${r.status}${r.detail ? `: ${r.detail}` : ''})`;
      const effects = r.adjudication?.effects;
      if (effects?.applied.length) console.log(`[table-timeskip] ${b.name}: ${effects.applied.join('; ')}`);
      if (effects?.refused.length) console.warn(`[table-timeskip] ${b.name}: map refused ${effects.refused.join('; ')}`);
      return { characterId: b.id, name: b.name, status: r.status, line };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[table-timeskip] ${b.name}: time-skip failed (non-fatal): ${msg}`);
      return { characterId: b.id, name: b.name, status: 'error', line: `${b.name}, over ${stretch.span}: not lived (${msg.slice(0, 120)})` };
    }
  }));

  for (const o of outcomes) await postStretch(campaignId, actor, o).catch((err) => console.warn('[table-timeskip] post failed (non-fatal):', err instanceof Error ? err.message : err));
  return outcomes;
}

async function postStretch(campaignId: string, actor: { userId: string; username: string }, o: StretchOutcome): Promise<void> {
  const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }).catch(() => null))?.currentCycle;
  const payload: TerminalPayload = { kind: 'game_event', eventType: 'timeskip', description: o.line, ...(cycle !== undefined ? { cycle } : {}) };
  const event = await createCampaignEvent({
    campaignId, type: 'game_event', actor: 'system', actorUserId: actor.userId, actorName: actor.username,
    characterId: o.characterId, characterName: o.name, payload,
  });
  const terminalEvent: TerminalEvent = {
    id: `ev-${event.id}`, type: 'game_event',
    timestamp: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
    campaignId, actor: 'system', actorUserId: actor.userId, actorName: actor.username,
    characterId: o.characterId, characterName: o.name, sessionId: event.sessionId || undefined, payload,
  };
  broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });
}
