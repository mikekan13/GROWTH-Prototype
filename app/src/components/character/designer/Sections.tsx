"use client";

import React, { useState } from 'react';
import { C, F, ActionBar, Chip, GhostButton, Readout, SectionBar, TextInput } from './parts';
import {
  QUICK_TELLS, SHAPE_PRESETS,
  composeShapeText, composeStub, composeTellText, isMarkPart, isUnfinishedStub, layerKindFor, markPlacesFor, partsFor,
  type EditTarget, type LayerKind, type MarkKind, type MarkPlace, type Part, type Possessive,
} from '@/lib/appearance-designer';

// ── 1 · START FROM ──────────────────────────────────────────────────────

export function StartFrom({
  open, locked, onToggle, photos, uploading, onUpload, onRemove, description, onDescription,
  onLock, busy, blockedLine,
}: {
  open: boolean;
  locked: boolean;
  onToggle: () => void;
  photos: string[];
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (path: string) => void;
  description: string;
  onDescription: (v: string) => void;
  onLock: () => void;
  busy: boolean;
  /** Why LOCK IDENTITY can't run yet (no seed, no photo). */
  blockedLine: string | null;
}) {
  return (
    <section className="space-y-2" data-testid="designer-start">
      <SectionBar
        n={1}
        title="Start from"
        hint={open ? 'two or three clear photos of the face' : `identity locked from ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
        right={locked ? <GhostButton label={open ? 'hide' : 'change photos'} onClick={onToggle} testId="designer-start-toggle" /> : undefined}
      />
      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p} className="relative" style={{ width: 88, height: 110 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-0 top-0 px-1" style={{ background: C.ink, color: C.gold, fontFamily: F.mono, fontSize: 9 }}>PRIMARY</span>
                )}
                <button
                  type="button"
                  aria-label={`Remove reference ${i + 1}`}
                  onClick={() => onRemove(p)}
                  className="gd-btn absolute right-0 bottom-0 flex items-center justify-center"
                  style={{ width: 44, height: 44, background: 'rgba(20,20,19,0.8)', color: C.powder, border: 'none', fontFamily: F.mono, fontSize: 16, cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < 3 && (
              <label
                className="flex flex-col items-center justify-center cursor-pointer"
                style={{ width: 88, height: 110, border: `1px dashed ${C.ink}`, color: C.ink, fontFamily: F.mono, fontSize: 11 }}
                data-testid="designer-photo-add"
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{uploading ? '…' : '+'}</span>
                <span>{uploading ? 'uploading' : 'photo'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} className="hidden" disabled={uploading} />
              </label>
            )}
          </div>
          <TextInput
            multiline
            value={description}
            onChange={onDescription}
            placeholder="Or describe them"
            testId="designer-describe"
          />
          {blockedLine && <Readout tone="note">{blockedLine}</Readout>}
          <ActionBar label="LOCK IDENTITY" onClick={onLock} disabled={!!blockedLine} busy={busy} tone="soul" testId="designer-lock" />
        </div>
      )}
    </section>
  );
}

// ── 2 · SHAPE (one section, one sentence) ───────────────────────────────

const SHAPE_HINT: Record<EditTarget, string> = {
  face: 'FACE · hair and marks · pick a part and finish the sentence, or just say it',
  body: 'BODY · build, marks, underwear · pick a part and finish the sentence, or just say it',
};

/**
 * Shape and Tell JEWL were the same action twice (Mike 2026-10-15), so this
 * is the one place to change the image: the part chips write into ONE
 * sentence box (a preset writes the whole sentence, a mark or own-words part
 * an open stub to finish), the box can also just be typed in, and EDIT sends
 * what the box says. The parts follow the tab: FACE = hair + marks on the
 * face/neck; BODY = build + marks anywhere + underwear.
 */
export function Shape({ target, possessive, onApply, disabled, busy }: {
  target: EditTarget;
  possessive: Possessive;
  /** text = the visible sentence (no suffix). Returns true when it went through (clears the box). */
  onApply: (text: string, kind: LayerKind) => Promise<boolean>;
  disabled: boolean;
  busy: boolean;
}) {
  const parts = partsFor(target);
  const places = markPlacesFor(target);
  const [part, setPart] = useState<Part | null>(null);
  const [place, setPlace] = useState<MarkPlace>(places[0]);
  const [say, setSay] = useState('');
  // The container keys this section on the tab, so a switch remounts it clean.

  const presets = part && !isMarkPart(part) ? SHAPE_PRESETS[part] : [];
  const ready = !isUnfinishedStub(say);

  const pickPart = (p: Part) => {
    if (part === p) { setPart(null); setSay(''); return; }
    setPart(p);
    setSay(composeStub(p, place, possessive));
  };
  /** A new place keeps whatever was typed after the old stub. */
  const pickPlace = (pl: MarkPlace) => {
    setPlace(pl);
    if (!part || !isMarkPart(part)) return;
    const prev = composeStub(part, place, possessive);
    const tail = say.startsWith(prev) ? say.slice(prev.length) : '';
    setSay(composeStub(part, pl, possessive) + tail);
  };
  const pickPreset = (label: string) => {
    if (!part || isMarkPart(part)) return;
    setSay(composeShapeText(part, label, '', possessive) ?? '');
  };

  const send = async (raw: string) => {
    const t = composeTellText(raw);
    if (!t || isUnfinishedStub(raw)) return;
    setSay(raw);
    const ok = await onApply(t, layerKindFor(t, part));
    if (ok) { setSay(''); setPart(null); }
  };

  const stubPlaceholder = target === 'body'
    ? 'What should change on the body? e.g. a tattoo down the left forearm'
    : 'What should change on the face? e.g. a thin pale scar through the left eyebrow';

  return (
    <section className="space-y-2" data-testid="designer-shape" data-target={target} style={{ opacity: disabled ? 0.55 : 1 }}>
      <SectionBar n={2} title="Shape" hint={SHAPE_HINT[target]} />
      <div className="flex flex-wrap gap-1">
        {parts.map(p => (
          <Chip
            key={p}
            label={p.toUpperCase()}
            tone={isMarkPart(p) ? 'spirit' : 'ink'}
            on={part === p}
            onClick={() => pickPart(p)}
            disabled={disabled}
            testId={`designer-part-${p.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ))}
      </div>

      {part && isMarkPart(part) && (
        <div className="space-y-1">
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }}>WHERE</div>
          <div className="flex flex-wrap gap-1">
            {places.map(p => (
              <Chip key={p} label={p} on={place === p} onClick={() => pickPlace(p)} disabled={disabled} testId={`designer-place-${p.toLowerCase()}`} />
            ))}
          </div>
        </div>
      )}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map(p => (
            <Chip key={p.label} label={p.label} on={say === composeShapeText(part as Exclude<Part, MarkKind>, p.label, '', possessive)} onClick={() => pickPreset(p.label)} disabled={disabled} testId={`designer-preset-${p.label}`} />
          ))}
        </div>
      )}

      <div className="flex gap-1">
        <div className="flex-1 min-w-0">
          <TextInput value={say} onChange={setSay} placeholder={stubPlaceholder} testId="designer-say" disabled={disabled} onEnter={() => send(say)} />
        </div>
        <button
          type="button"
          onClick={() => send(say)}
          disabled={disabled || busy || !ready}
          data-testid="designer-apply"
          className="gd-btn shrink-0 px-4"
          style={{
            minHeight: 44, minWidth: 72, background: disabled || !ready ? '#5b6470' : C.spirit, color: '#fff', border: 'none',
            fontFamily: F.bebas, fontSize: 18, letterSpacing: '0.12em', cursor: disabled || busy || !ready ? 'default' : 'pointer',
          }}
        >
          {busy ? '…' : 'EDIT'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span style={{ fontFamily: F.mono, fontSize: 11, color: C.soul, marginRight: 4 }}>try:</span>
        {QUICK_TELLS[target].map(q => (
          <Chip key={q} label={q} tone="spirit" onClick={() => send(q)} disabled={disabled || busy} testId={`designer-quick-${q}`} />
        ))}
      </div>

      {part && isMarkPart(part) && (
        /* The Qwen provider refuses object-reference edits today, so the design
           photo is parked behind a disabled tile rather than silently ignored. */
        <div
          className="flex items-center gap-2 px-2"
          aria-disabled="true"
          data-testid="designer-mark-ref-soon"
          style={{ minHeight: 44, border: `1px dashed rgba(20,20,19,0.4)`, color: 'rgba(20,20,19,0.55)', fontFamily: F.mono, fontSize: 11 }}
        >
          <span style={{ fontSize: 18 }}>+</span>
          <span>reference photo of the {part.toLowerCase()} (soon) · the design is copied, the skin stays theirs</span>
        </div>
      )}
    </section>
  );
}
