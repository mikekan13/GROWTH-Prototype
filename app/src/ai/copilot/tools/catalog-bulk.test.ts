/**
 * search_catalog bulk mode: several lookups in ONE call (perf pass 2026-10-12).
 */
import { describe, it, expect, vi } from 'vitest';

const search = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/forge', () => ({
  searchGlobalCatalog: (opts: unknown) => search(opts),
  pullFromGlobalCatalog: vi.fn(),
}));

import { searchCatalogTool } from './catalog';

const ctx = { campaignId: 'c', actorId: 'a', actorRole: 'GODHEAD' };

describe('search_catalog', () => {
  it('runs every query of a bulk call and returns one result set per query', async () => {
    search.mockImplementation(async (o: { query?: string }) =>
      o.query === 'knife' ? [{ id: 'k', name: 'Kitchen Knife', type: 'item', karmicValue: 4, data: {} }] : []);
    const out = await searchCatalogTool.handler({ queries: [{ query: 'knife', type: 'item' }, { query: 'grief', type: 'thorn' }] }, ctx);
    const o = out.output as { ok: boolean; results: Array<{ query: { query: string }; count: number }> };
    expect(search).toHaveBeenCalledTimes(2);
    expect(o.results.map(r => [r.query.query, r.count])).toEqual([['knife', 1], ['grief', 0]]);
  });

  it('a single search still works', async () => {
    search.mockReset().mockResolvedValue([]);
    const out = await searchCatalogTool.handler({ query: 'x' }, ctx);
    expect(out.output).toMatchObject({ ok: true, count: 0, entries: [] });
  });
});
