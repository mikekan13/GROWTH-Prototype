"use client";

/**
 * PLANNING-BOARD CHIPS (TABLE-RHYTHM-DESIGN §3; perception unit 11's inspect chips — Mike approved 2026-10-09).
 * A compact strip above the speak bar: one chip per open intent on the board — who (portrait + name) and what
 * ("inspect the sword · Swordsmanship · DR 12"). Commit = the GM's next move (a check call or table
 * narration): the chips simply leave the board — no timer, no button here.
 *
 *   - Who sees what: the server filters (GET /intents) — a Trailblazer only their own character's chips, the
 *     subject named as their character knows it (PERCEPTION_FEED); the Watcher every chip, in truth.
 *   - Owner: rewrite the words (realigns the subject), name a skill from the sheet or let the system pick, withdraw.
 *   - Watcher: the same on any chip, plus the DR.
 *   - Refresh: the targeted, text-free `board_changed` stream signal (CampaignCanvas → BOARD_CHANGED_EVENT).
 *
 * ORDER pole (rulebook): Bebas gold on Soul-blue name bars, powder-blue strip, off-white chips, plain reading
 * text. Touch: open on `click` (never pointerup); controls carry data-no-hold.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { FeedEntity } from './table-feed/TableFeedRows';

/** Window event: the stream said the planning board moved (CampaignCanvas dispatches it). */
export const BOARD_CHANGED_EVENT = 'growth:board-changed';

/** One chip as GET /api/campaigns/[id]/intents returns it (services/inspection IntentChipView). */
export interface PlanningChipView {
  id: string;
  characterId: string;
  characterName: string;
  subjectLabel: string;
  text: string;
  skillName: string | null;
  skillBy: 'player' | 'gm' | null;
  dr: number | null;
  skills: string[];
  gm: boolean;
}

interface PlanningChipsProps {
  campaignId: string;
  /** Portraits by character id (the TABLE feed's entities). */
  entities?: FeedEntity[];
  /** Harness only: render these instead of fetching. */
  initial?: PlanningChipView[];
}

const BLUE = '#002f6c';
const GOLD = '#ffcc78';
const POWDER = '#CBD9E8';
const PAPER = '#f5f4ef';
const BEBAS = 'var(--font-bebas-neue), Bebas Neue, sans-serif';
const BODY = 'var(--font-comfortaa), Comfortaa, var(--font-roboto), Roboto, sans-serif';

export default function PlanningChips({ campaignId, entities, initial }: PlanningChipsProps) {
  const [chips, setChips] = useState<PlanningChipView[]>(initial ?? []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (initial) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/intents`);
      if (!res.ok) return;
      const data = (await res.json()) as { intents?: PlanningChipView[] };
      setChips(data.intents ?? []);
    } catch { /* keep what we have */ }
  }, [campaignId, initial]);

  useEffect(() => {
    void load();
    const onChanged = () => { void load(); };
    window.addEventListener(BOARD_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BOARD_CHANGED_EVENT, onChanged);
  }, [load]);

  // A committed / withdrawn chip closes its editor.
  useEffect(() => {
    if (openId && !chips.some((c) => c.id === openId)) setOpenId(null);
  }, [chips, openId]);

  const send = useCallback(async (id: string, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/intents/${id}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Could not ${method === 'DELETE' ? 'withdraw' : 'change'} it`);
      }
      if (method === 'DELETE' && res.ok) setOpenId(null);
      await load();
    } catch {
      setError('Could not reach the board');
    } finally {
      setBusy(false);
    }
  }, [campaignId, load]);

  if (!chips.length) return null;
  const portraitOf = (id: string) => entities?.find((e) => e.id === id)?.portrait ?? null;
  const open = chips.find((c) => c.id === openId) ?? null;

  return (
    <div data-planning-chips style={{ flex: 'none', background: POWDER, borderTop: `2px solid ${BLUE}`, padding: '6px 10px 6px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            data-no-hold
            data-planning-chip={c.id}
            aria-expanded={openId === c.id}
            onClick={() => { setError(null); setOpenId(openId === c.id ? null : c.id); }}
            style={{
              flex: 'none', display: 'flex', alignItems: 'stretch', minHeight: 40, maxWidth: 300, padding: 0, cursor: 'pointer',
              border: `2px solid ${BLUE}`, background: PAPER, textAlign: 'left',
              outline: openId === c.id ? `2px solid ${GOLD}` : 'none', outlineOffset: -4,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: BLUE, padding: '0 8px 0 4px' }}>
              <Portrait src={portraitOf(c.characterId)} name={c.characterName} />
              <span style={{ fontFamily: BEBAS, fontSize: 17, letterSpacing: '0.04em', color: GOLD, whiteSpace: 'nowrap' }}>
                {c.characterName.toUpperCase()}
              </span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '2px 8px', minWidth: 0 }}>
              <span style={{ fontFamily: BODY, fontSize: 13, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.text}
              </span>
              <span style={{ fontFamily: BODY, fontSize: 11, color: BLUE, whiteSpace: 'nowrap' }}>
                {c.skillName ?? 'system picks'}{c.dr != null ? ` · DR ${c.dr}` : ''}
              </span>
            </span>
          </button>
        ))}
      </div>

      {open && (
        <ChipEditor key={open.id} chip={open} busy={busy} error={error} onSend={send} />
      )}
    </div>
  );
}

function Portrait({ src, name }: { src: string | null; name: string }) {
  const size = 28;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover', border: `1px solid ${GOLD}` }} />;
  }
  return (
    <span aria-hidden style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${GOLD}`, fontFamily: BEBAS, fontSize: 16, color: GOLD }}>
      {name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

function ChipEditor({ chip, busy, error, onSend }: {
  chip: PlanningChipView;
  busy: boolean;
  error: string | null;
  onSend: (id: string, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) => Promise<void>;
}) {
  const [text, setText] = useState(chip.text);
  const [dr, setDr] = useState(chip.dr != null ? String(chip.dr) : '');
  const skills = chip.skillName && !chip.skills.includes(chip.skillName) ? [chip.skillName, ...chip.skills] : chip.skills;
  const label: React.CSSProperties = { fontFamily: BEBAS, fontSize: 15, letterSpacing: '0.05em', color: GOLD, background: BLUE, padding: '1px 6px', alignSelf: 'flex-start' };
  const field: React.CSSProperties = { height: 40, minWidth: 0, fontSize: 16, fontFamily: BODY, color: '#000', background: '#fff', border: 0, borderLeft: `4px solid ${BLUE}`, padding: '0 8px' };
  const action: React.CSSProperties = { minHeight: 40, padding: '0 10px', border: `2px solid ${BLUE}`, background: BLUE, color: GOLD, fontFamily: BEBAS, fontSize: 17, letterSpacing: '0.05em', cursor: 'pointer' };
  const textChanged = text.trim() && text.trim() !== chip.text;
  const drValue = dr.trim() === '' ? null : Number(dr);
  const drChanged = drValue !== chip.dr && (drValue === null || (Number.isInteger(drValue) && drValue >= 1 && drValue <= 100));

  return (
    <div data-chip-editor style={{ marginTop: 6, padding: 8, background: PAPER, border: `2px solid ${BLUE}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={label}>WHAT</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && textChanged) void onSend(chip.id, 'PATCH', { text: text.trim() }); }}
          aria-label="What the character is about to do"
          data-no-hold
          style={{ ...field, flex: 1 }}
        />
        <button type="button" data-no-hold disabled={busy || !textChanged} onClick={() => void onSend(chip.id, 'PATCH', { text: text.trim() })} style={{ ...action, opacity: textChanged ? 1 : 0.45 }}>
          SET
        </button>
      </div>

      <span style={label}>SKILL</span>
      <select
        value={chip.skillName ?? ''}
        onChange={(e) => void onSend(chip.id, 'PATCH', { skillName: e.target.value || null })}
        disabled={busy}
        aria-label="Skill"
        data-no-hold
        style={field}
      >
        <option value="">Let the system pick</option>
        {skills.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {chip.gm && (<>
        <span style={label}>DR</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={dr}
            placeholder="default"
            onChange={(e) => setDr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && drChanged) void onSend(chip.id, 'PATCH', { dr: drValue }); }}
            aria-label="Difficulty rating"
              data-no-hold
            style={{ ...field, width: 96 }}
          />
          <button type="button" data-no-hold disabled={busy || !drChanged} onClick={() => void onSend(chip.id, 'PATCH', { dr: drValue })} style={{ ...action, opacity: drChanged ? 1 : 0.45 }}>
            SET
          </button>
        </div>
      </>)}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <button type="button" data-no-hold disabled={busy} onClick={() => void onSend(chip.id, 'DELETE')} style={{ ...action, background: PAPER, color: BLUE }}>
          WITHDRAW
        </button>
        {error && <span role="alert" style={{ fontFamily: BODY, fontSize: 12, color: '#000' }}>{error}</span>}
      </div>
    </div>
  );
}
