import { describe, it, expect } from 'vitest';
import { lodForZoom, folderLabelSize, depthHeaderFill, depthPrefix, locationDepths, LOD_TUNING, DEPTH_HEADER } from './canvas-lod';

describe('semantic zoom levels', () => {
  it('near when zoomed in, mid in the middle, far when zoomed out', () => {
    expect(lodForZoom(1)).toBe('near');
    expect(lodForZoom(LOD_TUNING.mid)).toBe('mid');
    expect(lodForZoom(LOD_TUNING.far)).toBe('far');
    expect(lodForZoom(6)).toBe('far');
  });
  it('folder labels grow with zoom and cap', () => {
    expect(folderLabelSize(1)).toBe(LOD_TUNING.labelBase);
    expect(folderLabelSize(3.2)).toBe(72);
    expect(folderLabelSize(6)).toBe(LOD_TUNING.labelBase * LOD_TUNING.labelMaxScale);
  });
});

describe('depth encoding', () => {
  it('roots are deep blue with no prefix; rooms lighten and gain one ▸ per level', () => {
    const parentOf = new Map([['apt', 'arms'], ['arms', 'block'], ['main', 'apt'], ['bath', 'apt']]);
    const d = locationDepths(parentOf);
    expect(d.get('block')).toBe(0);
    expect(d.get('arms')).toBe(1);
    expect(d.get('apt')).toBe(2);
    expect(d.get('main')).toBe(3);
    expect(depthHeaderFill(0)).toBe(DEPTH_HEADER[0]);
    expect(depthHeaderFill(3)).toBe(DEPTH_HEADER[3]);
    expect(depthHeaderFill(99)).toBe(DEPTH_HEADER[DEPTH_HEADER.length - 1]);
    expect(depthPrefix(0)).toBe('');
    expect(depthPrefix(3)).toBe('▸▸▸ ');
  });
  it('a cycle does not hang', () => {
    const d = locationDepths(new Map([['a', 'b'], ['b', 'a']]));
    expect(d.get('a')).toBeLessThanOrEqual(12);
  });
});
