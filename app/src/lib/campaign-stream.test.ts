/** Perception unit 9: what a perceived-feed SSE connection receives (lib/campaign-stream deliveryFor). */
import { describe, it, expect } from 'vitest';
import { deliveryFor } from './campaign-stream';
import type { CampaignStreamEvent } from '@/types/campaign-events';

const envelope = (data: CampaignStreamEvent['data']): CampaignStreamEvent => ({ id: 'x', timestamp: 't', campaignId: 'c1', data });
const line = (characterId: string | undefined, actorUserId: string, actor: 'player' | 'gm' = 'player') => envelope({
  kind: 'terminal_event',
  event: { id: 'ev-1', type: 'chat', timestamp: 't', campaignId: 'c1', actor, actorUserId, actorName: 'n', characterId, payload: { kind: 'chat', message: 'SECRET line' } },
});

describe('deliveryFor (perceived-feed connections)', () => {
  it('truth-record connections get every event unchanged', () => {
    const e = line('danny', 'p2');
    expect(deliveryFor({ userId: 'gm' }, e)).toBe(e);
  });

  it('another being\'s line becomes a text-free nudge', () => {
    const out = deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, line('danny', 'p2'));
    expect(out?.data).toEqual({ kind: 'perceived_feed_stale' });
    expect(JSON.stringify(out)).not.toContain('SECRET');
    const gm = deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, line(undefined, 'gm', 'gm'));
    expect(JSON.stringify(gm)).not.toContain('SECRET');
  });

  it('the viewer\'s own line arrives in full', () => {
    const e = line('violet', 'p1');
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, e)).toBe(e);
  });

  it('the growing line (being_speaking) is not sent; other kinds pass', () => {
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, envelope({ kind: 'being_speaking', phase: 'final', utteranceId: 'u', characterId: 'ruth', action: 'speak', text: 'SECRET', revoiced: false }))).toBeNull();
    const hb = envelope({ kind: 'heartbeat' });
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: null } }, hb)).toBe(hb);
  });
});
