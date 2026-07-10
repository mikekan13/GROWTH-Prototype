'use client';

import React, { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { AngleKey, FrontCandidate, AngleResult, TestImage, WizardStep, WizardState, ANGLE_KEYS, ANGLE_LABELS, COMPOSITION_OPTIONS, TEST_PRESETS } from './identity-lock/types';
import { emptyAngle, initialState, reducer, Action } from './identity-lock/state';
import { GradeButton, WizardButton, MiniFrame, MiniFramePlaceholder, FaceCropImage, DebugPanel, ElapsedTimer } from './identity-lock/ui-bits';
import { FinetunePanel } from './identity-lock/FinetunePanel';
import { IdentityTestStep } from './identity-lock/IdentityTestStep';

// ============================================================
// Props
// ============================================================

interface IdentityLockWizardProps {
  characterData: Record<string, unknown>;
  campaignId: string;
  referencePhotos: string[];         // ALL player-uploaded reference photos
  characterId?: string;
  onComplete: (bust: string, fullBody: string) => void;
  onCancel: () => void;
}

// ============================================================
// Component
// ============================================================

export default function IdentityLockWizard({
  characterData,
  campaignId,
  referencePhotos,
  characterId,
  onComplete,
  onCancel,
}: IdentityLockWizardProps) {
  // Persist wizard state to localStorage so a page refresh restores the user to
  // wherever they were (locked face, angles, body) instead of Step 1.
  const charKey = (characterData as Record<string, unknown>).characterId as string || characterId || 'creation-preview';
  const storageKey = `identity-lock-wizard:${campaignId}:${charKey}`;
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    if (typeof window === 'undefined') return initialState();
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as WizardState;
        // Scrub transient flags AND wipe frontCandidates — candidates always reload
        // fresh from /api/portraits/existing so deleted files don't stay in the list.
        return {
          ...saved,
          frontCandidates: [],
          frontGenerating: false,
          bodyGenerating: false,
          testGenerating: false,
          currentAngleGenerating: null,
          generationStartTime: null,
          error: null,
        };
      }
    } catch { /* fall through */ }
    return initialState();
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore quota/storage errors */ }
  }, [state, storageKey]);

  const [matureContent, setMatureContent] = useState(false);

  // Fetch campaign AI settings (mature content toggle)
  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const ai = data?.campaign?.aiSettings || data?.aiSettings;
        if (ai) {
          try {
            const settings = typeof ai === 'string' ? JSON.parse(ai) : ai;
            setMatureContent(!!settings.matureContent);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [campaignId]);
  const abortRef = useRef(false);

  // Primary reference photo (for PuLID on front face generation)
  const primaryRef = referencePhotos[0] || undefined;

  // Which candidate is currently displayed (defaults to latest)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const displayIndex = viewingIndex ?? (state.frontCandidates.length - 1);
  const displayCandidate = state.frontCandidates[displayIndex] || null;

  const [bodyPoseRef, setBodyPoseRef] = useState<string | null>(null);
  const bodyPoseInputRef = useRef<HTMLInputElement>(null);
  const [keepBodySeed, setKeepBodySeed] = useState(false);
  const [bodyDraftMode, setBodyDraftMode] = useState(false);
  const [bodySeedManual, setBodySeedManual] = useState('');
  const [bodySeed2Manual, setBodySeed2Manual] = useState('');
  const [bodyDenoise, setBodyDenoise] = useState(0.60);
  const [bodyIdLockP2, setBodyIdLockP2] = useState(false);
  const [bodyRandomPose, setBodyRandomPose] = useState(false);
  const [bodyViewIndex, setBodyViewIndex] = useState<number | null>(null);
  const [lastBodySeed, setLastBodySeed] = useState<number | null>(null);
  // Persist settings to localStorage
  const loadSaved = <T,>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback;
    try { const v = localStorage.getItem(`growth_${key}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  };
  const [fillModel, setFillModel] = useState<'nsfw' | 'standard'>(() => loadSaved('fillModel', 'nsfw'));
  const [useDetailedPrompt, setUseDetailedPrompt] = useState(() => loadSaved('useDetailedPrompt', false));
  const [manualSeed, setManualSeed] = useState<string>(() => loadSaved('manualSeed', ''));
  const [batchCount, setBatchCount] = useState<number>(1);
  const [customPrompt, setCustomPrompt] = useState(() => loadSaved('customPrompt', ''));
  const [faceCustomPrompt, setFaceCustomPrompt] = useState(() => loadSaved('faceCustomPrompt', ''));
  const [faceCustomPass2Prompt, setFaceCustomPass2Prompt] = useState(() => loadSaved('faceCustomPass2Prompt', ''));

  // Face-gen levers (experimentation knobs — 2026-04-24)
  const [runPass2, setRunPass2] = useState<boolean>(() => loadSaved('runPass2', false));
  const [useTurbo, setUseTurbo] = useState<boolean>(() => loadSaved('useTurbo', false));
  const [useTurboPass2, setUseTurboPass2] = useState<boolean>(() => loadSaved('useTurboPass2', false));
  const [pass1Guidance, setPass1Guidance] = useState<number>(() => loadSaved('pass1Guidance', 4.0));
  const [pass2Guidance, setPass2Guidance] = useState<number>(() => loadSaved('pass2Guidance', 4.0));
  // Per-pass ref assignment. String spec: "all" (default) or comma-separated 1-based indexes (e.g. "1,3,4").
  const [pass1RefSpec, setPass1RefSpec] = useState<string>(() => loadSaved('pass1RefSpec', 'all'));
  const [pass2RefSpec, setPass2RefSpec] = useState<string>(() => loadSaved('pass2RefSpec', 'all'));

  // Wizard-local additional refs uploaded via the "+ Upload Ref" button. These
  // extend the referencePhotos prop for this session (persisted to localStorage).
  // Combined list (referencePhotos + additionalRefs) is what P1/P2 ref specs index into.
  const [additionalRefs, setAdditionalRefs] = useState<string[]>(() => loadSaved('additionalRefs', [] as string[]));
  const [additionalRefUploading, setAdditionalRefUploading] = useState(false);
  const additionalRefInputRef = useRef<HTMLInputElement | null>(null);

  // Combined ref pool. P1/P2 ref specs resolve 1-based indexes against this array.
  const allRefs = React.useMemo(() => [...referencePhotos, ...additionalRefs], [referencePhotos, additionalRefs]);

  const handleAdditionalRefPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setAdditionalRefUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const r = await fetch('/api/references', { method: 'POST', body: form });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'upload failed');
        uploaded.push(j.path as string);
      }
      setAdditionalRefs(prev => [...prev, ...uploaded]);
      // Ensure the new refs actually appear in pass slots. If the user previously
      // typed an explicit index spec (e.g. "1"), uploads would be invisible until
      // they updated the spec manually. Default both passes back to 'all'.
      setPass1RefSpec('all');
      setPass2RefSpec('all');
    } catch (err) {
      alert(`Additional ref upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAdditionalRefUploading(false);
      if (additionalRefInputRef.current) additionalRefInputRef.current.value = '';
    }
  };

  const removeAdditionalRef = (idx: number) => {
    setAdditionalRefs(prev => prev.filter((_, i) => i !== idx));
  };
  const [faceLoraWeights, setFaceLoraWeights] = useState(() => loadSaved('faceLoraWeights', {
    realism: 1.0,
    detail: 0.4,
    handDetail: 1.0,
    imageUpgrader: 0,
    campaign: 0,
    darkFantasyIllustration: 0,
    growthStyle2: 0,
    oldschool2: 0,
    mythSharpLines: 0,
    animeCrabdm: 0,
    growthStyle: 0,
    artiSketchy: 0,
    eyeDetail: 0,
  }));

  const [bodyLoraWeights, setBodyLoraWeights] = useState(() => loadSaved('bodyLoraWeights', {
    realism: 1.0,
    detail: 0.4,
    handDetail: 0.7,
    imageUpgrader: 0,
    campaign: 0.5,
    darkFantasyIllustration: 0,
    growthStyle2: 0,
    oldschool2: 0,
    mythSharpLines: 0.4,
    animeCrabdm: 0,
    growthStyle: 0.6,
    artiSketchy: 0.35,
    eyeDetail: 0,
  }));

  const DEFAULT_LORA_ORDER: [string, string][] = [
    ['realism', 'Realism'],
    ['detail', 'Detail'],
    ['handDetail', 'Perfection'],
    ['imageUpgrader', 'Img Upgrader'],
    ['campaign', 'Dark Fantasy v2'],
    ['darkFantasyIllustration', 'DarkFant Illust.'],
    ['growthStyle2', 'Oldschool Fant.'],
    ['oldschool2', 'Oldschool Fant. 2'],
    ['mythSharpLines', 'MythSharpLines'],
    ['animeCrabdm', 'Anime CRABDM'],
    ['growthStyle', 'GROWTH Style'],
    ['artiSketchy', 'Arti Sketchy'],
    ['eyeDetail', 'Eye Detail'],
  ];
  const [loraOrder, setLoraOrder] = useState<[string, string][]>(() => {
    const saved = loadSaved('loraOrder', null) as [string, string][] | null;
    if (!saved) return DEFAULT_LORA_ORDER;
    const validKeys = new Set(DEFAULT_LORA_ORDER.map(([k]) => k));
    // Remove entries that no longer exist, add new ones at the end
    const filtered = saved.filter(([k]) => validKeys.has(k));
    const existingKeys = new Set(filtered.map(([k]) => k));
    const missing = DEFAULT_LORA_ORDER.filter(([k]) => !existingKeys.has(k));
    return [...filtered, ...missing];
  });
  const dragLoraRef = useRef<number | null>(null);
  const dragOverLoraRef = useRef<number | null>(null);

  const handleLoraDragEnd = () => {
    const from = dragLoraRef.current;
    const to = dragOverLoraRef.current;
    if (from === null || to === null || from === to) return;
    setLoraOrder(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
    dragLoraRef.current = null;
    dragOverLoraRef.current = null;
  };

  const [faceLoraOrder, setFaceLoraOrder] = useState<[string, string][]>(() => {
    const saved = loadSaved('faceLoraOrder', null) as [string, string][] | null;
    if (!saved) return DEFAULT_LORA_ORDER;
    const validKeys = new Set(DEFAULT_LORA_ORDER.map(([k]) => k));
    const filtered = saved.filter(([k]) => validKeys.has(k));
    const existingKeys = new Set(filtered.map(([k]) => k));
    const missing = DEFAULT_LORA_ORDER.filter(([k]) => !existingKeys.has(k));
    return [...filtered, ...missing];
  });
  const dragFaceLoraRef = useRef<number | null>(null);
  const dragOverFaceLoraRef = useRef<number | null>(null);
  const handleFaceLoraDragEnd = () => {
    const from = dragFaceLoraRef.current;
    const to = dragOverFaceLoraRef.current;
    if (from === null || to === null || from === to) return;
    setFaceLoraOrder(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
    dragFaceLoraRef.current = null;
    dragOverFaceLoraRef.current = null;
  };

  // Auto-save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('growth_fillModel', JSON.stringify(fillModel));
      localStorage.setItem('growth_useDetailedPrompt', JSON.stringify(useDetailedPrompt));
      localStorage.setItem('growth_manualSeed', JSON.stringify(manualSeed));
      localStorage.setItem('growth_customPrompt', JSON.stringify(customPrompt));
      localStorage.setItem('growth_bodyLoraWeights', JSON.stringify(bodyLoraWeights));
      localStorage.setItem('growth_loraOrder', JSON.stringify(loraOrder));
      localStorage.setItem('growth_faceCustomPrompt', JSON.stringify(faceCustomPrompt));
      localStorage.setItem('growth_faceCustomPass2Prompt', JSON.stringify(faceCustomPass2Prompt));
      localStorage.setItem('growth_faceLoraWeights', JSON.stringify(faceLoraWeights));
      localStorage.setItem('growth_faceLoraOrder', JSON.stringify(faceLoraOrder));
      localStorage.setItem('growth_runPass2', JSON.stringify(runPass2));
      localStorage.setItem('growth_useTurbo', JSON.stringify(useTurbo));
      localStorage.setItem('growth_useTurboPass2', JSON.stringify(useTurboPass2));
      localStorage.setItem('growth_pass1Guidance', JSON.stringify(pass1Guidance));
      localStorage.setItem('growth_pass2Guidance', JSON.stringify(pass2Guidance));
      localStorage.setItem('growth_pass1RefSpec', JSON.stringify(pass1RefSpec));
      localStorage.setItem('growth_pass2RefSpec', JSON.stringify(pass2RefSpec));
      localStorage.setItem('growth_additionalRefs', JSON.stringify(additionalRefs));
    } catch { /* ignore */ }
  }, [fillModel, useDetailedPrompt, manualSeed, customPrompt, bodyLoraWeights, loraOrder, faceCustomPrompt, faceCustomPass2Prompt, faceLoraWeights, faceLoraOrder, runPass2, useTurbo, useTurboPass2, pass1Guidance, pass2Guidance, pass1RefSpec, pass2RefSpec, additionalRefs]);

  const bodyCandidates = state.bodyCandidates;
  const bodyDisplayIndex = bodyViewIndex ?? (bodyCandidates.length - 1);
  const bodyDisplayEntry = bodyCandidates[bodyDisplayIndex];
  const bodyDisplayImage = bodyDisplayEntry?.imagePath || state.bodyImage;

  // Per-angle picker state — user clicks "Pick" on an angle slot to manually assign
  // an image from the angles/ folder (auto-load's angle-key detection is imperfect).
  const [pickingFor, setPickingFor] = useState<AngleKey | null>(null);
  const [availableAngleFiles, setAvailableAngleFiles] = useState<string[]>([]);

  // Load existing generated images on mount and validate state refs against disk.
  // "Load what's actually in the folders" — stale references to deleted files get cleared.
  const [existingLoaded, setExistingLoaded] = useState(false);
  useEffect(() => {
    if (existingLoaded) return;
    setExistingLoaded(true);
    const charId = (characterData as Record<string, unknown>).characterId as string || 'creation-preview';
    fetch(`/api/portraits/existing?characterId=${charId}`)
      .then(r => r.json())
      .then(data => {
        const candidates: Array<{ imagePath: string; tier: string; angleKey?: string; seed?: number }> = data.candidates || [];
        const onDisk = new Set(candidates.map(c => c.imagePath));

        // 1) Populate sketch + refined front candidates
        for (const c of candidates) {
          if (c.tier === 'sketch' || c.tier === 'refined') {
            dispatch({ type: 'FRONT_CANDIDATE_DONE', imagePath: c.imagePath, seed: c.seed ?? 0, tier: c.tier });
          }
        }

        // 2) Populate angles from disk (newest first per angleKey)
        const seenAngleKeys = new Set<string>();
        for (const c of candidates) {
          if (c.tier !== 'angle' || !c.angleKey) continue;
          if (seenAngleKeys.has(c.angleKey)) continue;
          seenAngleKeys.add(c.angleKey);
          if (ANGLE_KEYS.includes(c.angleKey as AngleKey)) {
            dispatch({ type: 'ANGLE_COMPLETE', angle: c.angleKey as AngleKey, imagePath: c.imagePath, seed: 0 });
          }
        }

        // 3) Wipe any angle slots whose localStorage-restored path isn't on disk anymore
        for (const k of ANGLE_KEYS) {
          const p = state.angles[k].imagePath;
          if (p && !onDisk.has(p)) {
            dispatch({ type: 'ANGLE_ERROR', angle: k, error: '' });  // clears imagePath
          }
        }

        // 4) Populate body candidates from disk (replaces stale state).
        const bodyEntries = candidates.filter(c => c.tier === 'body');
        dispatch({
          type: 'SET_BODY_CANDIDATES',
          candidates: bodyEntries.map(b => ({ imagePath: b.imagePath, seed: b.seed ?? 0 })),
        });

        // 5) Cache all angle files for the per-angle manual picker.
        const angleFiles = candidates.filter(c => c.tier === 'angle').map(c => c.imagePath);
        setAvailableAngleFiles(angleFiles);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core generation helper ─────────────────────────────────
  // Debug info from last generation
  const [debugInfo, setDebugInfo] = useState<{ prompt: string; pass2Prompt: string | null; negativePrompt: string; seed: number; timeMs: number; workflow: string; failures: string[]; refs: string } | null>(null);

  const generate = useCallback(async (opts: {
    referenceImagePath?: string;
    referenceImagePaths?: string[];
    overrides?: Record<string, unknown>;
    creationMode?: boolean;
  }): Promise<{ imagePath: string; seed: number } | null> => {
    const res = await fetch('/api/portraits/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterData,
        creationMode: opts.creationMode ?? true,
        referenceImagePath: opts.referenceImagePath,
        referenceImagePaths: opts.referenceImagePaths,
        overrides: opts.overrides,
        campaignStyle: { allowNudity: matureContent },
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Generation failed');
    }
    const data = await res.json();
    setViewingIndex(null);  // Reset to show latest
    setDebugInfo({
      prompt: data.metadata.prompt || '',
      pass2Prompt: data.metadata.pass2Prompt ?? null,
      negativePrompt: data.metadata.negativePrompt || '',
      seed: data.metadata.seed,
      timeMs: data.metadata.generationTimeMs,
      workflow: data.metadata.workflowUsed || 'unknown',
      failures: data.metadata.failedWorkflows || [],
      refs: data.metadata.debugRefs || '',
    });
    return { imagePath: data.imagePath, seed: data.metadata.seed };
  }, [characterData, matureContent]);

  // Resolve a per-pass ref spec ("all" or "1,3,4") against the uploaded refs array.
  // 1-based indexes matching the order of referencePhotos; primary ref is index 1.
  const resolveRefSpec = (spec: string, allRefs: string[]): string[] => {
    const trimmed = (spec || '').trim().toLowerCase();
    if (!trimmed || trimmed === 'all') return allRefs;
    const indices = trimmed.split(',')
      .map(s => parseInt(s.trim(), 10) - 1)
      .filter(n => Number.isInteger(n) && n >= 0 && n < allRefs.length);
    return indices.map(i => allRefs[i]).filter((r): r is string => !!r);
  };

  // ── Step 1: Front face generation — single pass, InfiniteYou identity ──
  const generateFrontFace = useCallback(async (count?: number) => {
    const total = count ?? batchCount;
    abortRef.current = false;
    const p1Refs = resolveRefSpec(pass1RefSpec, allRefs);
    const p2Refs = resolveRefSpec(pass2RefSpec, allRefs);
    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;
      dispatch({ type: 'FRONT_GENERATING' });
      try {
        const result = await generate({
          referenceImagePath: primaryRef,
          referenceImagePaths: allRefs,
          overrides: {
            anglePreset: 'front',
            quality: 'final',
            widthOverride: 1024,
            heightOverride: 1024,
            neutralizeExpression: true,
            bodyLoraWeights: faceLoraWeights,
            bodyLoraOrder: faceLoraOrder.map(([key]) => key),
            ...(faceCustomPrompt ? { customPrompt: faceCustomPrompt } : {}),
            ...(faceCustomPass2Prompt ? { customPass2Prompt: faceCustomPass2Prompt } : {}),
            ...(useDetailedPrompt ? { useDetailedPrompt: true } : {}),
            ...(manualSeed && !isNaN(Number(manualSeed)) ? { seed: Number(manualSeed) } : {}),
            // Face-gen levers
            pass1Refs: p1Refs,
            pass2Refs: p2Refs,
            runPass2,
            useTurbo,
            useTurboPass2,
            pass1Guidance,
            pass2Guidance,
          },
        });
        if (result) {
          dispatch({ type: 'FRONT_CANDIDATE_DONE', imagePath: result.imagePath, seed: result.seed, tier: 'sketch' });
        }
      } catch (e) {
        dispatch({ type: 'FRONT_CANDIDATE_ERROR', error: e instanceof Error ? e.message : 'Generation failed' });
        break;
      }
    }
  }, [generate, primaryRef, allRefs, faceLoraWeights, faceLoraOrder, faceCustomPrompt, faceCustomPass2Prompt, useDetailedPrompt, manualSeed, batchCount, pass1RefSpec, pass2RefSpec, runPass2, useTurbo, useTurboPass2, pass1Guidance, pass2Guidance]);

  // Grade handlers for front face
  const handleFrontBad = useCallback(() => {
    dispatch({ type: 'FRONT_GRADE_BAD' });
    // Fresh sketch pass
    generateFrontFace();
  }, [generateFrontFace]);

  const handleFrontGood = useCallback(() => {
    dispatch({ type: 'FRONT_GRADE_GOOD' });
    generateFrontFace();
  }, [generateFrontFace]);

  const handleFrontPerfect = useCallback(() => {
    dispatch({ type: 'FRONT_GRADE_PERFECT', index: displayIndex >= 0 ? displayIndex : undefined });
  }, [displayIndex]);

  // Don't auto-generate — existing images load on mount, player can pick or generate new
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  // ── Step 2: Multi-angle generation (uses locked front as PuLID ref) ──
  const runAngleGeneration = useCallback(async (onlyBad: boolean) => {
    if (!state.lockedFace) return;
    // Share ONE seed across all angles so skin tone / lighting / color stay consistent.
    // Reuse the seed from any already-generated angle so single-angle regens (onlyBad=true)
    // match the color of the surviving good angles. Only pick a fresh seed if no angle
    // has been generated yet in this session.
    const existingSeed = ANGLE_KEYS
      .map(a => state.angles[a].seed)
      .find((s): s is number => typeof s === 'number');
    const sharedSeed = existingSeed ?? Math.floor(Math.random() * 2147483647);
    for (const angle of ANGLE_KEYS) {
      if (abortRef.current) return;
      if (onlyBad && state.angles[angle].imagePath && state.angles[angle].grade !== 'bad') continue;
      if (!onlyBad && state.angles[angle].imagePath) continue;

      dispatch({ type: 'ANGLE_GENERATING', angle });
      try {
        const result = await generate({
          referenceImagePath: state.lockedFace,
          overrides: { anglePreset: angle, quality: 'final', seed: sharedSeed },
        });
        if (result) {
          dispatch({ type: 'ANGLE_COMPLETE', angle, imagePath: result.imagePath, seed: result.seed });
        }
      } catch (e) {
        dispatch({ type: 'ANGLE_ERROR', angle, error: e instanceof Error ? e.message : 'Generation failed' });
      }
    }
    if (!abortRef.current) {
      dispatch({ type: 'ALL_ANGLES_DONE' });
    }
  }, [state.lockedFace, state.angles, generate]);

  // Trigger angle generation when entering angle_generation step
  // Trigger angle generation when entering angle_generation step
  const prevStepRef = useRef<string>('');
  useEffect(() => {
    if (state.step === 'angle_generation' && state.lockedFace && prevStepRef.current !== 'angle_generation') {
      abortRef.current = false;  // Reset abort flag
      const hasBad = ANGLE_KEYS.some(k => state.angles[k].grade === 'bad');
      runAngleGeneration(hasBad);
    }
    prevStepRef.current = state.step;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // ── Step 3: Body generation ─────────────────────────────────
  const generateBody = useCallback(async () => {
    if (!state.lockedFace) return;
    dispatch({ type: 'BODY_GENERATING' });
    // Body gen uses SINGLE PuLID ref (just locked face). PuLID only embeds the face
    // region per image — stacking 9 refs (face + 4 angles + 4 player photos) all
    // encode the same face box and cost 9× BiSeNet parses for marginal identity gain.
    // Hair, skin, body-level detail come from prompt (character.identity fields),
    // not from PuLID. Keeping body gen to 1 ref cuts ~60% off gen time.
    try {
      const result = await generate({
        referenceImagePath: state.lockedFace,
        creationMode: true,
        overrides: {
          composition: 'full_body',
          quality: 'final',
          baseImagePath: state.lockedFace,
          // Body seed: manual override > undefined (provider generates fresh
          // random). Previously fell back to state.lockedSeed (the FACE seed)
          // which made every body gen reuse the same seed even when keepBodySeed
          // wasn't checked. keepBodySeed has its own bodySeedOverride below.
          seed: bodySeedManual && !isNaN(Number(bodySeedManual)) ? Number(bodySeedManual) : undefined,
          ...(bodyPoseRef ? { bodyPoseImagePath: bodyPoseRef } : {}),
          bodyLoraWeights,
          bodyLoraOrder: loraOrder.map(([key]) => key),
          ...(customPrompt ? { customPrompt } : {}),
          fillModelType: fillModel,
          bodyDraftMode: bodyDraftMode,
          ...(bodySeed2Manual && !isNaN(Number(bodySeed2Manual)) ? { pass2Seed: Number(bodySeed2Manual) } : {}),
          pass2Denoise: bodyDenoise,
          pass2IdLock: bodyIdLockP2,
          randomPose: bodyRandomPose,
          ...(keepBodySeed && !bodySeedManual && (bodyDisplayEntry?.seed || lastBodySeed) ? { bodySeedOverride: bodyDisplayEntry?.seed || lastBodySeed } : {}),
        },
      });
      if (result) {
        setLastBodySeed(result.seed);
        dispatch({ type: 'BODY_COMPLETE', imagePath: result.imagePath });
        setBodyViewIndex(null);  // Jump to latest
      }
    } catch (e) {
      dispatch({ type: 'BODY_ERROR', error: e instanceof Error ? e.message : 'Body generation failed' });
    }
  }, [state.lockedFace, state.lockedSeed, generate, bodyPoseRef, bodyLoraWeights, loraOrder, keepBodySeed, lastBodySeed, fillModel, customPrompt, bodyDisplayEntry, bodyDraftMode, bodySeedManual, bodySeed2Manual, bodyDenoise, bodyIdLockP2, bodyRandomPose]);

  // ── Step 3.5: Finetune (Kontext edit) ───────────────────────
  const generateFinetune = useCallback(async (
    editPrompt: string,
    guidance?: number,
    paintData?: { mode: string; dataUrl: string } | null,
    objectRefImagePath?: string | null,
  ) => {
    // Iterative: use latest finetune result as source, or fall back to body
    const ftHistory = state.finetuneHistory || [];
    const latestFinetune = ftHistory.length > 0 ? ftHistory[ftHistory.length - 1].imagePath : null;
    const sourceImage = latestFinetune || bodyDisplayImage || state.bodyImage || state.lockedFace;
    if (!sourceImage) return;
    dispatch({ type: 'FINETUNE_GENERATING' });
    try {
      const res = await fetch('/api/portraits/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImagePath: sourceImage,
          editPrompt,
          guidance: guidance ?? 5.0,
          paintData: paintData || undefined,
          objectRefImagePath: objectRefImagePath || undefined,
          characterId: (characterData as Record<string, unknown>).characterId as string || 'creation-preview',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Edit failed');
      }
      dispatch({ type: 'FINETUNE_COMPLETE', imagePath: data.imagePath, prompt: editPrompt, paintData });
    } catch (e) {
      dispatch({ type: 'FINETUNE_ERROR', error: e instanceof Error ? e.message : 'Finetune failed' });
    }
  }, [state.finetuneHistory, bodyDisplayImage, state.bodyImage, state.lockedFace, characterData]);

  // Bake is a no-op on FLUX.2 — the old FLUX.1 bake pass re-ran img2img with
  // golden LoRAs to refresh detail. FLUX.2 edits are clean enough that a
  // separate bake pass isn't needed. We keep the callback so the button in
  // FinetunePanel still works (collapses the history to the current latest
  // entry as a fresh baseline), but no ComfyUI work fires.
  const bakeFinetune = useCallback(async () => {
    const ftHist = state.finetuneHistory || [];
    const latest = ftHist.length > 0 ? ftHist[ftHist.length - 1].imagePath : null;
    if (!latest) return;
    dispatch({ type: 'FINETUNE_BAKE_COMPLETE', imagePath: latest });
  }, [state.finetuneHistory]);

  // ── Step 4: Test generation ─────────────────────────────────
  const generateTest = useCallback(async (steeringWords: string, composition: string) => {
    if (!state.lockedFace) return;
    dispatch({ type: 'TEST_GENERATING' });
    try {
      const result = await generate({
        referenceImagePath: state.lockedFace,
        overrides: {
          composition,
          steeringWords: steeringWords.split(',').map(w => w.trim()).filter(Boolean),
          quality: 'final',
        },
        creationMode: false,  // Allow clothing/equipment in tests
      });
      if (result) {
        dispatch({ type: 'TEST_COMPLETE', imagePath: result.imagePath, steeringWords, composition, seed: result.seed });
      }
    } catch (e) {
      dispatch({ type: 'TEST_ERROR', error: e instanceof Error ? e.message : 'Test generation failed' });
    }
  }, [state.lockedFace, generate]);

  // ── Step 5: Final generation + persona lock ─────────────────
  const generateFinalAndLock = useCallback(async () => {
    if (!state.lockedFace) return;
    dispatch({ type: 'START_FINAL' });
    try {
      // Canonical bust
      const bust = await generate({
        referenceImagePath: state.lockedFace,
        overrides: { composition: 'bust', seed: state.lockedSeed, quality: 'final' },
      });
      if (bust) dispatch({ type: 'FINAL_BUST_DONE', imagePath: bust.imagePath });

      // Canonical full body
      const body = await generate({
        referenceImagePath: state.lockedFace,
        overrides: { composition: 'full_body', seed: state.lockedSeed, quality: 'final' },
      });
      if (body) dispatch({ type: 'FINAL_BODY_DONE', imagePath: body.imagePath });

      // Call persona lock API if character exists in DB
      if (characterId) {
        try {
          const histRes = await fetch(`/api/portraits/history?characterId=${characterId}`);
          const histData = await histRes.json();
          const latest = histData.portraits?.[0];
          if (latest) {
            await fetch('/api/portraits/lock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ generationId: latest.id, characterId }),
            });
          }
        } catch {
          console.warn('[IdentityLock] Persona lock API failed — portraits still saved');
        }
      }

      dispatch({ type: 'COMPLETE' });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Final generation failed' });
    }
  }, [state.lockedFace, state.lockedSeed, generate, characterId]);

  // ── Fire onComplete when done ───────────────────────────────
  useEffect(() => {
    if (state.step === 'complete' && state.finalBust && state.finalFullBody) {
      onComplete(state.finalBust, state.finalFullBody);
    }
  }, [state.step, state.finalBust, state.finalFullBody, onComplete]);

  // ── Grading helpers ─────────────────────────────────────────
  const allGraded = ANGLE_KEYS.every(k => state.angles[k].grade !== null || !state.angles[k].imagePath);
  const hasBadAngles = ANGLE_KEYS.some(k => state.angles[k].grade === 'bad');
  const hasAnyGood = ANGLE_KEYS.some(k => state.angles[k].grade === 'good' || state.angles[k].grade === 'almost_perfect');

  // ── Step labels for indicator ───────────────────────────────
  const STEPS: { key: WizardStep; label: string }[] = [
    { key: 'front_discovery', label: 'Face' },
    { key: 'body_discovery', label: 'Body' },
    { key: 'finetune', label: 'Finetune' },
    { key: 'persona_lock', label: 'Lock' },
  ];
  const stepOrder: WizardStep[] = ['front_discovery', 'body_discovery', 'finetune', 'persona_lock', 'generating_final', 'complete'];
  const currentStepIndex = stepOrder.indexOf(state.step);

  return (
    <div className="border p-4" style={{ borderColor: '#D0A030', borderRadius: '3px', backgroundColor: '#0d0d1f' }}>
      <div className="flex gap-4">
      {/* Custom Prompt Panel — LoRA sliders removed (no FLUX.2-compatible LoRAs loaded) */}
      {true && (() => {
        const isFaceStep = state.step === 'front_discovery' || state.step === 'angle_generation' || state.step === 'angle_grading';
        const activePrompt = isFaceStep ? faceCustomPrompt : customPrompt;
        const setActivePrompt = isFaceStep ? setFaceCustomPrompt : setCustomPrompt;
        const panelColor = isFaceStep ? '#582a72' : '#D0A030';

        // Reference chain = exactly what local.ts sends to ComfyUI:
        // deduped referencePhotos → then pose ref (wireframe for face, bodyPoseRef for body).
        const seenRefs = new Set<string>();
        const idRefs = allRefs.filter(r => {
          if (!r || seenRefs.has(r)) return false;
          seenRefs.add(r);
          return true;
        });
        // Resolve the per-pass ref spec ("all" or "1,3,4") against idRefs. Mirrors
        // resolveRefSpec in the generate callback (1-based indexing).
        const specToRefs = (spec: string): { path: string; origIndex: number }[] => {
          const trimmed = (spec || '').trim().toLowerCase();
          if (!trimmed || trimmed === 'all') return idRefs.map((path, i) => ({ path, origIndex: i + 1 }));
          const idxs = trimmed.split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => Number.isInteger(n) && n >= 1 && n <= idRefs.length);
          return idxs.map(n => ({ path: idRefs[n - 1], origIndex: n })).filter(e => !!e.path);
        };
        const pass1Resolved = specToRefs(pass1RefSpec);
        const pass2Resolved = specToRefs(pass2RefSpec);

        const angleKey = state.currentAngleGenerating || 'front';
        // OpenPose keypoint refs — identity-free, trained format.
        const angleRefMap: Record<string, string> = {
          front: '/portraits/pose-refs/openpose/front-face.png',
          profile_left: '/portraits/pose-refs/openpose/profile_left.png',
          profile_right: '/portraits/pose-refs/openpose/profile_right.png',
          three_quarter_left: '/portraits/pose-refs/openpose/three_quarter_left.png',
          three_quarter_right: '/portraits/pose-refs/openpose/three_quarter_right.png',
        };
        const poseRef = !isFaceStep && bodyPoseRef ? { path: bodyPoseRef, label: 'body pose' } : null;
        void angleKey; void angleRefMap; // kept for future pose-template use on body step

        // Pass 1 chain (what generateFaceFlux2 populates into LOAD_REF slots).
        // Order mirrors the provider: identity refs first (Image 1..n), then pose (n+1), then style (n+2).
        const pass1Chain: { slot: number; path: string; label: string }[] = pass1Resolved.map((r, i) => ({
          slot: i + 1,
          path: r.path,
          label: i === 0 ? `primary id (orig #${r.origIndex})` : `id ref ${i + 1} (orig #${r.origIndex})`,
        }));
        if (!isFaceStep && poseRef) {
          pass1Chain.push({ slot: pass1Chain.length + 1, path: poseRef.path, label: poseRef.label });
        }

        // Pass 2 chain: Pass 1 output is always slot 1; pass2Resolved fills slots 2..N.
        const pass2Chain: { slot: number; path: string | null; label: string }[] = [
          { slot: 1, path: null /* Pass 1 output — generated at runtime */, label: 'Pass 1 output' },
          ...pass2Resolved.map((r, i) => ({
            slot: i + 2,
            path: r.path,
            label: `id/style ref ${i + 1} (orig #${r.origIndex})`,
          })),
        ];

        // Kept for external references to `chain` symbol below (render block).
        const chain = pass1Chain;

        return (
      <div className="flex-shrink-0 p-2" style={{ width: '320px', backgroundColor: '#0a0a18', border: `1px solid ${panelColor}44`, borderRadius: 4 }}>
        <div className="text-xs uppercase tracking-wider mb-1" style={{ color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {isFaceStep ? 'Face — Pass 1 Prompt (identity gen)' : 'Body Prompt'}
        </div>
        <textarea
          value={activePrompt}
          onChange={e => setActivePrompt(e.target.value)}
          placeholder="Pass 1 custom prompt. Use {id} and {pose} for slot numbers. Blank = default."
          rows={6}
          className="w-full p-1 text-xs"
          style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333', borderRadius: 3, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', resize: 'vertical' }}
        />
        {isFaceStep && (
          <>
            <div className="text-xs uppercase tracking-wider mt-3 mb-1" style={{ color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Face — Pass 2 Prompt (cleanup + style)
            </div>
            <textarea
              value={faceCustomPass2Prompt}
              onChange={e => setFaceCustomPass2Prompt(e.target.value)}
              placeholder="Pass 2 edit prompt (nude + style transform). Blank = default."
              rows={6}
              className="w-full p-1 text-xs"
              style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333', borderRadius: 3, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', resize: 'vertical' }}
            />
          </>
        )}
        {pass1Chain.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
              Pass 1 Slots
            </div>
            <div className="flex flex-wrap gap-1">
              {pass1Chain.map(({ slot, path, label }) => (
                <div key={`p1-${slot}-${path}`} className="flex flex-col items-center" style={{ width: 56 }} title={label}>
                  <div style={{ position: 'relative', width: 56, height: 56, border: `1px solid ${panelColor}66`, borderRadius: 3, overflow: 'hidden', backgroundColor: '#000' }}>
                    <img src={path} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: panelColor, color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '0 3px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {slot}
                    </div>
                  </div>
                  <div style={{ color: '#888', fontSize: '8px', fontFamily: 'var(--font-terminal), Consolas, monospace', marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>
                    image {slot}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isFaceStep && runPass2 && pass2Chain.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#4ec9b0', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
              Pass 2 Slots
            </div>
            <div className="flex flex-wrap gap-1">
              {pass2Chain.map(({ slot, path, label }) => (
                <div key={`p2-${slot}-${path ?? 'pass1'}`} className="flex flex-col items-center" style={{ width: 56 }} title={label}>
                  <div style={{ position: 'relative', width: 56, height: 56, border: '1px solid #4ec9b066', borderRadius: 3, overflow: 'hidden', backgroundColor: '#000' }}>
                    {path ? (
                      <img src={path} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ec9b0', fontSize: '8px', textAlign: 'center', padding: 2, fontFamily: 'var(--font-terminal), Consolas, monospace', lineHeight: 1.15 }}>
                        Pass 1<br/>output
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: '#4ec9b0', color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '0 3px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {slot}
                    </div>
                  </div>
                  <div style={{ color: '#888', fontSize: '8px', fontFamily: 'var(--font-terminal), Consolas, monospace', marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>
                    image {slot}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isFaceStep && (
          <div className="mt-3" style={{ borderTop: '1px dashed #333', paddingTop: 8 }}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs uppercase tracking-wider" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
                Additional Refs ({additionalRefs.length})
              </div>
              <label style={{ display: 'inline-block', padding: '2px 6px', border: `1px solid ${panelColor}`, borderRadius: 2, fontSize: '9px', cursor: additionalRefUploading ? 'wait' : 'pointer', color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {additionalRefUploading ? '...' : '+ Upload'}
                <input
                  ref={additionalRefInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAdditionalRefPick}
                  disabled={additionalRefUploading}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            {additionalRefs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {additionalRefs.map((path, i) => {
                  const globalIdx = referencePhotos.length + i + 1; // 1-based index into allRefs
                  return (
                    <div key={`add-${i}`} style={{ position: 'relative', width: 44, height: 44 }}>
                      <img src={path} alt={`extra ref ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', border: `1px solid ${panelColor}66`, borderRadius: 2 }} />
                      <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: '#888', color: '#000', fontSize: '8px', fontWeight: 'bold', padding: '0 2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                        #{globalIdx}
                      </div>
                      <button
                        onClick={() => removeAdditionalRef(i)}
                        title="Remove this ref"
                        style={{ position: 'absolute', top: 0, right: 0, background: '#E8585A', color: '#fff', border: 'none', width: 14, height: 14, fontSize: '10px', lineHeight: '12px', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#555', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace', fontStyle: 'italic' }}>
                Upload extras to reference by index in P1/P2 specs.
              </div>
            )}
          </div>
        )}
      </div>
        );
      })()}

      {/* Wizard Content */}
      <div className="flex-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-base uppercase" style={{ color: '#D0A030', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.12em' }}>
          Identity Lock
        </div>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 transition-colors"
          style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E8585A')}
          onMouseLeave={e => (e.currentTarget.style.color = '#666')}
        >
          Cancel
        </button>
      </div>

      {/* Step Indicator — every step is always clickable. Each step's UI handles
          its own empty/loading state so users can jump to any phase of the flow. */}
      <div className="flex gap-1 mb-4">
        {STEPS.map((s) => {
          const sIdx = stepOrder.indexOf(s.key);
          const isActive = s.key === state.step
            || (state.step === 'angle_grading' && s.key === 'angle_generation')
            || (state.step === 'generating_final' && s.key === 'persona_lock');
          const isDone = currentStepIndex > sIdx;
          return (
            <div
              key={s.key}
              className="flex-1 text-center"
              onClick={() => dispatch({ type: 'JUMP_TO_STEP', step: s.key })}
              style={{ cursor: 'pointer' }}
              title={`Jump to ${s.label}`}
            >
              <div className="h-1 mb-1 rounded-full transition-colors"
                style={{ backgroundColor: isDone ? '#D0A030' : isActive ? '#582a72' : '#2a2a3e' }} />
              <div className="text-xs uppercase tracking-wider" style={{
                color: isDone ? '#D0A030' : isActive ? '#582a72' : '#666',
                fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px',
              }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
          STEP 1: Front Face Discovery
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'front_discovery' && (() => {
        return (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Step 1 — Face
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Generate faces and pick one to lock as your character.
          </div>

          <div className="flex gap-4 justify-center mb-4">
            {/* Previous attempts (small, scrollable) */}
            {state.frontCandidates.length > 1 && (
              <div className="flex flex-col items-center">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
                  Attempts ({state.frontCandidates.length})
                </div>
                <div className="overflow-y-auto flex flex-col gap-1 pr-1" style={{ maxHeight: '220px', width: '56px' }}>
                  {state.frontCandidates.map((c, i) => (
                    <div key={i} onClick={() => setViewingIndex(i)} className="flex-shrink-0 border overflow-hidden cursor-pointer transition-all"
                      style={{
                        borderColor: i === displayIndex ? '#D0A030' : '#2a2a3e',
                        borderWidth: i === displayIndex ? '2px' : '1px',
                        width: '48px', height: '48px', backgroundColor: '#111',
                      }}>
                      <img src={c.imagePath} alt={`Attempt ${i + 1}`}
                        className="w-full h-full object-cover"
                        style={{ opacity: i === displayIndex ? 1 : 0.5 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current face (large) */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {state.frontGenerating ? 'Generating...' : `Face ${displayIndex + 1} of ${state.frontCandidates.length}`}
              </div>
              <div className="relative border overflow-hidden" style={{
                borderColor: state.frontGenerating ? '#2a2a3e' : '#D0A030',
                borderWidth: '2px',
                backgroundColor: '#111',
                width: '220px',
                aspectRatio: '1/1',
              }}>
                {!state.frontGenerating && displayCandidate ? (
                  <FaceCropImage
                    src={displayCandidate.imagePath}
                    alt="Current face"
                    faceCrop
                  />
                ) : state.frontGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="animate-pulse text-sm" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      Generating...
                    </div>
                    <ElapsedTimer startTime={state.generationStartTime} />
                    {batchCount > 1 && (
                      <button onClick={() => { abortRef.current = true; }}
                        className="mt-2 px-2 py-1 text-xs uppercase"
                        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#E8585A', border: '1px solid #E8585A', borderRadius: '2px', backgroundColor: 'transparent' }}>
                        Stop
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-xs" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Waiting...</div>
                  </div>
                )}
              </div>
              {!state.frontGenerating && displayCandidate && (
                <div className="text-xs mt-1" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Seed: {displayCandidate.seed}
                </div>
              )}
            </div>
          </div>

          {/* Face controls */}
          <div className="flex items-center justify-center gap-4 mb-2">
            <label className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#888', cursor: 'pointer' }}>
              <input type="checkbox" checked={useDetailedPrompt} onChange={e => setUseDetailedPrompt(e.target.checked)} />
              Description Prompt
            </label>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>Seed:</span>
              <input type="text" value={manualSeed} onChange={e => setManualSeed(e.target.value)} placeholder="random"
                className="px-1 py-0.5 text-xs" style={{ width: '70px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }} />
            </div>
          </div>

          {/* Face-gen levers (pass control + guidance + ref assignment) */}
          <div className="mb-2 p-2" style={{ border: '1px solid #2a2a3e', backgroundColor: '#0a0a14', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#8e7cc3', fontSize: '9px' }}>Levers</div>

            {/* Row 1: toggles */}
            <div className="flex items-center justify-center gap-4 mb-1.5">
              <label className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={runPass2} onChange={e => setRunPass2(e.target.checked)} />
                Run Pass 2
              </label>
              <label className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={useTurbo} onChange={e => setUseTurbo(e.target.checked)} />
                Turbo P1
              </label>
              <label className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={useTurboPass2} onChange={e => setUseTurboPass2(e.target.checked)} />
                Turbo P2
              </label>
            </div>

            {/* Row 2: guidance */}
            <div className="flex items-center justify-center gap-3 mb-1.5">
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P1 Guidance:</span>
                <input type="number" step={0.1} min={1.0} max={10.0} value={pass1Guidance}
                  onChange={e => setPass1Guidance(Math.max(1.0, Math.min(10.0, Number(e.target.value) || 4.0)))}
                  className="px-1 py-0.5" style={{ width: '60px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P2 Guidance:</span>
                <input type="number" step={0.1} min={1.0} max={10.0} value={pass2Guidance}
                  onChange={e => setPass2Guidance(Math.max(1.0, Math.min(10.0, Number(e.target.value) || 4.0)))}
                  className="px-1 py-0.5" style={{ width: '60px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
            </div>

            {/* Row 3: ref assignment — 1-based indexes into referencePhotos */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P1 refs:</span>
                <input type="text" value={pass1RefSpec} onChange={e => setPass1RefSpec(e.target.value)} placeholder="all"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P2 refs:</span>
                <input type="text" value={pass2RefSpec} onChange={e => setPass2RefSpec(e.target.value)} placeholder="all"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
              <span style={{ color: '#444', fontSize: '9px' }}>({referencePhotos.length + additionalRefs.length} uploaded)</span>
            </div>
          </div>

          {!state.frontGenerating && (
            <div className="space-y-2">
              {displayCandidate ? (
                <>
                  <div className="text-xs text-center mb-2" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    Lock this face and move to body generation?
                  </div>
                  <div className="flex gap-3 justify-center items-center">
                    <button onClick={() => generateFrontFace()}
                      className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#E8585A', border: '1px solid #E8585A60', borderRadius: '2px' }}>
                      Try Again
                    </button>
                    <span className="text-xs" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>×</span>
                    <input type="number" min={1} max={20} value={batchCount}
                      onChange={e => setBatchCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="w-12 text-center text-xs py-1 px-1"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#fff', border: '1px solid #582a72', borderRadius: '2px' }}
                    />
                    <button onClick={handleFrontPerfect}
                      className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors font-bold"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#D0A030', color: '#000', border: '1px solid #D0A030', borderRadius: '2px' }}>
                      Lock Face → Body
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex justify-center items-center gap-2">
                  <button onClick={() => generateFrontFace()}
                    className="px-4 py-2 text-xs uppercase tracking-wider transition-colors"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#582a72', color: '#fff', border: '1px solid #582a72', borderRadius: '2px' }}>
                    Generate Face
                  </button>
                  <span className="text-xs" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>×</span>
                  <input type="number" min={1} max={20} value={batchCount}
                    onChange={e => setBatchCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="w-12 text-center text-xs py-1 px-1"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#fff', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════
          STEP 2-3: Multi-Angle Generation & Grading
          ══════════════════════════════════════════════════════════ */}
      {false && (state.step === 'angle_generation' || state.step === 'angle_grading') && (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Step 2 — Angle Verification
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {state.step === 'angle_generation'
              ? 'Generating your face from multiple angles using identity lock. Each takes ~2 minutes.'
              : 'Rate each angle. Does this look like the SAME person as your locked face?'}
          </div>

          {/* Load existing angles from disk — lets user skip regeneration after a refresh */}
          <div className="flex justify-center mb-3">
            <button
              onClick={async () => {
                const charId = (characterData as Record<string, unknown>).characterId as string || 'creation-preview';
                const res = await fetch(`/api/portraits/existing?characterId=${charId}`);
                if (!res.ok) return;
                const data = await res.json();
                const angleEntries = (data.candidates || []).filter((c: { tier?: string; angleKey?: string }) => c.tier === 'angle' && c.angleKey);
                // Keep only the latest webp per angleKey (API returns newest-first).
                const seen = new Set<string>();
                for (const c of angleEntries as Array<{ imagePath: string; angleKey: string }>) {
                  if (seen.has(c.angleKey)) continue;
                  seen.add(c.angleKey);
                  if (ANGLE_KEYS.includes(c.angleKey as AngleKey)) {
                    dispatch({ type: 'ANGLE_COMPLETE', angle: c.angleKey as AngleKey, imagePath: c.imagePath, seed: 0 });
                  }
                }
                dispatch({ type: 'ALL_ANGLES_DONE' });
              }}
              className="px-3 py-1 text-xs uppercase tracking-wider transition-colors"
              style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#D0A030', border: '1px solid #D0A03060', borderRadius: '2px' }}>
              Load Existing Angles
            </button>
          </div>

          {/* Locked face reference + 4 angles */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {/* Locked front face — reference */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Front (Locked)
              </div>
              <div className="border overflow-hidden" style={{ borderColor: '#D0A030', borderWidth: '2px', backgroundColor: '#111', width: '130px', aspectRatio: '3/4' }}>
                {state.lockedFace && <FaceCropImage src={state.lockedFace!} alt="Locked face" faceCrop />}
              </div>
            </div>

            {/* Angle results */}
            {ANGLE_KEYS.map(angle => {
              const a = state.angles[angle];
              return (
                <div key={angle} className="flex flex-col items-center">
                  <div className="text-xs uppercase tracking-wider mb-1" style={{
                    color: a.grade === 'almost_perfect' ? '#D0A030' : a.grade === 'good' ? '#22ab94' : a.grade === 'bad' ? '#E8585A' : '#8e7cc3',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}>
                    {ANGLE_LABELS[angle]}
                  </div>
                  <div className="relative border overflow-hidden" style={{
                    borderColor: a.grade === 'almost_perfect' ? '#D0A030' : a.grade === 'good' ? '#22ab94' : a.imagePath ? '#582a72' : '#2a2a3e',
                    borderWidth: a.grade === 'almost_perfect' ? '2px' : '1px',
                    backgroundColor: '#111', width: '130px', aspectRatio: '3/4',
                  }}>
                    {a.imagePath ? (
                      <FaceCropImage src={a.imagePath} alt={ANGLE_LABELS[angle]} faceCrop />
                    ) : a.generating ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="animate-pulse text-sm" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                          Generating...
                        </div>
                        <ElapsedTimer startTime={state.generationStartTime} />
                      </div>
                    ) : a.error ? (
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <div className="text-xs text-center" style={{ color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{a.error}</div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-xs" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Waiting...</div>
                      </div>
                    )}
                  </div>

                  {/* Grade buttons */}
                  {state.step === 'angle_grading' && a.imagePath && (
                    <div className="flex gap-1 mt-2">
                      <GradeButton label="&times;" title="Bad — different person" active={a.grade === 'bad'} color="#E8585A"
                        onClick={() => dispatch({ type: 'GRADE_ANGLE', angle, grade: 'bad' })} />
                      <GradeButton label="&#10003;" title="Good — same person" active={a.grade === 'good'} color="#22ab94"
                        onClick={() => dispatch({ type: 'GRADE_ANGLE', angle, grade: 'good' })} />
                      <GradeButton label="&#9733;" title="Perfect match" active={a.grade === 'almost_perfect'} color="#D0A030"
                        onClick={() => dispatch({ type: 'GRADE_ANGLE', angle, grade: 'almost_perfect' })} />
                    </div>
                  )}
                  {/* Pick a specific file for this angle slot */}
                  <button
                    onClick={() => setPickingFor(pickingFor === angle ? null : angle)}
                    className="mt-1 px-2 py-0.5 text-xs uppercase tracking-wider"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px', backgroundColor: pickingFor === angle ? '#D0A030' : '#1a1a2e', color: pickingFor === angle ? '#000' : '#888', border: '1px solid #2a2a3e', borderRadius: '2px' }}>
                    {pickingFor === angle ? 'Cancel' : 'Pick File'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Per-angle file picker — click a thumbnail to assign it to the selected slot */}
          {pickingFor !== null && ((activeAngle: AngleKey) => (
            <div className="mb-4 p-2" style={{ backgroundColor: '#0a0a18', border: '1px solid #D0A030' }}>
              <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Assign a file to {ANGLE_LABELS[activeAngle]} — {availableAngleFiles.length} files available
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {availableAngleFiles.map(p => (
                  <div
                    key={p}
                    onClick={() => {
                      dispatch({ type: 'ANGLE_COMPLETE', angle: activeAngle, imagePath: p, seed: 0 });
                      setPickingFor(null);
                    }}
                    className="flex-shrink-0 border overflow-hidden cursor-pointer hover:opacity-80"
                    style={{ borderColor: '#2a2a3e', width: '90px', aspectRatio: '3/4', backgroundColor: '#111' }}
                    title={p.split('/').pop()}
                  >
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {availableAngleFiles.length === 0 && (
                  <div className="text-xs" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    No angle files on disk. Generate angles first or check the angles/ folder.
                  </div>
                )}
              </div>
            </div>
          ))(pickingFor!)}

          {/* Grading actions */}
          {state.step === 'angle_grading' && (
            <div className="flex flex-wrap gap-2 justify-center">
              {hasBadAngles && (
                <WizardButton onClick={() => dispatch({ type: 'REGEN_BAD_ANGLES' })} color="#582a72" label="Regenerate Bad" />
              )}
              <WizardButton onClick={() => dispatch({ type: 'REGEN_ALL_ANGLES' })} color="#582a72" label="Redo All Angles" />
              {allGraded && hasAnyGood && (
                <>
                  <WizardButton onClick={() => generateBody()} color="#22ab94" label="See Full Body" />
                  <WizardButton onClick={() => dispatch({ type: 'SKIP_BODY' })} color="#444" label="Skip to Testing" />
                </>
              )}
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 4: Body Discovery
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'body_discovery' && (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Step 3 — Body
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Full body with your locked identity. Verify proportions, skin tone, and distinguishing marks.
          </div>

          <div className="flex gap-4 justify-center mb-4">
            {/* Identity refs — locked front + all 4 angles. These are what PuLID uses. */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Face
              </div>
              {(() => {
                const angleCount = ANGLE_KEYS.filter(k => state.angles[k].imagePath).length;
                const totalImages = (state.lockedFace ? 1 : 0) + angleCount;
                const cols = totalImages <= 1 ? 1 : 2;
                const width = cols === 1 ? '120px' : '200px';
                return (
              <div className={`border p-1 grid gap-1`} style={{ borderColor: '#D0A030', borderWidth: '2px', width, backgroundColor: '#111', gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {state.lockedFace && (
                  <div className="border overflow-hidden group relative" style={{ borderColor: '#D0A030', aspectRatio: '3/4', cursor: 'pointer' }}>
                    <img src={state.lockedFace} alt="Locked front" className="w-full h-full object-cover" />
                    <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                      <img src={state.lockedFace} alt="Locked front" style={{ maxHeight: '80vh', maxWidth: '100%', width: 'auto', height: 'auto' }} />
                    </div>
                  </div>
                )}
                {ANGLE_KEYS.map(k => {
                  const p = state.angles[k].imagePath;
                  if (!p) return null;
                  return (
                    <div key={k} className="border overflow-hidden group relative" style={{ borderColor: '#582a72', aspectRatio: '3/4', cursor: 'pointer' }}>
                      <img src={p} alt={ANGLE_LABELS[k]} className="w-full h-full object-cover" />
                      <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                        <img src={p} alt={ANGLE_LABELS[k]} style={{ maxHeight: '80vh', maxWidth: '100%', width: 'auto', height: 'auto' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
                );
              })()}
            </div>

            {/* Body with prev/next gallery */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Full Body {bodyCandidates.length > 1 ? `(${bodyDisplayIndex + 1}/${bodyCandidates.length})` : ''}
              </div>
              <div className="flex items-center gap-1">
                {bodyCandidates.length > 1 && (
                  <button onClick={() => setBodyViewIndex(Math.max(0, bodyDisplayIndex - 1))}
                    style={{ color: bodyDisplayIndex > 0 ? '#D0A030' : '#333', fontSize: '18px', cursor: bodyDisplayIndex > 0 ? 'pointer' : 'default' }}>◀</button>
                )}
                <div className="relative border overflow-hidden" style={{ borderColor: bodyDisplayImage ? '#22ab94' : '#2a2a3e', width: '140px', aspectRatio: '1/2', backgroundColor: '#111' }}>
                  {bodyDisplayImage ? (
                    <div className="group relative w-full h-full">
                      <img src={bodyDisplayImage} alt="Full body" className="w-full h-full object-cover" />
                      <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70 overflow-auto">
                        <img src={bodyDisplayImage} alt="Full body" style={{ height: '100vh', width: 'auto' }} />
                      </div>
                    </div>
                  ) : state.bodyGenerating ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="animate-pulse text-sm" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Generating...</div>
                      <ElapsedTimer startTime={state.generationStartTime} />
                    </div>
                  ) : null}
                </div>
                {bodyCandidates.length > 1 && (
                  <button onClick={() => setBodyViewIndex(Math.min(bodyCandidates.length - 1, bodyDisplayIndex + 1))}
                    style={{ color: bodyDisplayIndex < bodyCandidates.length - 1 ? '#D0A030' : '#333', fontSize: '18px', cursor: bodyDisplayIndex < bodyCandidates.length - 1 ? 'pointer' : 'default' }}>▶</button>
                )}
              </div>
            </div>
          </div>

          {state.bodyImage && !state.bodyGenerating && (
            <div>
            {/* Body controls — Row 1: checkboxes + fill mode */}
            <div className="flex items-center justify-center gap-4 mb-2 flex-wrap" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#888' }}>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={keepBodySeed} onChange={e => setKeepBodySeed(e.target.checked)} />
                Keep body
              </label>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bodyDraftMode} onChange={e => setBodyDraftMode(e.target.checked)} />
                Draft (fast)
              </label>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bodyIdLockP2} onChange={e => setBodyIdLockP2(e.target.checked)} />
                ID Lock P2
              </label>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bodyRandomPose} onChange={e => setBodyRandomPose(e.target.checked)} />
                Random Pose
              </label>
              <div className="flex items-center gap-1">
                Fill:
                <button onClick={() => setFillModel('nsfw')} className="px-1.5 py-0.5"
                  style={{ backgroundColor: fillModel === 'nsfw' ? '#D0A030' : '#222', color: fillModel === 'nsfw' ? '#000' : '#888', border: '1px solid #444', fontSize: '9px' }}>NSFW</button>
                <button onClick={() => setFillModel('standard')} className="px-1.5 py-0.5"
                  style={{ backgroundColor: fillModel === 'standard' ? '#D0A030' : '#222', color: fillModel === 'standard' ? '#000' : '#888', border: '1px solid #444', fontSize: '9px' }}>Standard</button>
              </div>
            </div>
            {/* Body controls — Row 2: seeds + denoise */}
            <div className="flex items-center justify-center gap-4 mb-3 flex-wrap" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#888' }}>
              <div className="flex items-center gap-1">
                P1 Seed:
                <input type="text" value={bodySeedManual} onChange={e => setBodySeedManual(e.target.value)} placeholder="random"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
              </div>
              <div className="flex items-center gap-1">
                P2 Seed:
                <input type="text" value={bodySeed2Manual} onChange={e => setBodySeed2Manual(e.target.value)} placeholder="random"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
              </div>
              <div className="flex items-center gap-1">
                P2 Denoise:
                <input type="number" min={0.1} max={0.9} step={0.05} value={bodyDenoise}
                  onChange={e => setBodyDenoise(Math.min(0.9, Math.max(0.1, parseFloat(e.target.value) || 0.5)))}
                  className="px-1 py-0.5" style={{ width: '55px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
              </div>
            </div>
            {/* Body Pose Reference Upload */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Pose Ref:
              </span>
              {bodyPoseRef ? (
                <div className="flex items-center gap-2">
                  <img src={bodyPoseRef} alt="Pose ref" style={{ width: 40, height: 40, objectFit: 'cover', border: '1px solid #D0A030' }} />
                  <button onClick={() => setBodyPoseRef(null)} className="text-xs" style={{ color: '#E8585A' }}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => bodyPoseInputRef.current?.click()}
                  className="text-xs px-2 py-1 border"
                  style={{ color: '#D0A030', borderColor: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >
                  Upload Pose Photo
                </button>
              )}
              <input
                ref={bodyPoseInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('type', 'pose');
                  try {
                    const res = await fetch(`/api/references?characterId=${characterId || 'pose'}`, {
                      method: 'POST',
                      body: formData,
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setBodyPoseRef(data.path);
                    }
                  } catch { /* ignore */ }
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={() => dispatch({ type: 'ADVANCE_TO_FINETUNE' })} color="#D0A030" label="Finetune" />
              <WizardButton onClick={() => dispatch({ type: 'ADVANCE_TO_LOCK' })} color="#22ab94" label="Accept — Lock Identity" />
              <WizardButton onClick={() => generateBody()} color="#582a72" label="Retry Body" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
            </div>
          )}
          {!state.bodyImage && !state.bodyGenerating && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={() => generateBody()} color="#22ab94" label="Generate Body" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 4.5: Finetune (Kontext Edit)
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'finetune' && (
        <FinetunePanel
          sourceImage={bodyDisplayImage || state.bodyImage || state.lockedFace}
          finetuneHistory={state.finetuneHistory}
          finetuneGenerating={state.finetuneGenerating}
          generationStartTime={state.generationStartTime}
          onGenerate={generateFinetune}
          onBake={bakeFinetune}
          onLoadSaved={(imagePath, prompt) => dispatch({ type: 'FINETUNE_LOAD_SAVED', imagePath, prompt })}
          onUndo={() => dispatch({ type: 'FINETUNE_UNDO' })}
          onReroll={async (prompt) => {
            // Reroll: use the source from BEFORE the last layer, reuse its mask if any, generate new result
            const ftHist = state.finetuneHistory || [];
            const lastEntry = ftHist[ftHist.length - 1];
            const sourceBeforeLast = ftHist.length > 1 ? ftHist[ftHist.length - 2].imagePath : (bodyDisplayImage || state.bodyImage || state.lockedFace);
            if (!sourceBeforeLast) return;
            const storedPaintData = lastEntry?.paintData || undefined;
            dispatch({ type: 'FINETUNE_UNDO' });
            dispatch({ type: 'FINETUNE_GENERATING' });
            try {
              const res = await fetch('/api/portraits/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sourceImagePath: sourceBeforeLast,
                  editPrompt: prompt,
                  characterId: (characterData as Record<string, unknown>).characterId as string || 'creation-preview',
                  paintData: storedPaintData,
                }),
              });
              const data = await res.json();
              if (!res.ok || !data.success) throw new Error(data.error || 'Reroll failed');
              dispatch({ type: 'FINETUNE_COMPLETE', imagePath: data.imagePath, prompt, paintData: storedPaintData });
            } catch (e) {
              dispatch({ type: 'FINETUNE_ERROR', error: e instanceof Error ? e.message : 'Reroll failed' });
            }
          }}
          onReset={() => dispatch({ type: 'FINETUNE_RESET' })}
          onAccept={() => dispatch({ type: 'ADVANCE_TO_LOCK' })}
          onBack={() => dispatch({ type: 'JUMP_TO_STEP', step: 'body_discovery' })}
          onSkip={() => dispatch({ type: 'ADVANCE_TO_LOCK' })}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 5: Identity Testing
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'identity_test' && (
        <IdentityTestStep
          state={state}
          dispatch={dispatch}
          onGenerateTest={generateTest}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 6: Persona Lock
          ══════════════════════════════════════════════════════════ */}
      {(state.step === 'persona_lock' || state.step === 'generating_final') && (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {state.step === 'persona_lock' ? 'Final Step — Lock Identity' : 'Generating Official Portraits...'}
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {state.step === 'persona_lock'
              ? 'This locks your character\'s face permanently. All future portraits will use this identity.'
              : 'Creating your canonical bust and full body portraits.'}
          </div>

          {/* Reference summary */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {state.lockedFace && (
              <MiniFrame label="Front" imagePath={state.lockedFace} borderColor="#D0A030" />
            )}
            {ANGLE_KEYS.map(k => state.angles[k].imagePath && (
              <MiniFrame key={k} label={ANGLE_LABELS[k]} imagePath={state.angles[k].imagePath!}
                borderColor={state.angles[k].grade === 'almost_perfect' ? '#D0A030' : '#22ab94'} />
            ))}
            {state.bodyImage && (
              <MiniFrame label="Body" imagePath={state.bodyImage} borderColor="#8e7cc3" />
            )}

            {/* Final portraits (show as they generate) */}
            {state.step === 'generating_final' && (
              <>
                {state.finalBust ? (
                  <MiniFrame label="Official Bust" imagePath={state.finalBust} borderColor="#22ab94" />
                ) : (
                  <MiniFramePlaceholder label="Official Bust" startTime={state.generationStartTime} />
                )}
                {state.finalFullBody ? (
                  <MiniFrame label="Official Body" imagePath={state.finalFullBody} borderColor="#22ab94" />
                ) : (
                  <MiniFramePlaceholder label="Official Body" startTime={state.finalBust ? state.generationStartTime : null} />
                )}
              </>
            )}
          </div>

          {state.step === 'persona_lock' && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={generateFinalAndLock} color="#D0A030" textColor="#000" label="Lock Identity & Generate Portraits" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back" />
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="mt-3 p-2 text-xs" style={{
          color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace',
          backgroundColor: '#1a0a0a', border: '1px solid #E8585A40', borderRadius: '3px',
        }}>
          {state.error}
        </div>
      )}

      {/* Debug Panel */}
      {/* Debug panel hidden — future admin toggle */}
      {debugInfo && <DebugPanel info={debugInfo} />}
      </div>{/* end wizard content */}
      </div>{/* end flex wrapper */}
    </div>
  );
}

