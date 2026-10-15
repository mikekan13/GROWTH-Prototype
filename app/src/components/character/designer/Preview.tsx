"use client";

import React from 'react';
import { C, F, Chip, FrameButton, GlitchVeil, Readout } from './parts';
import type { DesignerLayer } from '@/lib/appearance-designer';

export type PreviewView = 'face' | 'body' | 'portrait';
const VIEWS: PreviewView[] = ['face', 'body', 'portrait'];

/**
 * One large frame — the character is always in front of you. FACE = the
 * current layer; BODY = the full-body render from the approved base;
 * PORTRAIT = the finished character (made in the background from the face
 * and body, with items and clothing from inventory — the next step; today it
 * shows the approved base as a stand-in). No seeds, no layer numbers: the
 * edit stack tells the history.
 */
export function Preview({
  view, onView, layer, bodyImagePath, portraitImagePath, busyLine, error, note, peekLine, onRegenerate, canRegenerate, glitchKey,
}: {
  /** Set while an older stack layer is being looked at. */
  peekLine: string | null;
  view: PreviewView;
  onView: (v: PreviewView) => void;
  layer: DesignerLayer | null;
  bodyImagePath: string | null;
  /** The approved base, standing in for the portrait until the portrait step exists. */
  portraitImagePath: string | null;
  busyLine: string | null;
  error: string | null;
  note: string | null;
  onRegenerate: () => void;
  canRegenerate: boolean;
  glitchKey: number;
}) {
  const src = view === 'body' ? bodyImagePath : view === 'portrait' ? portraitImagePath : layer?.imagePath ?? null;
  // The preview shows the web-sized copy under .thumbs/; the full-res PNG sits one level up.
  const fullRes = src && view !== 'portrait' ? src.replace('/.thumbs/', '/').replace(/\.webp$/i, '.png') : null;
  const aspect = view === 'body' ? '2 / 3' : '1 / 1';
  const empty = view === 'body'
    ? '[ BODY · made when you approve the base ]'
    : view === 'portrait'
      ? '[ PORTRAIT · after the base is approved ]'
      : '[ NO IDENTITY LOCKED ]';

  return (
    <div data-testid="designer-preview">
      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Preview view">
        {VIEWS.map(v => (
          <Chip key={v} label={v.toUpperCase()} on={view === v} onClick={() => onView(v)} testId={`designer-view-${v}`} />
        ))}
      </div>

      <div
        className="relative mt-2 gd-scan overflow-hidden mx-auto"
        style={{
          aspectRatio: aspect, maxHeight: '62vh', width: '100%', maxWidth: view === 'body' ? 'calc(62vh * 2 / 3)' : undefined,
          background: '#b9c9da', border: `2px solid ${C.gold}`, boxShadow: `inset 0 0 0 1px rgba(20,20,19,0.35)`, boxSizing: 'content-box',
        }}
      >
        {src ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${src}-${glitchKey}`}
              src={src}
              alt={view === 'body' ? 'Full body' : view === 'portrait' ? 'Portrait (approved base, stand-in)' : 'Current face'}
              className="gd-glitch absolute inset-0 w-full h-full object-contain"
              style={view === 'portrait' ? { filter: 'grayscale(0.35) contrast(0.95)', opacity: 0.8 } : undefined}
            />
            {view === 'portrait' && !busyLine && (
              <div className="absolute inset-0 flex items-end justify-center p-3 pointer-events-none">
                <span className="px-2 py-1 text-center" style={{ background: C.ink, color: C.gold, fontFamily: F.mono, fontSize: 11, letterSpacing: '0.06em' }} data-testid="designer-portrait-note">
                  [ PORTRAIT · made from the face and body in the background · next: items and clothing from inventory ]
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <span className="px-2" style={{ background: C.ink, color: C.powder, fontFamily: F.mono, fontSize: 12 }}>{empty}</span>
          </div>
        )}
        {busyLine && <GlitchVeil line={busyLine} src={src} />}
      </div>

      <div className="flex items-stretch gap-2 mt-2" data-testid="designer-frame-actions">
        <FrameButton label="FULL SIZE" href={fullRes ?? undefined} tone="ink" disabled={!fullRes} testId="designer-fullsize" />
        <FrameButton label="REGENERATE" onClick={onRegenerate} tone="gold" disabled={!canRegenerate} testId="designer-regenerate" />
      </div>
      {peekLine && <div className="mt-1"><Readout testId="designer-peek">{peekLine}</Readout></div>}
      {error && <div className="mt-1"><Readout tone="error" testId="designer-error">{error}</Readout></div>}
      {note && <div className="mt-1"><Readout tone="note" testId="designer-note">{note}</Readout></div>}
    </div>
  );
}
