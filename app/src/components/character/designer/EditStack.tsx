"use client";

import React, { useState } from 'react';
import { C, F, SectionBar } from './parts';
import type { DesignerLayer, EditTarget, LayerKind } from '@/lib/appearance-designer';

const MARK_KINDS: ReadonlySet<LayerKind> = new Set(['scar', 'tattoo', 'makeup', 'piercing', 'birthmark', 'bodymod']);

/** Pillar-tag style kind block: base = Soul, JEWL = Spirit, marks = Body, shape = ink. */
function kindTone(kind: LayerKind): string {
  if (kind === 'base') return C.soul;
  if (kind === 'jewl') return C.spirit;
  if (MARK_KINDS.has(kind)) return C.body;
  return C.ink;
}
const kindLabel = (kind: LayerKind) => (kind === 'bodymod' ? 'body mod' : kind);

/**
 * Linear history, newest first, one stack per tab (Mike 2026-10-15). Tapping
 * a row SHOWS that layer in the preview; the ⊗ asks once, then deletes the
 * layer — and the layers painted on it, since each was made from the one
 * before. The base (row 0) has no ⊗; REGENERATE re-rolls it.
 */
export function EditStack({ layers, target, selected, onSelect, onDelete, editable }: {
  layers: DesignerLayer[];
  target: EditTarget;
  /** The layer the preview shows (the top when nothing is being peeked at). */
  selected: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  editable: boolean;
}) {
  const [confirm, setConfirm] = useState<number | null>(null);
  if (layers.length === 0) return null;
  const top = layers.length - 1;
  const rows = layers.map((l, i) => ({ l, i })).reverse();

  return (
    <div className="space-y-2" data-testid="designer-stack" data-target={target}>
      <SectionBar title={`Edit stack · ${target.toUpperCase()}`} hint="newest first · tap a layer to see it · ⊗ deletes it" />
      <div className="space-y-1">
        {rows.map(({ l, i }) => {
          const current = i === selected;
          const asking = confirm === i;
          const later = top - i;
          return (
            <div
              key={`${l.imagePath}-${i}`}
              className="flex items-center gap-2"
              style={{
                minHeight: 56, padding: 4,
                background: current ? C.ink : 'transparent',
                color: current ? C.powder : C.ink,
                borderBottom: current ? 'none' : `1px solid rgba(20,20,19,0.25)`,
              }}
              data-testid={`designer-layer-${i}`}
              aria-current={current ? 'true' : undefined}
            >
              <button
                type="button"
                onClick={() => { setConfirm(null); onSelect(i); }}
                className="gd-btn flex items-center gap-2 text-left flex-1 min-w-0"
                style={{ background: 'transparent', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer', minHeight: 48 }}
                aria-label={`Show ${i === 0 ? 'the base' : `layer ${i}`}`}
                data-testid={`designer-layer-show-${i}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.imagePath} alt="" className="shrink-0 object-cover" style={{ width: 48, height: 48, background: '#b9c9da' }} />
                <span className="min-w-0 flex-1" style={{ fontFamily: F.body, fontSize: 13, lineHeight: 1.35, wordBreak: 'break-word' }}>
                  {l.text || (i === 0 ? 'Base' : 'Edit')}
                </span>
                <span
                  className="shrink-0 px-1.5"
                  style={{ background: kindTone(l.kind), color: '#fff', fontFamily: F.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: '18px' }}
                >
                  {kindLabel(l.kind)}
                </span>
              </button>
              {i > 0 && editable && (
                asking ? (
                  <button
                    type="button"
                    onClick={() => { setConfirm(null); onDelete(i); }}
                    className="gd-btn shrink-0 px-3"
                    data-testid="designer-delete-confirm"
                    aria-label={`Delete this layer${later ? ` and the ${later} after it` : ''}`}
                    style={{ minHeight: 36, background: C.body, color: '#fff', border: 'none', fontFamily: F.bebas, fontSize: 15, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 18 }}
                  >
                    DELETE{later ? ` +${later}` : ''}?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirm(i)}
                    className="gd-btn shrink-0 flex items-center justify-center"
                    data-testid={`designer-layer-delete-${i}`}
                    aria-label={`Delete layer ${i}`}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', lineHeight: 1, fontSize: 18, cursor: 'pointer',
                      background: `${C.body}22`, border: `1px solid ${C.body}55`, color: current ? '#F5F4EF' : C.body,
                    }}
                  >
                    {'⊗'}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
