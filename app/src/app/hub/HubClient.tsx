'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import CampaignCard from '@/components/hub/CampaignCard';
import HubFilters from '@/components/hub/HubFilters';

interface CampaignListing {
  id: string;
  name: string;
  genre: string | null;
  description: string | null;
  tags: string[];
  gmUsername: string;
  members: { username: string; tkv: number }[];
  memberCount: number;
  maxTrailblazers: number;
  lastSession: { number: number; name: string | null; date: string } | null;
  createdAt: string;
}

export default function HubClient() {
  const [campaigns, setCampaigns] = useState<CampaignListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [genres, setGenres] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Endless feed: repeat campaigns to fill the feed
  const REPEAT_COUNT = 20; // repeat the list to simulate endless
  const feedItems = campaigns.length > 0
    ? Array.from({ length: REPEAT_COUNT }, (_, i) => campaigns.map(c => ({ ...c, _feedKey: `${i}-${c.id}` }))).flat()
    : [];

  const fetchCampaigns = useCallback(async (search = '', genre = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (genre) params.set('genre', genre);
      params.set('limit', '50');

      const res = await fetch(`/api/hub?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns);
        setCurrentIndex(0);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filterTimer, setFilterTimer] = useState<NodeJS.Timeout | null>(null);
  function handleFilter(search: string, genre: string) {
    if (filterTimer) clearTimeout(filterTimer);
    const t = setTimeout(() => fetchCampaigns(search, genre), 300);
    setFilterTimer(t);
  }

  function scrollTo(index: number) {
    const clamped = Math.max(0, Math.min(index, feedItems.length - 1));
    setCurrentIndex(clamped);
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
    }
  }

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (el) {
          const h = el.clientHeight;
          if (h > 0) {
            setCurrentIndex(Math.round(el.scrollTop / h));
          }
        }
        ticking = false;
      });
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [feedItems.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable cards — hidden scrollbar, snap scroll */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 snap-y snap-mandatory"
        style={{ overflowY: 'auto', scrollbarWidth: 'none' }}
      >
        <style>{`div[class*="snap-y"]::-webkit-scrollbar { display: none; }`}</style>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[var(--accent-teal)]/40 text-xs font-[family-name:var(--font-terminal)] tracking-[0.2em]">
              {'<SCANNING STREAM>'}
            </span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-white/30 text-sm font-[family-name:var(--font-terminal)]">
              No campaigns found
            </span>
          </div>
        ) : (
          feedItems.map(c => (
            <div key={c._feedKey} className="snap-start" style={{ height: '100%', minHeight: '100%' }}>
              <CampaignCard {...c} />
            </div>
          ))
        )}
      </div>

      {/* Navigation arrows */}
      {campaigns.length > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-6 py-1">
          <button
            onClick={() => scrollTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="text-[var(--accent-teal)] disabled:text-[var(--accent-teal)]/20 text-lg font-[family-name:var(--font-terminal)] transition-colors hover:text-white disabled:hover:text-[var(--accent-teal)]/20 px-2"
          >
            ▲
          </button>
          <button
            onClick={() => scrollTo(currentIndex + 1)}
            className="text-[var(--accent-teal)] text-lg font-[family-name:var(--font-terminal)] transition-colors hover:text-white px-2"
          >
            ▼
          </button>
        </div>
      )}

      {/* Fixed filters at bottom */}
      <div className="shrink-0">
        <HubFilters genres={genres} onFilter={handleFilter} />
      </div>
    </div>
  );
}
