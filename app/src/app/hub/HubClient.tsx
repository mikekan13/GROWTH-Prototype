'use client';

import { useState, useEffect, useCallback } from 'react';
import CampaignCard from '@/components/hub/CampaignCard';
import HubFilters from '@/components/hub/HubFilters';

interface CampaignListing {
  id: string;
  name: string;
  genre: string | null;
  description: string | null;
  tags: string[];
  gmUsername: string;
  memberCount: number;
  maxTrailblazers: number;
}

export default function HubClient() {
  const [campaigns, setCampaigns] = useState<CampaignListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [genres, setGenres] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  const fetchCampaigns = useCallback(async (search = '', genre = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (genre) params.set('genre', genre);

      const res = await fetch(`/api/hub?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns);
        setTotal(data.total);

        // Extract unique genres from results for filter dropdown
        const uniqueGenres = [...new Set(data.campaigns.map((c: CampaignListing) => c.genre).filter(Boolean))] as string[];
        if (uniqueGenres.length > genres.length) {
          setGenres(uniqueGenres);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [genres.length]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Debounced filter
  const [filterTimer, setFilterTimer] = useState<NodeJS.Timeout | null>(null);
  function handleFilter(search: string, genre: string) {
    if (filterTimer) clearTimeout(filterTimer);
    const t = setTimeout(() => fetchCampaigns(search, genre), 300);
    setFilterTimer(t);
  }

  return (
    <div className="space-y-4">
      <HubFilters genres={genres} onFilter={handleFilter} />

      {loading ? (
        <div className="text-center py-8">
          <span className="text-xs text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)] tracking-wider">
            Loading campaigns...
          </span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-8 border border-[var(--surface-dark)]/10 bg-white/30">
          <span className="text-sm text-[var(--surface-dark)]/40">
            No campaigns found
          </span>
        </div>
      ) : (
        <>
          <div className="text-[10px] text-[var(--surface-dark)]/30 font-[family-name:var(--font-terminal)]">
            {total} campaign{total !== 1 ? 's' : ''} found
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {campaigns.map(c => (
              <CampaignCard key={c.id} {...c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
