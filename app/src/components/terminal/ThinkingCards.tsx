'use client';

/**
 * THINKING CARDS (Michael, 2026-11-05: "much larger 'thinking cards' for when an entity is processing").
 * One card per being that is processing, full width, at least four lines tall, standing where its final card will print.
 * Everything that happens while the being composes stays off screen — this card is all that shows. When the finished card
 * lands the thinking card dissolves in one fade (the card fades in); a being that ends with nothing to say just dissolves.
 * 360 px safe: 16 px gutters, the name bar truncates.
 */
import React from 'react';
import { PILLAR_COLOR, DISSOLVE_MS, type ThinkingCard } from './table-feed/beat-state';

export const THINKING_CSS = `
@keyframes tc-breathe{0%,100%{opacity:.35;transform:scaleX(.82)}50%{opacity:1;transform:scaleX(1)}}
@keyframes tc-dot{0%,80%,100%{opacity:.2}40%{opacity:1}}
@keyframes tc-in{0%{opacity:0;transform:translateY(4px)}100%{opacity:1;transform:none}}
.tc{box-sizing:border-box;width:100%;padding:0 16px;margin:10px 0 0}
.tc-card{box-sizing:border-box;min-height:112px;border-left:6px solid var(--tc-pillar,#22ab94);background:rgba(0,0,0,.06);padding:10px 14px 14px;
  animation:tc-in 500ms ease-out both;transition:opacity ${DISSOLVE_MS}ms ease}
.tc-card.tc-gone{opacity:0}
.tc-head{display:flex;align-items:center;gap:10px;min-width:0}
.tc-name{font-family:var(--font-bebas-neue),'Bebas Neue',sans-serif;font-size:20px;letter-spacing:.06em;line-height:1;color:#fff;background:#000;padding:5px 10px 3px;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-stage{font:700 11px/1 var(--font-terminal),Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#393937;white-space:nowrap;flex:none}
.tc-dot{display:inline-block;animation:tc-dot 1.4s infinite}
.tc-dot:nth-child(2){animation-delay:.25s}.tc-dot:nth-child(3){animation-delay:.5s}
.tc-lines{margin-top:14px;display:grid;gap:9px}
.tc-bar{height:9px;background:var(--tc-pillar,#22ab94);opacity:.35;transform-origin:left center;animation:tc-breathe 2.8s ease-in-out infinite}
.tc-bar:nth-child(1){width:92%}.tc-bar:nth-child(2){width:74%;animation-delay:.35s}.tc-bar:nth-child(3){width:48%;animation-delay:.7s}
.tc-dark .tc-card{background:rgba(255,255,255,.06)}
.tc-dark .tc-stage{color:rgba(255,255,255,.6)}
@media (prefers-reduced-motion:reduce){.tc-card{animation:none;transition:none}.tc-bar{animation:none;opacity:.5}.tc-dot{animation:none;opacity:.7}}
`;

export default function ThinkingCards({ cards, dark }: { cards: ThinkingCard[]; dark?: boolean }) {
  if (cards.length === 0) return null;
  return (
    <div className={`tc${dark ? ' tc-dark' : ''}`} data-thinking-cards>
      <style>{THINKING_CSS}</style>
      {cards.map(c => (
        <div
          key={c.characterId}
          data-thinking-card={c.characterId}
          data-stage={c.stage}
          className={`tc-card${c.dissolving ? ' tc-gone' : ''}`}
          style={{ ['--tc-pillar' as string]: PILLAR_COLOR[c.pillar ?? 'terminal'], marginTop: 8 }}
          role="status"
          aria-label={`${c.name} is ${c.stage}`}
        >
          <div className="tc-head">
            <span className="tc-name">{c.name}</span>
            <span className="tc-stage">{c.stage}<span aria-hidden> <span className="tc-dot">.</span><span className="tc-dot">.</span><span className="tc-dot">.</span></span></span>
          </div>
          <div className="tc-lines" aria-hidden>
            <div className="tc-bar" /><div className="tc-bar" /><div className="tc-bar" />
          </div>
        </div>
      ))}
    </div>
  );
}
