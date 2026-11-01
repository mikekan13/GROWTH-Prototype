"use client";

import React from 'react';

/**
 * Six-dot grip shown inside a card's `data-drag-grip` header. Visible ONLY on
 * touch (coarse pointer) so a phone user knows where to put a finger for a
 * direct drag; hidden for mouse (rule in globals.css).
 */
export function DragGripGlyph({ style }: { style?: React.CSSProperties }) {
  return (
    <span className="drag-grip-glyph" aria-hidden style={style}>
      <i /><i /><i /><i /><i /><i />
    </span>
  );
}
