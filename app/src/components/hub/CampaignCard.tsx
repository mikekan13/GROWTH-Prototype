'use client';

import Link from 'next/link';

interface CampaignCardProps {
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

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 22%)`;
}

function genreBanner(genre: string | null): string {
  const g = (genre || '').toLowerCase();
  if (g.includes('horror') || g.includes('gothic')) return 'linear-gradient(135deg, #1a0a0a 0%, #2d1525 40%, #0a0a1a 100%)';
  if (g.includes('cyber') || g.includes('sci')) return 'linear-gradient(135deg, #0a1a2d 0%, #1a0a2d 40%, #0d2d3d 100%)';
  if (g.includes('fantasy') || g.includes('byzantine')) return 'linear-gradient(135deg, #1a0a2d 0%, #2d1a0a 40%, #0a1a0a 100%)';
  if (g.includes('post') || g.includes('apocal')) return 'linear-gradient(135deg, #1a1a0a 0%, #2d1a0a 40%, #0a0a0a 100%)';
  if (g.includes('maritime') || g.includes('adventure')) return 'linear-gradient(135deg, #0a1a2d 0%, #0a2d2d 40%, #0a0a1a 100%)';
  return 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2d 40%, #0a1a1a 100%)';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatTkv(tkv: number): string {
  return tkv.toLocaleString();
}

// PORTRAIT_HEIGHT controls how far portraits stick above the content area
const PORTRAIT_W = 100;
const PORTRAIT_H = 138;
const PORTRAIT_OVERLAP = Math.floor(PORTRAIT_H / 4); // quarter hangs over banner

function Portrait({ username, borderColor, labelColor, label, size = 'large', tkv }: {
  username: string;
  borderColor: string;
  labelColor: string;
  label: string;
  size?: 'large' | 'empty';
  tkv?: number;
}) {
  const isEmpty = size === 'empty';
  return (
    <div className="flex flex-col items-center">
      {/* Portrait + TKV flush together */}
      <div style={{ width: `${PORTRAIT_W}px` }}>
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{
            width: `${PORTRAIT_W}px`,
            height: `${PORTRAIT_H}px`,
            background: isEmpty ? 'transparent' : hashColor(username),
            border: isEmpty ? '1px dashed rgba(255,255,255,0.1)' : `2px solid ${borderColor}`,
          }}
        >
          {isEmpty ? (
            <img src="/EmptyPortrait.png" alt="Open slot" className="w-full h-full object-cover" />
          ) : (
            <>
              <div
                className="absolute inset-0 opacity-15"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 3px)',
                }}
              />
              <span
                className="relative text-4xl font-bold"
                style={{ fontFamily: '"Inknut Antiqua", serif', color: borderColor }}
              >
                {username.charAt(0).toUpperCase()}
              </span>
            </>
          )}
        </div>
        {/* TKV box — flush under portrait */}
        {!isEmpty && tkv !== undefined && (
          <div style={{ border: '1px solid #ffcc78', borderTop: 'none' }}>
            <div
              className="text-center text-[7px] leading-none py-0.5"
              style={{ background: '#f7525f', color: '#ffcc78', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.08em' }}
            >
              <span style={{ fontFamily: '"Inknut Antiqua", serif', fontWeight: 900, fontSize: '7px' }}>Ҝ</span>V
            </div>
            <div
              className="text-center text-[10px] leading-none py-0.5"
              style={{ background: '#b4a7d6', color: '#582a72', fontFamily: '"Bebas Neue", sans-serif' }}
            >
              {formatTkv(tkv)}
            </div>
          </div>
        )}
      </div>
      {/* Label */}
      <div className="text-center mt-1">
        <div className="text-[8px] tracking-[0.15em] uppercase font-[family-name:var(--font-terminal)]" style={{ color: `${labelColor}80` }}>
          {label}
        </div>
        <div className="text-[10px] font-[family-name:var(--font-terminal)] truncate max-w-[100px]" style={{ color: labelColor }}>
          {isEmpty ? 'open' : username}
        </div>
      </div>
    </div>
  );
}

export default function CampaignCard({
  id, name, genre, description, tags, gmUsername, members, memberCount, maxTrailblazers, lastSession, createdAt,
}: CampaignCardProps) {
  const isFull = memberCount >= maxTrailblazers;
  const slotsOpen = maxTrailblazers - memberCount;
  const totalPartyTkv = members.reduce((sum, m) => sum + m.tkv, 0);

  return (
    <Link
      href={`/hub/${id}`}
      className="block bg-black border border-[var(--accent-teal)]/20 hover:border-[var(--accent-teal)]/50 transition-all group relative h-full flex flex-col overflow-hidden"
    >
      {/* Banner — constrained height, will hold session video later */}
      <div
        className="relative overflow-hidden shrink-0"
        style={{ height: '35%', minHeight: '120px', background: genreBanner(genre) }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
          }}
        />

        {/* Genre badge */}
        {genre && (
          <div className="absolute top-3 left-4">
            <span
              className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] px-2 py-0.5 inline-block"
              style={{ background: 'var(--accent-teal)', color: '#000' }}
            >
              {genre}
            </span>
          </div>
        )}

        {/* Slot readout */}
        <div className="absolute top-3 right-4 flex items-center gap-0">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5"
            style={{
              fontFamily: 'Consolas, monospace',
              background: isFull ? 'var(--pillar-body)' : 'var(--accent-teal)',
              color: isFull ? '#fff' : '#000',
            }}
          >
            {slotsOpen > 0 ? `${slotsOpen} OPEN` : 'FULL'}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 text-white/50"
            style={{ fontFamily: 'Consolas, monospace', background: '#582a72' }}
          >
            {memberCount}/{maxTrailblazers}
          </span>
        </div>

        {/* Campaign name — positioned above portraits */}
        <div className="absolute bottom-[50px] left-0 right-0 px-6">
          <h3 className="font-[family-name:var(--font-header)] text-4xl tracking-wider text-white leading-tight group-hover:text-[var(--accent-teal)] transition-colors drop-shadow-lg">
            {name}
          </h3>
        </div>

        {/* Blocky accent lines on banner — circuit chip style */}
        <div className="absolute bottom-0 left-0 w-[60px] h-[2px] bg-[#E8585A]/30" />
        <div className="absolute bottom-0 left-[60px] w-[2px] h-[20px] bg-[#E8585A]/30" />
        <div className="absolute bottom-0 right-0 w-[40px] h-[2px] bg-[#582a72]/30" />
      </div>

      {/* Portrait row — overlapping banner by half */}
      <div
        className="relative px-4"
        style={{ marginTop: `-${PORTRAIT_OVERLAP}px` }}
      >
        <div className="flex items-start gap-3 overflow-x-auto">
          {/* Watcher */}
          <Portrait
            username={gmUsername}
            borderColor="var(--accent-gold)"
            labelColor="var(--accent-gold)"
            label="Watcher"
          />

          {/* Divider */}
          <div className="w-[1px] self-stretch bg-[var(--accent-teal)]/15 shrink-0 my-2" />

          {/* Trailblazers */}
          {members.map(member => (
            <Portrait
              key={member.username}
              username={member.username}
              borderColor="var(--accent-teal)"
              labelColor="var(--accent-teal)"
              label="Trailblazer"
              tkv={member.tkv}
            />
          ))}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, maxTrailblazers - memberCount) }).map((_, i) => (
            <Portrait
              key={`empty-${i}`}
              username=""
              borderColor="transparent"
              labelColor="rgba(255,255,255,0.15)"
              label="Open"
              size="empty"
            />
          ))}

          {/* Total Party TKV */}
          {totalPartyTkv > 0 && (
            <>
              <div className="w-[1px] self-stretch bg-[var(--accent-teal)]/15 shrink-0 my-2" />
              <div className="flex flex-col items-center justify-end self-end mb-1">
                <div style={{ border: '1px solid #ffcc78', minWidth: '70px' }}>
                  <div
                    className="text-center text-[7px] leading-none py-0.5 px-2"
                    style={{ background: '#f7525f', color: '#ffcc78', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.08em' }}
                  >
                    PARTY <span style={{ fontFamily: '"Inknut Antiqua", serif', fontWeight: 900, fontSize: '7px' }}>Ҝ</span>V
                  </div>
                  <div
                    className="text-center text-[12px] leading-none py-1 px-2"
                    style={{ background: '#b4a7d6', color: '#582a72', fontFamily: '"Bebas Neue", sans-serif' }}
                  >
                    {formatTkv(totalPartyTkv)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description + meta — fills remaining card space */}
      <div className="flex-1 px-5 py-3 space-y-3 border-t border-[var(--accent-teal)]/10 mt-2">
        {description && (
          <p className="text-[13px] text-white/50 leading-relaxed font-[family-name:var(--font-terminal)]">
            {description}
          </p>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-5 text-[10px] font-[family-name:var(--font-terminal)] tracking-wider">
          <span>
            <span className="text-white/20 uppercase">Watcher </span>
            <span style={{ color: 'var(--accent-gold)' }}>{gmUsername}</span>
          </span>
          <span>
            <span className="text-white/20 uppercase">Est </span>
            <span className="text-white/40">{timeAgo(createdAt)}</span>
          </span>
          {lastSession ? (
            <span>
              <span className="text-white/20 uppercase">Session {lastSession.number} </span>
              <span className="text-[var(--accent-teal)]/50">{timeAgo(lastSession.date)}</span>
            </span>
          ) : (
            <span className="text-white/15 uppercase">No sessions yet</span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {tags.map(tag => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[9px] tracking-wider uppercase font-[family-name:var(--font-terminal)] text-white/30 border border-white/10"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom accent — blocky circuit style */}
      <div className="relative h-[3px]">
        <div className="absolute left-0 top-0 w-[30%] h-full bg-[#E8585A]/25" />
        <div className="absolute left-[30%] top-0 w-[40%] h-full bg-[#582a72]/25" />
        <div className="absolute right-0 top-0 w-[30%] h-full bg-[#002F6C]/25" />
      </div>
      <div className="h-[1px] bg-[var(--accent-teal)]/20 group-hover:bg-[var(--accent-teal)]/40 transition-colors" />
    </Link>
  );
}
