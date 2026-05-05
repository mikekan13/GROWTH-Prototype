'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';

interface FaceCropModalProps {
  /** The raw File object selected by the user. */
  file: File;
  /** Called with a cropped 1024x1024 File (JPEG) when user confirms. */
  onConfirm: (croppedFile: File) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

const CROP_SIZE = 1024;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.002;

/**
 * FaceCropModal — full-screen overlay that lets the user pan + zoom an image
 * so the face is centered in a square crop region, then exports a 1024x1024
 * JPEG via HTML5 Canvas. No external dependencies.
 */
export default function FaceCropModal({ file, onConfirm, onCancel }: FaceCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Image natural dimensions
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  // Pan offset (image position relative to crop center, in image-space pixels)
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Zoom: how many display-pixels per image-pixel. Computed so image fills the
  // crop square initially, then user can adjust.
  const [zoom, setZoom] = useState(1);

  // Drag state
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Display size of the crop overlay (responsive — square that fits the viewport)
  const [displaySize, setDisplaySize] = useState(512);

  // Load the image from the File object
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });

      // Auto-zoom so the shorter dimension fills the crop square.
      // Default offset: center horizontally, upper-third vertically (face heuristic).
      const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
      const initialZoom = displaySize / shortSide;
      setZoom(initialZoom);

      // Center horizontally
      setOffsetX(0);
      // Shift up by ~15% of image height to bias toward face region
      const faceBias = img.naturalHeight * 0.15;
      setOffsetY(-faceBias);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Recompute display size on resize
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Leave room for buttons (80px) + padding
      const maxSquare = Math.min(vw - 80, vh - 180);
      setDisplaySize(Math.max(256, Math.min(maxSquare, 700)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Re-initialize zoom when displaySize changes and image is loaded
  useEffect(() => {
    if (!imgSize) return;
    const shortSide = Math.min(imgSize.w, imgSize.h);
    setZoom(displaySize / shortSide);
  }, [displaySize, imgSize]);

  // Redraw the preview canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgSize) return;

    canvas.width = displaySize;
    canvas.height = displaySize;
    const ctx = canvas.getContext('2d')!;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, displaySize, displaySize);

    // The crop square center is the canvas center.
    // Image is drawn centered, then offset by user pan.
    const cx = displaySize / 2;
    const cy = displaySize / 2;

    const drawW = imgSize.w * zoom;
    const drawH = imgSize.h * zoom;

    const dx = cx - drawW / 2 + offsetX * zoom;
    const dy = cy - drawH / 2 + offsetY * zoom;

    ctx.drawImage(img, dx, dy, drawW, drawH);

    // Draw dark overlay outside the crop square (the crop square IS the full canvas)
    // Since the canvas IS the crop area, no overlay needed — but draw grid lines
    // to help alignment.
    ctx.strokeStyle = 'rgba(208, 160, 48, 0.25)';
    ctx.lineWidth = 1;
    // Rule of thirds
    const third = displaySize / 3;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(third * i, 0);
      ctx.lineTo(third * i, displaySize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, third * i);
      ctx.lineTo(displaySize, third * i);
      ctx.stroke();
    }

    // Center crosshair
    ctx.strokeStyle = 'rgba(208, 160, 48, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();
  }, [imgSize, offsetX, offsetY, zoom, displaySize]);

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
  }, [offsetX, offsetY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    // Convert display-pixels to image-space pixels
    setOffsetX(dragStart.current.ox + dx / zoom);
    setOffsetY(dragStart.current.oy + dy / zoom);
  }, [zoom]);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    dragging.current = true;
    dragStart.current = { x: t.clientX, y: t.clientY, ox: offsetX, oy: offsetY };
  }, [offsetX, offsetY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - dragStart.current.x;
    const dy = t.clientY - dragStart.current.y;
    setOffsetX(dragStart.current.ox + dx / zoom);
    setOffsetY(dragStart.current.oy + dy / zoom);
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  // Scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => {
      const next = prev - e.deltaY * ZOOM_STEP;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    });
  }, []);

  // Zoom slider
  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZoom(parseFloat(e.target.value));
  }, []);

  // Reset to center
  const handleReset = useCallback(() => {
    if (!imgSize) return;
    const shortSide = Math.min(imgSize.w, imgSize.h);
    setZoom(displaySize / shortSide);
    setOffsetX(0);
    setOffsetY(-imgSize.h * 0.15);
  }, [imgSize, displaySize]);

  // Confirm: render the final 1024x1024 crop to an offscreen canvas, export as File
  const handleConfirm = useCallback(() => {
    const img = imgRef.current;
    if (!img || !imgSize) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = CROP_SIZE;
    offscreen.height = CROP_SIZE;
    const ctx = offscreen.getContext('2d')!;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

    // Scale factor: output-pixels per display-pixel
    const scale = CROP_SIZE / displaySize;

    const cx = CROP_SIZE / 2;
    const cy = CROP_SIZE / 2;
    const finalZoom = zoom * scale;
    const drawW = imgSize.w * finalZoom;
    const drawH = imgSize.h * finalZoom;
    const dx = cx - drawW / 2 + offsetX * finalZoom;
    const dy = cy - drawH / 2 + offsetY * finalZoom;

    ctx.drawImage(img, dx, dy, drawW, drawH);

    offscreen.toBlob(
      (blob) => {
        if (!blob) return;
        const cropped = new File([blob], file.name.replace(/\.\w+$/, '_cropped.jpg'), {
          type: 'image/jpeg',
        });
        onConfirm(cropped);
      },
      'image/jpeg',
      0.92,
    );
  }, [imgSize, offsetX, offsetY, zoom, displaySize, file, onConfirm]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const terminalFont = 'var(--font-terminal), Consolas, monospace';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove as unknown as React.MouseEventHandler<HTMLDivElement>}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex flex-col items-center gap-4"
        style={{ maxWidth: '95vw', maxHeight: '95vh' }}
      >
        {/* Title */}
        <div
          className="text-sm uppercase tracking-wider"
          style={{ color: '#D0A030', fontFamily: terminalFont }}
        >
          Crop Face Region
        </div>
        <div
          className="text-xs"
          style={{ color: '#9a7a3a', fontFamily: terminalFont }}
        >
          Drag to pan, scroll to zoom. Center the face in the square.
        </div>

        {/* Canvas (the crop area) */}
        <div
          ref={containerRef}
          className="relative"
          style={{
            width: displaySize,
            height: displaySize,
            border: '2px solid #D0A030',
            cursor: dragging.current ? 'grabbing' : 'grab',
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          <canvas
            ref={canvasRef}
            width={displaySize}
            height={displaySize}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            style={{ display: 'block', touchAction: 'none' }}
          />
          {/* Corner markers */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2" style={{ borderColor: '#D0A030' }} />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2" style={{ borderColor: '#D0A030' }} />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2" style={{ borderColor: '#D0A030' }} />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2" style={{ borderColor: '#D0A030' }} />

          {!imgSize && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ color: '#D0A030', fontFamily: terminalFont, fontSize: '12px' }}>
                Loading...
              </div>
            </div>
          )}
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3" style={{ width: displaySize }}>
          <span style={{ color: '#9a7a3a', fontFamily: terminalFont, fontSize: '11px', whiteSpace: 'nowrap' }}>
            Zoom
          </span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={handleZoomSlider}
            className="flex-1"
            style={{
              accentColor: '#D0A030',
              height: '4px',
            }}
          />
          <span style={{ color: '#9a7a3a', fontFamily: terminalFont, fontSize: '11px', width: '45px', textAlign: 'right' }}>
            {zoom.toFixed(2)}x
          </span>
          <button
            onClick={handleReset}
            className="px-2 py-1 text-xs transition-colors hover:opacity-80"
            style={{
              fontFamily: terminalFont,
              color: '#D0A030',
              backgroundColor: 'transparent',
              border: '1px solid #D0A03060',
              borderRadius: '2px',
            }}
          >
            Reset
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-xs uppercase tracking-wider transition-colors hover:opacity-80"
            style={{
              fontFamily: terminalFont,
              backgroundColor: '#1a1a2a',
              color: '#888',
              border: '1px solid #333',
              borderRadius: '2px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!imgSize}
            className="px-6 py-2 text-xs uppercase tracking-wider transition-colors hover:opacity-80 disabled:opacity-40"
            style={{
              fontFamily: terminalFont,
              backgroundColor: '#D0A030',
              color: '#000',
              border: '1px solid #D0A030',
              borderRadius: '2px',
              fontWeight: 700,
            }}
          >
            Confirm Crop
          </button>
        </div>

        {/* Output info */}
        <div style={{ color: '#555', fontFamily: terminalFont, fontSize: '10px' }}>
          Output: {CROP_SIZE}x{CROP_SIZE} JPEG
        </div>
      </div>
    </div>
  );
}
