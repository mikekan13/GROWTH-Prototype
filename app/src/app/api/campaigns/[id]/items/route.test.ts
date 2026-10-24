/** GET /api/campaigns/[id]/items — ?holderId= / ?locationId= pass through to the service; bad input → 400. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const listCampaignItems = vi.hoisted(() => vi.fn(async () => [{ id: 'i1' }]));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: { id: 'gm', role: 'WATCHER' } })) }));
vi.mock('@/services/campaign-item', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/campaign-item')>();
  return { ...actual, listCampaignItems, createCampaignItem: vi.fn() };
});
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/provenance', () => ({ recordProvenanceSafe: vi.fn() }));

const { GET } = await import('./route');
const params = Promise.resolve({ id: 'c1' });
const get = (qs = '') => GET(new NextRequest(`http://x/api/campaigns/c1/items${qs}`), { params });

beforeEach(() => listCampaignItems.mockClear());

describe('GET /items', () => {
  it('no query → every item (default unchanged)', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: 'i1' }] });
    expect(listCampaignItems).toHaveBeenCalledWith('c1', {});
  });

  it('?holderId= and ?locationId= reach the service', async () => {
    await get('?holderId=v1');
    expect(listCampaignItems).toHaveBeenCalledWith('c1', { holderId: 'v1' });
    await get('?holderId=v1&locationId=loc1');
    expect(listCampaignItems).toHaveBeenCalledWith('c1', { holderId: 'v1', locationId: 'loc1' });
  });

  it('empty holderId → 400 from Zod, service not called', async () => {
    const res = await get('?holderId=');
    expect(res.status).toBe(400);
    expect(listCampaignItems).not.toHaveBeenCalled();
  });
});
