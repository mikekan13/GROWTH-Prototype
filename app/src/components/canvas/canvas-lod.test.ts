import { describe, it, expect } from 'vitest';
import { depthHeaderFill, depthPrefix, locationDepths, DEPTH_HEADER } from './canvas-lod';

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
