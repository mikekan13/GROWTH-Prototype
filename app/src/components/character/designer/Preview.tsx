"use client";

import React from 'react';
import { C, F, Chip, FrameButton, GlitchVeil, PortraitVeil, Readout } from './parts';
import type { DesignerLayer } from '@/lib/appearance-designer';

export type PreviewView = 'face' | 'body' | 'portrait';
const VIEWS: PreviewView[] = ['face', 'body', 'portrait'];

/**
 * One large frame — the character is always in front of you. FACE = the
 * current layer; BODY = the full-body render from the approved base;
 * PORTRAIT = the painted portrait (JEWL's brief painted from the face and
 * body, dressed from her own things — Mike 2026-10-16); its stack is a row
 * of paints, REGENERATE re-rolls the seed. No seeds, no layer numbers: the
 * edit stack tells the history.
 */
export function Preview({
  view, onView, layer, bodyImagePath, portraitImagePath, portraitLocked, busyLine, busySub, error, note, peekLine, onRegenerate, canRegenerate, glitchKey,
  onPaint, canPaint, portraitEmpty,
}: {
  /** PORTRAIT waits until the face is approved AND the body exists (Mike 2026-10-15). */
  portraitLocked: boolean;
  /** A second line under the stage line on the portrait veil (what JEWL is doing, in words). */
  busySub?: string | null;
  /** Set while an older stack layer is being looked at. */
  peekLine: string | null;
  view: PreviewView;
  onView: (v: PreviewView) => void;
  layer: DesignerLayer | null;
  bodyImagePath: string | null;
  /** The portrait paint being shown (the newest, or a peeked one). */
  portraitImagePath: string | null;
  /** No paint yet → the frame offers PAINT PORTRAIT instead of REGENERATE. */
  portraitEmpty?: boolean;
  onPaint?: () => void;
  canPaint?: boolean;
  busyLine: string | null;
  error: string | null;
  note: string | null;
  onRegenerate: () => void;
  canRegenerate: boolean;
  glitchKey: number;
}) {
  const src = view === 'body' ? bodyImagePath : view === 'portrait' ? portraitImagePath : layer?.imagePath ?? null;
  // The preview shows the web-sized copy under .thumbs/; the full-res PNG sits one level up.
  const fullRes = src ? src.replace('/.thumbs/', '/').replace(/\.webp$/i, '.png') : null;
  // The portrait has the character sheet's shape: 2:3, 1024×1536 (EmptyPortrait.png).
  const aspect = view === 'body' || view === 'portrait' ? '2 / 3' : '1 / 1';
  const maxWidth = view === 'body' || view === 'portrait' ? 'calc(62vh * 2 / 3)' : undefined;
  const empty = view === 'body'
    ? '[ BODY · made when you approve the base ]'
    : view === 'portrait'
      ? '[ PORTRAIT · dress her below, then PAINT PORTRAIT ]'
      : '[ NO IDENTITY LOCKED ]';
  const paintFrame = view === 'portrait' && !!portraitEmpty;

  return (
    <div data-testid="designer-preview">
      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Preview view">
        {VIEWS.map(v => (
          <Chip
            key={v}
            label={v === 'portrait' && portraitLocked ? 'PORTRAIT ⌧' : v.toUpperCase()}
            on={view === v}
            onClick={() => onView(v)}
            disabled={v === 'portrait' && portraitLocked}
            testId={`designer-view-${v}`}
          />
        ))}
      </div>

      <div
        className="relative mt-2 gd-scan overflow-hidden mx-auto"
        style={{
          aspectRatio: aspect, maxHeight: '62vh', width: '100%', maxWidth,
          background: '#b9c9da', border: `2px solid ${C.gold}`, boxShadow: `inset 0 0 0 1px rgba(20,20,19,0.35)`, boxSizing: 'content-box',
        }}
      >
        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={`${src}-${glitchKey}`}
            src={src}
            alt={view === 'body' ? 'Full body' : view === 'portrait' ? 'Portrait' : 'Current face'}
            className="gd-glitch absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <span className="px-2" style={{ background: C.ink, color: C.powder, fontFamily: F.mono, fontSize: 12 }}>{empty}</span>
          </div>
        )}
        {busyLine && (view === 'portrait'
          ? <PortraitVeil face={layer?.imagePath ?? null} body={bodyImagePath} line={busyLine} sub={busySub} />
          : <GlitchVeil line={busyLine} src={src} />)}
      </div>

      <div className="flex items-stretch gap-2 mt-2" data-testid="designer-frame-actions">
        <FrameButton label="FULL SIZE" href={fullRes ?? undefined} tone="ink" disabled={!fullRes} testId="designer-fullsize" />
        {paintFrame
          ? <FrameButton label="PAINT PORTRAIT" onClick={onPaint} tone="gold" disabled={!canPaint} testId="designer-paint" />
          : <FrameButton label="REGENERATE" onClick={onRegenerate} tone="gold" disabled={!canRegenerate} testId="designer-regenerate" />}
      </div>
      {peekLine && <div className="mt-1"><Readout testId="designer-peek">{peekLine}</Readout></div>}
      {error && <div className="mt-1"><Readout tone="error" testId="designer-error">{error}</Readout></div>}
      {note && <div className="mt-1"><Readout tone="note" testId="designer-note">{note}</Readout></div>}
    </div>
  );
}
