'use client';

import { useState } from 'react';

type FaceRegion = 'eyes' | 'mouth' | 'nose' | 'skin' | 'forehead';

interface Props {
  lockedFace: string;
  characterId: string;
  onApplied: (imagePath: string) => void;
  onContinue: () => void;
  onError: (message: string) => void;
}

const FEATURES: { key: FaceRegion; label: string }[] = [
  { key: 'eyes', label: 'Eyes' },
  { key: 'mouth', label: 'Mouth' },
  { key: 'nose', label: 'Nose' },
  { key: 'skin', label: 'Skin' },
  { key: 'forehead', label: 'Forehead' },
];

export function FaceRefinementPanel({ lockedFace, characterId, onApplied, onContinue, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  // Refine + neutralize now route through the generic FLUX.2 /edit endpoint.
  // The old dedicated routes were FLUX.1 (Kontext + segmentation masks) only.
  const REGION_PROMPTS: Record<FaceRegion, string> = {
    eyes: 'Refine the eyes — sharper iris with crisp catchlights, cleaner eyelash detail. Preserve eye color and shape.',
    mouth: 'Refine the mouth and lips — cleaner lip line, natural color. Preserve lip shape.',
    nose: 'Refine the nose — clean shape, subtle natural contour. Preserve size and angle.',
    skin: 'Refine the skin — natural pore-level texture, subtle imperfections, no plastic smoothing. Preserve skin tone.',
    forehead: 'Refine the forehead — smooth natural skin, preserve hairline.',
  };

  const runRefine = async (region: FaceRegion) => {
    setBusy(region);
    try {
      const editPrompt = REGION_PROMPTS[region] ?? `Refine the ${region} region.`;
      const res = await fetch('/api/portraits/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, sourceImagePath: lockedFace, editPrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Refine ${region} failed`);
      onApplied(data.imagePath);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runNeutralize = async () => {
    setBusy('neutralize');
    try {
      const editPrompt = 'Neutralize the expression — lips closed in a calm relaxed line, no smile, eyes open and neutral. Preserve identity and everything else.';
      const res = await fetch('/api/portraits/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, sourceImagePath: lockedFace, editPrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Neutralize failed');
      onApplied(data.imagePath);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const terminalFont = { fontFamily: 'var(--font-terminal), Consolas, monospace' };
  const btnBase = 'px-3 py-2 text-xs uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-wait';
  const btnStyle = { ...terminalFont, backgroundColor: '#1a1a1a', color: '#D0A030', border: '1px solid #D0A030', borderRadius: '2px' } as const;
  const primaryStyle = { ...terminalFont, backgroundColor: '#582a72', color: '#fff', border: '1px solid #582a72', borderRadius: '2px' } as const;

  return (
    <div>
      <div className="text-xs mb-1" style={{ color: '#D0A030', ...terminalFont }}>
        Stage 3 — Refine Face (optional)
      </div>
      <div className="text-[11px] mb-3" style={{ color: '#9a7a3a', ...terminalFont }}>
        Tweak individual features before angles. Each pass preserves identity elsewhere.
      </div>

      <div className="flex gap-4 items-start">
        <div className="w-64 h-64 flex-shrink-0 border border-[#3a3a3a] bg-black overflow-hidden">
          <img src={lockedFace} alt="Locked face" className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <div>
            <div className="text-[11px] mb-1" style={{ color: '#9a7a3a', ...terminalFont }}>Per-feature inpaint</div>
            <div className="flex flex-wrap gap-2">
              {FEATURES.map(f => (
                <button
                  key={f.key}
                  onClick={() => runRefine(f.key)}
                  disabled={busy !== null}
                  className={btnBase}
                  style={btnStyle}
                >
                  {busy === f.key ? `${f.label}…` : f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] mb-1" style={{ color: '#9a7a3a', ...terminalFont }}>Expression</div>
            <button
              onClick={runNeutralize}
              disabled={busy !== null}
              className={btnBase}
              style={btnStyle}
            >
              {busy === 'neutralize' ? 'Neutralizing…' : 'Neutralize Expression'}
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-[#3a3a3a]">
            <button
              onClick={onContinue}
              disabled={busy !== null}
              className={`${btnBase} px-4 py-2`}
              style={primaryStyle}
            >
              Continue to Angles →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
