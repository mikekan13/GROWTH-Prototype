/**
 * Prods reach whoever owns the answer (2026-10-16): GM chat for 'gm' (as
 * before), a UserNotification for a player audience, a needs_input stream
 * event either way (targeted when it is a player's).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, notify, broadcast } = vi.hoisted(() => ({
  db: {
    campaign: { findUnique: vi.fn() },
    character: { findUnique: vi.fn() },
    copilotMessage: { create: vi.fn() },
  },
  notify: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: (...a: unknown[]) => broadcast(...a) }));
vi.mock('./notifications', () => ({ GENESIS_PROD_NOTIFICATION: 'genesis_prod', createNotification: (...a: unknown[]) => notify(...a) }));
vi.mock('@/ai/copilot/jewl-identity', () => ({ getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl' })) }));
vi.mock('./campaign-access', () => ({ requireCampaignGM: vi.fn() }));

import { deliverGenesisProd, parseProdAudience, prodRecipient } from './character-genesis-progress';

const session = { id: 's1', campaignId: 'c1', goal: 'Character genesis: Violet [ch1] — gestate the person' };
const prod = (audience: string, id = 'p1') => ({ id, question: 'Where does she sleep?', why: 'Her home seeds her world.', audience });

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findUnique.mockResolvedValue({ gmUserId: 'gm' });
  db.character.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    ch1: { userId: 'pl', campaignId: 'c1' },
    ch2: { userId: 'pl2', campaignId: 'c1' },
    npc1: { userId: 'gm', campaignId: 'c1' },
    foreign: { userId: 'px', campaignId: 'c9' },
  } as Record<string, unknown>)[where.id] ?? null);
  db.copilotMessage.create.mockResolvedValue({ id: 'm1' });
  notify.mockResolvedValue({ id: 'n1' });
});

describe('parseProdAudience / prodRecipient (pure)', () => {
  it('parses the three shapes; unknown → gm', () => {
    expect(parseProdAudience('gm')).toEqual({ kind: 'gm' });
    expect(parseProdAudience(null)).toEqual({ kind: 'gm' });
    expect(parseProdAudience('player')).toEqual({ kind: 'player' });
    expect(parseProdAudience('player:ch2')).toEqual({ kind: 'player:character', characterId: 'ch2' });
    expect(parseProdAudience('player:')).toEqual({ kind: 'gm' });
  });
  it('routes: gm → chat; player → owner notification; player:<id> → that owner; an owner who IS the GM → chat', () => {
    const ctx = { gmUserId: 'gm', ownerUserId: 'pl', namedOwnerUserId: 'pl2' };
    expect(prodRecipient('gm', ctx)).toEqual({ channel: 'chat', userId: 'gm', audience: 'gm' });
    expect(prodRecipient('player', ctx)).toEqual({ channel: 'notification', userId: 'pl', audience: 'player' });
    expect(prodRecipient('player:ch2', ctx)).toEqual({ channel: 'notification', userId: 'pl2', audience: 'player:ch2' });
    expect(prodRecipient('player', { ...ctx, ownerUserId: 'gm' })).toEqual({ channel: 'chat', userId: 'gm', audience: 'player' });
    expect(prodRecipient('player:ch2', { ...ctx, namedOwnerUserId: null })).toEqual({ channel: 'chat', userId: 'gm', audience: 'player:ch2' });
  });
});

describe('deliverGenesisProd', () => {
  it("'gm': the GM chat line as today + an untargeted needs_input", async () => {
    const r = await deliverGenesisProd(session, prod('gm'));
    expect(r).toEqual({ channel: 'chat', userId: 'gm' });
    expect(db.copilotMessage.create).toHaveBeenCalledTimes(1);
    expect(db.copilotMessage.create.mock.calls[0][0].data).toMatchObject({ campaignId: 'c1', role: 'assistant', userId: 'gm', content: expect.stringContaining('Where does she sleep?') });
    expect(notify).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith('c1', { kind: 'needs_input', characterId: 'ch1', prodId: 'p1', audience: 'gm', question: 'Where does she sleep?' }, undefined);
  });

  it("'player': a notification for Violet's player, no GM chat line, needs_input targeted at her", async () => {
    const r = await deliverGenesisProd(session, prod('player'));
    expect(r).toEqual({ channel: 'notification', userId: 'pl' });
    expect(db.copilotMessage.create).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith({
      userId: 'pl', campaignId: 'c1', kind: 'genesis_prod',
      payload: { prodId: 'p1', sessionId: 's1', characterId: 'ch1', characterName: 'Violet', question: 'Where does she sleep?', why: 'Her home seeds her world.', audience: 'player' },
    });
    expect(broadcast).toHaveBeenCalledWith('c1', expect.objectContaining({ kind: 'needs_input', audience: 'player' }), 'pl');
  });

  it("'player:<id>': the named character's owner is told; a character of another campaign falls back to the GM", async () => {
    await deliverGenesisProd(session, prod('player:ch2'));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'pl2', payload: expect.objectContaining({ audience: 'player:ch2' }) }));
    vi.clearAllMocks();
    db.campaign.findUnique.mockResolvedValue({ gmUserId: 'gm' });
    db.copilotMessage.create.mockResolvedValue({ id: 'm2' });
    await deliverGenesisProd(session, prod('player:foreign'));
    expect(notify).not.toHaveBeenCalled();
    expect(db.copilotMessage.create).toHaveBeenCalledTimes(1);
  });

  it('a GM-owned NPC asked as player goes to the GM chat', async () => {
    await deliverGenesisProd({ ...session, goal: 'Character genesis: Rosemary [npc1] — x' }, prod('player'));
    expect(notify).not.toHaveBeenCalled();
    expect(db.copilotMessage.create).toHaveBeenCalledTimes(1);
  });
});
