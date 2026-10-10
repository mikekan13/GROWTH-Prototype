'use client';

/**
 * UNIT 10 — the Watcher's "view as character" picker (ruling Q6, 2026-10-09: "the GM should probably have
 * an option to change their (feed) to that of any character"). Watcher / ADMIN only, behind the perception
 * feed switch; the server enforces it again (GET /events ?viewAs=).
 *
 * Rulebook ORDER pole (feedback-rulebook-two-poles): a Bebas gold-on-blue label bar beside a plain select —
 * mechanics chrome, stable, small. Phone-first: one row, 36 px targets, the select shrinks before the label.
 * Default = the truth record. The choice is remembered per viewer in localStorage only (viewAsKey).
 */
import React from 'react';

export interface ViewAsCharacter { id: string; name: string; kind: 'character' | 'npc' }

/** Per campaign, per viewer. */
export const viewAsKey = (campaignId: string, userId: string) => `growth:feed-view-as:${campaignId}:${userId}`;

export function readViewAs(campaignId: string, userId: string): string | null {
  try { return window.localStorage.getItem(viewAsKey(campaignId, userId)) || null; } catch { return null; }
}

export function writeViewAs(campaignId: string, userId: string, characterId: string | null): void {
  try {
    if (characterId) window.localStorage.setItem(viewAsKey(campaignId, userId), characterId);
    else window.localStorage.removeItem(viewAsKey(campaignId, userId));
  } catch { /* private window: the choice just isn't remembered */ }
}

const bebas = 'var(--font-bebas-neue), Bebas Neue, sans-serif';
const mono = 'var(--font-terminal), Consolas, monospace';

export default function ViewAsPicker({ characters, value, onChange }: {
  characters: ViewAsCharacter[];
  value: string | null;
  onChange: (characterId: string | null) => void;
}) {
  const pcs = characters.filter((c) => c.kind === 'character');
  const npcs = characters.filter((c) => c.kind === 'npc');
  return (
    <label data-view-as style={{ display: 'flex', alignItems: 'stretch', flex: '0 1 auto', minWidth: 0, height: 36 }}>
      <span style={{
        flex: 'none', display: 'flex', alignItems: 'center', padding: '2px 7px 0',
        background: '#002f6c', color: '#ffcc78', fontFamily: bebas, fontSize: 15, letterSpacing: '0.06em', whiteSpace: 'nowrap',
      }}>
        SEEN BY
      </span>
      <select
        aria-label="View the record as a character"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-[16px] md:text-[14px]"
        style={{
          minWidth: 0, maxWidth: 170, height: 36, padding: '0 4px', border: 0, borderRadius: 0,
          fontFamily: mono, color: '#000', background: value ? '#fff' : '#f5f4ef', boxShadow: 'inset 0 0 0 1.5px #002f6c',
        }}
      >
        <option value="">Truth record</option>
        {pcs.length > 0 && (
          <optgroup label="Characters">
            {pcs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        )}
        {npcs.length > 0 && (
          <optgroup label="NPCs">
            {npcs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        )}
      </select>
    </label>
  );
}
