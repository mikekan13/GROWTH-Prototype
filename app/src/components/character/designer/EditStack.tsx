"use client";

import React, { useState } from 'react';
import { C, F, SectionBar } from './parts';
import type { DesignerLayer, LayerKind } from '@/lib/appearance-designer';

const MARK_KINDS: ReadonlySet<LayerKind> = new Set(['scar', 'tattoo', 'makeup', 'piercing', 'birthmark', 'bodymod']);

/** Pillar-tag style kind block: base = Soul, JEWL = Spirit, marks = Body, shape = ink. */
function kindTone(kind: LayerKind): string {
  if (kind === 'base') return C.soul;
  if (kind === 'jewl') return C.spirit;
  if (MARK_KINDS.has(kind)) return C.body;
  return C.ink;
}

/**
 * Linear history, newest first. Tapping an older row asks once, then makes it
 * the current layer and drops everything after it.
 */
export function EditStack({ layers, onRevert, editable }: {
  layers: DesignerLayer[];
  onRevert: (index: number) => void;
  editable: boolean;
}) {
  const [confirm, setConfirm] = useState<number | null>(null);
  if (layers.length === 0) return null;
  const top = layers.length - 1;
  const rows = layers.map((l, i) => ({ l, i })).reverse();

  return (
    <div className="space-y-2" data-testid="designer-stack">
      <SectionBar title="Edit stack" hint="newest first · tap an older layer to go back to it" />
      <div className="space-y-1">
        {rows.map(({ l, i }) => {
          const current = i === top;
          return (
            <div key={`${l.imagePath}-${i}`}>
              <button
                type="button"
                onClick={() => { if (editable && !current) setConfirm(confirm === i ? null : i); }}
                disabled={!editable || current}
                data-testid={`designer-layer-${i}`}
                aria-current={current ? 'true' : undefined}
                className="gd-btn w-full flex items-center gap-2 text-left"
                style={{
                  minHeight: 56, padding: 4, border: 'none',
                  background: current ? C.ink : 'transparent',
                  color: current ? C.powder : C.ink,
                  borderBottom: current ? 'none' : `1px solid rgba(20,20,19,0.25)`,
                  cursor: editable && !current ? 'pointer' : 'default',
                }}
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
                  {l.kind}
                </span>
              </button>
              {confirm === i && (
                <div className="flex flex-wrap items-center gap-2 p-2" style={{ background: C.ink }} role="alertdialog" aria-label="Go back to this layer">
                  <span className="flex-1 min-w-0" style={{ color: C.gold, fontFamily: F.mono, fontSize: 12 }}>
                    Go back to this layer? {top - i} later layer{top - i === 1 ? '' : 's'} will be dropped.
                  </span>
                  <button
                    type="button"
                    className="gd-btn px-3"
                    data-testid="designer-revert-confirm"
                    onClick={() => { setConfirm(null); onRevert(i); }}
                    style={{ minHeight: 44, background: C.gold, color: C.ink, border: 'none', fontFamily: F.bebas, fontSize: 16, letterSpacing: '0.1em', cursor: 'pointer' }}
                  >
                    DROP &amp; GO BACK
                  </button>
                  <button
                    type="button"
                    className="gd-btn px-3"
                    onClick={() => setConfirm(null)}
                    style={{ minHeight: 44, background: 'transparent', color: C.powder, border: `1px solid ${C.powder}`, fontFamily: F.mono, fontSize: 12, cursor: 'pointer' }}
                  >
                    keep
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
