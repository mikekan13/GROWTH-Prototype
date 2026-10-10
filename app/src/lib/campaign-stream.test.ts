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

  it('another being\'s line is not sent at all (the memory-write push re-reads the feed instead)', () => {
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, line('danny', 'p2'))).toBeNull();
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, line(undefined, 'gm', 'gm'))).toBeNull();
  });

  it('session markers pass (no diegetic text); the memory-write push passes', () => {
    const marker = envelope({ kind: 'terminal_event', event: { id: 'ev-s', type: 'game_event', timestamp: 't', campaignId: 'c1', actor: 'gm', actorUserId: 'gm', actorName: 'GM', payload: { kind: 'game_event', eventType: 'session_start', description: 'Session 2' } } });
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, marker)).toBe(marker);
    const push = { ...envelope({ kind: 'perceived_feed_stale', characterId: 'violet' }), targetUserId: 'p1' };
    expect(deliveryFor({ userId: 'p1', perceived: { characterId: 'violet' } }, push)).toBe(push);
  });

  it('results and texts of other beings never reach a perceived connection', () => {
    const conn = { userId: 'p1', perceived: { characterId: 'violet' } };
    const check = envelope({ kind: 'check_result', checkId: 'k', characterId: 'danny', characterName: 'SECRET-NAME', sdDie: 'd6', sdResult: 3, fdDie: 'd6', fdResult: 2, effort: 0, total: 5, dr: 4, success: true, margin: 1 });
    expect(deliveryFor(conn, check)).toBeNull();
    expect(deliveryFor(conn, { ...check, data: { ...check.data, characterId: 'violet' } as typeof check.data })).not.toBeNull();
    expect(deliveryFor(conn, envelope({ kind: 'cast_result', characterId: 'danny', characterName: 'SECRET-NAME', method: 'wild', schools: [], weakestSchool: 'x', fateRoll: 1, schoolContribution: 0, associatedContribution: 0, manaSpent: 0, total: 1, dr: 1, margin: 0, success: true, monkeyPaw: false, schoolToMarkTrainable: null, requiresSystemReview: false }))).toBeNull();
    expect(deliveryFor(conn, envelope({ kind: 'death_save', phase: 'TRIGGERED', characterId: 'danny', characterName: 'SECRET-NAME', door: 'COMBAT' }))).toBeNull();
    expect(deliveryFor(conn, envelope({ kind: 'skill_check_request', checkId: 'k', targetCharacterId: 'danny', targetCharacterName: 'SECRET-NAME', dr: 4, difficultyHint: 'blue', requestedBy: 'gm' }))).toBeNull();
    expect(deliveryFor(conn, envelope({ kind: 'daya_work_session', phase: 'opened', sessionId: 's', goal: 'SECRET goal' }))).toBeNull();
    const upd = deliveryFor(conn, envelope({ kind: 'character_update', characterId: 'danny', characterName: 'SECRET-NAME', fields: ['attributes'] }));
    expect(upd?.data).toEqual({ kind: 'character_update', characterId: 'danny', characterName: '', fields: ['attributes'] });
    const jw = deliveryFor(conn, envelope({ kind: 'jewl_working', phase: 'tool', tool: 'create_location', label: 'created "SECRET room"' }));
    expect(JSON.stringify(jw)).not.toContain('SECRET');
    expect(jw?.data).toEqual({ kind: 'jewl_working', phase: 'tool', tool: 'create_location' });
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
