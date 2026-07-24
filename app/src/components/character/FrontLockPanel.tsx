'use client';

import { useEffect, useRef, useState } from 'react';

/** Thumbnail that shows the full-res image centered over the viewport on hover. */
function HoverZoom({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="group relative w-full h-full">
      <img src={src} alt={alt} className="w-full h-full object-cover" />
      <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-start justify-center bg-black/70 overflow-auto">
        <img src={src} alt={alt} style={{ width: 1024, height: 'auto' }} />
      </div>
    </div>
  );
}

interface Props {
  /** Step 1 selected image (PuLID anchor + ControlNet pose ref). */
  lockedFace: string;
  /** Same seed as the Step 1 candidate so identity carries over. */
  lockedSeed: number;
  /** Identity refs the user uploaded — fed to PuLID alongside the Step 1 anchor. */
  uploadedRefs: string[];
  characterId: string;
  onLocked: (imagePath: string) => void;
  onContinue: () => void;
  onError: (message: string) => void;
  /** Surface the gen response metadata back to the wizard's debug display. */
  onDebug?: (meta: {
    prompt: string; negativePrompt: string; seed: number; timeMs: number;
    workflow: string; failures: string[]; refs: string;
  }) => void;
}

/**
 * Lock — Front-Angle Lock.
 *
 * Same PuLID refs + same seed + same prompt as Step 1 — just at a higher render
 * size (1536²) with the pose anchored to the canonical `angle-refs/front.jpg`
 * ControlNet template. Pure txt2img, no img2img, no expression changes.
 *
 * The provider auto-fetches the angle-ref for `anglePreset: 'front'`, so we
 * don't pass a ControlNet image override — the canonical template wins.
 */
export function FrontLockPanel({
  lockedFace, lockedSeed, uploadedRefs, characterId, onLocked, onContinue, onError, onDebug,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [skinBusy, setSkinBusy] = useState(false);
  const [skinResultPath, setSkinResultPath] = useState<string | null>(null);
  // Which uploaded ref drives IP-Adapter for the skin pass. Independent of
  // PuLID's multi-ref identity chain. Defaults to the first upload.
  const [skinRefIndex, setSkinRefIndex] = useState(0);
  const triggered = useRef(false);
  // Snapshot the Stage 1 pick on mount — the parent updates its `lockedFace`
  // state to the Lock output once onLocked fires, which would otherwise swap
  // the left-pane image mid-stage and kill the comparison.
  const stage1SnapshotRef = useRef(lockedFace);
  const stage1Src = stage1SnapshotRef.current;

  const runLock = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/portraits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          // Same PuLID inputs that produced Step 1 — the originals, not the generated face.
          referenceImagePaths: uploadedRefs,
          overrides: {
            anglePreset: 'front',
            quality: 'final',
            seed: lockedSeed,
            minimalPulid: false,
            // No controlnetImagePath override — let provider auto-fetch the
            // canonical `angle-refs/front.jpg` template. Pose locks to that.
            // 1024² — 1536² OOMs on 24GB 4090 when PuLID + ControlNet +
            // IP-Adapter all active (+SigLIP, +FLUX Q4, +CLIP). 1024² is still
            // a high-detail identity reference; upscaling is a separate pass
            // if we need 1536+ later.
            widthOverride: 1024,
            heightOverride: 1024,
            // Lock is the canonical identity reference — crank everything.
            // Kill the Hyper-FLUX 8-step accelerator for full vanilla FLUX Dev
            // sampling (20 steps). Trades speed for pore-level skin texture,
            // which is the whole point of this stage.
            disableHyperflux: true,
            // Aggressive deadpan-expression sentence so smiles in the player's
            // photos don't carry through PuLID into the locked reference.
            neutralizeExpression: true,
            // Pass 1 is PuLID + ControlNet only — no IP-Adapter. IPA
            // overwhelms identity even time-gated to the last 2-3 steps.
            // Skin texture gets added in a separate Pass 2 inpaint that only
            // edits the face-oval region (see "Apply Skin Texture" button).
            enableIpAdapter: false,
            // ControlNet ON in OpenPose mode. Identity-neutral skeleton — no
            // facial keypoints (detect_face disabled at runtime + in JSON).
            // Strength at workflow default (0.7). Cranking to 0.85 thrashed
            // identity without helping framing — the skeleton from our 250²
            // face-only angle-refs is sparse (no shoulders visible), so more
            // strength just amplifies noise, not framing signal. Real framing
            // fix lives in the prompt + eventually a 2nd layered CN for
            // segmentation-based crop control.
            // H100 80GB: FP8 FLUX fits alongside the full adapter stack
            // (PuLID + CN + LoRAs + IPAdapter + SigLIP) with room to spare.
            // forceGguf no longer needed — FP8 runs ~6x faster than Q4 GGUF.
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Front-lock generation failed');
      setResultPath(data.imagePath);
      onLocked(data.imagePath);
      if (onDebug && data.metadata) {
        onDebug({
          prompt: data.metadata.prompt || '',
          negativePrompt: data.metadata.negativePrompt || '',
          seed: data.metadata.seed,
          timeMs: data.metadata.generationTimeMs,
          workflow: data.metadata.workflowUsed || 'unknown',
          failures: data.metadata.failedWorkflows || [],
          refs: data.metadata.debugRefs || '',
        });
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Auto-trigger once on mount — the panel is the action.
  // Face is already locked from Step 1 — set it as the result immediately
  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    setResultPath(lockedFace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pass 2 — face-region inpaint driven by IP-Adapter. Takes Pass 1's
  // locked face as the base image, generates a face-oval mask in the provider,
  // and runs IP-Adapter at full weight on ONLY the masked region. Everything
  // outside the face oval is preserved from Pass 1 pixels (hair, background,
  // ears) so identity geometry literally cannot shift.
  const runSkinPass = async () => {
    if (!resultPath) return;
    setSkinBusy(true);
    try {
      const res = await fetch('/api/portraits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          // IP-Adapter pulls appearance from the uploaded photos. Primary ref
          // (first upload) drives the skin. Later iteration will let the user
          // pick which uploaded photo supplies the skin.
          referenceImagePaths: uploadedRefs,
          overrides: {
            skinInpaintPass: true,
            baseImagePath: resultPath,
            // User-picked ref drives IPA. Falls back to first upload if index
            // is out of bounds (shouldn't happen but defensive).
            ipAdapterRefPath: uploadedRefs[skinRefIndex] || uploadedRefs[0],
            seed: lockedSeed,
            widthOverride: 1024,
            heightOverride: 1024,
            // Denoise 0.55: tested sweet spot (2026-04-17). Lower (0.3) = too
            // subtle, higher (0.85) = "messed up image" per Mike. 0.55 gives
            // visible skin tone/texture improvement without identity drift.
            denoise: 0.55,
            disableHyperflux: true,
            // IPA weight 0.8: pulls skin tone/warmth from the ref photo.
            // Tested range 0.6-1.3; 0.8 is the best balance of visible
            // texture transfer vs identity preservation. IPA is global
            // (affects model attention, not just masked region), so >1.0
            // overwhelms the inpaint and shifts features.
            ipAdapterWeightOverride: 0.8,
            ipAdapterStartPercentOverride: 0,
            ipAdapterEndPercentOverride: 1.0,
            // FluxRealSkin LoRA — purpose-trained for realistic skin texture
            // in FLUX. Swaps the detail LoRA slot. At 0.5 it adds subtle
            // skin variation without changing identity geometry.
            skinLoraName: 'fluxRealSkin-V2.safetensors',
            detailLoraWeightOverride: 0.5,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Skin inpaint failed');
      setSkinResultPath(data.imagePath);
      onLocked(data.imagePath);
      if (onDebug && data.metadata) {
        onDebug({
          prompt: data.metadata.prompt || '',
          negativePrompt: data.metadata.negativePrompt || '',
          seed: data.metadata.seed,
          timeMs: data.metadata.generationTimeMs,
          workflow: data.metadata.workflowUsed || 'unknown',
          failures: data.metadata.failedWorkflows || [],
          refs: data.metadata.debugRefs || '',
        });
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSkinBusy(false);
    }
  };

  const terminalFont = { fontFamily: 'var(--font-terminal), Consolas, monospace' };
  const btnBase = 'px-3 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-wait';
  const btnStyle = { ...terminalFont, backgroundColor: '#1a1a1a', color: '#D0A030', border: '1px solid #D0A030', borderRadius: '2px' } as const;
  const primaryStyle = { ...terminalFont, backgroundColor: 'var(--pillar-spirit)', color: '#fff', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' } as const;

  return (
    <div>
      <div className="text-xs mb-1" style={{ color: '#D0A030', ...terminalFont }}>
        Stage 2 — Lock Front Pose
      </div>
      <div className="text-[11px] mb-3" style={{ color: '#9a7a3a', ...terminalFont }}>
        Upscaling to 1536², pose-locked to your Stage 1 pick, expression neutralized.
        Same seed + same refs — txt2img only, no img2img.
      </div>

      {uploadedRefs.length > 1 && (
        <div className="mb-3">
          <div className="text-[10px] mb-1" style={{ color: '#9a7a3a', ...terminalFont }}>
            Skin source for inpaint pass (which photo&apos;s skin texture gets pulled)
          </div>
          <div className="flex gap-2">
            {uploadedRefs.map((src, i) => (
              <button
                key={src}
                onClick={() => setSkinRefIndex(i)}
                className="w-14 h-14 overflow-hidden transition-all"
                style={{
                  border: `2px solid ${i === skinRefIndex ? '#D0A030' : '#3a3a3a'}`,
                  opacity: i === skinRefIndex ? 1 : 0.6,
                  cursor: 'pointer',
                  borderRadius: '2px',
                }}
                title={`Use ref #${i + 1} for skin pass`}
              >
                <img src={src} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        <div>
          <div className="text-[10px] mb-1" style={{ color: '#9a7a3a', ...terminalFont }}>Stage 1 (locked)</div>
          <div className="w-64 h-64 flex-shrink-0 border border-[#3a3a3a] bg-black overflow-hidden">
            <HoverZoom src={stage1Src} alt="Stage 1 selection" />
          </div>
        </div>

        <div>
          <div className="text-[10px] mb-1" style={{ color: '#9a7a3a', ...terminalFont }}>Stage 2 (locked + neutral)</div>
          <div className="w-64 h-64 flex-shrink-0 border border-[#3a3a3a] bg-black overflow-hidden flex items-center justify-center">
            {busy && (
              <div className="text-[11px]" style={{ color: '#D0A030', ...terminalFont }}>
                Locking…
              </div>
            )}
            {!busy && resultPath && (
              <HoverZoom src={resultPath} alt="Stage 2 lock" />
            )}
            {!busy && !resultPath && (
              <div className="text-[11px]" style={{ color: '#9a7a3a', ...terminalFont }}>
                Pending
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] mb-1" style={{ color: '#9a7a3a', ...terminalFont }}>Stage 2b (skin inpaint)</div>
          <div className="w-64 h-64 flex-shrink-0 border border-[#3a3a3a] bg-black overflow-hidden flex items-center justify-center">
            {skinBusy && (
              <div className="text-[11px]" style={{ color: '#D0A030', ...terminalFont }}>
                Painting skin…
              </div>
            )}
            {!skinBusy && skinResultPath && (
              <HoverZoom src={skinResultPath} alt="Skin inpaint" />
            )}
            {!skinBusy && !skinResultPath && (
              <div className="text-[11px]" style={{ color: '#9a7a3a', ...terminalFont }}>
                Optional
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <button
            onClick={runLock}
            disabled={busy || skinBusy}
            className={btnBase}
            style={btnStyle}
          >
            {busy ? 'Re-locking…' : 'Try Again'}
          </button>

          <button
            onClick={runSkinPass}
            disabled={busy || skinBusy || !resultPath}
            className={btnBase}
            style={btnStyle}
          >
            {skinBusy ? 'Painting skin…' : skinResultPath ? 'Re-do Skin' : 'Apply Skin Texture'}
          </button>

          <button
            onClick={onContinue}
            disabled={busy || skinBusy || !resultPath}
            className={`${btnBase} px-4 py-2`}
            style={primaryStyle}
          >
            Continue to Angles →
          </button>
        </div>
      </div>
    </div>
  );
}
