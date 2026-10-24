"use client";

/**
 * AppearanceDesigner (ruling 2026-10-13, image-designer redesign) — the
 * Appearance section of the Tapestry entity view. One big preview; 1 Start
 * from (photos → LOCK IDENTITY, Qwen two-step lock → style); 2 Shape (part
 * chips write into one sentence box; EDIT sends it in place — Shape and Tell
 * JEWL merged 2026-10-15); the edit stack; APPROVE AS BASE (Character.portrait
 * + body render); seeds and levers hidden.
 *
 * The sheet owns the character's facts; the designer owns the image. The
 * stack persists in identity.designer (see lib/appearance-designer.ts).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CLOTHING_NOTE, RESTRICTED_NOTE, SCOPE_NOTE, BODY_ONLY_NOTE, STATUS_LABEL, currentLayer, deriveDesignerStatus, designerReducer,
  editScope, layersOf, pronounsFor, restoreDesigner, withNothingElse, EMPTY_DESIGNER, GATE_FLAGGED_NOTE, NOT_LOCALIZED_NOTE, POLISH_TEXT, PORTRAIT_TEXT,
  type DesignerAction, type DesignerState, type EditTarget, type LayerKind, type Pronouns, type StackTarget,
} from '@/lib/appearance-designer';
import { C, F, ActionBar, DesignerStyles, Readout, SigilBorder } from './parts';

/** Guard lines are notes (nothing was sent), not engine errors. */
const SCOPE_LINES: ReadonlySet<string> = new Set([CLOTHING_NOTE, RESTRICTED_NOTE, SCOPE_NOTE, BODY_ONLY_NOTE]);

const BODY_NOT_YET = 'The body is made when you approve the base. Approve the face first, then shape the body here.';
const PORTRAIT_APPROVED_NOTE = 'Portrait approved — it is the canvas image now.';
/** The veil's sub line: the route writes the brief first (a local JEWL call), then paints; the clock decides the words. */
const paintSubBrief = (p: Pronouns) => `JEWL is writing the brief — the place, ${p.possessive} bearing, ${p.possessive} mood, what ${p.subject} ${p.has === 'has' ? 'wears' : 'wear'}`;
const PAINT_SUB_PAINT = 'painting from the face and body';
const PAINT_SUB_SWITCH_MS = 9000;
import { Preview, type PreviewView } from './Preview';
import { EditStack } from './EditStack';
import { Shape, StartFrom } from './Sections';
import { BriefReadout, DressSection } from './Dress';
import { approveBase, editLayer, generateBody, loadIdentity, lockIdentity, paintPortrait, persistDesigner, polishImage, readPortraitBrief, type PaintBrief, type WardrobeView } from './api';

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

type Busy = null | 'lock' | 'edit' | 'regen' | 'approve' | 'polishBody' | 'body' | 'portrait' | 'portraitRegen' | 'portraitApprove';

const BUSY_LINE: Record<Exclude<Busy, null>, string> = {
  lock: '[ LOCKING IDENTITY · lock, then style · the engine may take a minute to wake ]',
  edit: '[ EDITING IN PLACE ]',
  regen: '[ REGENERATING · new seed ]',
  approve: '[ APPROVING · CLEAN RE-RENDER OF THE FACE ]',
  polishBody: '[ CLEAN RE-RENDER OF THE BODY ]',
  body: '[ RENDERING BODY FROM THE BASE ]',
  portrait: '[ PAINTING THE PORTRAIT ]',
  portraitRegen: '[ PAINTING THE PORTRAIT · new seed ]',
  portraitApprove: '[ APPROVING THE PORTRAIT ]',
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
  const [glitchKey, setGlitchKey] = useState(0);
  const photosRef = useRef(referencePhotos);
  useEffect(() => { photosRef.current = referencePhotos; }, [referencePhotos]);
  // "Or describe them" is typed locally and saved after a pause (not per keystroke).
  const [describeText, setDescribeText] = useState('');
  // PORTRAIT (16 Oct): the last brief (identity.portraitBrief), what is worn (gates the paint), the veil's sub line.
  const [brief, setBrief] = useState<PaintBrief | null>(null);
  const [worn, setWorn] = useState<boolean | null>(null);
  const [paintSub, setPaintSub] = useState<string | null>(null);
  const onWardrobe = useCallback((w: WardrobeView) => { setWorn(w.garments.some(g => g.state === 'worn')); }, []);

  /** Photos key last saved (null = not yet seen for this character). */
  const lastPhotosKey = useRef<string | null>(null);

  // ── load / persist ──
  useEffect(() => {
    let cancelled = false;
    if (!characterId) return;
    void loadIdentity(characterId).then(identity => {
      if (cancelled) return;
      if (identity === null) {
        // Never sit on "reading the edit stack…" (15 Oct: a recompiling dev server left it there).
        setError('Could not read the character record. Reload the page to try again.');
        return;
      }
      const s = restoreDesigner(identity);
      ref.current = s;
      setDesigner(s);
      setDescribeText(s.description ?? '');
      setBrief(readPortraitBrief(identity.portraitBrief));
      setWorn(null);
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
  const locked = !!top;
  const who = pronounsFor(getCharacterData().identity?.sex);
  const possessive = who.possessive;
  const working = busy !== null;
  const lockBlocked = !seedName
    ? 'No seed yet. Portraits wait for one: JEWL picks it when the story is submitted.'
    : referencePhotos.length === 0
      ? (describeText.trim()
        ? 'Describe-only starts are not wired on the Qwen engine yet. Add one clear photo of the face.'
        : 'Add one to three clear photos of the face.')
      : null;

  /** The tab decides what an edit lands on: BODY edits the body stack, everything else the face. */
  const target: EditTarget = view === 'body' ? 'body' : 'face';
  /** The stack the tab shows (the PORTRAIT tab has its own row of paints; edits never land there). */
  const stackTarget: StackTarget = view;
  const bodyPath = designer.bodyImagePath ?? null;
  const stack = layersOf(designer, stackTarget);
  const stackTop = stack.length - 1;
  /** An older stack layer being looked at (null = the newest). */
  const [peek, setPeek] = useState<number | null>(null);
  const peeking = peek !== null && peek >= 0 && peek < stackTop ? peek : null;
  const changeView = (v: PreviewView) => { setView(v); setPeek(null); };

  const newLayerLanded = () => { setGlitchKey(k => k + 1); setPeek(null); };

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
    if (r.levers.gate && !r.levers.gate.pass) setNote(GATE_FLAGGED_NOTE);
    setStartOpen(false);
    setView('face');
    newLayerLanded();
  };

  /**
   * One edit on `source`, onto the tab's stack: append, or replace the top
   * when regenerating. The face and the body each keep their own stack.
   */
  const runEdit = async (text: string, kind: LayerKind, mode: 'edit' | 'regen', source: string, target: EditTarget): Promise<boolean> => {
    if (!characterId || working) return false;
    const instruction = withNothingElse(text);
    // Allowed scope (Mike 2026-10-15), per tab; the route checks the same.
    const scope = editScope(instruction, target);
    if (!scope.ok) { setNote(scope.line); setError(null); return false; }
    setBusy(mode); setError(null); setNote(null);
    const r = await editLayer(characterId, source, instruction, target);
    setBusy(null);
    if (!r.ok) {
      if (SCOPE_LINES.has(r.line)) setNote(r.line); else setError(r.line);
      return false;
    }
    const layer = { imagePath: r.imagePath, text, kind, seed: r.seed, at: new Date().toISOString() };
    commit({ type: mode === 'edit' ? 'append' : 'replaceTop', layer, target }, { type: 'levers', levers: r.levers });
    if (r.localized === 'none') setNote(NOT_LOCALIZED_NOTE);
    setView(target);
    newLayerLanded();
    return true;
  };

  /** Edits always go on the newest layer of the tab's stack (peeking is only looking). */
  const applyEdit = (text: string, kind: LayerKind) => {
    if (target === 'body') {
      if (!bodyPath) { setNote(BODY_NOT_YET); return Promise.resolve(false); }
      return runEdit(text, kind, 'edit', bodyPath, 'body');
    }
    return top ? runEdit(text, kind, 'edit', top.imagePath, 'face') : Promise.resolve(false);
  };

  /** BODY base re-roll: a fresh body from the approved base (the body stack restarts from it). */
  const regenBody = async () => {
    if (!characterId || working || !designer.approvedImagePath) return;
    setBusy('body'); setError(null); setNote(null);
    const b = await generateBody(getCharacterData(), designer.approvedImagePath);
    setBusy(null);
    if (!b.ok) { setError(b.line); return; }
    commit({ type: 'body', imagePath: b.imagePath, seed: b.levers.seed, at: new Date().toISOString() }, { type: 'levers', levers: b.levers });
    onApproved(designer.approvedImagePath, b.imagePath);
    newLayerLanded();
  };

  /**
   * PAINT PORTRAIT / REGENERATE (Mike 16 Oct; plan §4 C): the route has JEWL
   * write the brief (reused while nothing changed) and paints it from the
   * approved face + body on the v1 recipe. A paint is a new row on the
   * PORTRAIT stack; REGENERATE replaces the newest with a new seed.
   */
  const paint = async (mode: 'paint' | 'regen') => {
    if (!characterId || working || !designer.approvedImagePath || !bodyPath) return;
    if (worn === false) { setNote(`Nothing is worn — dress ${who.object} first, or let JEWL dress ${who.object}.`); return; }
    setBusy(mode === 'paint' ? 'portrait' : 'portraitRegen'); setError(null); setNote(null);
    setPaintSub(paintSubBrief(who));
    const t = setTimeout(() => setPaintSub(PAINT_SUB_PAINT), PAINT_SUB_SWITCH_MS);
    const r = await paintPortrait(characterId);
    clearTimeout(t);
    setPaintSub(null);
    setBusy(null);
    if (!r.ok) { setError(r.line); return; }
    if (r.brief) setBrief(r.brief);
    const layer = { imagePath: r.imagePath, text: `${PORTRAIT_TEXT}${r.brief ? (r.brief.byJewl ? ' · JEWL’s brief' : ' · plain brief') : ''}`, kind: 'portrait' as const, seed: r.seed, at: new Date().toISOString() };
    commit({ type: mode === 'paint' || stackTop < 0 ? 'append' : 'replaceTop', layer, target: 'portrait' }, { type: 'levers', levers: r.levers });
    setView('portrait');
    newLayerLanded();
  };

  /** APPROVE PORTRAIT → /api/portraits/lock sets Character.portrait: the canvas image (the first one = the BASE portrait). */
  const approvePortrait = async () => {
    const newest = currentLayer(designer, 'portrait');
    if (!characterId || working || !newest) return;
    setBusy('portraitApprove'); setError(null); setNote(null);
    const a = await approveBase(characterId, newest.imagePath);
    setBusy(null);
    if (!a.ok) { setError(a.line); return; }
    commit({ type: 'portraitApproved', imagePath: newest.imagePath, at: new Date().toISOString() });
    setNote(PORTRAIT_APPROVED_NOTE);
  };

  /** REGENERATE re-rolls the newest layer of the tab's stack: the base from its source, an edit on the layer under it (a paint: a new seed). */
  const regenerate = () => {
    if (view === 'portrait') { if (stackTop >= 0) void paint('regen'); return; }
    if (stackTop < 0) return;
    if (stackTop === 0) { void (target === 'body' ? regenBody() : runLock('regen')); return; }
    const newest = stack[stackTop];
    const prev = stack[stackTop - 1];
    if (newest.kind === 'polish') { void rerollPolish(prev.imagePath); return; }
    void runEdit(newest.text, newest.kind, 'regen', prev.imagePath, target);
  };

  /** REGENERATE on a clean-render layer: polish the layer under it again with a new seed (replaces the top). */
  const rerollPolish = async (source: string) => {
    if (!characterId || working) return;
    setBusy(target === 'body' ? 'polishBody' : 'approve'); setError(null); setNote(null);
    const r = await polishImage(characterId, source, target);
    setBusy(null);
    if (!r.ok) { setError(`The clean re-render failed: ${r.line}`); return; }
    commit({ type: 'replaceTop', target, layer: { imagePath: r.imagePath, text: POLISH_TEXT, kind: 'polish', seed: r.seed, at: new Date().toISOString() } }, { type: 'levers', levers: r.levers });
    if (target === 'face') {
      const a = await approveBase(characterId, r.imagePath);
      if (a.ok) { commit({ type: 'approved', imagePath: r.imagePath, at: new Date().toISOString() }); onApproved(r.imagePath, bodyPath); }
      else setError(a.line);
    }
    newLayerLanded();
  };
  const portraitReady = !!designer.approvedImagePath && !!bodyPath;
  const canPaint = editable && !working && portraitReady && worn === true;
  const canRegenerate = editable && !working && stackTop >= 0 && (
    view === 'portrait'
      ? canPaint
      : stackTop > 0 || (target === 'body' ? !!designer.approvedImagePath : (!!seedName && referencePhotos.length > 0))
  );

  const showLayer = (index: number) => setPeek(index >= stackTop ? null : index);
  const deleteLayer = (index: number) => {
    commit({ type: 'dropFrom', index, target: stackTarget });
    newLayerLanded();
  };
  const peekLine = peeking !== null
    ? view === 'portrait'
      ? `[ viewing paint ${peeking + 1} · ${stackTop - peeking} newer · REGENERATE and APPROVE take the newest ]`
      : `[ viewing ${peeking === 0 ? 'the base' : `layer ${peeking}`} · ${stackTop - peeking} newer · edits and REGENERATE go on the newest ]`
    : null;
  const shownFace = view === 'face' && peeking !== null ? designer.layers[peeking] : top;
  const shownBody = view === 'body' && peeking !== null ? (designer.bodyLayers?.[peeking]?.imagePath ?? bodyPath) : bodyPath;
  const portraitTop = currentLayer(designer, 'portrait');
  const shownPortrait = view === 'portrait' && peeking !== null ? (designer.portraitLayers?.[peeking]?.imagePath ?? null) : (portraitTop?.imagePath ?? null);

  /** Shape / Tell follow the tab; the body waits for its render. */
  const editDisabled = !locked || working || (target === 'body' && !bodyPath);

  /**
   * APPROVE (Mike, 15 Oct): a CLEAN RE-RENDER of the face (the polish layer
   * becomes the approved base), then the body — polished in place when one
   * exists (its edits kept), rendered fresh from the polished face when not.
   */
  const approve = async () => {
    if (!characterId || !top || working) return;
    setBusy('approve'); setError(null); setNote(null);
    const now = () => new Date().toISOString();
    const f = await polishImage(characterId, top.imagePath, 'face');
    if (!f.ok) { setBusy(null); setError(`The clean re-render failed: ${f.line}`); return; }
    const bust = f.imagePath;
    commit({ type: 'append', layer: { imagePath: bust, text: POLISH_TEXT, kind: 'polish', seed: f.seed, at: now() } });
    const a = await approveBase(characterId, bust);
    if (!a.ok) { setBusy(null); setError(a.line); return; }
    commit({ type: 'approved', imagePath: bust, at: now() });
    let bodyOut: string | null = null;
    if (bodyPath) {
      setBusy('polishBody');
      const b = await polishImage(characterId, bodyPath, 'body');
      if (b.ok) {
        commit({ type: 'append', target: 'body', layer: { imagePath: b.imagePath, text: POLISH_TEXT, kind: 'polish', seed: b.seed, at: now() } }, { type: 'levers', levers: b.levers });
        bodyOut = b.imagePath;
      } else {
        setError(`Face approved. The body's clean re-render failed: ${b.line}`);
      }
    } else {
      setBusy('body');
      const b = await generateBody(getCharacterData(), bust);
      if (b.ok) {
        commit({ type: 'body', imagePath: b.imagePath, seed: b.levers.seed, at: now() }, { type: 'levers', levers: b.levers });
        bodyOut = b.imagePath;
      } else {
        setError(`Face approved. The body render failed: ${b.line}`);
      }
    }
    // Approved AFTER the body landed, so the body counts as approved too (deriveDesignerStatus).
    if (bodyOut) commit({ type: 'approved', imagePath: bust, at: now() });
    setBusy(null);
    setView(bodyOut ? 'body' : 'face');
    newLayerLanded();
    onApproved(bust, bodyOut);
  };

  // ── render ──
  // DEV PREVIEW of the veils without a generation: ?veil=portrait | ?veil=face (never in production).
  const demoVeil = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('veil')
    : null;
  const shownView: PreviewView = demoVeil === 'portrait' ? 'portrait' : view;
  const shownBusy = busy ? BUSY_LINE[busy] : demoVeil === 'portrait' ? '[ PAINTING THE PORTRAIT · preview ]' : demoVeil === 'face' ? '[ EDITING IN PLACE · preview ]' : null;
  const shownSub = paintSub ?? (demoVeil === 'portrait' ? paintSubBrief(who) : null);
  const statusColor = status === 'awaiting' ? C.gold : C.teal;
  const startIsOpen = !locked || startOpen;
  const portraitApproved = !!portraitTop && designer.approvedPortraitPath === portraitTop.imagePath;

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
          error ? <Readout tone="error" testId="designer-error">{error}</Readout> : <Readout>[ reading the edit stack… ]</Readout>
        ) : (
          <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
            <div className="md:sticky md:top-2">
              <Preview
                view={shownView}
                onView={changeView}
                layer={shownFace}
                bodyImagePath={shownBody}
                portraitImagePath={shownPortrait}
                portraitEmpty={!portraitTop}
                onPaint={() => { void paint('paint'); }}
                canPaint={canPaint}
                portraitLocked={!portraitReady}
                busyLine={shownBusy}
                busySub={shownSub}
                error={error}
                note={note}
                peekLine={peekLine}
                onRegenerate={regenerate}
                canRegenerate={canRegenerate}
                glitchKey={glitchKey}
                pronouns={who}
              />
            </div>

            <div className="space-y-6 mt-5 md:mt-0">
              {view === 'portrait' && (
                <>
                  <DressSection characterId={characterId} editable={editable} disabled={working} onWardrobe={onWardrobe} pronouns={who} />
                  <BriefReadout brief={brief} worn={worn} hasPaint={!!portraitTop} pronouns={who} />
                  <EditStack
                    key="portrait"
                    layers={stack}
                    target="portrait"
                    selected={peeking ?? stackTop}
                    onSelect={showLayer}
                    onDelete={deleteLayer}
                    editable={editable && !working}
                    approvedPath={designer.approvedPortraitPath}
                  />
                  {editable && portraitTop && (
                    <div className="space-y-1">
                      <ActionBar
                        label={portraitApproved ? 'PORTRAIT APPROVED' : 'APPROVE PORTRAIT'}
                        onClick={() => { void approvePortrait(); }}
                        disabled={portraitApproved || working}
                        busy={busy === 'portraitApprove'}
                        tone="soul"
                        testId="designer-approve-portrait"
                      />
                      <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }}>
                        Approving makes this paint the character&rsquo;s portrait — the image on the canvas. The approved face stays the identity anchor.
                      </div>
                    </div>
                  )}
                </>
              )}
              {editable && view !== 'portrait' && (
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
                  {locked && target === 'body' && !bodyPath && (
                    <Readout tone="note" testId="designer-body-not-yet">{BODY_NOT_YET}</Readout>
                  )}
                  <Shape key={target} target={target} possessive={possessive} onApply={applyEdit} disabled={editDisabled} busy={busy === 'edit'} />
                </>
              )}

              {view !== 'portrait' && (
                <EditStack
                  key={target}
                  layers={stack}
                  target={target}
                  selected={peeking ?? stackTop}
                  onSelect={showLayer}
                  onDelete={deleteLayer}
                  editable={editable && !working}
                />
              )}

              {editable && locked && view !== 'portrait' && (
                <div className="space-y-1">
                  <ActionBar
                    label={status === 'approved' ? 'BASE APPROVED' : 'APPROVE AS BASE'}
                    onClick={() => { void approve(); }}
                    disabled={status === 'approved'}
                    busy={busy === 'approve' || busy === 'polishBody' || busy === 'body'}
                    testId="designer-approve"
                  />
                  <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }}>
                    Approving re-renders the face and body clean (seams and artifacts from the edits go, the look stays). Then the PORTRAIT tab: dress {who.object} from {who.possessive} own things and paint.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
