/**
 * Lazy-loaded DiceOverlay wrapper.
 *
 * Mount this once in the root layout. Three.js + Cannon-es are only loaded
 * when the first dice roll event fires (dynamic import, no SSR).
 */

'use client';

import dynamic from 'next/dynamic';

const DiceOverlay = dynamic(
  () => import('./DiceOverlay').then(m => ({ default: m.DiceOverlay })),
  { ssr: false },
);

export function DiceOverlayLoader() {
  console.log('[DICE LOADER] mounted');
  return <DiceOverlay />;
}
