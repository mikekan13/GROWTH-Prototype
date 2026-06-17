'use client';

/**
 * Campaign clock chip + GM time controls + full calendar editor.
 *
 * Canon: each campaign is a pocket universe whose clock is stored in meta
 * cycles and PRESENTED through the campaign's default timescale/calendar
 * (rulings 2026-06-08 + r-2026-06-09-06 — GMs control how they present
 * time, with a fully customizable calendar at initial release).
 *
 * The chip renders the current local date; clicking it (GM only) opens a
 * CtxMenuPanel popover with quick advances, a custom advance, set-clock,
 * and the calendar editor.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CtxMenuPanel } from '@/components/ui/ContextMenu';
import type { CalendarSpec, LocalDate, TimescaleRecord } from '@/types/time';
import { STANDARD_CALENDAR } from '@/types/time';

interface ClockState {
  currentCycle: number;
  defaultTimescale: TimescaleRecord;
  localDate: LocalDate;
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-terminal), Consolas, monospace' };

export default function CampaignClock({ campaignId, isGM }: { campaignId: string; isGM: boolean }) {
  const [clock, setClock] = useState<ClockState | null>(null);
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customAmount, setCustomAmount] = useState('1');
  const [customUnit, setCustomUnit] = useState<'hour' | 'day' | 'month' | 'year' | 'cycle'>('day');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/clock`);
      if (res.ok) setClock(await res.json());
    } catch { /* silent */ }
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  const advance = async (amount: number, unit: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/clock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, unit }),
      });
      let newDateLabel: string | null = null;
      if (res.ok) {
        try {
          const data = await res.json();
          newDateLabel = data?.localDate?.formatted ?? null;
        } catch { /* swallow */ }
      }
      await refresh();
      // Fire-and-forget observation event so JEWL witnesses manual time
      // advances. See [[jewl-is-the-interface-2026-06-15]].
      if (res.ok) {
        const summary = `GM advanced clock by ${amount} ${unit}${amount === 1 ? '' : 's'}` +
          (newDateLabel ? ` → ${newDateLabel}` : '');
        void fetch(`/api/campaigns/${campaignId}/observation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mutationKind: 'advance-clock',
            targetType: 'campaign',
            targetId: campaignId,
            summary,
          }),
        }).catch(() => { /* best-effort */ });
      }
    } finally { setBusy(false); }
  };

  if (!clock) return null;
  const { localDate } = clock;

  return (
    <div style={{ position: 'relative' }}>
      {/* The chip — current presented date. Gold-framed black bar, terminal type. */}
      <button
        onClick={() => isGM && setOpen(o => !o)}
        title={isGM ? 'Campaign clock — click to advance time' : 'Campaign clock'}
        style={{
          ...mono,
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(255,204,120,0.5)',
          color: '#ffcc78',
          padding: '6px 12px',
          fontSize: 11,
          letterSpacing: '0.08em',
          cursor: isGM ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ opacity: 0.6 }}>⧗</span>
        <span>{localDate.formatted}</span>
        {localDate.holidays.length > 0 && (
          <span style={{ color: '#22ab94' }} title={localDate.holidays.map(h => h.name).join(', ')}>✦ {localDate.holidays[0].name}</span>
        )}
        <span style={{ opacity: 0.4, fontSize: 9 }}>{clock.currentCycle.toFixed(3)} cyc</span>
      </button>

      {/* Advance popover */}
      {open && isGM && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, width: 280 }}>
          <CtxMenuPanel title="Jewl — Advance Time">
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {([['+1 hour', 1, 'hour'], ['+6 hours', 6, 'hour'], ['+1 day', 1, 'day'],
                   ['+1 week', 7, 'day'], ['+1 month', 1, 'month'], ['+1 year', 1, 'year']] as const).map(([label, amt, unit]) => (
                  <button
                    key={label}
                    disabled={busy}
                    onClick={() => advance(amt, unit)}
                    style={{ ...mono, fontSize: 10, padding: '5px 4px', background: 'rgba(34,171,148,0.12)', border: '1px solid rgba(34,171,148,0.4)', color: '#22ab94', cursor: 'pointer' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="number"
                  min={0.001}
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  style={{ ...mono, width: 70, fontSize: 11, padding: '4px 6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
                />
                <select
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value as typeof customUnit)}
                  style={{ ...mono, fontSize: 11, padding: '4px 4px', background: '#000', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}
                >
                  <option value="hour">hours</option>
                  <option value="day">days</option>
                  <option value="month">months</option>
                  <option value="year">{clock.defaultTimescale.unitName}s</option>
                  <option value="cycle">meta cycles</option>
                </select>
                <button
                  disabled={busy}
                  onClick={() => { const n = parseFloat(customAmount); if (n > 0) advance(n, customUnit); }}
                  style={{ ...mono, fontSize: 10, padding: '5px 10px', background: 'linear-gradient(135deg, #ffcc78, #d09f55)', border: '1px solid #ffcc78', color: '#000', fontWeight: 700, cursor: 'pointer' }}
                >
                  GO
                </button>
              </div>
              <button
                onClick={() => { setEditorOpen(true); setOpen(false); }}
                style={{ ...mono, fontSize: 10, padding: '6px', background: 'transparent', border: '1px solid rgba(255,204,120,0.4)', color: '#ffcc78', cursor: 'pointer', letterSpacing: '0.1em' }}
              >
                ⚙ cALENDAR & tIMESCALE
              </button>
            </div>
          </CtxMenuPanel>
        </div>
      )}

      {editorOpen && (
        <CalendarEditor
          campaignId={campaignId}
          timescale={clock.defaultTimescale}
          onClose={() => { setEditorOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Calendar editor — the GM's full presentation control ───────────────────

function CalendarEditor({ campaignId, timescale, onClose }: {
  campaignId: string;
  timescale: TimescaleRecord;
  onClose: () => void;
}) {
  const [name, setName] = useState(timescale.name);
  const [unitName, setUnitName] = useState(timescale.unitName);
  const [unitsPerMetaCycle, setUnitsPerMetaCycle] = useState(String(timescale.unitsPerMetaCycle));
  const [cal, setCal] = useState<CalendarSpec>(timescale.calendar ?? STANDARD_CALENDAR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMonth = (i: number, patch: Partial<{ name: string; days: number }>) => {
    setCal(c => ({ ...c, months: c.months.map((m, j) => j === i ? { ...m, ...patch } : m) }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/timescales/${timescale.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          unitName,
          unitsPerMetaCycle: parseFloat(unitsPerMetaCycle) || 1,
          calendar: cal,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' };
  const lbl: React.CSSProperties = { ...mono, fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', width: 110, textTransform: 'uppercase' };
  const inp: React.CSSProperties = { ...mono, fontSize: 11, padding: '4px 6px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: 560, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <CtxMenuPanel title="Jewl — Calendar & Timescale">
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={row}><span style={lbl}>Name</span><input style={{ ...inp, flex: 1 }} value={name} onChange={e => setName(e.target.value)} /></div>
            <div style={row}>
              <span style={lbl}>Base unit</span>
              <input style={{ ...inp, width: 110 }} value={unitName} onChange={e => setUnitName(e.target.value)} />
              <span style={lbl}>per meta cycle</span>
              <input style={{ ...inp, width: 70 }} type="number" step="0.1" min="0.001" value={unitsPerMetaCycle} onChange={e => setUnitsPerMetaCycle(e.target.value)} />
            </div>
            <div style={row}>
              <span style={lbl}>Hours / day</span>
              <input style={{ ...inp, width: 70 }} type="number" min={1} value={cal.hoursPerDay ?? 24} onChange={e => setCal(c => ({ ...c, hoursPerDay: parseInt(e.target.value) || 24 }))} />
              <span style={lbl}>Epoch year</span>
              <input style={{ ...inp, width: 70 }} type="number" value={cal.epochYear ?? 1} onChange={e => setCal(c => ({ ...c, epochYear: parseInt(e.target.value) || 1 }))} />
              <input style={{ ...inp, width: 90 }} placeholder="era label" value={cal.epochLabel ?? ''} onChange={e => setCal(c => ({ ...c, epochLabel: e.target.value || undefined }))} />
            </div>
            <div style={row}>
              <span style={lbl}>Week days</span>
              <input
                style={{ ...inp, flex: 1 }}
                value={(cal.dayNames ?? []).join(', ')}
                placeholder="Monday, Tuesday, ... (blank = no week cycle)"
                onChange={e => setCal(c => ({ ...c, dayNames: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
              />
            </div>

            {/* Months */}
            <div style={{ ...mono, fontSize: 9, color: '#ffcc78', letterSpacing: '0.15em', marginTop: 4 }}>MONTHS</div>
            {cal.months.map((m, i) => (
              <div key={i} style={row}>
                <input style={{ ...inp, flex: 1 }} value={m.name} onChange={e => setMonth(i, { name: e.target.value })} />
                <input style={{ ...inp, width: 64 }} type="number" min={1} value={m.days} onChange={e => setMonth(i, { days: parseInt(e.target.value) || 1 })} />
                <span style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>days</span>
                <button
                  onClick={() => setCal(c => ({ ...c, months: c.months.filter((_, j) => j !== i) }))}
                  disabled={cal.months.length <= 1}
                  style={{ ...mono, fontSize: 11, color: '#ff6666', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setCal(c => ({ ...c, months: [...c.months, { name: `Month ${c.months.length + 1}`, days: 30 }] }))}
              style={{ ...mono, fontSize: 10, padding: '4px', background: 'rgba(34,171,148,0.12)', border: '1px dashed rgba(34,171,148,0.4)', color: '#22ab94', cursor: 'pointer' }}
            >+ add month</button>

            {/* Holidays */}
            <div style={{ ...mono, fontSize: 9, color: '#ffcc78', letterSpacing: '0.15em', marginTop: 4 }}>HOLIDAYS</div>
            {(cal.holidays ?? []).map((h, i) => (
              <div key={i} style={row}>
                <input style={{ ...inp, flex: 1 }} value={h.name} onChange={e => setCal(c => ({ ...c, holidays: (c.holidays ?? []).map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} />
                <select
                  style={{ ...inp, width: 130, background: '#000' }}
                  value={h.month}
                  onChange={e => setCal(c => ({ ...c, holidays: (c.holidays ?? []).map((x, j) => j === i ? { ...x, month: parseInt(e.target.value) } : x) }))}
                >
                  {cal.months.map((m, mi) => <option key={mi} value={mi + 1}>{m.name}</option>)}
                </select>
                <input style={{ ...inp, width: 56 }} type="number" min={1} value={h.day} onChange={e => setCal(c => ({ ...c, holidays: (c.holidays ?? []).map((x, j) => j === i ? { ...x, day: parseInt(e.target.value) || 1 } : x) }))} />
                <button
                  onClick={() => setCal(c => ({ ...c, holidays: (c.holidays ?? []).filter((_, j) => j !== i) }))}
                  style={{ ...mono, fontSize: 11, color: '#ff6666', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setCal(c => ({ ...c, holidays: [...(c.holidays ?? []), { name: 'New Holiday', month: 1, day: 1 }] }))}
              style={{ ...mono, fontSize: 10, padding: '4px', background: 'rgba(34,171,148,0.12)', border: '1px dashed rgba(34,171,148,0.4)', color: '#22ab94', cursor: 'pointer' }}
            >+ add holiday</button>

            {error && <div style={{ ...mono, fontSize: 10, color: '#ff6666' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={onClose} style={{ ...mono, fontSize: 10, padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>CANCEL</button>
              <button
                onClick={save}
                disabled={saving}
                style={{ ...mono, fontSize: 10, padding: '6px 14px', background: 'linear-gradient(135deg, #ffcc78, #d09f55)', border: '1px solid #ffcc78', color: '#000', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}
              >
                {saving ? 'SAVING…' : 'COMMIT'}
              </button>
            </div>
          </div>
        </CtxMenuPanel>
      </div>
    </div>
  );
}
