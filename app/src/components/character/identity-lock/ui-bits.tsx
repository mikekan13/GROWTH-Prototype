'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ============================================================
// Shared Sub-components
// ============================================================

export function GradeButton({ label, title, active, color, onClick }: {
  label: string; title: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 flex items-center justify-center text-sm transition-all"
      style={{
        backgroundColor: active ? color : '#1a1a2e',
        color: active ? '#000' : color,
        border: `1px solid ${active ? color : color + '60'}`,
        borderRadius: '3px', fontWeight: active ? 'bold' : 'normal',
      }}
      dangerouslySetInnerHTML={{ __html: label }}
    />
  );
}

export function WizardButton({ onClick, color, textColor, label }: {
  onClick: () => void; color: string; textColor?: string; label: string;
}) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 text-xs uppercase tracking-wider transition-colors"
      style={{
        fontFamily: 'var(--font-terminal), Consolas, monospace',
        backgroundColor: color, color: textColor || '#fff',
        border: `1px solid ${color}`, borderRadius: '2px',
      }}>
      {label}
    </button>
  );
}

export function MiniFrame({ label, imagePath, borderColor }: { label: string; imagePath: string; borderColor: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: borderColor, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
        {label}
      </div>
      <div className="border overflow-hidden" style={{ borderColor, width: '80px', aspectRatio: '3/4', backgroundColor: '#111' }}>
        <img src={imagePath} alt={label} className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

export function MiniFramePlaceholder({ label, startTime }: { label: string; startTime: number | null }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
        {label}
      </div>
      <div className="relative border overflow-hidden" style={{ borderColor: '#2a2a3e', width: '80px', aspectRatio: '3/4', backgroundColor: '#111' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="animate-pulse text-xs" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>...</div>
          <ElapsedTimer startTime={startTime} />
        </div>
      </div>
    </div>
  );
}

/**
 * Displays a generated image cropped to the face region via CSS.
 * On hover, shows the full uncropped image in an overlay.
 * The actual file is stored uncropped (better for PuLID reference).
 */
export function FaceCropImage({ src, alt, faceCrop }: { src: string; alt: string; faceCrop?: boolean }) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(() => {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      // Position overlay to the right of the image, or left if too close to edge
      const x = rect.right + 10 + 400 > window.innerWidth ? rect.left - 410 : rect.right + 10;
      const y = Math.max(10, rect.top - 50);
      setPos({ x, y });
    }
    setHoverOpen(true);
  }, []);

  return (
    <>
      <div ref={imgRef} onMouseEnter={handleMouseEnter} onMouseLeave={() => setHoverOpen(false)}
        className="w-full h-full cursor-zoom-in">
        <img src={src} alt={alt}
          className="w-full h-full"
          style={faceCrop ? {
            objectFit: 'cover',
            objectPosition: 'center 20%',  // Face is usually upper-center in a portrait
          } : {
            objectFit: 'cover',
          }}
        />
      </div>
      {/* Full-size hover overlay — 100% native image (capped to viewport) */}
      {hoverOpen && (
        <div className="fixed z-50 border-2 shadow-2xl" style={{
          left: pos.x, top: pos.y,
          borderColor: '#D0A030', backgroundColor: '#000',
          maxWidth: 'min(1280px, calc(100vw - 20px))',
          maxHeight: 'calc(100vh - 20px)',
          pointerEvents: 'none',
        }}>
          <img src={src} alt={`${alt} (full)`} style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'inherit', display: 'block' }} />
        </div>
      )}
    </>
  );
}

export function DebugPanel({ info }: { info: { prompt: string; pass2Prompt?: string | null; negativePrompt: string; seed: number; timeMs: number; workflow: string; failures: string[]; refs: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border" style={{ borderColor: '#333', borderRadius: '3px', backgroundColor: '#0a0a15' }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-2 py-1 flex justify-between items-center"
        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#555' }}>
        <span>Debug — Workflow: <span style={{ color: info.workflow.includes('flux2') ? '#4ec9b0' : info.workflow.includes('controlnet') ? '#22ab94' : info.workflow.includes('pulid') ? '#D0A030' : '#E8585A' }}>{info.workflow}</span> | Seed: {info.seed} | {(info.timeMs / 1000).toFixed(1)}s</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
          <div>
            <div style={{ color: '#22ab94' }}>PASS 1 PROMPT (identity gen):</div>
            <div style={{ color: '#888', wordBreak: 'break-all' }}>{info.prompt}</div>
          </div>
          {info.pass2Prompt && (
            <div>
              <div style={{ color: '#D0A030' }}>PASS 2 PROMPT (cleanup + style):</div>
              <div style={{ color: '#888', wordBreak: 'break-all' }}>{info.pass2Prompt}</div>
            </div>
          )}
          <div>
            <div style={{ color: '#E8585A' }}>NEGATIVE:</div>
            <div style={{ color: '#666', wordBreak: 'break-all' }}>{info.negativePrompt}</div>
          </div>
          {info.refs && (
            <div>
              <div style={{ color: '#8e7cc3' }}>REFS:</div>
              <div style={{ color: '#888', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{info.refs}</div>
            </div>
          )}
          {info.failures.length > 0 && (
            <div>
              <div style={{ color: '#D0A030' }}>FAILED WORKFLOWS:</div>
              {info.failures.map((f, i) => (
                <div key={i} style={{ color: '#E8585A', wordBreak: 'break-all' }}>{f}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ElapsedTimer({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = React.useState(0);
  useEffect(() => {
    // setElapsed(0) here is intentional — resets the displayed timer when
    // startTime clears. The linter's cascading-render warning doesn't apply
    // because this only fires on startTime changes and the effect returns
    // immediately after setting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!startTime) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  if (!startTime) return null;
  return (
    <div className="mt-1 text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
      {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')} / ~2:00
    </div>
  );
}
