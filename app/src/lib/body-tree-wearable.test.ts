/** Wearable regions (Mike 2026-10-16): things go ON or OVER a body part, never inside beside its organs. */
import { describe, it, expect } from 'vitest';
import { isWearablePart, wearableRegions } from './body-tree';
import { HUMAN_BASELINE_ANATOMY } from './body-damage';
import type { GrowthWorldItem } from '@/types/item';

describe('wearableRegions', () => {
  it('the human baseline offers surface parts only — no brain, tongue, heart or lungs', () => {
    const keys = wearableRegions(HUMAN_BASELINE_ANATOMY).map(r => r.key);
    expect(keys).toEqual(['Body', 'Body/Head', 'Body/Head/Left Eye', 'Body/Head/Right Eye', 'Body/Head/Left Ear', 'Body/Head/Right Ear', 'Body/Torso']);
  });
  it('anatomies saved before the flag existed are filtered by organ name', () => {
    const legacy: GrowthWorldItem = { isBodyPart: true, partName: 'Body', contains: [{ isBodyPart: true, partName: 'Torso', contains: [{ isBodyPart: true, partName: 'Heart' }, { isBodyPart: true, partName: 'Left Lung' }] }] } as GrowthWorldItem;
    expect(wearableRegions(legacy).map(r => r.key)).toEqual(['Body', 'Body/Torso']);
  });
  it('an explicit isInternal hides the part and everything below it', () => {
    expect(isWearablePart({ partName: 'Pouch', isInternal: true })).toBe(false);
    expect(isWearablePart({ partName: 'Left Hand' })).toBe(true);
  });
});
