/** listCampaignItems — optional holder/location filters (2026-10-23); default = every item. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.hoisted(() => vi.fn(async () => []));

vi.mock('@/lib/db', () => ({ prisma: { campaignItem: { findMany } } }));
vi.mock('@/services/provenance', () => ({ recordProvenanceSafe: vi.fn() }));

const { listCampaignItems, listCampaignItemsQuerySchema } = await import('./campaign-item');

beforeEach(() => findMany.mockClear());

describe('listCampaignItems', () => {
  it('no filter → campaign only (unchanged default)', async () => {
    await listCampaignItems('c1');
    expect(findMany).toHaveBeenCalledWith({ where: { campaignId: 'c1' }, orderBy: { updatedAt: 'desc' } });
  });

  it('holderId / locationId narrow the where', async () => {
    await listCampaignItems('c1', { holderId: 'v1' });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { campaignId: 'c1', holderId: 'v1' } });
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('where.locationId');

    await listCampaignItems('c1', { holderId: 'v1', locationId: 'loc1' });
    expect(findMany.mock.calls[1][0].where).toEqual({ campaignId: 'c1', holderId: 'v1', locationId: 'loc1' });
  });
});

describe('listCampaignItemsQuerySchema', () => {
  it('accepts empty and either key; rejects empty strings (Zod 4 issues)', () => {
    expect(listCampaignItemsQuerySchema.parse({})).toEqual({});
    expect(listCampaignItemsQuerySchema.parse({ holderId: 'v1' })).toEqual({ holderId: 'v1' });
    const r = listCampaignItemsQuerySchema.safeParse({ holderId: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['holderId']);
  });
});
