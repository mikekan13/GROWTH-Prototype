'use client';

import Link from 'next/link';

interface CampaignCardProps {
  id: string;
  name: string;
  genre: string | null;
  description: string | null;
  tags: string[];
  gmUsername: string;
  memberCount: number;
  maxTrailblazers: number;
}

export default function CampaignCard({
  id, name, genre, description, tags, gmUsername, memberCount, maxTrailblazers,
}: CampaignCardProps) {
  const isFull = memberCount >= maxTrailblazers;

  return (
    <Link
      href={`/hub/${id}`}
      className="block border border-[var(--surface-dark)]/15 bg-white/50 hover:border-[var(--accent-teal)]/40 hover:bg-white/70 transition-all p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-[family-name:var(--font-header)] text-lg tracking-wider text-[var(--surface-dark)] leading-tight">
          {name}
        </h3>
        <span className={`text-[10px] uppercase tracking-wider font-[family-name:var(--font-terminal)] whitespace-nowrap ${isFull ? 'text-[var(--pillar-body)]' : 'text-[var(--accent-teal)]'}`}>
          {memberCount}/{maxTrailblazers}
        </span>
      </div>

      {genre && (
        <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--pillar-soul)] font-[family-name:var(--font-terminal)]">
          {genre}
        </div>
      )}

      {description && (
        <p className="text-xs text-[var(--surface-dark)]/60 line-clamp-2">
          {description}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/10 text-[10px] text-[var(--surface-dark)]/50">
              {tag}
            </span>
          ))}
        </div>
        <Link
          href={`/profile/${gmUsername}`}
          onClick={e => e.stopPropagation()}
          className="text-[10px] text-[var(--accent-gold)] font-[family-name:var(--font-terminal)] hover:underline"
        >
          {gmUsername}
        </Link>
      </div>
    </Link>
  );
}
