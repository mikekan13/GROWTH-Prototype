/**
 * Camera bounded by content (Mike 2026-10-08): "you can only scroll so far
 * away from stuff if it doesn't exist. So basically the canvas can keep
 * getting larger if stuff exists to fill it."
 *
 * Pure geometry, world units. The viewport is `baseW*zoom × baseH*zoom`
 * (zoom > 1 = further out). On each axis the viewport may stray past the
 * content box by a margin of min(half the viewport, pad):
 *  - zoomed in (half viewport ≤ pad): the viewport CENTRE stays inside the
 *    content box, so at least half the screen always overlaps content;
 *  - zoomed out: at most `pad` of void beyond the content edge;
 *  - viewport wider than content + 2·pad: centred on the content (no pan).
 * The zoom-out ceiling (`maxZoomForContent`) is where content + pad fits on
 * BOTH axes, so at the furthest zoom the whole world is on screen, centred.
 */

export interface ContentBox { minX: number; minY: number; maxX: number; maxY: number }
export interface Rect { x: number; y: number; width: number; height: number }

/** Union of rects; null when there is nothing (empty campaign → no clamp). */
export function contentBoxOf(rects: Iterable<Rect>): ContentBox | null {
  let box: ContentBox | null = null;
  for (const r of rects) {
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) continue;
    if (!box) box = { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
    else {
      box.minX = Math.min(box.minX, r.x);
      box.minY = Math.min(box.minY, r.y);
      box.maxX = Math.max(box.maxX, r.x + r.width);
      box.maxY = Math.max(box.maxY, r.y + r.height);
    }
  }
  return box;
}

/** Furthest zoom-out at which the content box + pad fits on both axes. */
export function maxZoomForContent(box: ContentBox | null, baseW: number, baseH: number, pad: number): number {
  if (!box || baseW <= 0 || baseH <= 0) return Infinity;
  const w = box.maxX - box.minX + 2 * pad;
  const h = box.maxY - box.minY + 2 * pad;
  return Math.max(w / baseW, h / baseH);
}

function clampAxis(pos: number, view: number, min: number, max: number, pad: number): number {
  const half = view / 2;
  const m = Math.min(half, pad);
  const lo = min - m;
  const hi = max + m - view;
  if (hi < lo) return (min + max) / 2 - half; // viewport bigger than content + margin → centre
  return Math.max(lo, Math.min(hi, pos));
}

/**
 * Box clamp, then: the viewport must actually SHOW something. A bounding box
 * can have empty corners (content top-left + content bottom-right), so the
 * camera is moved to the nearest position (inside the box clamp) where at
 * least one content rect is in view by min(20% of the viewport, half the
 * rect) on each axis. Voids smaller than a viewport pan through smoothly.
 */
export function clampCameraToContent(
  camera: { x: number; y: number },
  zoom: number,
  viewport: { baseW: number; baseH: number },
  rects: readonly Rect[],
  pad: number,
): { x: number; y: number } {
  const box = contentBoxOf(rects);
  if (!box) return camera;
  const c = clampCamera(camera, zoom, viewport, box, pad);
  const vw = viewport.baseW * zoom, vh = viewport.baseH * zoom;
  // the box-clamp's allowed interval per axis (a point when centred)
  const boxRange = (view: number, min: number, max: number, pos: number): [number, number] => {
    const m = Math.min(view / 2, pad);
    const lo = min - m, hi = max + m - view;
    return hi < lo ? [pos, pos] : [lo, hi];
  };
  const bx = boxRange(vw, box.minX, box.maxX, c.x), by = boxRange(vh, box.minY, box.maxY, c.y);
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (const r of rects) {
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) continue;
    const kx = Math.min(vw * 0.2, r.width / 2), ky = Math.min(vh * 0.2, r.height / 2);
    // camera positions where r shows by ≥ k: [r.min - view + k, r.max - k]
    const ax0 = Math.max(bx[0], r.x - vw + kx), ax1 = Math.min(bx[1], r.x + r.width - kx);
    const ay0 = Math.max(by[0], r.y - vh + ky), ay1 = Math.min(by[1], r.y + r.height - ky);
    if (ax0 > ax1 || ay0 > ay1) continue;
    const p = { x: Math.max(ax0, Math.min(ax1, c.x)), y: Math.max(ay0, Math.min(ay1, c.y)) };
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) { bestD = d; best = p; if (d === 0) break; }
  }
  return best ?? c;
}

/** Clamp the camera (viewBox top-left) so the viewport never leaves content + margin. */
export function clampCamera(
  camera: { x: number; y: number },
  zoom: number,
  viewport: { baseW: number; baseH: number },
  box: ContentBox | null,
  pad: number,
): { x: number; y: number } {
  if (!box) return camera;
  return {
    x: clampAxis(camera.x, viewport.baseW * zoom, box.minX, box.maxX, pad),
    y: clampAxis(camera.y, viewport.baseH * zoom, box.minY, box.maxY, pad),
  };
}
