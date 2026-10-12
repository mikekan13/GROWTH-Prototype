/**
 * BORN ≠ DONE (Mike 2026-10-12): the small "awaiting image" mark on a born
 * character whose official portrait is still to come — the canvas card and
 * the Tapestry list. The rulebook's black highlight bar, amber Terminal type
 * (= needs you). A completeness flag only: the character is ACTIVE and
 * voiceable meanwhile. Renders nothing when not awaiting.
 */
import type { CSSProperties } from 'react';

export function AwaitingImageBadge({ awaiting, size = 'sm', style }: {
  awaiting: boolean | null | undefined;
  /** 'sm' = list rows (phone-first, 10px); 'lg' = canvas card (zoomed out). */
  size?: 'sm' | 'lg';
  style?: CSSProperties;
}) {
  if (!awaiting) return null;
  const lg = size === 'lg';
  return (
    <span
      className="awaiting-image-badge"
      data-awaiting-image
      title="Born — the official portrait is still to come (Appearance ↗). Playable meanwhile."
      style={{
        display: 'inline-block', flex: 'none', whiteSpace: 'nowrap',
        background: '#000', color: '#D07818', borderLeft: `${lg ? 4 : 2}px solid #D07818`,
        fontFamily: 'var(--font-terminal), Consolas, monospace',
        fontSize: lg ? 22 : 10, letterSpacing: '0.1em', lineHeight: 1,
        padding: lg ? '6px 10px' : '3px 6px',
        ...style,
      }}
    >
      AWAITING IMAGE
    </span>
  );
}
