import { describe, it, expect } from 'vitest';
import { statesHandOver } from './hand-over';

describe('statesHandOver (HW12 2026-10-31)', () => {
  it('reads the lines that changed hands at the door', () => {
    expect(statesHandOver('He slowly hands her the box.')).toBe(true);
    expect(statesHandOver('He finally hands the box to her.')).toBe(true);
    expect(statesHandOver('Violet passes the cash over to Kristopher.')).toBe(true);
    expect(statesHandOver('She gives him a five-dollar bill.')).toBe(true);
  });
  it('leaves reading, staring and knocking alone', () => {
    expect(statesHandOver('He tries to read off the price.')).toBe(false);
    expect(statesHandOver('He stares at her, smiling, as he waits for her to pay.')).toBe(false);
    expect(statesHandOver('He lets out a small sigh as he knocks gently on the door.')).toBe(false);
    expect(statesHandOver('His hand brushes hers as he fully releases the box.')).toBe(false);
  });
});
