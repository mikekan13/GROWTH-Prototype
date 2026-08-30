'use client';

/**
 * The play surface — Incubator test instrument. Mike sits here as a
 * PLAYER; the Watcher-seat AI GM narrates. Deliberately spare: a table,
 * a voice, nothing that looks like a console.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

interface Turn { actor: string; text?: string; at?: string }

export default function PlayPage() {
  const { id } = useParams<{ id: string }>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}/watcher-gm`);
    if (res.ok) setTurns((await res.json()).turns ?? []);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    setTurns(t => [...t, { actor: 'player', text }]);
    try {
      const res = await fetch(`/api/campaigns/${id}/watcher-gm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      setTurns(t => [...t, { actor: 'gm', text: data.narration }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#CBD9E8] text-[#1a1a2a] flex flex-col items-center">
      <div className="w-full max-w-2xl flex-1 flex flex-col px-6 py-10">
        <h1 className="text-center font-mono text-sm tracking-[0.3em] text-[#582a72] mb-8">
          — THE TABLE —
        </h1>
        <div className="flex-1 space-y-6">
          {turns.map((t, i) => (
            <div key={i} className={t.actor === 'player' ? 'text-right' : ''}>
              <div
                className={
                  t.actor === 'player'
                    ? 'inline-block bg-[#002f6c] text-white rounded-lg px-4 py-2 max-w-[85%] text-left whitespace-pre-wrap'
                    : 'font-serif leading-relaxed whitespace-pre-wrap'
                }
              >
                {t.text}
              </div>
            </div>
          ))}
          {busy && <div className="font-mono text-xs text-[#582a72] animate-pulse">the GM considers…</div>}
          {error && <div className="font-mono text-xs text-[#f7525f]">{error}</div>}
          <div ref={endRef} />
        </div>
        <div className="mt-8 flex gap-2">
          <textarea
            className="flex-1 rounded border border-[#582a72]/30 bg-white/70 px-3 py-2 font-serif resize-none focus:outline-none focus:border-[#582a72]"
            rows={2}
            placeholder="What do you do?"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          />
          <button
            className="rounded bg-[#582a72] text-white px-5 font-mono text-sm disabled:opacity-40"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
          >
            act
          </button>
        </div>
      </div>
    </div>
  );
}
