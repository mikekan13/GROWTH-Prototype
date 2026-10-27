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
import React, { useEffect, useRef, useState } from 'react';
import type { JewlTicket } from '@/components/jewl/useJewlHeld';

interface RosterCharacter {
  id: string;
  name: string;
}

interface ProseResponse {
  /** JEWL stopped the table — answer him (continue = improvising; take it back = mistake). */
  held?: JewlTicket;
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
  warmup,
  held = null,
  onHold,
  register,
}: {
  campaignId: string;
  onEvent?: () => void;
  /** Session-start warm-up (2026-10-26): while given, the bar is LOCKED and this ticker stands in its place. */
  warmup?: React.ReactNode;
  /** JEWL's stop (hook + popup live in CampaignTerminal, 2026-10-26): while a ticket is held the box waits. */
  held?: JewlTicket | null;
  /** A /table POST came back { held }: hand the ticket up. */
  onHold?: (ticket: JewlTicket) => void;
  /** Gives the terminal this bar's re-send / put-the-words-back / note entries (null on unmount). */
  register?: (api: { send: (message: string, ticketId: string | null) => Promise<void>; restoreWords: (message: string) => void; note: (n: string) => void } | null) => void;
}) {
  const [dayaActive, setDayaActive] = useState<RosterCharacter[]>([]);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [coreStatus, setCoreStatus] = useState<CoreStatus>('unknown');
  const [note, setNote] = useState<string | null>(null);
  /** Lines the last send dropped on purpose (see ProseResponse.ignored). Cleared on the next send. */
  const [ignored, setIgnored] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // JEWL's stop: the popup is mounted by CampaignTerminal; it re-sends the held words / restores them through this.
  useEffect(() => {
    register?.({ send: (message, ticketId) => send(message, ticketId), restoreWords: (message) => { setValue(message); inputRef.current?.focus(); }, note: setNote });
  });
  useEffect(() => () => register?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Roster on mount — only to know whom to warm and who is awake.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/table`);
        if (!res.ok) return;
        const data = (await res.json()) as { npcs: RosterCharacter[]; dayaActive: RosterCharacter[] };
        if (cancelled) return;
        setDayaActive(data.dayaActive);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

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
        onHold?.(result.held);
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

  const awake = dayaActive.map((d) => d.name).join(', ');

  // Look: the approved drawer mockup (2026-10-07 v7) — off-white bar under a
  // black rule; JEWL's held question on the book's grey aside bar (p 64);
  // white input with a navy rule; navy/gold Bebas buttons. Behaviour unchanged.
  const mono = 'var(--font-terminal), Consolas, monospace';
  const bebas = 'var(--font-bebas-neue), Bebas Neue, sans-serif';
  const strip: React.CSSProperties = { fontFamily: mono, fontSize: 12, lineHeight: 1.5, margin: '0 0 6px' };
  return (
    <div style={{ flex: 'none', backgroundColor: '#fafaf8', borderTop: '3px solid #000', padding: '8px 10px 10px' }}>
      {/* JEWL's catch — the table holds until the Watcher answers in the popup (Mike 09-26, 10-26) */}
      {/* No control toggles here (Mike 2026-10-24): the Watcher voices whom the Watcher voices,
          and whoever is not voiced plays itself. Control is contextual, not a switch. */}
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
      {warmup ? warmup : (
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
      )}
    </div>
  );
}
