/**
 * Dice Texture Atlas — Canvas-rendered number textures for 3D dice faces.
 *
 * Renders numbers onto a canvas, then creates Three.js textures.
 * Each die type gets its own set of face textures with the correct numbers.
 * Textures are cached after first creation.
 */

import * as THREE from 'three';
import type { DieColor } from '@/types/dice';

// ── Color Mapping ─────────────────────────────────────────────────────────

const DIE_COLORS: Record<DieColor, { bg: string; fg: string; glow: string }> = {
  red:    { bg: '#3A1518', fg: '#E8585A', glow: '#E8585A' },
  blue:   { bg: '#142838', fg: '#3EB89A', glow: '#3EB89A' },
  purple: { bg: '#1E1530', fg: '#7050A8', glow: '#9070D0' },
  teal:   { bg: '#0C2A28', fg: '#2DB8A0', glow: '#2DB8A0' },
  gold:   { bg: '#2A2010', fg: '#D0A030', glow: '#D0A030' },
  white:  { bg: '#1A1A20', fg: '#E8E4DC', glow: '#E8E4DC' },
  black:  { bg: '#0A0A0A', fg: '#C02020', glow: '#FF3030' },
};

// ── Texture Cache ─────────────────────────────────────────────────────────

const textureCache = new Map<string, THREE.CanvasTexture>();

function getCacheKey(value: number, color: DieColor): string {
  return `${color}_${value}`;
}

// ── Canvas Rendering ──────────────────────────────────────────────────────

const TEXTURE_SIZE = 256;

function renderFaceTexture(value: number, color: DieColor): THREE.CanvasTexture {
  const key = getCacheKey(value, color);
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;

  const colors = DIE_COLORS[color];

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  // Subtle border/bevel
  ctx.strokeStyle = colors.glow + '40';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, TEXTURE_SIZE - 16, TEXTURE_SIZE - 16);

  // Number
  const text = value.toString();
  const fontSize = value >= 10 ? 100 : 120;
  ctx.font = `bold ${fontSize}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow effect
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = colors.fg;
  ctx.fillText(text, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2);

  // Second pass for brightness
  ctx.shadowBlur = 8;
  ctx.fillText(text, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2);
  ctx.shadowBlur = 0;

  // Underline for 6 and 9 disambiguation
  if (value === 6 || value === 9) {
    ctx.fillStyle = colors.fg;
    const underY = TEXTURE_SIZE / 2 + fontSize * 0.4;
    ctx.fillRect(TEXTURE_SIZE / 2 - 20, underY, 40, 4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Get an array of face textures for a die type.
 * Returns textures ordered by face value (index 0 = value 1, etc.)
 */
export function getFaceTextures(sides: number, color: DieColor): THREE.CanvasTexture[] {
  const textures: THREE.CanvasTexture[] = [];
  for (let i = 1; i <= sides; i++) {
    textures.push(renderFaceTexture(i, color));
  }
  return textures;
}

/**
 * Get a single face texture for a specific value.
 */
export function getFaceTexture(value: number, color: DieColor): THREE.CanvasTexture {
  return renderFaceTexture(value, color);
}

/**
 * Render a flat bonus texture (e.g., "+2") instead of a die number.
 */
export function getFlatBonusTexture(value: number, color: DieColor): THREE.CanvasTexture {
  const key = `flat_${color}_${value}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;

  const colors = DIE_COLORS[color];

  ctx.fillStyle = 'transparent';
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const text = `+${value}`;
  ctx.font = `bold 80px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 20;
  ctx.fillStyle = colors.fg;
  ctx.fillText(text, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2);
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

/** Clear all cached textures. */
export function clearTextureCache(): void {
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();
}
