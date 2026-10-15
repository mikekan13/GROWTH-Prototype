"use client";

import React, { useEffect, useState } from 'react';
import { C, F, ActionBar, Chip, GhostButton, Readout, SectionBar, TextInput } from './parts';
import {
  MARK_KINDS, QUICK_TELLS, SHAPE_PRESETS, SHAPE_WORDS_PLACEHOLDER,
  composeMarkText, composeShapeText, composeTellText, markLayerKind, markPlacesFor, shapeCategoriesFor,
  type EditTarget, type LayerKind, type MarkKind, type MarkPlace, type Possessive, type ShapeCategory,
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

// ── 2 · SHAPE ───────────────────────────────────────────────────────────

const SHAPE_HINT: Record<EditTarget, string> = {
  face: 'FACE · hair and marks · the face itself is the locked identity',
  body: 'BODY · build, marks and the underwear design',
};

/**
 * The parts follow the tab (Mike 2026-10-15): FACE = hair + marks on the
 * face/neck; BODY = build + marks anywhere + underwear. Switching tabs resets
 * the chips so nothing from the other tab lingers.
 */
export function Shape({ target, possessive, onApply, disabled, busy }: {
  target: EditTarget;
  possessive: Possessive;
  /** text = the visible sentence (no suffix). Returns true when it went through (clears inputs). */
  onApply: (text: string, kind: LayerKind) => Promise<boolean>;
  disabled: boolean;
  busy: boolean;
}) {
  const categories = shapeCategoriesFor(target);
  const places = markPlacesFor(target);
  const [cat, setCat] = useState<ShapeCategory>(categories[0]);
  const [preset, setPreset] = useState<string | null>(null);
  const [words, setWords] = useState('');
  const [mark, setMark] = useState<MarkKind>('Scar');
  const [place, setPlace] = useState<MarkPlace>(places[0]);

  useEffect(() => {
    setCat(shapeCategoriesFor(target)[0]);
    setPlace(markPlacesFor(target)[0]);
    setPreset(null);
    setWords('');
  }, [target]);

  const isMarks = cat === 'Marks';
  const text = isMarks
    ? composeMarkText(mark, place, words, possessive)
    : composeShapeText(cat, preset, words, possessive);
  const kind: LayerKind = isMarks ? markLayerKind(mark) : (cat.toLowerCase() as LayerKind);

  const apply = async () => {
    if (!text) return;
    const ok = await onApply(text, kind);
    if (ok) { setWords(''); setPreset(null); }
  };

  return (
    <section className="space-y-2" data-testid="designer-shape" data-target={target} style={{ opacity: disabled ? 0.55 : 1 }}>
      <SectionBar n={2} title="Shape" hint={SHAPE_HINT[target]} />
      <div className="flex flex-wrap gap-1">
        {categories.map(c => (
          <Chip key={c} label={c.toUpperCase()} on={cat === c} onClick={() => { setCat(c); setPreset(null); setWords(''); }} disabled={disabled} testId={`designer-cat-${c.toLowerCase()}`} />
        ))}
      </div>

      {isMarks ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {MARK_KINDS.map(m => (
              <Chip key={m} label={m} tone="spirit" on={mark === m} onClick={() => setMark(m)} disabled={disabled} testId={`designer-mark-${m.toLowerCase().replace(/\s+/g, '-')}`} />
            ))}
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }}>WHERE</div>
          <div className="flex flex-wrap gap-1">
            {places.map(p => (
              <Chip key={p} label={p} on={place === p} onClick={() => setPlace(p)} disabled={disabled} testId={`designer-place-${p.toLowerCase()}`} />
            ))}
          </div>
          <TextInput
            value={words}
            onChange={setWords}
            placeholder={mark === 'Body mod' ? 'Describe it: stretched ear gauges, a brand on the shoulder…' : 'Describe it: a thin pale scar through the left eyebrow'}
            testId="designer-mark-words"
            disabled={disabled}
            onEnter={apply}
          />
          {/* The Qwen provider refuses object-reference edits today, so the design
              photo is parked behind a disabled tile rather than silently ignored. */}
          <div
            className="flex items-center gap-2 px-2"
            aria-disabled="true"
            data-testid="designer-mark-ref-soon"
            style={{ minHeight: 44, border: `1px dashed rgba(20,20,19,0.4)`, color: 'rgba(20,20,19,0.55)', fontFamily: F.mono, fontSize: 11 }}
          >
            <span style={{ fontSize: 18 }}>+</span>
            <span>reference photo of the {mark.toLowerCase()} (soon) · the design is copied, the skin stays theirs</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {SHAPE_PRESETS[cat].length > 0 && (
            <div className="flex flex-wrap gap-1">
              {SHAPE_PRESETS[cat].map(p => (
                <Chip key={p.label} label={p.label} on={preset === p.label} onClick={() => setPreset(preset === p.label ? null : p.label)} disabled={disabled} testId={`designer-preset-${p.label}`} />
              ))}
            </div>
          )}
          <TextInput value={words} onChange={setWords} placeholder={SHAPE_WORDS_PLACEHOLDER[cat]} testId="designer-shape-words" disabled={disabled} onEnter={apply} />
        </div>
      )}
      {text && !disabled && (
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }} data-testid="designer-shape-sentence">&gt; {text}</div>
      )}
      <ActionBar label="APPLY" onClick={apply} disabled={disabled || !text} busy={busy} testId="designer-apply" />
    </section>
  );
}

// ── 3 · TELL JEWL ───────────────────────────────────────────────────────

export function TellJewl({ target, onTell, disabled, busy }: {
  target: EditTarget;
  onTell: (text: string) => Promise<boolean>;
  disabled: boolean;
  busy: boolean;
}) {
  const [say, setSay] = useState('');
  const send = async (raw: string) => {
    const t = composeTellText(raw);
    if (!t) return;
    setSay(raw);
    const ok = await onTell(t);
    if (ok) setSay('');
  };
  return (
    <section className="space-y-2" data-testid="designer-tell" data-target={target} style={{ opacity: disabled ? 0.55 : 1 }}>
      <SectionBar n={3} title="Tell JEWL" hint={`${target.toUpperCase()} · say what to change; it edits in place`} />
      <div className="flex gap-1">
        <div className="flex-1 min-w-0">
          <TextInput value={say} onChange={setSay} placeholder={`One sentence: what should change on the ${target}?`} testId="designer-tell-input" disabled={disabled} onEnter={() => send(say)} />
        </div>
        <button
          type="button"
          onClick={() => send(say)}
          disabled={disabled || busy || !say.trim()}
          data-testid="designer-tell-edit"
          className="gd-btn shrink-0 px-4"
          style={{
            minHeight: 44, minWidth: 64, background: disabled || !say.trim() ? '#5b6470' : C.spirit, color: '#fff', border: 'none',
            fontFamily: F.bebas, fontSize: 18, letterSpacing: '0.12em', cursor: disabled || busy || !say.trim() ? 'default' : 'pointer',
          }}
        >
          {busy ? '…' : 'EDIT'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK_TELLS[target].map(q => (
          <Chip key={q} label={q} tone="spirit" onClick={() => send(q)} disabled={disabled || busy} testId={`designer-quick-${q}`} />
        ))}
      </div>
    </section>
  );
}
