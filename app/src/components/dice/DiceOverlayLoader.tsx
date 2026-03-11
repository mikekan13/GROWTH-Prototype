/**
 * Lazy-loaded DiceOverlay wrapper with loading screen.
 *
 * Mount this once in the root layout. Three.js + Cannon-es are eagerly
 * preloaded on browser idle so the first interaction doesn't lag.
 *
 * Shows a full-screen loading overlay while the dice engine initializes
 * (only on pages that have the Relations Canvas).
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

// ── Eager chunk preload ─────────────────────────────────────────────
// Start downloading Three.js + Cannon-es as soon as the browser is idle,
// so the chunk is parsed and ready before the user ever needs dice.

let overlayModule: typeof import('./DiceOverlay') | null = null;
let loadPromise: Promise<typeof import('./DiceOverlay')> | null = null;

function preloadChunk() {
  if (!loadPromise) {
    loadPromise = import('./DiceOverlay').then(m => { overlayModule = m; return m; });
  }
  return loadPromise;
}

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(() => preloadChunk());
  } else {
    setTimeout(() => preloadChunk(), 200);
  }
}

// ── Pages that use the Relations Canvas ─────────────────────────────
function isCanvasPage(pathname: string): boolean {
  // /campaign/[id] and /watcher/campaign/[id] have the canvas
  return /^\/(campaign|watcher\/campaign)\/[^/]+$/.test(pathname);
}

// ── Component ───────────────────────────────────────────────────────

export function DiceOverlayLoader() {
  const pathname = usePathname();
  const onCanvas = isCanvasPage(pathname);

  const [Component, setComponent] = useState<React.ComponentType<{ onReady?: () => void }> | null>(
    () => overlayModule ? overlayModule.DiceOverlay : null,
  );
  const [chunkLoaded, setChunkLoaded] = useState(!!overlayModule);
  const [engineReady, setEngineReady] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [fadingOut, setFadingOut] = useState(false);

  // Load the chunk
  useEffect(() => {
    if (Component) return;
    preloadChunk().then(m => {
      setComponent(() => m.DiceOverlay);
      setChunkLoaded(true);
    });
  }, [Component]);

  // Callback when DiceOverlay finishes initializing the 3D engine
  const handleReady = useCallback(() => {
    // Brief fade-out before removing the loading screen
    setFadingOut(true);
    fadeTimerRef.current = setTimeout(() => setEngineReady(true), 400);
  }, []);

  useEffect(() => () => clearTimeout(fadeTimerRef.current), []);

  // Show loading screen: only on canvas pages, while chunk or engine is loading
  const showLoading = onCanvas && !engineReady;

  return (
    <>
      {Component && <Component onReady={handleReady} />}

      {showLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'black',
            transition: 'opacity 0.4s ease-out',
            opacity: fadingOut ? 0 : 1,
            pointerEvents: fadingOut ? 'none' : 'auto',
          }}
        >
          {/* Ambient glow */}
          <div
            style={{
              position: 'absolute',
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(112,80,168,0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* Dice icon — animated */}
          <div
            style={{
              fontSize: '48px',
              marginBottom: '24px',
              animation: 'spin-slow 3s linear infinite',
              filter: 'drop-shadow(0 0 20px rgba(208,160,48,0.4))',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
              {/* D20-inspired icosahedron silhouette */}
              <polygon points="50,5 95,35 80,90 20,90 5,35" stroke="#D0A030" strokeWidth="2" fill="none" opacity="0.8" />
              <polygon points="50,5 80,90 20,90" stroke="#7050A8" strokeWidth="1.5" fill="none" opacity="0.5" />
              <line x1="5" y1="35" x2="80" y2="90" stroke="#7050A8" strokeWidth="1" opacity="0.3" />
              <line x1="95" y1="35" x2="20" y2="90" stroke="#7050A8" strokeWidth="1" opacity="0.3" />
              <line x1="5" y1="35" x2="95" y2="35" stroke="#D0A030" strokeWidth="1" opacity="0.4" />
            </svg>
          </div>

          {/* Status text */}
          <div
            className="font-[Consolas,monospace]"
            style={{
              color: '#D0A030',
              fontSize: '14px',
              letterSpacing: '0.15em',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#7050A8' }}>{'[ '}</span>
              {!chunkLoaded ? 'Downloading dice engine' : 'Initializing physics'}
              <span className="animate-pulse">...</span>
              <span style={{ color: '#7050A8' }}>{' ]'}</span>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.3em' }}>
              THREE.js + CANNON-es
            </div>
          </div>

          {/* Progress bar */}
          <div
            style={{
              marginTop: '20px',
              width: '200px',
              height: '2px',
              background: 'rgba(112,80,168,0.2)',
              borderRadius: '1px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #7050A8, #D0A030)',
                borderRadius: '1px',
                animation: 'loading-bar 2s ease-in-out infinite',
              }}
            />
          </div>

          {/* Inline keyframes */}
          <style>{`
            @keyframes spin-slow {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes loading-bar {
              0% { width: 0%; margin-left: 0%; }
              50% { width: 60%; margin-left: 20%; }
              100% { width: 0%; margin-left: 100%; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
