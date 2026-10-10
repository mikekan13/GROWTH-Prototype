/** Campaign membership gate (Mike 2026-10-08) — GM, members and ADMIN only. */
import { describe, it, expect, vi } from 'vitest';
import { canViewCampaign } from '@/lib/permissions';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null),
    },
    campaignMember: {
      findUnique: vi.fn(async ({ where }: { where: { campaignId_userId: { campaignId: string; userId: string } } }) =>
        where.campaignId_userId.userId === 'p1' ? { id: 'm1' } : null),
    },
  },
}));

const { requireCampaignMember, requireCampaignGM } = await import('./campaign-access');

describe('requireCampaignGM (start/end session)', () => {
  it('lets the campaign GM and ADMIN/GODHEAD through', async () => {
    await expect(requireCampaignGM('c1', { id: 'gm', role: 'WATCHER' })).resolves.toMatchObject({ id: 'c1' });
    await expect(requireCampaignGM('c1', { id: 'mike', role: 'ADMIN' })).resolves.toMatchObject({ id: 'c1' });
    await expect(requireCampaignGM('c1', { id: 'god', role: 'GODHEAD' })).resolves.toMatchObject({ id: 'c1' });
  });
  it('403s a member, another Watcher and a stranger; 404s a missing campaign', async () => {
    await expect(requireCampaignGM('c1', { id: 'p1', role: 'TRAILBLAZER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCampaignGM('c1', { id: 'x', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCampaignGM('c1', { id: 'x', role: 'TRAILBLAZER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCampaignGM('nope', { id: 'gm', role: 'ADMIN' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('canViewCampaign', () => {
  const c = { gmUserId: 'gm' };
  it('GM, member and ADMIN/GODHEAD pass; a stranger does not', () => {
    expect(canViewCampaign('gm', 'WATCHER', c, false)).toBe(true);
    expect(canViewCampaign('p1', 'TRAILBLAZER', c, true)).toBe(true);
    expect(canViewCampaign('mike', 'ADMIN', c, false)).toBe(true);
    expect(canViewCampaign('god', 'GODHEAD', c, false)).toBe(true);
    expect(canViewCampaign('x', 'WATCHER', c, false)).toBe(false);
    expect(canViewCampaign('x', 'TRAILBLAZER', c, false)).toBe(false);
  });
});

describe('requireCampaignMember', () => {
  it('lets the GM, a member and ADMIN through', async () => {
    await expect(requireCampaignMember('c1', { id: 'gm', role: 'WATCHER' })).resolves.toMatchObject({ id: 'c1' });
    await expect(requireCampaignMember('c1', { id: 'p1', role: 'TRAILBLAZER' })).resolves.toMatchObject({ id: 'c1' });
    await expect(requireCampaignMember('c1', { id: 'mike', role: 'ADMIN' })).resolves.toMatchObject({ id: 'c1' });
  });
  it('403s a logged-in stranger, 404s a missing campaign', async () => {
    await expect(requireCampaignMember('c1', { id: 'x', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCampaignMember('nope', { id: 'gm', role: 'ADMIN' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
