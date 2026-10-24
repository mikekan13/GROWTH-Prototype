"use client";

/**
 * TableSpeakBar — the TABLE tab's input row.
 *
 * Mike 2026-09-26: "The system shouldn't need a tab switcher. It should
 * pick up from normal prose." One box. The GM types tabletop prose —
 * narration, and speech in quotes (or `Ruth: …`) — and the server picks up
 * what's what: narration becomes canon, each quoted line becomes dialogue
 * attributed from the prose, and every awake DAYA character at the table
 * lives it through the murky mirror. Their responses arrive back in the
 * same feed. Infra states (core warming/offline) show here for the GM
 * only, never in the record.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface RosterCharacter {
  id: string;
  name: string;
}

/** Everyone at the table and who plays them (GET /table `beings`). */
interface TableBeing {
  id: string;
  name: string;
  /** The being runs the loop (DayaEntity ACTIVE). Off = the Watcher voices it. */
  awake: boolean;
  /** Has a DayaEntity at all; only a wrapped character can be woken. */
  wrapped: boolean;
}

interface ReconTicket {
  id: string;
  status: string;
  kinds: string[];
  summary: string;
  question: string;
  plan: Array<{ kind: string; name: string; matchId: string | null; matchName: string | null; baseKrma: number }>;
  estimateKrma: number;
  fluidKrma: number;
  message: string;
}

interface ProseResponse {
  /** JEWL stopped the table — answer him (continue = improvising; take it back = mistake). */
  held?: ReconTicket;
  canonEventId: string | null;
  /** Split loop (U2c-3): typed lines that were NOT recorded and NOT heard by
   *  beings — out-of-character asides, check calls. The GM must see these, or
   *  a dropped line looks like the table swallowed the narration. */
  ignored?: Array<{ kind: string; text: string }>;
  dialogue: Array<{ canonEventId: string; speakerId: string | null; speakerLabel: string; text: string }>;
  narration: string | null;
  responses: Array<{
    characterId: string;
    characterName: string;
    status: 'ok' | 'disabled' | 'dormant' | 'core_offline' | 'warming';
    actionKind?: string;
    detail?: string;
  }>;
}

type CoreStatus = 'unknown' | 'ready' | 'warming' | 'offline' | 'disabled';

export default function TableSpeakBar({
  campaignId,
  onEvent,
}: {
  campaignId: string;
  onEvent?: () => void;
}) {
  const [dayaActive, setDayaActive] = useState<RosterCharacter[]>([]);
  const [beings, setBeings] = useState<TableBeing[]>([]);
  const [toggling, setToggling] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [coreStatus, setCoreStatus] = useState<CoreStatus>('unknown');
  const [note, setNote] = useState<string | null>(null);
  /** Lines the last send dropped on purpose (see ProseResponse.ignored). Cleared on the next send. */
  const [ignored, setIgnored] = useState<string[] | null>(null);
  const [held, setHeld] = useState<ReconTicket | null>(null);
  const [answering, setAnswering] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Roster on mount — whom to warm, who is awake, and who the Watcher voices.
  const loadRoster = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/table`);
      if (!res.ok) return;
      const data = (await res.json()) as { npcs: RosterCharacter[]; dayaActive: RosterCharacter[]; beings?: TableBeing[] };
      setDayaActive(data.dayaActive);
      setBeings(data.beings ?? []);
    } catch { /* silent */ }
  }, [campaignId]);
  useEffect(() => { void loadRoster(); }, [loadRoster]);

  /** Awake ↔ voiced by the Watcher: DayaEntity ACTIVE ↔ DORMANT, which is what the being loop reads. */
  async function toggleBeing(b: TableBeing) {
    if (!b.wrapped || toggling) return;
    setToggling(b.id);
    try {
      const res = await fetch(`/api/characters/${b.id}/daya/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: b.awake ? 'DORMANT' : 'ACTIVE' }),
      });
      if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; setNote(j.error ?? `Could not switch ${b.name}`); return; }
      await loadRoster();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(null);
    }
  }

  // Warm the DAYA core as soon as the table opens — a serverless cold start
  // takes minutes; get it moving before the GM finishes typing.
  useEffect(() => {
    const target = dayaActive[0];
    if (!target) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollWarm() {
      try {
        const res = await fetch(`/api/characters/${target.id}/daya/warm`, { method: 'POST' });
        const json = (await res.json()) as { status: CoreStatus };
        if (cancelled) return;
        setCoreStatus(json.status ?? 'offline');
        if (json.status === 'warming') timer = setTimeout(() => void pollWarm(), 4000);
      } catch {
        if (!cancelled) setCoreStatus('offline');
      }
    }

    void pollWarm();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dayaActive]);

  async function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || sending || held) return;
    setValue('');
    await send(trimmed, null);
  }

  async function send(message: string, confirmTicketId: string | null) {
    setNote(null);
    setIgnored(null);
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmTicketId ? { message, confirmTicketId } : { message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote(json.error ?? 'Failed to send');
        setValue(message);
        return;
      }
      const result = json as ProseResponse;
      if (result.held) {
        // JEWL caught it: nothing was written. The words wait in the box until the Watcher answers.
        setHeld(result.held);
        return;
      }
      // A being that only LISTENED answers ok with detail 'listening' — that says
      // nothing about its core, so it must not flip the indicator to ready; the
      // first real ask then reports warming correctly.
      setCoreStatus((prev) => (result.responses.some((r) => r.status === 'ok' && r.detail !== 'listening') ? 'ready' : prev));
      if (result.ignored && result.ignored.length > 0) setIgnored(result.ignored.map((u) => u.text));
      const notes: string[] = [];
      const unattributed = result.dialogue.filter((d) => !d.speakerId);
      if (unattributed.length > 0) {
        notes.push(`recorded as spoken by ${unattributed.map((d) => d.speakerLabel).join(', ')}`);
      }
      for (const r of result.responses) {
        if (r.status === 'ok') continue;
        notes.push(
          r.status === 'warming'
            ? `${r.characterName} is still coming awake — say it again in a moment`
            : r.status === 'core_offline'
              ? `${r.characterName}'s core is unreachable (${r.detail ?? 'L1 offline'})`
              : r.status === 'dormant'
                ? `${r.characterName} is dormant`
                : `DAYA disabled`,
        );
      }
      if (notes.length > 0) setNote(notes.join(' · '));
      onEvent?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // The Watcher answers JEWL's popup.
  async function answerJewl(action: 'confirm' | 'dismiss') {
    if (!held || answering) return;
    setAnswering(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ticketId: held.id }),
      });
      const json = await res.json();
      if (!res.ok) { setNote(json.error ?? 'JEWL did not get that'); return; }
      const ticket = json.ticket as ReconTicket & { created?: Array<{ kind: string; name: string }>; moved?: string[]; bridge?: { elapsedMinutes: number; stepEventIds: string[] } | null; refusedReason?: string };
      const message = held.message;
      setHeld(null);
      if (action === 'dismiss') { setValue(message); inputRef.current?.focus(); return; }
      if (ticket.status === 'REFUSED') { setNote(ticket.refusedReason ?? 'The world cannot afford this.'); setValue(message); return; }
      const spun = (ticket.created ?? []).map((c) => c.name).join(', ');
      const moved = (ticket.moved ?? []).join(', ');
      const bridged = ticket.bridge ? `; the sim bridged the jump (${ticket.bridge.elapsedMinutes} min, ${ticket.bridge.stepEventIds.length} steps)` : '';
      if (spun || moved) setNote(`JEWL spun up ${spun || 'nothing new'}${moved ? `; ${moved} now there` : ''}${bridged} — holding ${ticket.estimateKrma} KRMA until it sticks`);
      await send(message, ticket.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setAnswering(false);
    }
  }

  const awake = dayaActive.map((d) => d.name).join(', ');

  // Look: the approved drawer mockup (2026-10-07 v7) — off-white bar under a
  // black rule; JEWL's held question on the book's grey aside bar (p 64);
  // white input with a navy rule; navy/gold Bebas buttons. Behaviour unchanged.
  const mono = 'var(--font-terminal), Consolas, monospace';
  const bebas = 'var(--font-bebas-neue), Bebas Neue, sans-serif';
  const strip: React.CSSProperties = { fontFamily: mono, fontSize: 12, lineHeight: 1.5, margin: '0 0 6px' };
  return (
    <div style={{ flex: 'none', backgroundColor: '#fafaf8', borderTop: '3px solid #000', padding: '8px 10px 10px' }}>
      {/* JEWL's catch — the table holds until the Watcher answers (Mike 09-26) */}
      {held && (
        <div data-jewl-held style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: mono, fontWeight: 700, fontSize: 13, lineHeight: 1.55 }}>
              <span style={{ background: '#383837', color: '#f5f4ef', padding: '1px 5px', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' }}>[jEWL]: {held.question}</span>
            </p>
            <button onClick={() => void answerJewl('confirm')} disabled={answering} title="We're going somewhere new — JEWL spins it up" style={{ fontFamily: bebas, fontSize: 18, letterSpacing: '0.05em', height: 36, padding: '3px 10px 0', border: 0, whiteSpace: 'nowrap', background: '#002f6c', color: '#ffcc78', cursor: 'pointer' }}>
              {answering ? '…' : 'New'}
            </button>
            <button onClick={() => void answerJewl('dismiss')} disabled={answering} title="My mistake — take it back" style={{ fontFamily: bebas, fontSize: 18, letterSpacing: '0.05em', height: 36, padding: '3px 10px 0', border: 0, whiteSpace: 'nowrap', background: 'none', color: '#002f6c', boxShadow: 'inset 0 0 0 2px #002f6c', cursor: 'pointer' }}>
              My mistake
            </button>
          </div>
          {held.plan.length > 0 && (
            <div style={{ ...strip, margin: '4px 0 0', color: '#393937' }}>
              {held.plan.map((p) => (p.matchId ? `${p.name} → ${p.matchName} (already here)` : `${p.name} → new ${p.kind}`)).join(' · ')}
              {held.estimateKrma > 0 && ` · hold ${held.estimateKrma} of ${held.fluidKrma} fluid KRMA`}
            </div>
          )}
        </div>
      )}
      {/* Who plays whom (Mike 2026-10-17: the AI played Kristopher, whom Mike voices).
          ● awake = the being lives it; ○ voiced = the Watcher speaks for it. Tap to switch. */}
      {beings.length > 0 && (
        <div data-table-beings style={{ ...strip, display: 'flex', flexWrap: 'wrap', gap: '4px 8px', alignItems: 'center', color: '#393937' }}>
          {beings.map((b) => (
            <button
              key={b.id}
              type="button"
              data-no-hold
              disabled={!b.wrapped || toggling === b.id}
              onClick={() => void toggleBeing(b)}
              title={!b.wrapped ? `${b.name} has no being yet (wrap it first)` : b.awake ? `${b.name} is awake — the being plays it. Tap: you voice it.` : `You voice ${b.name}. Tap: wake the being.`}
              style={{
                fontFamily: mono, fontSize: 12, lineHeight: 1.4, padding: '1px 7px', border: 0, cursor: b.wrapped ? 'pointer' : 'default',
                background: b.awake ? '#002f6c' : 'transparent', color: b.awake ? '#ffcc78' : '#002f6c',
                boxShadow: b.awake ? undefined : 'inset 0 0 0 1.5px #002f6c', opacity: b.wrapped ? 1 : 0.45,
              }}
            >
              {toggling === b.id ? '…' : b.awake ? '● ' : '○ '}{b.name}{!b.awake && b.wrapped ? ' · voiced by you' : ''}
            </button>
          ))}
        </div>
      )}
      {/* GM-only status strip — infra truth, never part of the table record */}
      {(note || coreStatus === 'warming' || sending) && (
        <div style={{ ...strip, color: '#7a4a00' }}>
          {sending
            ? `The table is responding…${coreStatus !== 'ready' ? ' (core warming from cold, first response can take minutes)' : ''}`
            : note ?? 'The core is warming up from a cold start…'}
        </div>
      )}
      {/* Lines the table did not hear (out-of-character asides, check calls):
          shown quietly so a dropped line never looks swallowed; clears on the next send. */}
      {ignored && ignored.length > 0 && !sending && (
        <div data-not-heard style={{ ...strip, fontStyle: 'italic', color: '#4a5560' }}>
          not heard: {ignored.map((t) => (t.length > 60 ? t.slice(0, 57) + '…' : t)).join(' · ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <textarea
          ref={inputRef}
          value={value}
          rows={2}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={awake ? `Narrate · "speech" · Name: line — ${awake} will live it` : 'Narrate · "speech" · Name: line — no one is awake yet'}
          title="Shift+Enter for a new line"
          disabled={sending || !!held}
          // 16px below md: anything smaller makes iOS zoom the page when the GM taps in to narrate.
          className="text-[16px] md:text-[14px]"
          style={{
            flex: 1, minWidth: 0, height: 48, resize: 'none', outline: 0,
            fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif', lineHeight: 1.4,
            color: '#000', backgroundColor: '#fff', border: 0, borderLeft: '4px solid #002f6c', padding: '6px 8px',
          }}
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={sending || !!held || !value.trim()}
          style={{
            width: 68, minHeight: 36, border: 0, cursor: 'pointer',
            fontFamily: bebas, fontSize: 22, letterSpacing: '0.06em',
            backgroundColor: '#002f6c', color: '#ffcc78',
            opacity: sending || !!held || !value.trim() ? 0.55 : 1,
          }}
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
