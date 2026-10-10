import { describe, it, expect } from 'vitest';
import { pressureDelta, DREAM_PRESSURE_THRESHOLD } from './dream-pressure';

describe('dream pressure', () => {
  it('maps 0..1 salience to Smallville poignancy units and clamps', () => {
    expect(pressureDelta(0)).toBe(0);
    expect(pressureDelta(0.5)).toBe(5);
    expect(pressureDelta(1)).toBe(10);
    expect(pressureDelta(3)).toBe(10);
    expect(pressureDelta(-1)).toBe(0);
  });
  it('threshold defaults to 150 (fifteen maximally salient events)', () => {
    expect(DREAM_PRESSURE_THRESHOLD).toBe(150);
  });
});
