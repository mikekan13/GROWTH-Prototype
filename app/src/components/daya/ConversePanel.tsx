'use client';

/**
 * ConversePanel — the on-canvas talk surface for a DAYA-wrapped character.
 *
 * Summoned from a character card's context menu ("sPEAK") via a
 * `daya:converse` CustomEvent, exactly the JewlChip summon pattern —
 * mounted once in the root layout, renders nothing until called.
 *
 * What you type is delivered VERBATIM as a stimulus into her being loop
 * (/api/characters/[id]/daya/converse -> deliverStimulus -> full ensemble
 * pipeline: ingest, thorns, recall, soul, spirit -> Say:/Do:/Attend:/Rest).
 * There is no GM-side filter here and no separate "table" — the canvas IS
 * the table (Mike 2026-09-02). You are the world speaking; frame your
 * words as what she perceives.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface ConverseOpenDetail {
  characterId: string;
  name: string;
  x: number;
  y: number;
}

interface ConverseResultDTO {
  status: 'ok' | 'disabled' | 'dormant' | 'core_offline' | 'warming';
  action?: { kind: string; content?: string };
  detail?: string;
}

type CoreStatus = 'unknown' | 'ready' | 'warming' | 'offline' | 'disabled';

interface ChatLine {
  who: 'you' | 'her' | 'system';
  text: string;
}

// Transcript survives close/reopen within the tab (not a reload). Her own
// durable record is her memory ledger — this is just the visible thread.
const chatByCharacter = new Map<string, ChatLine[]>();

const PANEL_W = 420;
const PANEL_H = 480;

export function DayaConversePanel() {
  const [open, setOpen] = useState(false);
  const [character, setCharacter] = useState<{ id: string; name: string } | null>(null);
  const [pos, setPos] = useState({ x: 120, y: 120 });
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [coreStatus, setCoreStatus] = useState<CoreStatus>('unknown');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ConverseOpenDetail>).detail;
      if (!detail?.characterId) return;
      setCharacter({ id: detail.characterId, name: detail.name });
      setChat(chatByCharacter.get(detail.characterId) ?? []);
      setPos({
        x: Math.max(8, Math.min(detail.x, window.innerWidth - PANEL_W - 8)),
        y: Math.max(8, Math.min(detail.y, window.innerHeight - PANEL_H - 8)),
      });
      setOpen(true);
    };
    window.addEventListener('daya:converse', onOpen);
    return () => window.removeEventListener('daya:converse', onOpen);
  }, []);

  // Warm her core the moment the panel opens (serverless cold start can take
  // minutes — start it before the first message, poll while warming).
  useEffect(() => {
    if (!open || !character) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pollWarm() {
      try {
        const res = await fetch(`/api/characters/${character!.id}/daya/warm`, { method: 'POST' });
        const json = (await res.json()) as { status: CoreStatus };
        if (cancelled) return;
        setCoreStatus(json.status ?? 'offline');
        if (json.status === 'warming') timer = setTimeout(() => void pollWarm(), 4000);
      } catch {
        if (!cancelled) setCoreStatus('offline');
      }
    }

    setCoreStatus('unknown');
    void pollWarm();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, character]);

  useEffect(() => {
    if (character) chatByCharacter.set(character.id, chat);
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat, character]);

  const appendLine = useCallback((line: ChatLine) => {
    setChat((prev) => [...prev, line]);
  }, []);

  async function handleSend() {
    if (!message.trim() || !character || sending) return;
    const text = message.trim();
    setMessage('');
    appendLine({ who: 'you', text });
    setSending(true);
    try {
      const res = await fetch(`/api/characters/${character.id}/daya/converse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'converse failed');
      const result = json as ConverseResultDTO;
      if (result.status === 'ok') setCoreStatus('ready');

      if (result.status === 'disabled') {
        appendLine({ who: 'system', text: 'DAYA is disabled — the message was audited, not delivered.' });
      } else if (result.status === 'dormant') {
        appendLine({ who: 'system', text: 'She is dormant — wake her on the persona canvas first.' });
      } else if (result.status === 'core_offline') {
        appendLine({ who: 'system', text: `Her core is unreachable (${result.detail ?? 'L1 offline'}).` });
      } else if (result.status === 'warming') {
        appendLine({ who: 'system', text: 'Still coming awake — give it a moment and send again.' });
      } else if (result.action?.kind === 'speak') {
        appendLine({ who: 'her', text: result.action.content ?? '' });
      } else if (result.action?.kind === 'act') {
        appendLine({ who: 'her', text: `*${result.action.content ?? 'acts'}*` });
      } else if (result.action?.kind === 'attend') {
        appendLine({ who: 'her', text: `*her attention shifts — ${result.action.content ?? 'something'}*` });
      } else if (result.action?.kind === 'held') {
        appendLine({ who: 'system', text: 'Held by the seal — not delivered.' });
      } else {
        appendLine({ who: 'her', text: '*stays quiet*' });
      }
    } catch (err) {
      appendLine({ who: 'system', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  if (!open || !character) return null;

  return (
    <div
      className="fixed z-50 flex flex-col shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: PANEL_W,
        height: PANEL_H,
        background: '#CBD9E8',
        border: '2px solid #ffcc78',
        fontFamily: 'Consolas, monospace',
      }}
    >
      {/* Black header bar — signature pattern */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-move"
        style={{ background: '#000' }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX - pos.x;
          const startY = e.clientY - pos.y;
          const onMove = (me: MouseEvent) => setPos({ x: me.clientX - startX, y: me.clientY - startY });
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      >
        <span style={{ color: '#ffcc78', letterSpacing: '0.15em', fontSize: 13 }}>
          {character.name.toUpperCase()}
          <span style={{ color: '#22ab94', marginLeft: 10, fontSize: 10 }}>
            {coreStatus === 'ready' ? '● present' : coreStatus === 'warming' ? '◐ stirring…' : coreStatus === 'offline' ? '○ unreachable' : coreStatus === 'disabled' ? '○ disabled' : '◌'}
          </span>
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ color: '#fff', opacity: 0.7, fontSize: 14, lineHeight: 1 }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Transcript */}
      <div ref={logRef} className="flex-1 overflow-y-auto px-3 py-2" style={{ fontSize: 13, color: '#1a1a1a' }}>
        {chat.length === 0 && (
          <p style={{ opacity: 0.55, fontStyle: 'italic' }}>
            What you type is what she perceives, verbatim. Speak as the world.
          </p>
        )}
        {chat.map((line, i) => (
          <p key={i} style={{ margin: '6px 0', whiteSpace: 'pre-wrap' }}>
            {line.who === 'system' ? (
              <span style={{ opacity: 0.6, fontStyle: 'italic' }}>{line.text}</span>
            ) : line.who === 'you' ? (
              <>
                <span style={{ color: '#582a72', fontWeight: 700 }}>you » </span>
                {line.text}
              </>
            ) : (
              <>
                <span style={{ color: '#002f6c', fontWeight: 700 }}>{character.name} » </span>
                {line.text}
              </>
            )}
          </p>
        ))}
        {sending && (
          <p style={{ margin: '6px 0', opacity: 0.55, fontStyle: 'italic' }}>
            …{coreStatus !== 'ready' ? ' (her core is warming from cold — first reply can take minutes)' : ''}
          </p>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid #ffcc78', background: '#dde7f1' }}>
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={2}
          placeholder="*knocks twice* Delivery."
          disabled={sending}
          className="w-full resize-none px-2 py-1"
          style={{ fontFamily: 'Consolas, monospace', fontSize: 13, background: '#fff', border: '1px solid #002f6c33', color: '#1a1a1a' }}
        />
      </div>
    </div>
  );
}
