'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * Terminal → Moderation (ADMIN, Mike 2026-10-12). The human moderation queue
 * for lawfulness flags: open-count badge, the list (category, lane, source,
 * campaign, when, status), and on click the flagged row's text — fetched by
 * pointer, ADMIN only — with the review form (REVIEWED / ACTIONED + note).
 * Styled like the Terminal's other panels (navy header strip, gold Bebas title).
 */

interface Flag {
  id: string;
  sequenceNumber: number;
  createdAt: string;
  campaignId: string | null;
  userId: string | null;
  category: string;
  lane: string;
  source: string;
  refTable: string | null;
  refId: string | null;
  screenHits: string;
  status: string;
  reviewerId: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
}

const CATEGORY: Record<string, { label: string; color: string }> = {
  MINOR_SEXUAL: { label: 'MINOR · SEXUAL', color: 'var(--pillar-body)' },
  REAL_PERSON_THREAT: { label: 'REAL-PERSON THREAT', color: 'var(--pillar-spirit)' },
  REAL_PERSON_SEXUAL_IMAGE: { label: 'REAL-FACE IMAGE', color: 'var(--pillar-soul)' },
};

const STATUS_FILTERS = ['OPEN', 'REVIEWED', 'ACTIONED', 'ALL'] as const;

const mono = { fontFamily: 'Consolas, monospace' } as const;

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ModerationPanel({ campaignNames }: { campaignNames: Record<string, string> }) {
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>('OPEN');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ flag: Flag; referent: { text: string | null; note?: string } } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, open] = await Promise.all([
        fetch(`/api/lawfulness/flags${filter === 'ALL' ? '' : `?status=${filter}`}`).then((r) => r.json()),
        fetch('/api/lawfulness/flags?status=OPEN').then((r) => r.json()),
      ]);
      setFlags(list.flags ?? []);
      setOpenCount((open.flags ?? []).length);
    } catch {
      setError('Could not load flags');
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    fetch(`/api/lawfulness/flags/${selected}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setDetail(d.flag ? d : null); setNote(d.flag?.reviewNote ?? ''); } })
      .catch(() => setError('Could not load the flag'));
    return () => { alive = false; };
  }, [selected]);

  async function review(status: 'REVIEWED' | 'ACTIONED') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/lawfulness/flags/${selected}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Review failed');
      setDetail((cur) => (cur ? { ...cur, flag: d.flag } : cur));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  }

  const hits = (() => {
    try { return (JSON.parse(detail?.flag.screenHits ?? '[]') as string[]).join(' · '); } catch { return ''; }
  })();

  return (
    <div className="bg-white/60 border border-[var(--surface-dark)]/15 relative overflow-hidden" data-testid="moderation-panel">
      <div className="bg-[var(--surface-dark)] px-4 py-1.5 flex items-center justify-between">
        <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-header)] uppercase tracking-[0.15em] flex items-center gap-2">
          Moderation
          <span
            className="text-[10px] px-1.5 py-0.5 text-white"
            style={{ ...mono, background: openCount ? 'var(--pillar-body)' : 'rgba(255,255,255,0.15)' }}
            aria-label={`${openCount} open flags`}
          >
            {openCount}
          </span>
        </span>
        <span className="text-[var(--pillar-body)]/60 text-[8px] font-[family-name:var(--font-terminal)]">LAWFULNESS</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex gap-0">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setFilter(s); setSelected(null); }}
              className="px-3 py-1 text-[10px] tracking-[0.12em]"
              style={{ ...mono, background: filter === s ? '#000' : 'transparent', color: filter === s ? '#fff' : 'var(--surface-dark)' }}
            >
              {s}
            </button>
          ))}
        </div>

        {flags.length === 0 ? (
          <p className="text-[var(--surface-dark)]/40 text-[10px] font-[family-name:var(--font-terminal)] italic">
            No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}flags. The tables are lawful.
          </p>
        ) : (
          <div className="space-y-0">
            {flags.map((f) => {
              const cat = CATEGORY[f.category] ?? { label: f.category, color: '#000' };
              const active = selected === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelected(active ? null : f.id)}
                  className="w-full text-left flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 border-b border-dashed border-[var(--surface-dark)]/10"
                  style={{ background: active ? 'rgba(203,217,232,0.6)' : undefined }}
                >
                  <span className="text-white text-[9px] px-1.5 py-0.5 tracking-[0.08em]" style={{ ...mono, background: cat.color }}>{cat.label}</span>
                  <span className="text-[var(--surface-dark)] text-[10px]" style={mono}>{f.lane}/{f.source}</span>
                  <span className="text-[var(--surface-dark)]/60 text-[10px]" style={mono}>
                    {f.campaignId ? campaignNames[f.campaignId] ?? f.campaignId.slice(0, 8) : '—'}
                  </span>
                  <span className="text-[var(--surface-dark)]/40 text-[9px] ml-auto" style={mono}>{when(f.createdAt)}</span>
                  <span className="text-white text-[9px] px-1.5 py-0.5" style={{ ...mono, background: f.status === 'OPEN' ? 'var(--pillar-body)' : f.status === 'ACTIONED' ? 'var(--accent-teal)' : '#000' }}>
                    {f.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="border-t-2 border-[var(--surface-dark)] pt-3 space-y-2" data-testid="moderation-detail">
            {!detail ? (
              <p className="text-[10px] text-[var(--surface-dark)]/50" style={mono}>loading…</p>
            ) : (
              <>
                <div className="text-[10px] text-[var(--surface-dark)]/70 space-y-0.5" style={mono}>
                  <div>#{detail.flag.sequenceNumber} · {detail.flag.refTable ?? 'no pointer'}{detail.flag.refId ? `:${detail.flag.refId}` : ''}</div>
                  <div>user {detail.flag.userId ?? '—'} · hits {hits || '—'}</div>
                  {detail.flag.reviewedAt && <div>reviewed {when(detail.flag.reviewedAt)} by {detail.flag.reviewerId}</div>}
                </div>
                <div className="bg-black px-3 py-2 max-h-64 overflow-auto">
                  {detail.referent.text ? (
                    <pre className="text-white/85 text-[11px] whitespace-pre-wrap break-words" style={mono}>{detail.referent.text}</pre>
                  ) : (
                    <p className="text-white/50 text-[11px] italic" style={mono}>{detail.referent.note ?? 'No text.'}</p>
                  )}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reviewer note"
                  rows={2}
                  maxLength={2000}
                  className="w-full bg-white/80 border border-[var(--surface-dark)]/20 px-2 py-1 text-[11px]"
                  style={mono}
                />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => review('REVIEWED')} className="px-3 py-1 text-[10px] tracking-[0.12em] bg-black text-white disabled:opacity-40" style={mono}>
                    MARK REVIEWED
                  </button>
                  <button type="button" disabled={busy} onClick={() => review('ACTIONED')} className="px-3 py-1 text-[10px] tracking-[0.12em] text-white disabled:opacity-40" style={{ ...mono, background: 'var(--pillar-body)' }}>
                    MARK ACTIONED
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {error && <p className="text-[10px] text-[var(--pillar-body)]" style={mono}>{error}</p>}
      </div>
    </div>
  );
}
