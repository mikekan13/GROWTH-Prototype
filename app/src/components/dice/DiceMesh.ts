/**
 * Dice Mesh Factory — Creates Three.js meshes with numbers ON each face.
 *
 * Each die is a colored polyhedron with small number planes positioned
 * flush on every face (like Roll20 dice). Numbers are canvas-rendered
 * textures on tiny planes aligned to each face normal.
 *
 * Face normals are precomputed for snap-to-result after physics settle.
 */

import * as THREE from 'three';
import type { DieType, DieColor } from '@/types/dice';

// ── Color Mapping ─────────────────────────────────────────────────────────

const DIE_BODY_COLORS: Record<DieColor, { base: number; emissive: number; edgeHex: number; textColor: string }> = {
  red:    { base: 0x7A1A1A, emissive: 0x300808, edgeHex: 0xE8585A, textColor: '#FFFFFF' },
  blue:   { base: 0x14504A, emissive: 0x082820, edgeHex: 0x3EB89A, textColor: '#FFFFFF' },
  purple: { base: 0x3A1868, emissive: 0x1A0C30, edgeHex: 0x9070D0, textColor: '#FFFFFF' },
  teal:   { base: 0x126858, emissive: 0x083028, edgeHex: 0x2DB8A0, textColor: '#FFFFFF' },
  gold:   { base: 0x6A5818, emissive: 0x352C0C, edgeHex: 0xD0A030, textColor: '#1A1408' },
  white:  { base: 0xD8D0C0, emissive: 0x1A1810, edgeHex: 0x888070, textColor: '#1A1A1A' },
  black:  { base: 0x121212, emissive: 0x180404, edgeHex: 0xC02020, textColor: '#E02020' },
};

// ── Number Texture Rendering ──────────────────────────────────────────────

const numberTextureCache = new Map<string, THREE.CanvasTexture>();

function renderNumberTexture(value: number, textColor: string): THREE.CanvasTexture {
  const key = `${textColor}_${value}`;
  const cached = numberTextureCache.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const text = value.toString();
  const fontSize = value >= 10 ? 56 : 68;
  ctx.font = `bold ${fontSize}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Shadow for readability
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = textColor;
  ctx.fillText(text, size / 2, size / 2);

  // Second pass, sharper
  ctx.shadowBlur = 2;
  ctx.fillText(text, size / 2, size / 2);
  ctx.shadowBlur = 0;

  // Underline for 6 and 9
  if (value === 6 || value === 9) {
    const y = size / 2 + fontSize * 0.38;
    ctx.fillRect(size / 2 - 16, y, 32, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  numberTextureCache.set(key, texture);
  return texture;
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
  faceNormals: THREE.Vector3[];
  /** Get quaternion that puts face `faceIndex` pointing up (+Y) */
  getSnapRotation: (faceIndex: number) => THREE.Quaternion;
}

// ── Create Number Planes on Faces ─────────────────────────────────────────

function addFaceNumbers(
  group: THREE.Group,
  faces: FaceInfo[],
  values: number[],
  textColor: string,
  planeSize: number,
): void {
  for (let i = 0; i < faces.length; i++) {
    const { center, normal } = faces[i];
    const value = values[i];

    const texture = renderNumberTexture(value, textColor);
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

    group.add(plane);
  }
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
  addFaceNumbers(group, faces, values, colors.textColor, numberPlaneSize);

  // Precompute snap rotations
  const UP = new THREE.Vector3(0, 1, 0);
  const faceNormals = faces.map(f => f.normal.clone());

  return {
    group,
    dieType,
    faceNormals,
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

export function createDieMesh(dieType: DieType, color: DieColor = 'white'): DiceMeshResult {
  switch (dieType) {
    case 'd4':
      return buildDie(
        new THREE.TetrahedronGeometry(0.75), 'd4', 4,
        getD4Values(), color, 0.45,
      );
    case 'd6':
      return buildDie(
        new THREE.BoxGeometry(0.9, 0.9, 0.9), 'd6', 6,
        getD6Values(), color, 0.55,
      );
    case 'd8':
      return buildDie(
        new THREE.OctahedronGeometry(0.7), 'd8', 8,
        getD8Values(), color, 0.38,
      );
    case 'd12':
      return buildDie(
        new THREE.DodecahedronGeometry(0.7), 'd12', 12,
        getD12Values(), color, 0.3,
      );
    case 'd20':
      return buildDie(
        new THREE.IcosahedronGeometry(0.7), 'd20', 20,
        getD20Values(), color, 0.28,
      );
    default:
      return buildDie(
        new THREE.BoxGeometry(0.9, 0.9, 0.9), 'd6', 6,
        getD6Values(), color, 0.55,
      );
  }
}
