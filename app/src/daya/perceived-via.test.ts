import { describe, it, expect } from 'vitest';
import { decodePerceivedVia, encodePerceivedVia, mergePerceivedVia } from './perceived-via';

describe('perceivedVia codec (D3)', () => {
  it('legacy arrays read as senses with no stored clarity', () => {
    expect(decodePerceivedVia('["sight","hearing"]')).toEqual({ via: ['sight', 'hearing'], clarity: {} });
    expect(decodePerceivedVia('[]')).toEqual({ via: [], clarity: {} });
    expect(decodePerceivedVia('not json')).toEqual({ via: [], clarity: {} });
    expect(decodePerceivedVia(null)).toEqual({ via: [], clarity: {} });
  });

  it('no clarity encodes byte-for-byte as before', () => {
    expect(encodePerceivedVia(['sight'])).toBe('["sight"]');
    expect(encodePerceivedVia(['sight'], {})).toBe('["sight"]');
  });

  it('round-trips clarity, keeping only carried senses and clamping', () => {
    const s = encodePerceivedVia(['sight', 'mind reading'], { sight: 0.5, 'mind reading': 1, hearing: 1 });
    expect(decodePerceivedVia(s)).toEqual({ via: ['sight', 'mind reading'], clarity: { sight: 0.5, 'mind reading': 1 } });
    expect(decodePerceivedVia('{"via":["sight"],"clarity":{"sight":7,"x":"bad"}}')).toEqual({ via: ['sight'], clarity: { sight: 1 } });
  });

  it('merge unions senses; the newer clarity wins per sense', () => {
    expect(mergePerceivedVia({ via: ['sight'], clarity: { sight: 0.5 } }, { via: ['sight', 'hearing'], clarity: { sight: 1, hearing: 0.5 } }))
      .toEqual({ via: ['sight', 'hearing'], clarity: { sight: 1, hearing: 0.5 } });
  });
});
