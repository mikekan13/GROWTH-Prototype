'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Watcher's lawfulness badge (Mike 2026-10-12): "they should see it and it
 * should be flagged for a human moderator to inspect". Sits beside the gear in
 * the campaign header, only for the table's Watcher. Renders nothing until a
 * flag exists at this table. Tap → the table's flags: category + status, never
 * the text (ADMIN reads text in the Terminal). Phone-first: one 40 px icon.
 */

interface FlagRow {
  id: string;
  createdAt: string;
  category: string;
  lane: string;
  source: string;
  status: string;
}

const LABEL: Record<string, string> = {
  MINOR_SEXUAL: 'Minor — sexual',
  REAL_PERSON_THREAT: 'Real-person threat',
  REAL_PERSON_SEXUAL_IMAGE: 'Real-face sexual image',
};

const CSS = `
.lf-wrap{position:relative;flex:none;align-self:center}
.lf-btn{position:relative}
.lf-n{position:absolute;top:3px;right:2px;min-width:16px;height:16px;padding:0 3px;display:grid;place-items:center;background:var(--pillar-body);color:#fff;font-family:var(--font-terminal);font-size:10px;font-weight:700;line-height:1}
.lf-n.lf-quiet{background:rgba(203,217,232,.35);color:var(--pillar-soul)}
.lf-pop{position:absolute;top:calc(100% + 4px);right:0;z-index:200;width:300px;max-width:calc(100vw - 12px);max-height:60vh;overflow:auto;background:#FAFAF8;border:2px solid var(--pillar-soul);box-shadow:0 6px 18px rgba(0,0,0,.35)}
.lf-h{background:var(--pillar-soul);color:var(--krma-gold);font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:18px;letter-spacing:.1em;padding:6px 12px 4px}
.lf-row{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 12px;border-bottom:1px dashed rgba(0,47,108,.15);font-size:12px;color:#14213d}
.lf-row b{flex:1 1 auto;font-family:var(--font-comfortaa),Comfortaa,sans-serif;font-weight:700}
.lf-row time{font-family:var(--font-terminal);font-size:10px;opacity:.6;white-space:nowrap}
.lf-st{font-family:var(--font-terminal);font-size:10px;letter-spacing:.08em;padding:2px 5px;background:#000;color:#fff}
.lf-st[data-s="OPEN"]{background:var(--pillar-body)}
.lf-st[data-s="ACTIONED"]{background:var(--terminal-prime,#22ab94)}
.lf-note{padding:8px 12px;font-size:11px;color:#14213d;opacity:.7;font-family:var(--font-comfortaa),Comfortaa,sans-serif}
`;

const FlagIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5z" fill="currentColor" stroke="none" />
  </svg>
);

export default function LawfulnessBadge({ campaignId }: { campaignId: string }) {
  const [flags, setFlags] = useState<FlagRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/lawfulness/flags?campaignId=${encodeURIComponent(campaignId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setFlags(d.flags as FlagRow[]); })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [campaignId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!flags || flags.length === 0) return null;
  const openCount = flags.filter((f) => f.status === 'OPEN').length;

  return (
    <div className="lf-wrap" ref={ref}>
      <style>{CSS}</style>
      <button
        type="button"
        className="gh-ic lf-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${openCount} open lawfulness flag${openCount === 1 ? '' : 's'} at this table`}
        aria-label={`Lawfulness flags: ${openCount} open`}
      >
        <FlagIcon />
        <span className={`lf-n${openCount ? '' : ' lf-quiet'}`}>{openCount || flags.length}</span>
      </button>
      {open && (
        <div className="lf-pop" role="dialog" aria-label="Lawfulness flags at this table">
          <div className="lf-h">Flagged at this table</div>
          {flags.map((f) => (
            <div key={f.id} className="lf-row">
              <b>{LABEL[f.category] ?? f.category}</b>
              <time dateTime={f.createdAt}>{new Date(f.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
              <span className="lf-st" data-s={f.status}>{f.status}</span>
            </div>
          ))}
          <div className="lf-note">Held for a human moderator. The content itself is withheld.</div>
        </div>
      )}
    </div>
  );
}
