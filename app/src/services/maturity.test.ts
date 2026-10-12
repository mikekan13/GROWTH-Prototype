/** Adult-only campaigns (Mike 2026-10-12): propagation, watcher toggle, gates, member removal. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ConflictError } from '@/lib/errors';
import { AdultOnlyError } from '@/lib/permissions';

type Row = Record<string, unknown>;
const db = {
  users: [] as Row[],
  campaigns: [] as Row[],
  members: [] as Row[],
  forgeItems: [] as Row[],
  audits: [] as Row[],
  copilot: [] as Row[],
};

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Row;
      if ('not' in o) return row[k] !== o.not;
      if ('in' in o) return (o.in as unknown[]).includes(row[k]);
      if ('contains' in o) return String(row[k] ?? '').includes(String(o.contains));
      return true; // relation filters are not modelled here
    }
    return row[k] === v;
  });
}
const withUser = (m: Row) => ({ ...m, user: db.users.find(u => u.id === m.userId) });
const countMembers = (campaignId: unknown) => db.members.filter(m => m.campaignId === campaignId && m.status !== 'REMOVED').length;

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(async ({ where }: { where: Row }) => db.users.find(u => u.id === where.id) ?? null) },
    campaign: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async ({ where, include }: { where: Row; include?: Row }) => {
        const c = db.campaigns.find(x => (where.id ? x.id === where.id : x.inviteCode === where.inviteCode));
        if (!c) return null;
        return include?._count ? { ...c, _count: { members: countMembers(c.id) } } : { ...c };
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const c = db.campaigns.find(x => x.id === where.id)!;
        for (const [k, v] of Object.entries(data)) if (v !== undefined) c[k] = v;
        return { ...c };
      }),
    },
    campaignMember: {
      findMany: vi.fn(async ({ where }: { where: Row }) => db.members.filter(m => matches(m, where)).map(withUser)),
      findUnique: vi.fn(async ({ where, include }: { where: Row; include?: Row }) => {
        const m = where.id
          ? db.members.find(x => x.id === where.id)
          : db.members.find(x => {
            const k = where.campaignId_userId as Row;
            return x.campaignId === k.campaignId && x.userId === k.userId;
          });
        if (!m) return null;
        return include?.campaign ? { ...m, campaign: db.campaigns.find(c => c.id === m.campaignId) } : { ...m };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = db.members.filter(m => matches(m, where));
        hit.forEach(m => Object.assign(m, data));
        return { count: hit.length };
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => Object.assign(db.members.find(m => m.id === where.id)!, data)),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const m = { id: `m${db.members.length + 1}`, ...data };
        db.members.push(m);
        return m;
      }),
    },
    forgeItem: { findMany: vi.fn(async ({ where }: { where: Row }) => db.forgeItems.filter(f => matches(f, where))) },
    auditEntry: {
      count: vi.fn(async ({ where }: { where: Row }) => db.audits.filter(a => matches(a, where)).length),
      create: vi.fn(async ({ data }: { data: Row }) => { db.audits.push(data); return data; }),
    },
    dayaMemoryEntry: { findMany: vi.fn(async () => []) },
    copilotMessage: { create: vi.fn(async ({ data }: { data: Row }) => { db.copilot.push(data); return data; }) },
  },
}));
vi.mock('@/services/consent', () => ({ assertMetaConsent: vi.fn(async () => undefined) }));
vi.mock('@/services/krma/wallet', () => ({ createCampaignWallet: vi.fn() }));
vi.mock('@/services/character', () => ({ createDraftCharacterForMember: vi.fn(async () => undefined) }));

const maturity = await import('./maturity');
const { requireCampaignMember } = await import('./campaign-access');
const { joinCampaign, reviewInterest, listCampaigns } = await import('./campaign');

const ADULT = { id: 'adult', role: 'TRAILBLAZER', dateOfBirth: new Date('1990-01-01T00:00:00Z') };
const MINOR = { id: 'minor', role: 'TRAILBLAZER', dateOfBirth: new Date('2015-01-01T00:00:00Z') };
const UNKNOWN = { id: 'unknown', role: 'TRAILBLAZER', dateOfBirth: null };
const MIKE = { id: 'mike', role: 'ADMIN', dateOfBirth: null };
const GM = { id: 'gm', role: 'WATCHER', dateOfBirth: new Date('1985-01-01T00:00:00Z') };

beforeEach(() => {
  db.users = [ADULT, MINOR, UNKNOWN, MIKE, GM].map(u => ({ ...u }));
  db.campaigns = [{ id: 'c1', gmUserId: 'gm', inviteCode: 'inv1', status: 'ACTIVE', maxTrailblazers: 5, networkMode: 'DISCONNECTED', adultOnly: false, adultOnlySetBy: null, adultOnlyAt: null }];
  db.members = [];
  db.forgeItems = [];
  db.audits = [];
  db.copilot = [];
});

const sexualDraft = () => db.forgeItems.push({ id: 'f1', campaignId: 'c1', status: 'draft', data: JSON.stringify({ description: 'x', maturityFlags: ['sexual'] }) });

describe('auto propagation', () => {
  it('a sexual-flagged draft turns the campaign adult-only (auto)', async () => {
    sexualDraft();
    const r = await maturity.recomputeCampaignAdultOnly('c1');
    expect(r).toMatchObject({ adultOnly: true, changed: true });
    expect(db.campaigns[0]).toMatchObject({ adultOnly: true, adultOnlySetBy: 'auto' });
  });
  it('other flags do not', async () => {
    db.forgeItems.push({ id: 'f2', campaignId: 'c1', data: JSON.stringify({ maturityFlags: ['violence'] }) });
    expect((await maturity.recomputeCampaignAdultOnly('c1')).adultOnly).toBe(false);
  });
  it('auto clears its own true when the content goes; never a watcher-set true', async () => {
    sexualDraft();
    await maturity.recomputeCampaignAdultOnly('c1');
    db.forgeItems = [];
    expect((await maturity.recomputeCampaignAdultOnly('c1')).adultOnly).toBe(false);

    await maturity.setCampaignAdultOnly('c1', { id: 'gm', role: 'WATCHER' }, true);
    const r = await maturity.recomputeCampaignAdultOnly('c1');
    expect(r.adultOnly).toBe(true);
    expect(db.campaigns[0].adultOnlySetBy).toBe('watcher');
  });
  it('noteSexualContent (tone filter hook) turns the table 18+ and keeps it while the note stands', async () => {
    await maturity.noteSexualContent('c1', { table: 'CopilotMessage', id: 'msg1' });
    expect(db.campaigns[0]).toMatchObject({ adultOnly: true, adultOnlySetBy: 'auto' });
    await expect(maturity.setCampaignAdultOnly('c1', { id: 'gm', role: 'WATCHER' }, false)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('watcher toggle', () => {
  it('only the GM/ADMIN may set it', async () => {
    await expect(maturity.setCampaignAdultOnly('c1', { id: 'adult', role: 'TRAILBLAZER' }, true)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('a watcher cannot un-set while flagged content exists; can once it is gone', async () => {
    sexualDraft();
    await maturity.recomputeCampaignAdultOnly('c1');
    await expect(maturity.setCampaignAdultOnly('c1', { id: 'gm', role: 'WATCHER' }, false)).rejects.toBeInstanceOf(ConflictError);
    db.forgeItems = [];
    await maturity.setCampaignAdultOnly('c1', { id: 'gm', role: 'WATCHER' }, true);
    const r = await maturity.setCampaignAdultOnly('c1', { id: 'gm', role: 'WATCHER' }, false);
    expect(r.adultOnly).toBe(false);
  });
});

describe('member removal + notice', () => {
  it('turning 18+ moves minors (and unknown DOB) to REMOVED, keeps adults, tells the Watcher', async () => {
    db.members = [
      { id: 'mA', campaignId: 'c1', userId: 'adult', status: 'ACTIVE' },
      { id: 'mM', campaignId: 'c1', userId: 'minor', status: 'ACTIVE' },
      { id: 'mU', campaignId: 'c1', userId: 'unknown', status: 'BACKSTORY' },
    ];
    sexualDraft();
    const r = await maturity.recomputeCampaignAdultOnly('c1');
    expect(r.removed).toBe(2);
    expect(db.members.map(m => m.status)).toEqual(['ACTIVE', 'REMOVED', 'REMOVED']);
    expect(db.members).toHaveLength(3); // nothing deleted
    expect(db.copilot).toHaveLength(1);
    expect(db.copilot[0]).toMatchObject({ userId: 'gm', content: '2 members removed: table is now 18+', contentClass: 'real' });
  });
});

describe('enforcement', () => {
  beforeEach(async () => {
    await maturity.setCampaignAdultOnly('c1', { id: 'gm', role: 'WATCHER' }, true);
  });
  it('a minor cannot join by invite code (403); an adult can', async () => {
    await expect(joinCampaign('minor', 'inv1')).rejects.toBeInstanceOf(AdultOnlyError);
    await expect(joinCampaign('unknown', 'inv1')).rejects.toMatchObject({ status: 403, message: 'This table is 18+' });
    await expect(joinCampaign('adult', 'inv1')).resolves.toMatchObject({ campaign: { id: 'c1' } });
  });
  it('a minor cannot view (requireCampaignMember 403) even with a member row; adults, the GM and ADMIN with null DOB can', async () => {
    db.members.push({ id: 'mM', campaignId: 'c1', userId: 'minor', status: 'ACTIVE' });
    db.members.push({ id: 'mA', campaignId: 'c1', userId: 'adult', status: 'ACTIVE' });
    await expect(requireCampaignMember('c1', { id: 'minor', role: 'TRAILBLAZER' })).rejects.toBeInstanceOf(AdultOnlyError);
    await expect(requireCampaignMember('c1', { id: 'adult', role: 'TRAILBLAZER' })).resolves.toMatchObject({ id: 'c1' });
    await expect(requireCampaignMember('c1', { id: 'gm', role: 'WATCHER' })).resolves.toMatchObject({ id: 'c1' });
    await expect(requireCampaignMember('c1', { id: 'mike', role: 'ADMIN' })).resolves.toMatchObject({ id: 'c1' });
  });
  it('a removed member no longer passes the view gate even after turning 18', async () => {
    db.members.push({ id: 'mR', campaignId: 'c1', userId: 'adult', status: 'REMOVED' });
    await expect(requireCampaignMember('c1', { id: 'adult', role: 'TRAILBLAZER' })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('the GM cannot accept ("invite") a minor; can accept an adult', async () => {
    db.members.push({ id: 'iM', campaignId: 'c1', userId: 'minor', status: 'INTERESTED' });
    db.members.push({ id: 'iA', campaignId: 'c1', userId: 'adult', status: 'INTERESTED' });
    await expect(reviewInterest('gm', 'WATCHER', 'iM', 'BACKSTORY')).rejects.toBeInstanceOf(AdultOnlyError);
    await expect(reviewInterest('gm', 'WATCHER', 'iA', 'BACKSTORY')).resolves.toMatchObject({ status: 'BACKSTORY' });
  });
  it('the 403 maps to HTTP 403', () => {
    expect(new AdultOnlyError().status).toBe(403);
  });
  it('listCampaigns hides adult-only tables from minors (and removed rows), not from adults', async () => {
    const { prisma } = await import('@/lib/db');
    const findMany = prisma.campaign.findMany as unknown as ReturnType<typeof vi.fn>;
    findMany.mockClear();
    await listCampaigns('minor', MINOR);
    expect(findMany.mock.calls[1][0].where).toMatchObject({ adultOnly: false, members: { some: { userId: 'minor', status: { not: 'REMOVED' } } } });
    findMany.mockClear();
    await listCampaigns('adult', ADULT);
    expect(findMany.mock.calls[1][0].where.adultOnly).toBeUndefined();
  });
});
