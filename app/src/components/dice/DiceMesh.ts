/**
 * Dice Mesh Factory — Creates Three.js meshes with numbers ON each face.
 *
 * Each die is a colored polyhedron with small number planes positioned
 * flush on every face. Numbers are canvas-rendered textures on tiny planes
 * aligned to each face normal.
 *
 * D4 is special: numbers appear near each vertex on the 3 adjacent faces.
 * The result is the number at the top point (vertex), not a face.
 *
 * Face normals / vertex directions are precomputed for snap-to-flat after settle.
 */

import * as THREE from 'three';
import type { DieType, DieColor } from '@/types/dice';

// ── Color Mapping ─────────────────────────────────────────────────────────

const DIE_BODY_COLORS: Record<DieColor, { base: number; emissive: number; edgeHex: number }> = {
  red:    { base: 0x7A1A1A, emissive: 0x300808, edgeHex: 0xE8585A },
  blue:   { base: 0x1A2E6A, emissive: 0x0C1430, edgeHex: 0x4080D0 },
  purple: { base: 0x3A1868, emissive: 0x1A0C30, edgeHex: 0x9070D0 },
  teal:   { base: 0x126858, emissive: 0x083028, edgeHex: 0x2DB8A0 },
  gold:   { base: 0x6A5818, emissive: 0x352C0C, edgeHex: 0xD0A030 },
  white:  { base: 0xD8D0C0, emissive: 0x1A1810, edgeHex: 0x888070 },
  black:  { base: 0x121212, emissive: 0x180404, edgeHex: 0xC02020 },
};

// ── Number Texture Rendering ──────────────────────────────────────────────

const numberTextureCache = new Map<string, THREE.CanvasTexture>();

// Gold for settled highlight — matches KRMA identity, pops on every die
const SETTLE_HIGHLIGHT_COLOR = '#D0A030';

type HighlightStyle = 'gold' | 'red' | 'green';

const HIGHLIGHT_COLORS: Record<HighlightStyle, { fill: string; shadow: string }> = {
  gold:  { fill: '#D0A030', shadow: 'rgba(0,0,0,0.8)' },
  red:   { fill: '#FF4444', shadow: 'rgba(100,0,0,0.8)' },
  green: { fill: '#44FF66', shadow: 'rgba(0,60,0,0.8)' },
};

function renderNumberTexture(value: number, highlight: false | HighlightStyle = false): THREE.CanvasTexture {
  const prefix = highlight || 'white';
  const key = `${prefix}_${value}`;
  const cached = numberTextureCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const text = value.toString();
  // Consistent font size: 140 for all, slightly smaller for 2-digit
  const fontSize = value >= 10 ? 130 : 150;
  ctx.font = `${fontSize}px 'Bebas Neue', 'Impact', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (highlight) {
    const colors = HIGHLIGHT_COLORS[highlight];
    ctx.shadowColor = colors.shadow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = colors.fill;
    ctx.fillText(text, size / 2, size / 2);
    ctx.shadowBlur = 3;
    ctx.fillText(text, size / 2, size / 2);
    ctx.shadowBlur = 0;
  } else {
    // Shadow for readability on any color die
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, size / 2, size / 2);

    // Second pass, sharper
    ctx.shadowBlur = 4;
    ctx.fillText(text, size / 2, size / 2);
    ctx.shadowBlur = 0;
  }

  // Underline for 6 and 9
  if (value === 6 || value === 9) {
    const fillColor = highlight ? HIGHLIGHT_COLORS[highlight].fill : '#FFFFFF';
    const y = size / 2 + fontSize * 0.35;
    ctx.fillStyle = fillColor;
    ctx.fillRect(size / 2 - 28, y, 56, 5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  numberTextureCache.set(key, texture);
  return texture;
}

/** Get a highlighted number texture for settle display. Style determines color. */
export function getHighlightTexture(value: number, style: HighlightStyle = 'gold'): THREE.CanvasTexture {
  return renderNumberTexture(value, style);
}

/** Get the normal (white) number texture. */
export function getNormalTexture(value: number): THREE.CanvasTexture {
  return renderNumberTexture(value, false);
}

/** Get the mystery "?" texture shown while dice are rolling. */
let mysteryTextureCache: THREE.CanvasTexture | null = null;
export function getMysteryTexture(): THREE.CanvasTexture {
  if (mysteryTextureCache) return mysteryTextureCache;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const fontSize = 150;
  ctx.font = `${fontSize}px 'Bebas Neue', 'Impact', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('?', size / 2, size / 2);
  ctx.shadowBlur = 4;
  ctx.fillText('?', size / 2, size / 2);
  ctx.shadowBlur = 0;

  mysteryTextureCache = new THREE.CanvasTexture(canvas);
  mysteryTextureCache.needsUpdate = true;
  return mysteryTextureCache;
}

/**
 * Glitch-stream textures: teal-tinted with distortion tearing.
 * Pre-generated pool — sampled randomly at runtime (no per-frame canvas work).
 */
const GLITCH_CHARS = '#!?*$%&@Ξ∆ΩΨ';
const GLITCH_POOL_SIZE = 16; // pre-rendered symbol variants
const glitchSymbolPool: THREE.CanvasTexture[] = [];
const glitchNumberPool = new Map<number, THREE.CanvasTexture[]>(); // 2 variants per number
const GLITCH_NUMBER_VARIANTS = 3;

function renderGlitchTexture(char: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const fontSize = char.length > 1 ? 110 : 150;
  ctx.font = `${fontSize}px 'Bebas Neue', 'Impact', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw the base character (teal)
  ctx.shadowColor = 'rgba(45, 184, 160, 0.8)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#2DB8A0';
  ctx.fillText(char, size / 2, size / 2);
  ctx.shadowBlur = 0;

  // ── Distortion tearing ──
  const tearCount = 2 + Math.floor(Math.random() * 3);
  for (let t = 0; t < tearCount; t++) {
    const y = Math.floor(Math.random() * size);
    const h = 3 + Math.floor(Math.random() * 15);
    const shift = (Math.random() - 0.5) * 30;
    const strip = ctx.getImageData(0, y, size, Math.min(h, size - y));
    ctx.putImageData(strip, Math.round(shift), y);
  }

  // ── Channel split: offset a red ghost copy ──
  const ghostShift = (Math.random() - 0.5) * 8;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#E8585A';
  ctx.fillText(char, size / 2 + ghostShift, size / 2);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // ── Scanlines ──
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < size; y += 4) {
    ctx.fillRect(0, y, size, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Pre-generate the glitch texture pools. Called by prewarmTextures(). */
function prewarmGlitchPool(): void {
  if (glitchSymbolPool.length > 0) return;
  // Symbol pool
  for (let i = 0; i < GLITCH_POOL_SIZE; i++) {
    const char = GLITCH_CHARS[i % GLITCH_CHARS.length];
    glitchSymbolPool.push(renderGlitchTexture(char));
  }
  // Number pool (1-20, multiple variants each)
  for (let v = 1; v <= 20; v++) {
    const variants: THREE.CanvasTexture[] = [];
    for (let i = 0; i < GLITCH_NUMBER_VARIANTS; i++) {
      variants.push(renderGlitchTexture(v.toString()));
    }
    glitchNumberPool.set(v, variants);
  }
}

/** Get a random glitch symbol texture from the pre-generated pool. */
export function getRandomGlitchTexture(): THREE.CanvasTexture {
  if (glitchSymbolPool.length === 0) prewarmGlitchPool();
  return glitchSymbolPool[Math.floor(Math.random() * glitchSymbolPool.length)];
}

/** Get a glitch number texture from the pre-generated pool. */
export function getGlitchNumberTexture(value: number): THREE.CanvasTexture {
  if (glitchNumberPool.size === 0) prewarmGlitchPool();
  const variants = glitchNumberPool.get(value);
  if (!variants) return getRandomGlitchTexture();
  return variants[Math.floor(Math.random() * variants.length)];
}

// ── Face Geometry Helpers ─────────────────────────────────────────────────

interface FaceInfo {
  center: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Compute center + outward normal for each logical face of a geometry.
 * Works for all polyhedra at detail=0.
 */
function computeFaces(geometry: THREE.BufferGeometry, faceCount: number): FaceInfo[] {
  const pos = geometry.getAttribute('position');
  const idx = geometry.getIndex();
  const faces: FaceInfo[] = [];

  if (!idx) {
    // Non-indexed: every 3 vertices = 1 triangle face
    const triCount = pos.count / 3;
    const trisPerFace = triCount / faceCount;
    for (let f = 0; f < faceCount; f++) {
      const center = new THREE.Vector3();
      const normal = new THREE.Vector3();
      let vertCount = 0;

      for (let t = 0; t < trisPerFace; t++) {
        const base = (f * trisPerFace + t) * 3;
        const v0 = new THREE.Vector3(pos.getX(base), pos.getY(base), pos.getZ(base));
        const v1 = new THREE.Vector3(pos.getX(base + 1), pos.getY(base + 1), pos.getZ(base + 1));
        const v2 = new THREE.Vector3(pos.getX(base + 2), pos.getY(base + 2), pos.getZ(base + 2));

        center.add(v0).add(v1).add(v2);
        vertCount += 3;

        if (t === 0) {
          normal.crossVectors(
            new THREE.Vector3().subVectors(v1, v0),
            new THREE.Vector3().subVectors(v2, v0),
          ).normalize();
        }
      }

      center.divideScalar(vertCount);
      faces.push({ center, normal });
    }
    return faces;
  }

  // Indexed geometry
  const totalTris = idx.count / 3;
  const trisPerFace = totalTris / faceCount;

  for (let f = 0; f < faceCount; f++) {
    const center = new THREE.Vector3();
    const normal = new THREE.Vector3();
    let vertCount = 0;

    for (let t = 0; t < trisPerFace; t++) {
      const triIdx = f * trisPerFace + t;
      const i0 = idx.getX(triIdx * 3);
      const i1 = idx.getX(triIdx * 3 + 1);
      const i2 = idx.getX(triIdx * 3 + 2);

      const v0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
      const v1 = new THREE.Vector3(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
      const v2 = new THREE.Vector3(pos.getX(i2), pos.getY(i2), pos.getZ(i2));

      center.add(v0).add(v1).add(v2);
      vertCount += 3;

      if (t === 0) {
        normal.crossVectors(
          new THREE.Vector3().subVectors(v1, v0),
          new THREE.Vector3().subVectors(v2, v0),
        ).normalize();
      }
    }

    center.divideScalar(vertCount);
    faces.push({ center, normal });
  }

  return faces;
}

// ── Mesh Result ───────────────────────────────────────────────────────────

export interface DiceMeshResult {
  group: THREE.Group;
  dieType: DieType;
  geometry: THREE.BufferGeometry; // Base geometry for physics shape
  faceNormals: THREE.Vector3[];
  faceCenters: THREE.Vector3[];
  /**
   * For D4: vertex directions (outward from center). Index = vertex/value index.
   * For other dice: undefined (use faceNormals instead).
   */
  vertexDirections?: THREE.Vector3[];
  /** Get quaternion that puts face/vertex `index` pointing up (+Y) */
  getSnapRotation: (index: number) => THREE.Quaternion;
}

// ── Create Number Planes on Faces ─────────────────────────────────────────

function addFaceNumbers(
  group: THREE.Group,
  faces: FaceInfo[],
  values: number[],
  planeSize: number,
  mystery = false,
): void {
  for (let i = 0; i < faces.length; i++) {
    const { center, normal } = faces[i];
    const value = values[i];

    const texture = mystery ? getMysteryTexture() : renderNumberTexture(value);
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
    const plane = new THREE.Mesh(planeGeo, planeMat);

    // Position slightly above face center along normal (avoid z-fighting)
    plane.position.copy(center).addScaledVector(normal, 0.02);

    // Orient plane to face outward along normal
    const target = center.clone().add(normal);
    plane.lookAt(target);

    // Tag for settle highlight lookup
    plane.userData = { numberPlane: true, faceIndex: i, value };

    group.add(plane);
  }
}

// ── D4 Vertex Numbers ────────────────────────────────────────────────────

/**
 * Extract the 4 unique vertices of a TetrahedronGeometry.
 */
function getTetrahedronVertices(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const pos = geometry.getAttribute('position');
  const tolerance = 0.001;
  const verts: THREE.Vector3[] = [];

  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    let found = false;
    for (const existing of verts) {
      if (existing.distanceTo(v) < tolerance) { found = true; break; }
    }
    if (!found) verts.push(v);
  }
  return verts;
}

/**
 * For each face, find which vertex of the tetrahedron is NOT on that face.
 * That opposite vertex's number goes on the face, positioned near the vertex
 * that IS on the face and closest to the opposite vertex's projection.
 *
 * Actually, the standard D4 convention: each face shows 3 numbers (one near
 * each corner). The number at the TOP point (the vertex pointing up) is the
 * result. Each vertex has a number, and that number appears on all 3 adjacent
 * faces near that vertex.
 */
function addD4VertexNumbers(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  faces: FaceInfo[],
  values: number[], // [1, 2, 3, 4] — one per vertex
  planeSize: number,
  mystery = false,
): void {
  const verts = getTetrahedronVertices(geometry);
  const tolerance = 0.1;

  // For each face, find which 3 vertices are on it
  // Then place each vertex's number near that vertex on the face
  const pos = geometry.getAttribute('position');

  for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
    const { center: faceCenter, normal: faceNormal } = faces[faceIdx];

    // Get the 3 raw vertices of this triangle face
    const base = faceIdx * 3; // non-indexed: 3 verts per face
    const faceVerts: THREE.Vector3[] = [];
    for (let vi = 0; vi < 3; vi++) {
      faceVerts.push(new THREE.Vector3(
        pos.getX(base + vi),
        pos.getY(base + vi),
        pos.getZ(base + vi),
      ));
    }

    // For each face vertex, find which unique vertex it matches → get its value
    for (const fv of faceVerts) {
      let vertIdx = 0;
      for (let vi = 0; vi < verts.length; vi++) {
        if (verts[vi].distanceTo(fv) < tolerance) { vertIdx = vi; break; }
      }
      const value = values[vertIdx];

      // Position the number: 45% from face center toward the vertex (pulled away from points)
      const numPos = new THREE.Vector3().lerpVectors(faceCenter, fv, 0.45);
      // Lift slightly above face to avoid z-fighting
      numPos.addScaledVector(faceNormal, 0.03);

      const texture = mystery ? getMysteryTexture() : renderNumberTexture(value);
      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
      const plane = new THREE.Mesh(planeGeo, planeMat);

      plane.position.copy(numPos);
      // Orient plane to face outward along normal, with "up" pointing toward the vertex
      // so the number reads right-side-up from that vertex's perspective
      const upDir = new THREE.Vector3().subVectors(fv, faceCenter).normalize();
      const lookTarget = numPos.clone().add(faceNormal);
      plane.up.copy(upDir);
      plane.lookAt(lookTarget);

      // Tag for settle highlight lookup — vertexIndex maps to die value
      plane.userData = { numberPlane: true, vertexIndex: vertIdx, value };

      group.add(plane);
    }
  }
}

/**
 * Build a D4 with vertex-based numbering.
 * The result is read from the top vertex, not a face.
 */
function buildD4(
  geometry: THREE.BufferGeometry,
  values: number[],
  color: DieColor,
  numberPlaneSize: number,
  mystery = false,
): DiceMeshResult {
  const colors = DIE_BODY_COLORS[color];

  // Die body
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colors.base,
    emissive: colors.emissive,
    roughness: 0.3,
    metalness: 0.15,
    flatShading: true,
  });
  const bodyMesh = new THREE.Mesh(geometry, bodyMat);
  bodyMesh.castShadow = true;

  // Edges
  const edgesGeo = new THREE.EdgesGeometry(geometry, 12);
  const edgesMat = new THREE.LineBasicMaterial({
    color: colors.edgeHex,
    transparent: true,
    opacity: 0.5,
  });
  const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);

  // Compute face info (still needed for number plane orientation)
  const faces = computeFaces(geometry, 4);
  const faceNormals = faces.map(f => f.normal.clone());
  const faceCenters = faces.map(f => f.center.clone());

  // Vertices and their outward directions (from center)
  const verts = getTetrahedronVertices(geometry);
  const vertexDirections = verts.map(v => v.clone().normalize());

  // Group
  const group = new THREE.Group();
  group.add(bodyMesh);
  group.add(edgesMesh);

  // Add numbers near vertices on each adjacent face
  addD4VertexNumbers(group, geometry, faces, values, numberPlaneSize, mystery);

  const UP = new THREE.Vector3(0, 1, 0);

  return {
    group,
    dieType: 'd4',
    geometry,
    faceNormals,
    faceCenters,
    vertexDirections,
    getSnapRotation: (index: number): THREE.Quaternion => {
      // For D4, snap so vertex `index` points up
      const dir = vertexDirections[index];
      if (!dir) return new THREE.Quaternion();
      return new THREE.Quaternion().setFromUnitVectors(dir, UP);
    },
  };
}

// ── Die Value Layouts ─────────────────────────────────────────────────────
// Standard opposite-face conventions for real dice

function getD4Values(): number[] { return [1, 2, 3, 4]; }
function getD6Values(): number[] { return [1, 6, 2, 5, 3, 4]; } // +X,-X,+Y,-Y,+Z,-Z
function getD8Values(): number[] { return [1, 8, 2, 7, 3, 6, 4, 5]; }
function getD12Values(): number[] {
  // Opposite faces sum to 13
  return [1, 12, 2, 11, 3, 10, 4, 9, 5, 8, 6, 7];
}
function getD20Values(): number[] {
  // Opposite faces sum to 21
  return [1, 20, 2, 19, 3, 18, 4, 17, 5, 16, 6, 15, 7, 14, 8, 13, 9, 12, 10, 11];
}

// ── Factory ───────────────────────────────────────────────────────────────

function buildDie(
  geometry: THREE.BufferGeometry,
  dieType: DieType,
  faceCount: number,
  values: number[],
  color: DieColor,
  numberPlaneSize: number,
  mystery = false,
): DiceMeshResult {
  const colors = DIE_BODY_COLORS[color];

  // Die body
  const bodyMat = new THREE.MeshStandardMaterial({
    color: colors.base,
    emissive: colors.emissive,
    roughness: 0.3,
    metalness: 0.15,
    flatShading: true,
  });
  const bodyMesh = new THREE.Mesh(geometry, bodyMat);
  bodyMesh.castShadow = true;

  // Edges
  const edgesGeo = new THREE.EdgesGeometry(geometry, 12);
  const edgesMat = new THREE.LineBasicMaterial({
    color: colors.edgeHex,
    transparent: true,
    opacity: 0.5,
  });
  const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);

  // Compute face info
  const faces = computeFaces(geometry, faceCount);

  // Group
  const group = new THREE.Group();
  group.add(bodyMesh);
  group.add(edgesMesh);

  // Add number planes on each face
  addFaceNumbers(group, faces, values, numberPlaneSize, mystery);

  // Precompute snap rotations
  const UP = new THREE.Vector3(0, 1, 0);
  const faceNormals = faces.map(f => f.normal.clone());
  const faceCenters = faces.map(f => f.center.clone());

  return {
    group,
    dieType,
    geometry,
    faceNormals,
    faceCenters,
    getSnapRotation: (faceIndex: number): THREE.Quaternion => {
      const normal = faceNormals[faceIndex];
      if (!normal) return new THREE.Quaternion();
      return new THREE.Quaternion().setFromUnitVectors(normal, UP);
    },
  };
}

/**
 * Get the face index for a target value, given the die's value layout.
 */
export function getFaceIndexForValue(dieType: DieType, targetValue: number): number {
  const values = getValuesForDie(dieType);
  const idx = values.indexOf(targetValue);
  return idx >= 0 ? idx : 0;
}

/**
 * Get the value for a given face index.
 */
export function getValueForFaceIndex(dieType: DieType, faceIndex: number): number {
  const values = getValuesForDie(dieType);
  return values[faceIndex] ?? 1;
}

/**
 * Find which face/vertex index is most aligned with +Y given the die's current quaternion.
 * For D4: checks vertex directions (top point = result).
 * For other dice: checks face normals (top face = result).
 */
export function readUpFaceIndex(meshResult: DiceMeshResult, worldQuat: THREE.Quaternion): number {
  const up = new THREE.Vector3(0, 1, 0);
  let bestDot = -Infinity;
  let bestIndex = 0;

  // D4: read from vertex directions
  if (meshResult.vertexDirections) {
    for (let i = 0; i < meshResult.vertexDirections.length; i++) {
      const worldDir = meshResult.vertexDirections[i].clone().applyQuaternion(worldQuat);
      const dot = worldDir.dot(up);
      if (dot > bestDot) {
        bestDot = dot;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  // Other dice: read from face normals
  for (let i = 0; i < meshResult.faceNormals.length; i++) {
    const worldNormal = meshResult.faceNormals[i].clone().applyQuaternion(worldQuat);
    const dot = worldNormal.dot(up);
    if (dot > bestDot) {
      bestDot = dot;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Read which face/vertex is pointing up (+Y) given the die's current world quaternion.
 * Returns the face value (not the face index).
 */
export function readUpFaceValue(meshResult: DiceMeshResult, worldQuat: THREE.Quaternion): number {
  const bestIndex = readUpFaceIndex(meshResult, worldQuat);
  return getValueForFaceIndex(meshResult.dieType, bestIndex);
}

function getValuesForDie(dieType: DieType): number[] {
  switch (dieType) {
    case 'd4':  return getD4Values();
    case 'd6':  return getD6Values();
    case 'd8':  return getD8Values();
    case 'd12': return getD12Values();
    case 'd20': return getD20Values();
    default:    return getD6Values();
  }
}

// Scale factor — controls overall die size
const S = 1.4;

export function createDieMesh(dieType: DieType, color: DieColor = 'white', mystery = false): DiceMeshResult {
  switch (dieType) {
    case 'd4':
      return buildD4(
        new THREE.TetrahedronGeometry(0.8 * S),
        getD4Values(), color, 0.9 * S, mystery,
      );
    case 'd6':
      return buildDie(
        new THREE.BoxGeometry(0.9 * S, 0.9 * S, 0.9 * S), 'd6', 6,
        getD6Values(), color, 0.9 * S, mystery,
      );
    case 'd8':
      return buildDie(
        new THREE.OctahedronGeometry(0.85 * S), 'd8', 8,
        getD8Values(), color, 0.9 * S, mystery,
      );
    case 'd12':
      return buildDie(
        new THREE.DodecahedronGeometry(0.7 * S), 'd12', 12,
        getD12Values(), color, 0.9 * S, mystery,
      );
    case 'd20':
      return buildDie(
        new THREE.IcosahedronGeometry(0.85 * S), 'd20', 20,
        getD20Values(), color, 0.9 * S, mystery,
      );
    default:
      return buildDie(
        new THREE.BoxGeometry(0.9 * S, 0.9 * S, 0.9 * S), 'd6', 6,
        getD6Values(), color, 0.9 * S, mystery,
      );
  }
}

/**
 * Pre-generate all number textures so the first roll doesn't lag.
 * Call once during initialization (not on the critical path).
 */
/**
 * Pre-generate all textures so rolls don't lag.
 * Spreads work across multiple frames via requestIdleCallback/setTimeout.
 */
export function prewarmTextures(): void {
  // These are fast (cached after first call) — do synchronously
  getMysteryTexture();

  // Spread heavier work across idle frames
  const tasks: (() => void)[] = [];

  // Number textures: 40 total (1-20 × normal + highlight)
  for (let v = 1; v <= 20; v++) {
    tasks.push(() => {
      renderNumberTexture(v, false);
      renderNumberTexture(v, 'gold');
      renderNumberTexture(v, 'red');
      renderNumberTexture(v, 'green');
    });
  }

  // Glitch pools: 16 symbols + 60 number variants
  tasks.push(() => prewarmGlitchPool());

  // Process tasks in batches across frames
  let idx = 0;
  const processBatch = () => {
    const deadline = performance.now() + 4; // 4ms budget per frame
    while (idx < tasks.length && performance.now() < deadline) {
      tasks[idx++]();
    }
    if (idx < tasks.length) {
      requestAnimationFrame(processBatch);
    }
  };
  requestAnimationFrame(processBatch);
}
