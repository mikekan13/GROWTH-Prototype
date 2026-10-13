"use client";

/**
 * AppearanceDesigner (ruling 2026-10-13, image-designer redesign) — the
 * Appearance section of the Tapestry entity view. One big preview; 1 Start
 * from (photos → LOCK IDENTITY, Qwen two-step lock → style); 2 Shape (chips +
 * presets + own words); 3 Tell JEWL (one-sentence in-place edits); the edit
 * stack; APPROVE AS BASE (Character.portrait + body render); levers hidden.
 *
 * The sheet owns the character's facts; the designer owns the image. The
 * stack persists in identity.designer (see lib/appearance-designer.ts).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CLOTHING_NOTE, STATUS_LABEL, currentLayer, deriveDesignerStatus, designerReducer, isClothingOrGear,
  possessiveFor, restoreDesigner, withNothingElse, EMPTY_DESIGNER,
  type DesignerAction, type DesignerState, type LayerKind,
} from '@/lib/appearance-designer';
import { C, F, ActionBar, DesignerStyles, GhostButton, Readout, SigilBorder } from './parts';
import { Preview, type PreviewView } from './Preview';
import { EditStack } from './EditStack';
import { Shape, StartFrom, TellJewl } from './Sections';
import { approveBase, editLayer, generateBody, loadIdentity, lockIdentity, persistDesigner } from './api';

export interface AppearanceDesignerProps {
  characterId: string | null;
  characterName: string;
  editable: boolean;
  /** Seed name (portraits wait for one, server-enforced). */
  seedName: string | null;
  /** Reference photos stay owned by CharacterTab (same upload API as before). */
  referencePhotos: string[];
  uploading: boolean;
  onUploadPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (path: string) => void;
  /** The generate route's inline characterData (story, seed, identity). */
  getCharacterData: () => { identity?: { sex?: string } } & Record<string, unknown>;
  /** Approved: CharacterTab records generatedBust/FullBody and flips completion. */
  onApproved: (bust: string, body: string | null) => void;
}

type Busy = null | 'lock' | 'edit' | 'regen' | 'approve' | 'body';

const BUSY_LINE: Record<Exclude<Busy, null>, string> = {
  lock: '[ LOCKING IDENTITY · lock, then style · the engine may take a minute to wake ]',
  edit: '[ EDITING IN PLACE ]',
  regen: '[ REGENERATING · new seed ]',
  approve: '[ APPROVING BASE ]',
  body: '[ RENDERING BODY FROM THE BASE ]',
};

export default function AppearanceDesigner({
  characterId, characterName, editable, seedName, referencePhotos, uploading, onUploadPhoto, onRemovePhoto,
  getCharacterData, onApproved,
}: AppearanceDesignerProps) {
  const [designer, setDesigner] = useState<DesignerState>(EMPTY_DESIGNER);
  const ref = useRef<DesignerState>(EMPTY_DESIGNER);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = !!characterId && loadedFor === characterId;
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<PreviewView>('face');
  const [startOpen, setStartOpen] = useState(false);
  const [showLevers, setShowLevers] = useState(false);
  const [glitchKey, setGlitchKey] = useState(0);
  const photosRef = useRef(referencePhotos);
  useEffect(() => { photosRef.current = referencePhotos; }, [referencePhotos]);
  // "Or describe them" is typed locally and saved after a pause (not per keystroke).
  const [describeText, setDescribeText] = useState('');

  /** Photos key last saved (null = not yet seen for this character). */
  const lastPhotosKey = useRef<string | null>(null);

  // ── load / persist ──
  useEffect(() => {
    let cancelled = false;
    if (!characterId) return;
    void loadIdentity(characterId).then(identity => {
      if (cancelled) return;
      const s = restoreDesigner(identity);
      ref.current = s;
      setDesigner(s);
      setDescribeText(s.description ?? '');
      setError(null);
      setNote(null);
      lastPhotosKey.current = null;
      setLoadedFor(characterId);
    });
    return () => { cancelled = true; };
  }, [characterId]);

  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const persist = useCallback((s: DesignerState) => {
    if (!characterId) return;
    saveChain.current = saveChain.current.then(async () => {
      const ok = await persistDesigner(characterId, s, photosRef.current);
      if (!ok) setError('Could not save the edit stack. The image is safe; it will save with the next change.');
    });
  }, [characterId]);

  const commit = useCallback((...actions: DesignerAction[]) => {
    const next = actions.reduce(designerReducer, ref.current);
    ref.current = next;
    setDesigner(next);
    persist(next);
  }, [persist]);

  // Photos ride with the designer save (CharacterTab owns the upload).
  const photosKey = referencePhotos.join('|');
  useEffect(() => {
    if (!loaded) return;
    if (lastPhotosKey.current === null) { lastPhotosKey.current = photosKey; return; }
    if (lastPhotosKey.current === photosKey) return;
    lastPhotosKey.current = photosKey;
    persist(ref.current);
  }, [photosKey, loaded, persist]);

  useEffect(() => {
    if (!loaded || describeText === (ref.current.description ?? '')) return;
    const t = setTimeout(() => commit({ type: 'describe', text: describeText }), 900);
    return () => clearTimeout(t);
  }, [describeText, loaded, commit]);

  // ── derived ──
  const status = deriveDesignerStatus(designer);
  const top = currentLayer(designer);
  const topIndex = designer.layers.length - 1;
  const locked = !!top;
  const possessive = possessiveFor(getCharacterData().identity?.sex);
  const working = busy !== null;
  const lockBlocked = !seedName
    ? 'No seed yet. Portraits wait for one: JEWL picks it when the story is submitted.'
    : referencePhotos.length === 0
      ? (describeText.trim()
        ? 'Describe-only starts are not wired on the Qwen engine yet. Add one clear photo of the face.'
        : 'Add one to three clear photos of the face.')
      : null;

  const newLayerLanded = () => setGlitchKey(k => k + 1);

  // ── actions ──
  const runLock = async (mode: 'lock' | 'regen') => {
    if (!characterId || working) return;
    setBusy(mode); setError(null); setNote(null);
    const r = await lockIdentity(getCharacterData(), referencePhotos);
    setBusy(null);
    if (!r.ok) { setError(r.line); return; }
    const layer = {
      imagePath: r.imagePath,
      text: `Locked from ${referencePhotos.length} photo${referencePhotos.length === 1 ? '' : 's'}`,
      kind: 'base' as const, seed: r.seed, at: new Date().toISOString(),
    };
    commit(mode === 'lock' ? { type: 'lock', layer } : { type: 'replaceTop', layer }, { type: 'levers', levers: r.levers });
    setStartOpen(false);
    setView('face');
    newLayerLanded();
  };

  /** One edit on `source` → append (or replace the top when regenerating). */
  const runEdit = async (text: string, kind: LayerKind, mode: 'edit' | 'regen', source: string): Promise<boolean> => {
    if (!characterId || working) return false;
    const instruction = withNothingElse(text);
    if (isClothingOrGear(instruction)) { setNote(CLOTHING_NOTE); setError(null); return false; }
    setBusy(mode); setError(null); setNote(null);
    const r = await editLayer(characterId, source, instruction);
    setBusy(null);
    if (!r.ok) {
      if (r.line === CLOTHING_NOTE) setNote(r.line); else setError(r.line);
      return false;
    }
    const layer = { imagePath: r.imagePath, text, kind, seed: r.seed, at: new Date().toISOString() };
    commit({ type: mode === 'edit' ? 'append' : 'replaceTop', layer }, { type: 'levers', levers: r.levers });
    setView('face');
    newLayerLanded();
    return true;
  };

  const applyEdit = (text: string, kind: LayerKind) => (top ? runEdit(text, kind, 'edit', top.imagePath) : Promise.resolve(false));

  const regenerate = () => {
    if (!top) return;
    if (topIndex === 0) { void runLock('regen'); return; }
    const prev = designer.layers[topIndex - 1];
    void runEdit(top.text, top.kind, 'regen', prev.imagePath);
  };
  const canRegenerate = editable && !working && !!top && (topIndex > 0 || (!!seedName && referencePhotos.length > 0));

  const approve = async () => {
    if (!characterId || !top || working) return;
    const bust = top.imagePath;
    setBusy('approve'); setError(null); setNote(null);
    const a = await approveBase(characterId, bust);
    if (!a.ok) { setBusy(null); setError(a.line); return; }
    commit({ type: 'approved', imagePath: bust, at: new Date().toISOString() });
    setBusy('body');
    const b = await generateBody(getCharacterData(), bust);
    setBusy(null);
    if (b.ok) {
      commit({ type: 'body', imagePath: b.imagePath }, { type: 'levers', levers: b.levers });
      setView('body');
      newLayerLanded();
    } else {
      setError(`Base approved. The body render failed: ${b.line}`);
    }
    onApproved(bust, b.ok ? b.imagePath : null);
  };

  const revertTo = (index: number) => {
    commit({ type: 'revertTo', index });
    newLayerLanded();
  };

  // ── render ──
  const statusColor = status === 'awaiting' ? C.gold : C.teal;
  const startIsOpen = !locked || startOpen;
  const lv = designer.levers;

  return (
    <div className="relative" data-testid="appearance-designer" style={{ background: C.powder, color: C.ink, fontFamily: F.body }}>
      <DesignerStyles />
      <SigilBorder />
      <div className="pl-5 pr-3 pt-3 pb-5 sm:pl-7 sm:pr-5">
        {/* Header strip */}
        <div className="flex items-center gap-2 flex-wrap mb-3" data-testid="designer-header">
          <span className="px-2 min-w-0 truncate" style={{ background: C.ink, color: '#fff', fontFamily: F.bebas, fontSize: 22, letterSpacing: '0.12em', lineHeight: '30px', maxWidth: '100%' }}>
            {(characterName || 'Unnamed').toUpperCase()}
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.12em', color: C.soul }}>APPEARANCE</span>
          <span
            className="px-1.5 ml-auto"
            data-testid="designer-status"
            style={{ background: statusColor, color: C.ink, fontFamily: F.mono, fontSize: 11, letterSpacing: '0.06em', lineHeight: '22px' }}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        {!characterId ? (
          <Readout tone="note">Appearance needs a saved character record. Save the sheet first.</Readout>
        ) : !loaded ? (
          <Readout>[ reading the edit stack… ]</Readout>
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
            <div className="md:sticky md:top-2">
              <Preview
                view={view}
                onView={setView}
                layer={top}
                layerIndex={Math.max(0, topIndex)}
                editCount={Math.max(0, designer.layers.length - 1)}
                bodyImagePath={designer.bodyImagePath ?? null}
                busyLine={busy ? BUSY_LINE[busy] : null}
                error={error}
                note={note}
                onRegenerate={regenerate}
                canRegenerate={canRegenerate}
                glitchKey={glitchKey}
              />
            </div>

            <div className="space-y-6 mt-5 md:mt-0">
              {editable && (
                <>
                  <StartFrom
                    open={startIsOpen}
                    locked={locked}
                    onToggle={() => setStartOpen(o => !o)}
                    photos={referencePhotos}
                    uploading={uploading}
                    onUpload={onUploadPhoto}
                    onRemove={onRemovePhoto}
                    description={describeText}
                    onDescription={setDescribeText}
                    onLock={() => { void runLock('lock'); }}
                    busy={busy === 'lock'}
                    blockedLine={lockBlocked}
                  />
                  {locked && startIsOpen && (
                    <Readout tone="note">Locking again starts a new base; the edit stack below is replaced.</Readout>
                  )}
                  <Shape possessive={possessive} onApply={applyEdit} disabled={!locked || working} busy={busy === 'edit'} />
                  <TellJewl onTell={text => applyEdit(text, 'jewl')} disabled={!locked || working} busy={busy === 'edit'} />
                </>
              )}

              <EditStack layers={designer.layers} onRevert={revertTo} editable={editable && !working} />

              {editable && locked && (
                <div className="space-y-1">
                  <ActionBar
                    label={status === 'approved' ? 'BASE APPROVED' : 'APPROVE AS BASE'}
                    onClick={() => { void approve(); }}
                    disabled={status === 'approved'}
                    busy={busy === 'approve' || busy === 'body'}
                    testId="designer-approve"
                  />
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }}>
                    Token, paperdoll and future wound/expression updates all come from this base.
                  </div>
                </div>
              )}

              <div>
                <GhostButton label={showLevers ? 'hide levers' : 'levers'} onClick={() => setShowLevers(s => !s)} testId="designer-levers" />
                {showLevers && (
                  <Readout testId="designer-levers-line">
                    {lv
                      ? `seed ${lv.seed ?? '—'} · guidance ${lv.guidance ?? '—'} · steps ${lv.steps ?? '—'} · refs ${lv.refs}`
                      : 'no call yet'}
                  </Readout>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
