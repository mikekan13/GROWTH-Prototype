"use client";

import React from 'react';
import { C, F, Chip, GhostButton, Readout } from './parts';
import type { DesignerLayer } from '@/lib/appearance-designer';

export type PreviewView = 'face' | 'body' | 'token';
const VIEWS: PreviewView[] = ['face', 'body', 'token'];

/**
 * One large frame — the character is always in front of you. FACE = the
 * current layer; BODY = the full-body render from the approved base; TOKEN =
 * the bust in a token ring until a real RGBA token exists.
 */
export function Preview({
  view, onView, layer, layerIndex, editCount, bodyImagePath, busyLine, error, note, onRegenerate, canRegenerate, glitchKey,
}: {
  view: PreviewView;
  onView: (v: PreviewView) => void;
  layer: DesignerLayer | null;
  layerIndex: number;
  editCount: number;
  bodyImagePath: string | null;
  busyLine: string | null;
  error: string | null;
  note: string | null;
  onRegenerate: () => void;
  canRegenerate: boolean;
  glitchKey: number;
}) {
  const src = view === 'body' ? bodyImagePath : layer?.imagePath ?? null;
  // The preview shows the web-sized copy under .thumbs/; the full-res PNG sits one level up.
  const fullRes = src ? src.replace('/.thumbs/', '/').replace(/\.webp$/i, '.png') : null;
  const aspect = view === 'body' ? '2 / 3' : '1 / 1';
  const caption = view === 'body'
    ? (bodyImagePath ? 'body · from the approved base' : 'body · made when you approve the base')
    : layer
      ? `${view === 'token' ? 'token (from bust)' : 'face'} · ${layerIndex === 0 ? 'base' : `layer ${layerIndex}`} · seed ${layer.seed ?? '—'}`
      : `${view === 'token' ? 'token (from bust)' : view} · no image yet`;

  return (
    <div data-testid="designer-preview">
      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="Preview view">
        {VIEWS.map(v => (
          <Chip key={v} label={v.toUpperCase()} on={view === v} onClick={() => onView(v)} testId={`designer-view-${v}`} />
        ))}
      </div>

      <div
        className="relative mt-2 gd-scan overflow-hidden mx-auto"
        style={{ aspectRatio: aspect, maxHeight: '62vh', width: '100%', maxWidth: view === 'body' ? 'calc(62vh * 2 / 3)' : undefined, background: '#b9c9da' }}
      >
        {src ? (
          view === 'token' ? (
            <div className="absolute inset-0 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${src}-${glitchKey}`}
                src={src}
                alt="Token (from bust)"
                className="gd-glitch object-cover"
                style={{ width: '78%', height: '78%', borderRadius: '50%', boxShadow: `0 0 0 4px ${C.ink}, 0 0 0 7px ${C.teal}` }}
              />
            </div>
          ) : (
            <a
              href={fullRes ?? src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open full-size image in a new tab"
              className="absolute inset-0"
              data-testid="designer-fullsize-link"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${src}-${glitchKey}`}
                src={src}
                alt={view === 'body' ? 'Full body' : 'Current portrait layer'}
                className="gd-glitch absolute inset-0 w-full h-full object-contain"
              />
            </a>
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <span className="px-2" style={{ background: C.ink, color: C.powder, fontFamily: F.mono, fontSize: 12 }}>
              {view === 'body' ? '[ BODY · after approval ]' : '[ NO IDENTITY LOCKED ]'}
            </span>
          </div>
        )}
        {busyLine && (
          <div className="absolute left-0 right-0 bottom-0 p-2" style={{ background: 'rgba(20,20,19,0.86)' }}>
            <div style={{ color: C.gold, fontFamily: F.mono, fontSize: 12 }} role="status" aria-live="polite">{busyLine}</div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="min-w-0 truncate" style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }} data-testid="designer-caption">
          [{caption}]{editCount > 0 ? ` · ${editCount} edit${editCount === 1 ? '' : 's'}` : ''}
        </span>
        <span className="flex items-center gap-3">
          {fullRes && (
            <a
              href={fullRes}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: F.mono, fontSize: 11, color: C.soul, textDecoration: 'underline', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
              data-testid="designer-fullsize"
            >
              full size
            </a>
          )}
          <GhostButton label="regenerate" onClick={onRegenerate} disabled={!canRegenerate} testId="designer-regenerate" />
        </span>
      </div>
      {error && <div className="mt-1"><Readout tone="error" testId="designer-error">{error}</Readout></div>}
      {note && <div className="mt-1"><Readout tone="note" testId="designer-note">{note}</Readout></div>}
    </div>
  );
}
