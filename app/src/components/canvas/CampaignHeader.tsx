'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import CampaignClock from '@/components/time/CampaignClock';
import CanvasHistoryControls from '@/components/canvas/CanvasHistoryControls';

/**
 * Campaign header in the rulebook's ORDER voice — Option 2 (Mike 2026-10-07).
 * Mockups: tmp/screens/2026-10-06-header-v2-alt-412.html (phone) and
 * 2026-10-06-header-v2-order-1800.html (desktop strip).
 *
 * Phone (< 768 px), 155 px:
 *   row 1  Soul-blue bar — campaign name (gold Bebas) over the clock · settings gear
 *   row 2  off-white row — the KRMA / FLD / CRY strip
 *   row 3  powder tab row — FORGE / CANVAS / TAPESTRY · undo / redo
 *   (the strip, ~245 px, does not fit beside the clock at 412, so the clock
 *   rides the bar under the name — Mike 2026-10-07.)
 * Desktop (≥ 768 px), one strip:
 *   bar  name · clock · … · undo / redo · gear
 *   row  tabs · … · KRMA / FLD / CRY strip
 *   768–1399 px = compact sizes (≈89 px), ≥ 1400 px = full mockup sizes (≈101 px).
 *
 * KRMA / FLD / CRY keep the live header's coloured tiles (Mike 2026-10-07):
 * gold KRMA (navy numerals), purple FLD, red CRY — one contiguous strip, tiles
 * touching, the same at every width.
 * The invite code, genre and the way back to the Terminal live behind a tap
 * on the campaign name.
 */

export type HeaderTab = 'canvas' | 'forge' | 'tapestry' | 'character';

export interface CampaignHeaderEconomy {
  total: string;
  fluid: string;
  crystallized: string;
}

function formatKrma(value: string): string {
  return Number(value).toLocaleString();
}

const WIDE_QUERY = '(min-width: 768px)';

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const getWide = () => window.matchMedia(WIDE_QUERY).matches;
const getWideServer = () => false;

const CSS = `
.gh{flex-shrink:0;position:relative;z-index:60;background:#FAFAF8;border-bottom:3px solid var(--pillar-soul);font-family:var(--font-comfortaa),Comfortaa,sans-serif;color:#14213d}
.gh-bar{display:flex;align-items:center;gap:4px;background:var(--pillar-soul);height:46px;padding:0 4px 0 4px}
.gh-name{flex:1 1 auto;min-width:0;height:40px;display:flex;align-items:center;background:none;border:0;padding:0 10px;cursor:pointer;color:var(--krma-gold);font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:27px;letter-spacing:.04em;line-height:1;text-transform:uppercase;text-align:left;touch-action:manipulation}
.gh-name>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-top:2px}
.gh-ic{width:40px;height:40px;flex:none;display:grid;place-items:center;background:none;border:0;color:var(--surface-calm);cursor:pointer;touch-action:manipulation}
.gh-ic svg{width:22px;height:22px}
.gh-tabs{display:flex;align-items:center;background:var(--surface-calm);height:40px;padding:0 2px 0 6px}
.gh-tab{flex:1 1 0;min-width:0;height:36px;display:grid;place-items:center;background:none;border:0;padding:2px 4px 0;cursor:pointer;font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:20px;letter-spacing:.11em;color:var(--pillar-soul);white-space:nowrap;text-transform:uppercase;touch-action:manipulation}
.gh-tab[aria-current="page"]{background:var(--pillar-soul);color:var(--krma-gold);clip-path:polygon(1% 4%,99% 0,100% 94%,0 100%)}
.gh-four .gh-tab{font-size:17px;letter-spacing:.06em}
.gh-sep{width:2px;height:22px;background:var(--pillar-soul);opacity:.25;margin:0 2px;flex:none}
.gh-bar.gh-bar2{height:72px;align-items:stretch;padding:0 4px}
.gh-stack{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center}
.gh-stack>.gh-clock{padding-left:10px;min-width:0}
.gh-stack .gh-name{height:36px;padding-top:4px}
.gh-bar2>.gh-ic{align-self:center}
.gh-mid{display:flex;align-items:center;justify-content:flex-end;height:40px;padding:0 6px 0 14px;background:#FAFAF8}
.gh-strip{display:flex;align-items:stretch;height:36px;flex:none}
.gh-spacer{flex:1}
.gh-t{height:36px;flex:none;display:flex;align-items:center}
.gh-t-col{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 8px;min-width:46px}
.gh-t-col b{font-family:var(--font-terminal);font-weight:700;font-size:13px;color:#fff;line-height:1;white-space:nowrap}
.gh-t-col i{font-style:normal;font-family:var(--font-terminal);font-size:8px;letter-spacing:.1em;color:rgba(255,255,255,.6);line-height:1;margin-top:3px}
.gh-fld{background:var(--pillar-spirit)}
.gh-cry{background:var(--pillar-body)}
.gh-cry>u{text-decoration:none;font-family:var(--font-terminal);font-weight:700;font-size:22px;color:#fff;line-height:1;padding-right:6px}
.gh-krma{gap:6px;padding:0 10px;background:linear-gradient(90deg,#D4A830,#E8C848,#D4A830);color:var(--pillar-soul);font-weight:700;line-height:1}
.gh-krma b{font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:20px;letter-spacing:-.01em;padding-top:2px}
.gh-krma span{font-size:18px;letter-spacing:.02em;padding-top:2px}
.gh-krma em{font-style:normal;font-family:var(--font-inknut-antiqua),"Inknut Antiqua",serif;font-weight:900;font-size:14px}
.gh-krma span>span{font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:18px;padding:0}
.gh-pop{position:absolute;top:calc(100% + 4px);left:6px;z-index:200;min-width:240px;max-width:calc(100vw - 12px);background:#FAFAF8;border:2px solid var(--pillar-soul);box-shadow:0 6px 18px rgba(0,0,0,.35);padding:6px 0}
.gh-pop a,.gh-pop div{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 14px;font-size:13px;color:#14213d}
.gh-pop a{font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:18px;letter-spacing:.1em;color:var(--pillar-soul);text-decoration:none}
.gh-pop a:hover{background:var(--surface-calm)}
.gh-pop i{font-style:normal;font-family:var(--font-bebas-neue),'Bebas Neue',Impact,sans-serif;font-size:15px;letter-spacing:.12em;color:var(--pillar-soul);opacity:.7;min-width:52px}
.gh-pop code{font-family:var(--font-terminal);font-size:14px;color:var(--pillar-soul);user-select:all}
.gh-wide{background:var(--surface-calm)}
.gh-wide .gh-bar{padding:0 6px 0 4px}
.gh-wide .gh-name{flex:0 1 auto}
.gh-wide .gh-bar>.gh-clock{margin-left:14px;min-width:0}
.gh-row{display:flex;align-items:center;height:40px;padding:0 0 0 10px}
.gh-wide .gh-tab{flex:none;padding:2px 18px 0}
.gh-ledger{display:flex;align-items:center;align-self:stretch;background:#FAFAF8;margin-left:auto;padding:0 14px}
@media (min-width:1400px){
 .gh-wide .gh-bar{height:52px;padding-left:16px}
 .gh-wide .gh-name{font-size:32px;letter-spacing:.05em}
 .gh-wide .gh-bar>.gh-clock{margin-left:28px}
 .gh-wide .gh-ic{width:42px;height:42px}
 .gh-row{height:46px;padding-left:20px}
 .gh-wide .gh-tab{font-size:22px;letter-spacing:.14em;padding:2px 26px 0}
 .gh-ledger{padding:0 28px 0 22px}
}
`;

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export default function CampaignHeader({
  campaign,
  isGM,
  economy,
  tabs,
  activeTab,
  onTab,
}: {
  campaign: { id: string; name: string; genre: string | null; inviteCode: string | null };
  isGM: boolean;
  economy: CampaignHeaderEconomy | null;
  tabs: { key: HeaderTab; label: string }[];
  activeTab: HeaderTab;
  onTab: (tab: HeaderTab) => void;
}) {
  const wide = useSyncExternalStore(subscribeWide, getWide, getWideServer);
  const [infoOpen, setInfoOpen] = useState(false);
  const nameRef = useRef<HTMLDivElement>(null);

  // Close the name popover on a tap elsewhere or Escape.
  useEffect(() => {
    if (!infoOpen) return;
    const onDown = (e: PointerEvent) => {
      if (nameRef.current && !nameRef.current.contains(e.target as Node)) setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setInfoOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [infoOpen]);

  const name = (
    <div ref={nameRef} style={{ position: 'relative', display: 'flex', minWidth: 0, flex: wide ? '0 1 auto' : 'none' }}>
      <button
        type="button"
        className="gh-name"
        onClick={() => setInfoOpen(o => !o)}
        aria-expanded={infoOpen}
        title="Campaign info — invite code, back to the Terminal"
      >
        <span>{campaign.name}</span>
      </button>
      {infoOpen && (
        <div className="gh-pop" role="dialog" aria-label="Campaign info">
          <Link href="/terminal">&larr; Terminal</Link>
          {campaign.genre && <div><i>Genre</i>{campaign.genre}</div>}
          {campaign.inviteCode && <div><i>Invite</i><code>{campaign.inviteCode}</code></div>}
        </div>
      )}
    </div>
  );

  const clock = (
    <div className="gh-clock">
      <CampaignClock campaignId={campaign.id} isGM={isGM} tone="soul" />
    </div>
  );

  const showTiles = isGM && !!economy;
  const krmaTile = showTiles && economy ? (
    <div className="gh-t gh-krma" title="KRMA — campaign total">
      <b>{formatKrma(economy.total)}</b>
      <span><em>Ҝ</em><span>RMA</span></span>
    </div>
  ) : null;
  const fldTile = showTiles && economy ? (
    <div className="gh-t gh-fld" title="Fluid KRMA">
      <div className="gh-t-col"><b>{formatKrma(economy.fluid)}</b><i>FLD</i></div>
    </div>
  ) : null;
  const cryTile = showTiles && economy ? (
    <div className="gh-t gh-cry" title="Crystallized KRMA">
      <div className="gh-t-col"><b>{formatKrma(economy.crystallized)}</b><i>CRY</i></div>
      <u aria-hidden>]</u>
    </div>
  ) : null;
  // One contiguous ledger strip — the three tiles share edges (Mike 2026-10-07).
  const strip = showTiles ? (
    <div className="gh-strip" role="group" aria-label="KRMA ledger">{krmaTile}{fldTile}{cryTile}</div>
  ) : null;

  const gear = isGM ? (
    <Link href={`/watcher/campaign/${campaign.id}/settings`} className="gh-ic" title="Campaign Settings" aria-label="Campaign Settings">
      <GearIcon />
    </Link>
  ) : null;

  const tabButtons = tabs.map(tab => (
    <button
      key={tab.key}
      type="button"
      className="gh-tab"
      aria-current={activeTab === tab.key ? 'page' : undefined}
      onClick={() => onTab(tab.key)}
    >
      {tab.label}
    </button>
  ));

  const onCanvas = activeTab === 'canvas';

  return (
    <header className={`gh${wide ? ' gh-wide' : ''}`} data-no-hold>
      <style>{CSS}</style>
      {wide ? (
        <>
          <div className="gh-bar">
            {name}
            {clock}
            <div className="gh-spacer" />
            {onCanvas && <CanvasHistoryControls tone="powder" size={40} />}
            {gear}
          </div>
          <nav className="gh-row" aria-label="Campaign views">
            {tabButtons}
            {showTiles && (
              <div className="gh-ledger">{strip}</div>
            )}
          </nav>
        </>
      ) : (
        <>
          <div className="gh-bar gh-bar2">
            <div className="gh-stack">
              {name}
              {clock}
            </div>
            {gear}
          </div>
          {showTiles && <div className="gh-mid">{strip}</div>}
          <nav className={`gh-tabs${tabs.length > 3 ? ' gh-four' : ''}`} aria-label="Campaign views">
            {tabButtons}
            {onCanvas && <span className="gh-sep" aria-hidden />}
            {onCanvas && <CanvasHistoryControls tone="soul" size={38} />}
          </nav>
        </>
      )}
    </header>
  );
}
