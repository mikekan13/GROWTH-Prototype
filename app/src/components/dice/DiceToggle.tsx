/**
 * Toggle for enabling/disabling 3D dice animations.
 * Stores preference in localStorage.
 */

'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'growth_dice_3d_enabled';

export function DiceToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setEnabled(stored !== 'false');
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors"
      style={{
        fontFamily: 'Consolas, monospace',
        color: enabled ? '#2DB8A0' : '#6a7a88',
        backgroundColor: enabled ? 'rgba(45,184,160,0.1)' : 'rgba(106,122,136,0.1)',
        border: `1px solid ${enabled ? 'rgba(45,184,160,0.3)' : 'rgba(106,122,136,0.2)'}`,
      }}
      title={enabled ? 'Disable 3D dice animations' : 'Enable 3D dice animations'}
    >
      <span style={{ fontSize: '14px' }}>&#9858;</span>
      <span>3D Dice {enabled ? 'ON' : 'OFF'}</span>
    </button>
  );
}
