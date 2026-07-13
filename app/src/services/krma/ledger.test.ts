import { describe, it, expect } from 'vitest';
import { computeChecksum } from './ledger';

/**
 * INV-14: the KRMA ledger is an append-only, SHA-256 hash chain. Each row's
 * checksum binds the previous checksum, so tampering with any earlier row
 * cascades and invalidates every downstream link. These tests exercise the
 * pure checksum function that produces that chain (no DB).
 */
describe('ledger hash chain (INV-14)', () => {
  const c1 = computeChecksum(1n, 'walletA', 'walletB', 100n, 'FLUID', 'FUND', '');
  const c2 = computeChecksum(2n, 'walletB', 'walletC', 50n, 'FLUID', 'FUND', c1);
  const c3 = computeChecksum(3n, 'walletC', 'walletD', 25n, 'FLUID', 'FUND', c2);

  it('is deterministic and yields a 64-char sha256 hex digest', () => {
    expect(computeChecksum(1n, 'walletA', 'walletB', 100n, 'FLUID', 'FUND', '')).toBe(c1);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds the previous checksum into each link', () => {
    expect(computeChecksum(2n, 'walletB', 'walletC', 50n, 'FLUID', 'FUND', c1)).toBe(c2);
    // A wrong previous checksum produces a different link.
    expect(computeChecksum(2n, 'walletB', 'walletC', 50n, 'FLUID', 'FUND', 'tampered')).not.toBe(c2);
  });

  it('tampering an earlier tx cascades and breaks every downstream link', () => {
    // Alter tx1's amount 100 -> 999.
    const c1Tampered = computeChecksum(1n, 'walletA', 'walletB', 999n, 'FLUID', 'FUND', '');
    expect(c1Tampered).not.toBe(c1);
    // tx2 recomputed over the tampered predecessor no longer matches the stored chain.
    const c2FromTampered = computeChecksum(2n, 'walletB', 'walletC', 50n, 'FLUID', 'FUND', c1Tampered);
    expect(c2FromTampered).not.toBe(c2);
    // ...and the break propagates to tx3.
    const c3FromTampered = computeChecksum(3n, 'walletC', 'walletD', 25n, 'FLUID', 'FUND', c2FromTampered);
    expect(c3FromTampered).not.toBe(c3);
  });
});
