'use client';

import React from 'react';
import { WizardButton, ElapsedTimer } from './ui-bits';

// ============================================================
// Finetune Panel (Kontext image editing)
// ============================================================

export function FinetunePanel({
  sourceImage,
  finetuneHistory,
  finetuneGenerating,
  generationStartTime,
  onGenerate,
  onReroll,
  onBake,
  onLoadSaved,
  onUndo,
  onReset,
  onAccept,
  onBack,
  onSkip,
}: {
  sourceImage: string | null;
  finetuneHistory: { imagePath: string; prompt: string; paintData?: { mode: string; dataUrl: string } | null }[];
  finetuneGenerating: boolean;
  generationStartTime: number | null;
  onGenerate: (editPrompt: string, guidance?: number, paintData?: { mode: string; dataUrl: string } | null, objectRefImagePath?: string | null) => void;
  onReroll: (prompt: string) => void;
  onBake: () => void;
  onLoadSaved: (imagePath: string, prompt: string) => void;
  onUndo: () => void;
  onReset: () => void;
  onAccept: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [editPrompt, setEditPrompt] = React.useState('');
  const [guidance, setGuidance] = React.useState(5.0);
  // Optional object-pull reference: a photo/drawing/sketch of an item the
  // user wants to transfer onto the character (e.g. "take the shirt from
  // this and put it on her"). When set, the provider routes to
  // flux2-edit-with-refpull and restyles the pulled item into GROWTH look.
  const [objectRefPath, setObjectRefPath] = React.useState<string | null>(null);
  const [objectRefUploading, setObjectRefUploading] = React.useState(false);
  const objectRefInputRef = React.useRef<HTMLInputElement>(null);
  const [savedLayers, setSavedLayers] = React.useState<{ imagePath: string; prompt: string; savedAt: number }[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('growth_savedLayers') || '[]'); } catch { return []; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('growth_savedLayers', JSON.stringify(savedLayers)); } catch { /* ignore */ }
  }, [savedLayers]);
  const [paintMode, setPaintMode] = React.useState<'off' | 'mask'>('off');
  const [paintTool, setPaintTool] = React.useState<'brush' | 'box'>('brush');
  const [brushSize, setBrushSize] = React.useState(12);
  const [maskOpacity, setMaskOpacity] = React.useState(1.0);
  const [maskFeather, setMaskFeather] = React.useState(20);
  const [savedMasks, setSavedMasks] = React.useState<{ name: string; dataUrl: string; feather: number; opacity: number; savedAt: number }[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('growth_savedMasks') || '[]'); } catch { return []; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('growth_savedMasks', JSON.stringify(savedMasks)); } catch { /* ignore */ }
  }, [savedMasks]);
  const [isErasing, setIsErasing] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isPainting = React.useRef(false);
  const lastPos = React.useRef<{ x: number; y: number } | null>(null);
  const boxStart = React.useRef<{ x: number; y: number } | null>(null);
  const canvasSnapshot = React.useRef<ImageData | null>(null);

  const history = finetuneHistory || [];
  const latestImage = history.length > 0 ? history[history.length - 1].imagePath : null;
  const currentSource = latestImage || sourceImage;

  // Clear canvas when mode changes or source changes
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [paintMode, currentSource]);

  // Resize canvas to match container
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }, [currentSource]);

  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const draw = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isErasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255, 255, 255, ${maskOpacity})`;
    }

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const fillBox = (from: { x: number; y: number }, to: { x: number; y: number }, preview: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);
    if (isErasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = preview ? `rgba(255, 255, 255, ${maskOpacity * 0.4})` : `rgba(255, 255, 255, ${maskOpacity})`;
    }
    ctx.fillRect(x, y, w, h);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (paintMode === 'off') return;
    isPainting.current = true;
    const pos = getCanvasPos(e);
    if (paintTool === 'box') {
      boxStart.current = pos;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        canvasSnapshot.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    } else {
      lastPos.current = pos;
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPainting.current || paintMode === 'off') return;
    const pos = getCanvasPos(e);
    if (paintTool === 'box' && boxStart.current) {
      // Restore snapshot and draw preview
      const canvas = canvasRef.current;
      if (canvas && canvasSnapshot.current) {
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(canvasSnapshot.current, 0, 0);
        fillBox(boxStart.current, pos, true);
      }
    } else {
      if (lastPos.current) draw(lastPos.current, pos);
      lastPos.current = pos;
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (paintTool === 'box' && boxStart.current && isPainting.current) {
      const pos = getCanvasPos(e);
      const canvas = canvasRef.current;
      if (canvas && canvasSnapshot.current) {
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(canvasSnapshot.current, 0, 0);
        fillBox(boxStart.current, pos, false);
      }
      boxStart.current = null;
      canvasSnapshot.current = null;
    }
    isPainting.current = false;
    lastPos.current = null;
    updatePixelCount();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setPaintedPixels(0);
  };

  const [paintedPixels, setPaintedPixels] = React.useState(0);

  const getPaintData = (): { mode: string; dataUrl: string; feather?: number } | null => {
    if (paintMode === 'off') return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.data.length; i += 4) {
      if (data.data[i] > 0) count++;
    }
    if (count === 0) return null;
    return { mode: paintMode, dataUrl: canvas.toDataURL('image/png'), feather: maskFeather };
  };

  const saveCurrentMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const name = prompt('Name this mask:', `mask-${savedMasks.length + 1}`);
    if (!name) return;
    setSavedMasks(prev => [...prev, { name, dataUrl, feather: maskFeather, opacity: maskOpacity, savedAt: Date.now() }]);
  };

  const loadSavedMask = (saved: { name: string; dataUrl: string; feather: number; opacity: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setMaskFeather(saved.feather);
      setMaskOpacity(saved.opacity);
      updatePixelCount();
    };
    img.src = saved.dataUrl;
    setPaintMode('mask');
  };

  const updatePixelCount = () => {
    const canvas = canvasRef.current;
    if (!canvas) { setPaintedPixels(0); return; }
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.data.length; i += 4) {
      if (data.data[i] > 0) count++;
    }
    setPaintedPixels(count);
  };

  const handleObjectRefPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setObjectRefUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/references', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'upload failed');
      setObjectRefPath(j.path as string);
    } catch (err) {
      alert(`Object reference upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setObjectRefUploading(false);
      if (objectRefInputRef.current) objectRefInputRef.current.value = '';
    }
  };

  const handleGenerate = () => {
    if (!editPrompt.trim()) return;
    onGenerate(editPrompt.trim(), guidance, getPaintData(), objectRefPath);
    setEditPrompt('');
    clearCanvas();
  };

  const termFont = { fontFamily: 'var(--font-terminal), Consolas, monospace' };
  const toolBtn = (active: boolean) => ({
    padding: '3px 8px', fontSize: '9px', cursor: 'pointer',
    backgroundColor: active ? '#D0A030' : '#222',
    color: active ? '#000' : '#888',
    border: `1px solid ${active ? '#D0A030' : '#444'}`,
    borderRadius: '2px', ...termFont,
  });

  return (
    <div>
      <div className="text-xs mb-1" style={{ color: '#D0A030', ...termFont }}>
        Step 4 — Finetune {history.length > 0 ? `(${history.length} edits)` : ''}
      </div>

      {/* Layer chain (compact thumbnails with hover zoom) */}
      <div className="flex gap-1 items-end overflow-x-auto mb-3 pb-1" style={{ minHeight: '50px' }}>
        <div className="flex-shrink-0 border overflow-hidden group relative" style={{ borderColor: '#2a2a3e', width: '40px', aspectRatio: '1/2', backgroundColor: '#111', cursor: 'pointer' }}>
          {sourceImage && (
            <>
              <img src={sourceImage} alt="Base" className="w-full h-full object-cover" title="Base" />
              <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                <img src={sourceImage} alt="Base" style={{ height: '100vh', width: 'auto' }} />
              </div>
            </>
          )}
        </div>
        {history.map((edit, i) => {
          const isSaved = savedLayers.some(s => s.imagePath === edit.imagePath);
          const toggleSave = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isSaved) {
              setSavedLayers(prev => prev.filter(s => s.imagePath !== edit.imagePath));
            } else {
              setSavedLayers(prev => [...prev, { imagePath: edit.imagePath, prompt: edit.prompt, savedAt: Date.now() }]);
            }
          };
          return (
            <React.Fragment key={i}>
              <span className="text-xs" style={{ color: '#444' }}>→</span>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="border overflow-hidden group relative" style={{ borderColor: i === history.length - 1 ? '#22ab94' : '#333', width: '40px', aspectRatio: '1/2', backgroundColor: '#111', cursor: 'pointer' }}>
                  <img src={edit.imagePath} alt={edit.prompt} className="w-full h-full object-cover" title={edit.prompt} />
                  <button onClick={toggleSave} className="absolute top-0 right-0 text-xs"
                    style={{ color: isSaved ? '#D0A030' : '#666', backgroundColor: 'rgba(0,0,0,0.5)', fontSize: '10px', padding: '0 2px', cursor: 'pointer' }}
                    title={isSaved ? 'Remove from saved' : 'Save this layer'}>★</button>
                  <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                    <img src={edit.imagePath} alt={edit.prompt} style={{ height: '100vh', width: 'auto' }} />
                  </div>
                </div>
                {i === history.length - 1 && !finetuneGenerating && (
                  <button onClick={() => onReroll(edit.prompt)} className="text-xs" style={{ color: '#555', fontSize: '8px', cursor: 'pointer', ...termFont }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#D0A030')} onMouseLeave={e => (e.currentTarget.style.color = '#555')}>↻</button>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {finetuneGenerating && (
          <>
            <span className="text-xs" style={{ color: '#444' }}>→</span>
            <div className="flex items-center justify-center" style={{ width: '40px', height: '80px' }}>
              <div className="text-center">
                <div className="animate-pulse text-xs" style={{ color: '#D0A030', ...termFont }}>...</div>
                <ElapsedTimer startTime={generationStartTime} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Large canvas with paint overlay */}
      <div className="flex justify-center mb-3">
        <div
          ref={containerRef}
          className="relative border overflow-hidden"
          style={{ borderColor: '#22ab94', width: '300px', aspectRatio: '1/2', backgroundColor: '#111', cursor: paintMode !== 'off' ? 'crosshair' : 'default' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {currentSource ? (
            <img src={currentSource} alt="Current" className="w-full h-full object-cover" draggable={false} style={{ userSelect: 'none' }} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: '#444' }}>No image</div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ pointerEvents: paintMode !== 'off' ? 'auto' : 'none', opacity: paintMode === 'mask' ? 0.5 : 1 }}
          />
          {finetuneGenerating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center">
                <div className="animate-pulse text-lg" style={{ color: '#D0A030', ...termFont }}>Editing...</div>
                <ElapsedTimer startTime={generationStartTime} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Paint tools — Mask mode for targeted edits */}
      <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => { setPaintMode(paintMode === 'off' ? 'mask' : 'off'); setIsErasing(false); }}
          style={toolBtn(paintMode === 'mask')}
          title="Paint a mask over areas you want to edit"
        >
          Mask {paintMode === 'mask' ? 'ON' : 'OFF'}
        </button>
        {paintMode === 'mask' && (
          <>
            <button onClick={() => setPaintTool('brush')} style={toolBtn(paintTool === 'brush')} title="Brush — paint freehand">🖌 Brush</button>
            <button onClick={() => setPaintTool('box')} style={toolBtn(paintTool === 'box')} title="Box — click and drag to fill a rectangle">▭ Box</button>
            <button onClick={() => setIsErasing(!isErasing)} style={toolBtn(isErasing)}>Eraser</button>
            <button onClick={clearCanvas} style={toolBtn(false)}>Clear</button>
            <button onClick={saveCurrentMask} style={toolBtn(false)} title="Save this mask for reuse">💾 Save</button>
            {paintTool === 'brush' && (
              <>
                <span className="text-xs" style={{ color: '#666', ...termFont }}>Size:</span>
                <input type="range" min={2} max={40} value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))}
                  style={{ width: '60px', accentColor: '#D0A030' }} />
              </>
            )}
            <span className="text-xs" style={{ color: '#666', ...termFont }}>Opacity: {Math.round(maskOpacity * 100)}%</span>
            <input type="range" min={0.1} max={1.0} step={0.05} value={maskOpacity}
              onChange={e => setMaskOpacity(parseFloat(e.target.value))}
              style={{ width: '60px', accentColor: '#D0A030' }}
              title="Lower opacity = more source shows through (for sheer/transparent effects)" />
            <span className="text-xs" style={{ color: '#666', ...termFont }}>Margin: {maskFeather}px</span>
            <input type="range" min={0} max={80} step={2} value={maskFeather}
              onChange={e => setMaskFeather(parseInt(e.target.value))}
              style={{ width: '60px', accentColor: '#D0A030' }}
              title="Expands the mask outward at full opacity — lets edits extend beyond painted area without fading" />
            <span className="text-xs" style={{ color: paintedPixels > 0 ? '#22ab94' : '#666', ...termFont, fontSize: '9px' }}>
              {paintedPixels > 0 ? `✓ ${paintedPixels}px painted` : 'paint area to edit'}
            </span>
          </>
        )}
      </div>

      {/* Saved Masks strip */}
      {paintMode === 'mask' && savedMasks.length > 0 && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: '#666', ...termFont, fontSize: '9px' }}>Saved masks:</span>
          {savedMasks.map((s, i) => (
            <div key={i} className="flex items-center gap-1" style={{ border: '1px solid #333', borderRadius: '2px', padding: '2px 4px', backgroundColor: '#1a1a2e' }}>
              <button onClick={() => loadSavedMask(s)} className="text-xs" style={{ color: '#D0A030', cursor: 'pointer', ...termFont, fontSize: '9px' }} title="Load this mask">
                {s.name}
              </button>
              <button onClick={() => setSavedMasks(prev => prev.filter((_, j) => j !== i))} className="text-xs" style={{ color: '#666', cursor: 'pointer', fontSize: '9px' }} title="Delete">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Prompt + guidance */}
      <div className="mb-2">
        <textarea
          value={editPrompt}
          onChange={e => setEditPrompt(e.target.value)}
          placeholder={history.length > 0 ? 'Describe the next edit...' : 'Describe the edit to make...'}
          rows={2}
          className="w-full px-3 py-2 text-sm border rounded resize-none"
          style={{ backgroundColor: '#1a1a2e', borderColor: '#333', color: '#ccc', ...termFont }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
        />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs whitespace-nowrap" style={{ color: '#666', ...termFont }}>
          Guidance: {guidance.toFixed(1)}
        </label>
        <input type="range" min={1.0} max={10.0} step={0.5} value={guidance}
          onChange={e => setGuidance(parseFloat(e.target.value))}
          className="flex-1" style={{ accentColor: '#D0A030' }} />
        {/* Object-pull reference: attach a photo/drawing/sketch of an item to transfer */}
        <input
          ref={objectRefInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleObjectRefPick}
          className="hidden"
        />
        {objectRefPath ? (
          <div className="flex items-center gap-1" title={objectRefPath}>
            <img src={objectRefPath} alt="object ref" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3, border: '1px solid #8e7cc3' }} />
            <button
              onClick={() => setObjectRefPath(null)}
              className="text-xs"
              style={{ color: '#8e7cc3', ...termFont, padding: '0 4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Clear object reference"
            >×</button>
          </div>
        ) : (
          <button
            onClick={() => objectRefInputRef.current?.click()}
            disabled={objectRefUploading || finetuneGenerating}
            className="px-2 py-1"
            style={{
              backgroundColor: '#1a1a2a',
              color: '#8e7cc3',
              border: '1px solid #8e7cc3',
              borderRadius: '2px', fontSize: '10px', ...termFont,
            }}
            title="Attach an image — pull an item from it (photo/drawing/sketch all work)"
          >{objectRefUploading ? '...' : '📎 Ref'}</button>
        )}
        <button
          onClick={handleGenerate}
          disabled={!editPrompt.trim() || finetuneGenerating}
          className="flex items-center justify-center transition-colors px-3 py-1"
          style={{
            backgroundColor: editPrompt.trim() ? '#D0A030' : '#222',
            color: editPrompt.trim() ? '#000' : '#444',
            border: `1px solid ${editPrompt.trim() ? '#D0A030' : '#333'}`,
            borderRadius: '2px', fontSize: '11px', ...termFont,
          }}
        >{finetuneGenerating ? '...' : '+ Add'}</button>
      </div>

      {/* Saved Layers strip */}
      {savedLayers.length > 0 && (
        <div className="mb-3">
          <div className="text-xs mb-1" style={{ color: '#D0A030', ...termFont, fontSize: '9px' }}>
            ★ Saved Layers ({savedLayers.length}) — click to load as baseline
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1" style={{ minHeight: '62px' }}>
            {savedLayers.map((s, i) => (
              <div key={i} className="flex-shrink-0 relative group" style={{ width: '40px' }}>
                <div className="border overflow-hidden" style={{ borderColor: '#D0A030', aspectRatio: '1/2', backgroundColor: '#111', cursor: 'pointer' }}
                  onClick={() => onLoadSaved(s.imagePath, s.prompt)}
                  title={`Load: ${s.prompt}`}>
                  <img src={s.imagePath} alt={s.prompt} className="w-full h-full object-cover" />
                  <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                    <img src={s.imagePath} alt={s.prompt} style={{ height: '100vh', width: 'auto' }} />
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setSavedLayers(prev => prev.filter(x => x.imagePath !== s.imagePath)); }}
                  className="absolute top-0 right-0 text-xs"
                  style={{ color: '#E8585A', backgroundColor: 'rgba(0,0,0,0.6)', fontSize: '9px', padding: '0 2px', cursor: 'pointer' }}
                  title="Remove from saved">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-center flex-wrap">
        {history.length > 0 && !finetuneGenerating && (
          <WizardButton onClick={onUndo} color="#D0A030" label="Undo" />
        )}
        {history.length >= 3 && !finetuneGenerating && (
          <WizardButton
            onClick={onBake}
            color={history.length >= 4 ? '#582a72' : '#4a3770'}
            label={history.length >= 4 ? '✦ Bake (refresh quality)' : 'Bake'}
          />
        )}
        {history.length > 0 && !finetuneGenerating && (
          <WizardButton onClick={onReset} color="#E8585A" label="Reset" />
        )}
        {history.length > 0 && !finetuneGenerating && (
          <WizardButton onClick={onAccept} color="#22ab94" label="Accept — Lock Identity" />
        )}
      </div>
    </div>
  );
}
