import { describe, it, expect } from 'vitest';
import { deriveRights, ingredientRef, contentHashOf } from './provenance';

describe('provenance rights derivation', () => {
  it('human act follows the author; ai act follows the table; composite needs both', () => {
    expect(deriveRights({ creatorConsented: true, campaignConsented: false }, 'human').aiTraining).toBe(true);
    expect(deriveRights({ creatorConsented: false, campaignConsented: true }, 'human').aiTraining).toBe(false);
    expect(deriveRights({ creatorConsented: false, campaignConsented: true }, 'ai').aiTraining).toBe(true);
    expect(deriveRights({ creatorConsented: true, campaignConsented: false }, 'composite').aiTraining).toBe(false);
    expect(deriveRights({ creatorConsented: true, campaignConsented: true }, 'composite').aiTraining).toBe(true);
  });
  it('remix/commercial are recorded as unset, never assumed', () => {
    const r = deriveRights({ creatorConsented: true, campaignConsented: true }, 'human');
    expect(r.remix).toBeNull();
    expect(r.commercial).toBeNull();
  });
  it('helpers', () => {
    expect(ingredientRef('character', 'abc')).toBe('character:abc');
    expect(contentHashOf(null)).toBeNull();
    expect(contentHashOf('x')).toBe(contentHashOf('x'));
    expect(contentHashOf({ a: 1 })).not.toBe(contentHashOf({ a: 2 }));
  });
});
