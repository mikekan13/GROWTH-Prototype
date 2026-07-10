'use client';

import React, { useEffect, useRef, useState } from 'react';

// Tuning/panel state for the Identity Lock wizard, extracted verbatim from
// IdentityLockWizard.tsx (Stage C mechanical refactor). No behavior changes.
export function useTuning(campaignId: string) {
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

  // Which candidate is currently displayed (defaults to latest)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

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

  return {
    matureContent, setMatureContent,
    viewingIndex, setViewingIndex,
    bodyPoseRef, setBodyPoseRef, bodyPoseInputRef,
    keepBodySeed, setKeepBodySeed,
    bodyDraftMode, setBodyDraftMode,
    bodySeedManual, setBodySeedManual,
    bodySeed2Manual, setBodySeed2Manual,
    bodyDenoise, setBodyDenoise,
    bodyIdLockP2, setBodyIdLockP2,
    bodyRandomPose, setBodyRandomPose,
    bodyViewIndex, setBodyViewIndex,
    lastBodySeed, setLastBodySeed,
    fillModel, setFillModel,
    useDetailedPrompt, setUseDetailedPrompt,
    manualSeed, setManualSeed,
    batchCount, setBatchCount,
    customPrompt, setCustomPrompt,
    faceCustomPrompt, setFaceCustomPrompt,
    faceCustomPass2Prompt, setFaceCustomPass2Prompt,
    runPass2, setRunPass2,
    useTurbo, setUseTurbo,
    useTurboPass2, setUseTurboPass2,
    pass1Guidance, setPass1Guidance,
    pass2Guidance, setPass2Guidance,
    pass1RefSpec, setPass1RefSpec,
    pass2RefSpec, setPass2RefSpec,
    additionalRefs, setAdditionalRefs,
    additionalRefUploading, setAdditionalRefUploading,
    additionalRefInputRef,
    handleAdditionalRefPick, removeAdditionalRef,
    faceLoraWeights, setFaceLoraWeights,
    bodyLoraWeights, setBodyLoraWeights,
    loraOrder, setLoraOrder,
    dragLoraRef, dragOverLoraRef, handleLoraDragEnd,
    faceLoraOrder, setFaceLoraOrder,
    dragFaceLoraRef, dragOverFaceLoraRef, handleFaceLoraDragEnd,
  };
}
