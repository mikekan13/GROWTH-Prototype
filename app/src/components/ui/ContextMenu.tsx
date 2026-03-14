'use client';

import React, { useRef, useEffect } from 'react';

// ── Shared keyframes ──────────────────────────────────────────────────────

const CTX_MENU_KEYFRAMES = `
@keyframes ctxMenuUndulate {
  0%   { transform: translate(0px, 0px) scale(1); opacity: 0.85; }
  25%  { transform: translate(0.5px, -1px) scale(1.05); opacity: 1; }
  50%  { transform: translate(-0.5px, 0.5px) scale(0.95); opacity: 0.75; }
  75%  { transform: translate(0.8px, 0.3px) scale(1.02); opacity: 0.95; }
  100% { transform: translate(0px, 0px) scale(1); opacity: 0.85; }
}`;

let stylesInjected = false;
function ensureCtxMenuStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = CTX_MENU_KEYFRAMES;
  document.head.appendChild(style);
}

// ── Title text helper — any N/n becomes lowercase gold 'n' ────────────────

export function ctxMenuText(text: string) {
  return text.split('').map((ch, i) =>
    ch.toLowerCase() === 'n'
      ? <span key={i} style={{ color: '#D0A030' }}>n</span>
      : <span key={i}>{ch}</span>
  );
}

// ── ^v^v undulating border ────────────────────────────────────────────────

export function CtxMenuBorder() {
  useEffect(() => { ensureCtxMenuStyles(); }, []);

  const count = 50;
  const charSize = 10;
  const redSize = 14;
  const bandH = redSize + 2;

  const makeChar = (i: number) => {
    const isUp = i % 2 === 0;
    const delay = (i * 0.13) % 2.5;
    const duration = 1.8 + (i % 5) * 0.4;
    return (
      <span key={i} style={{
        color: isUp ? '#E8585A' : '#fff',
        fontSize: isUp ? `${redSize}px` : `${charSize}px`,
        display: 'inline-block',
        animation: `ctxMenuUndulate ${duration}s ease-in-out ${delay}s infinite`,
      }}>
        {isUp ? '^' : 'v'}
      </span>
    );
  };

  const hChars = Array.from({ length: count }, (_, i) => makeChar(i));
  const vChars = Array.from({ length: count }, (_, i) => makeChar(i + count));

  const textBase: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'none',
    fontSize: `${charSize}px`,
    lineHeight: '1',
    fontFamily: 'Consolas, monospace',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    letterSpacing: '-1px',
  };

  const half = bandH / 2;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.3))' }}>
      <div style={{ ...textBase, top: -half, left: -half, right: -half, height: bandH, display: 'flex', alignItems: 'flex-end' }}>
        {hChars}
      </div>
      <div style={{ ...textBase, bottom: -half, left: -half, right: -half, height: bandH, display: 'flex', alignItems: 'flex-start' }}>
        {hChars}
      </div>
      <div style={{ ...textBase, left: -half, top: half, bottom: half, width: bandH, writingMode: 'vertical-lr', display: 'flex', alignItems: 'flex-end' }}>
        {vChars}
      </div>
      <div style={{ ...textBase, right: -half, top: half, bottom: half, width: bandH, writingMode: 'vertical-lr', display: 'flex', alignItems: 'flex-start' }}>
        {vChars}
      </div>
    </div>
  );
}

// ── Canvas-rendered scanlines — random timing, wavy, vertical spikes ──────

export function CtxMenuScanlines() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let nextScanTime = performance.now() + 300 + Math.random() * 2000;
    const scans: { y: number; speed: number; phase: number }[] = [];
    let nextSpikeTime = performance.now() + 2000 + Math.random() * 4000;
    let spikeX = -1;
    let spikeLife = 0;

    const draw = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);

      // Scanlines: randomly spawn 1–3 at a time
      if (now > nextScanTime) {
        const burst = Math.random() < 0.3 ? (Math.random() < 0.5 ? 3 : 2) : 1;
        for (let b = 0; b < burst; b++) {
          scans.push({
            y: -(b * 6),
            speed: 0.5 + Math.random() * 1.5,
            phase: Math.random() * Math.PI * 2,
          });
        }
        nextScanTime = now + 1500 + Math.random() * 4000;
      }
      for (let s = scans.length - 1; s >= 0; s--) {
        const scan = scans[s];
        ctx.save();
        ctx.globalAlpha = 0.03 + Math.random() * 0.04;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x += 2) {
          const wave = Math.sin(x * 0.15 + now * 0.003 + scan.phase) * 1.5;
          if (x === 0) ctx.moveTo(x, scan.y + wave);
          else ctx.lineTo(x, scan.y + wave);
        }
        ctx.stroke();
        ctx.restore();
        scan.y += scan.speed;
        if (scan.y > h) scans.splice(s, 1);
      }

      // Vertical spike
      if (now > nextSpikeTime && spikeLife <= 0) {
        spikeX = Math.random() * w;
        spikeLife = 8 + Math.random() * 12;
        nextSpikeTime = now + 3000 + Math.random() * 5000;
      }
      if (spikeLife > 0) {
        ctx.save();
        ctx.globalAlpha = 0.04 + Math.random() * 0.03;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(spikeX, 0);
        ctx.lineTo(spikeX + (Math.random() - 0.5) * 3, h);
        ctx.stroke();
        ctx.restore();
        spikeX += (Math.random() - 0.5) * 2;
        spikeLife--;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

// ── Stream label ──────────────────────────────────────────────────────────

export function CtxMenuStreamLabel() {
  return (
    <div style={{ fontSize: '6px', fontFamily: 'Consolas, monospace', color: 'rgba(255,255,255,0.32)', letterSpacing: '0.5px', marginBottom: '6px', pointerEvents: 'none' }}>
      [STREAM INPUT INTERRUPTED]
    </div>
  );
}

// ── Full context menu wrapper ─────────────────────────────────────────────

interface CtxMenuPanelProps {
  title?: string;
  children: React.ReactNode;
}

export function CtxMenuPanel({ title, children }: CtxMenuPanelProps) {
  return (
    <div className="shadow-xl min-w-[140px]" style={{
      background: '#000',
      border: 'none',
      padding: '6px',
      position: 'relative',
    }}>
      <CtxMenuBorder />
      <CtxMenuScanlines />
      {title && (
        <div className="px-3 py-1 text-xs text-white" style={{ borderBottom: '1px solid #333', fontFamily: "'Inknut Antiqua', serif" }}>
          {ctxMenuText(title)}
        </div>
      )}
      {children}
    </div>
  );
}
