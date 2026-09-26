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

interface RosterCharacter {
  id: string;
  name: string;
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
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [coreStatus, setCoreStatus] = useState<CoreStatus>('unknown');
  const [note, setNote] = useState<string | null>(null);
  const [held, setHeld] = useState<ReconTicket | null>(null);
  const [answering, setAnswering] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      setCoreStatus((prev) => (result.responses.some((r) => r.status === 'ok') ? 'ready' : prev));
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
      const ticket = json.ticket as ReconTicket & { created?: Array<{ kind: string; name: string }>; moved?: string[]; refusedReason?: string };
      const message = held.message;
      setHeld(null);
      if (action === 'dismiss') { setValue(message); inputRef.current?.focus(); return; }
      if (ticket.status === 'REFUSED') { setNote(ticket.refusedReason ?? 'The world cannot afford this.'); setValue(message); return; }
      const spun = (ticket.created ?? []).map((c) => c.name).join(', ');
      const moved = (ticket.moved ?? []).join(', ');
      if (spun || moved) setNote(`JEWL spun up ${spun || 'nothing new'}${moved ? `; ${moved} now there` : ''} — holding ${ticket.estimateKrma} KRMA until it sticks`);
      await send(message, ticket.id);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setAnswering(false);
    }
  }

  const awake = dayaActive.map((d) => d.name).join(', ');

  return (
    <div className="border-t" style={{ borderColor: 'rgba(34, 171, 148, 0.3)', backgroundColor: '#0d0d1a' }}>
      {/* JEWL's catch — the table holds until the Watcher answers (Mike 09-26) */}
      {held && (
        <div className="mx-3 mt-2 px-3 py-2" style={{ border: '1px solid rgba(255, 204, 120, 0.55)', borderRadius: '2px', backgroundColor: 'rgba(255, 204, 120, 0.06)' }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', color: '#ffcc78' }}>JEWL</div>
          <div className="text-[13px] mt-1" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#CBD9E8' }}>{held.question}</div>
          {held.plan.length > 0 && (
            <div className="text-[12px] mt-1" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(203, 217, 232, 0.7)' }}>
              {held.plan.map((p) => (p.matchId ? `${p.name} → ${p.matchName} (already here)` : `${p.name} → new ${p.kind}`)).join(' · ')}
              {held.estimateKrma > 0 && ` · hold ${held.estimateKrma} of ${held.fluidKrma} fluid KRMA`}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={() => void answerJewl('confirm')} disabled={answering} className="px-3 py-1 text-[12px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', color: '#0a0a1a', backgroundColor: '#ffcc78', border: '1px solid rgba(255, 204, 120, 0.6)', borderRadius: '2px' }}>
              {answering ? '…' : "We're going somewhere new"}
            </button>
            <button onClick={() => void answerJewl('dismiss')} disabled={answering} className="px-3 py-1 text-[12px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', color: '#CBD9E8', backgroundColor: 'transparent', border: '1px solid rgba(203, 217, 232, 0.35)', borderRadius: '2px' }}>
              My mistake — take it back
            </button>
          </div>
        </div>
      )}
      {/* GM-only status strip — infra truth, never part of the table record */}
      {(note || coreStatus === 'warming' || sending) && (
        <div className="px-3 pt-1.5 text-[12px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255, 204, 120, 0.75)' }}>
          {sending
            ? `The table is responding…${coreStatus !== 'ready' ? ' (core warming from cold, first response can take minutes)' : ''}`
            : note ?? 'The core is warming up from a cold start…'}
        </div>
      )}
      <div className="flex items-end gap-2 px-3 py-2">
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
          placeholder={awake ? `Narrate. Put speech in quotes, or Name: line. ${awake} will live it. (Shift+Enter for a new line)` : 'Narrate. Put speech in quotes, or Name: line. No one is awake at the table yet.'}
          disabled={sending || !!held}
          className="flex-1 px-2 py-1 text-[13px] outline-none resize-none"
          style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            backgroundColor: '#0a0a1a',
            color: '#CBD9E8',
            border: '1px solid rgba(34, 171, 148, 0.25)',
            borderRadius: '2px',
          }}
        />
        <button
          onClick={() => void handleSubmit()}
          disabled={sending || !!held || !value.trim()}
          className="px-3 py-1 text-[12px] uppercase tracking-wider"
          style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            color: sending ? '#666' : '#0a0a1a',
            backgroundColor: sending ? 'transparent' : 'var(--terminal-prime)',
            border: '1px solid rgba(34, 171, 148, 0.4)',
            borderRadius: '2px',
          }}
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
