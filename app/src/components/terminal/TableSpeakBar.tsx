"use client";

/**
 * TableSpeakBar — the TABLE tab's input row (Mike 2026-09-02: "As a GM you
 * should be able to select any npc and speak through them. It works like
 * normal tabletop.").
 *
 * Replaces CommandInput when the terminal is in TABLE mode (session active,
 * GM only). Pick an NPC, type their line; it posts to the shared event
 * stream attributed to the NPC and is heard by every ACTIVE DAYA character
 * at the table — responses arrive back in the same feed. Infra states
 * (core warming/offline) show here for the GM only, never in the record.
 */
import React, { useEffect, useRef, useState } from 'react';

interface RosterCharacter {
  id: string;
  name: string;
}

interface SpeakResponse {
  npcName: string;
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
  const [npcs, setNpcs] = useState<RosterCharacter[]>([]);
  const [dayaActive, setDayaActive] = useState<RosterCharacter[]>([]);
  const [speakerId, setSpeakerId] = useState('');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [coreStatus, setCoreStatus] = useState<CoreStatus>('unknown');
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Roster on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/table`);
        if (!res.ok) return;
        const data = (await res.json()) as { npcs: RosterCharacter[]; dayaActive: RosterCharacter[] };
        if (cancelled) return;
        setNpcs(data.npcs);
        setDayaActive(data.dayaActive);
        setSpeakerId((prev) => prev || data.npcs[0]?.id || '');
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
    if (!trimmed || !speakerId || sending) return;
    setValue('');
    setNote(null);
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npcCharacterId: speakerId, message: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote(json.error ?? 'Failed to speak');
        return;
      }
      const result = json as SpeakResponse;
      setCoreStatus((prev) => (result.responses.some((r) => r.status === 'ok') ? 'ready' : prev));
      const infra = result.responses.filter((r) => r.status !== 'ok');
      if (infra.length > 0) {
        setNote(
          infra
            .map((r) =>
              r.status === 'warming'
                ? `${r.characterName} is still coming awake — say it again in a moment`
                : r.status === 'core_offline'
                  ? `${r.characterName}'s core is unreachable (${r.detail ?? 'L1 offline'})`
                  : r.status === 'dormant'
                    ? `${r.characterName} is dormant`
                    : `DAYA disabled`,
            )
            .join(' · '),
        );
      }
      onEvent?.();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const speakerName = npcs.find((n) => n.id === speakerId)?.name ?? '—';

  return (
    <div className="border-t" style={{ borderColor: 'rgba(34, 171, 148, 0.3)', backgroundColor: '#0d0d1a' }}>
      {/* GM-only status strip — infra truth, never part of the table record */}
      {(note || coreStatus === 'warming' || sending) && (
        <div className="px-3 pt-1.5 text-[12px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255, 204, 120, 0.75)' }}>
          {sending
            ? `${speakerName} speaks — the table is responding…${coreStatus !== 'ready' ? ' (core warming from cold, first response can take minutes)' : ''}`
            : note ?? 'The core is warming up from a cold start…'}
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <select
          value={speakerId}
          onChange={(e) => setSpeakerId(e.target.value)}
          className="px-2 py-1 text-[13px]"
          style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            backgroundColor: '#0a0a1a',
            color: 'var(--terminal-prime)',
            border: '1px solid rgba(34, 171, 148, 0.4)',
            borderRadius: '2px',
            maxWidth: '180px',
          }}
        >
          {npcs.length === 0 && <option value="">no NPCs yet</option>}
          {npcs.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={speakerId ? `Speak as ${speakerName}… (*asterisks* for actions)` : 'Build an NPC first — the table needs a voice'}
          disabled={sending || !speakerId}
          className="flex-1 px-2 py-1 text-[13px] outline-none"
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
          disabled={sending || !value.trim() || !speakerId}
          className="px-3 py-1 text-[12px] uppercase tracking-wider"
          style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            color: sending ? '#666' : '#0a0a1a',
            backgroundColor: sending ? 'transparent' : 'var(--terminal-prime)',
            border: '1px solid rgba(34, 171, 148, 0.4)',
            borderRadius: '2px',
          }}
        >
          {sending ? '…' : 'Speak'}
        </button>
      </div>
    </div>
  );
}
