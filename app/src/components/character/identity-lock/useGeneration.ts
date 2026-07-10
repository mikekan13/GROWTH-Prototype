'use client';

import React, { useCallback, useState } from 'react';
import { ANGLE_KEYS, WizardState } from './types';
import { Action } from './state';
import { useTuning } from './useTuning';

// Generation callbacks for the Identity Lock wizard, extracted verbatim from
// IdentityLockWizard.tsx (Stage C mechanical refactor). No behavior changes.
// Args are destructured into the exact local names the callback bodies close
// over so the bodies stay byte-identical to the pre-move code.
export function useGeneration(args: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  characterData: Record<string, unknown>;
  characterId?: string;
  abortRef: React.MutableRefObject<boolean>;
  primaryRef: string | undefined;
  allRefs: string[];
  displayIndex: number;
  bodyDisplayEntry: WizardState['bodyCandidates'][number] | undefined;
  bodyDisplayImage: string | null;
  tuning: ReturnType<typeof useTuning>;
}) {
  const { state, dispatch, characterData, characterId, abortRef, primaryRef, allRefs, displayIndex, bodyDisplayEntry, bodyDisplayImage, tuning } = args;
  const {
    matureContent, setViewingIndex, batchCount,
    pass1RefSpec, pass2RefSpec,
    faceLoraWeights, faceLoraOrder, faceCustomPrompt, faceCustomPass2Prompt,
    useDetailedPrompt, manualSeed,
    runPass2, useTurbo, useTurboPass2, pass1Guidance, pass2Guidance,
    bodyPoseRef, bodyLoraWeights, loraOrder, customPrompt, fillModel,
    bodyDraftMode, bodySeedManual, bodySeed2Manual, bodyDenoise, bodyIdLockP2,
    bodyRandomPose, keepBodySeed, lastBodySeed, setLastBodySeed, setBodyViewIndex,
  } = tuning;

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

  return {
    debugInfo, setDebugInfo,
    generate,
    generateFrontFace,
    handleFrontBad, handleFrontGood, handleFrontPerfect,
    runAngleGeneration,
    generateBody,
    generateFinetune, bakeFinetune,
    generateTest,
    generateFinalAndLock,
  };
}
