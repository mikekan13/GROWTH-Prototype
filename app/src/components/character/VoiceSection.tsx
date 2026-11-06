"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceSpec {
  engine: 'kokoro' | 'qwen';
  voice?: string;
  ref?: string;
  description?: string;
  transcript?: string;
  preset?: string;
  fx?: object;
  seed?: number;
  lockedAt?: string;
}
interface VoiceGet { spec: VoiceSpec; derived: boolean; description: string; presets: string[] }

const bebas = 'var(--font-bebas-neue), Bebas Neue, sans-serif';
const mono = 'var(--font-terminal), Consolas, monospace';
const bodyFont = 'var(--font-comfortaa), sans-serif';

/** Watcher-only: hear, design, lock and reset a being's voice. */
export default function VoiceSection({ characterId, name }: { characterId: string; name: string }) {
  const [data, setData] = useState<VoiceGet | null>(null);
  const [desc, setDesc] = useState('');
  const [preset, setPreset] = useState('human');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'' | 'hear' | 'design' | 'lock' | 'reset' | 'preset'>('');
  const [playing, setPlaying] = useState(false);
  const urlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const base = `/api/characters/${encodeURIComponent(characterId)}/voice`;

  const apply = useCallback((d: VoiceGet) => {
    setData(d);
    setDesc(d.spec.description ?? d.description ?? '');
    setPreset(d.spec.preset ?? 'human');
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) { setStatus(j?.error ?? `voice unavailable (${res.status})`); return; }
      apply(j as VoiceGet);
      setStatus('');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'voice unavailable'); }
  }, [base, apply]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); audioRef.current?.pause(); }, []);

  const play = useCallback(async (src: string) => {
    audioRef.current?.pause();
    const a = new Audio(src);
    audioRef.current = a;
    setPlaying(true);
    a.onended = () => setPlaying(false);
    a.onerror = () => setPlaying(false);
    try { await a.play(); } catch (e) { setPlaying(false); setStatus(e instanceof Error ? e.message : 'playback blocked'); }
  }, []);

  const hear = async () => {
    setBusy('hear'); setStatus('speaking…');
    try {
      const res = await fetch('/api/speech/speak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${name} here. Say what you came to say.`, characterId }),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); setStatus(j?.error ?? `speak failed (${res.status})`); return; }
      const blob = await res.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setStatus('');
      await play(urlRef.current);
    } catch (e) { setStatus(e instanceof Error ? e.message : 'speak failed'); }
    finally { setBusy(''); }
  };

  const post = async (payload: object) => {
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? `request failed (${res.status})`);
    return j as { spec: VoiceSpec; previewWavBase64?: string };
  };

  const design = async () => {
    setBusy('design'); setStatus('designing… 20–60 s');
    try {
      const j = await post({ action: 'design', description: desc, preset });
      await load();
      if (j.previewWavBase64) await play(`data:audio/wav;base64,${j.previewWavBase64}`);
    } catch (e) { setStatus(e instanceof Error ? e.message : 'design failed'); }
    finally { setBusy(''); }
  };

  const lock = async () => {
    setBusy('lock');
    try { await post({ action: 'set', lockedAt: new Date().toISOString() }); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'lock failed'); }
    finally { setBusy(''); }
  };

  const reset = async () => {
    setBusy('reset');
    try {
      const res = await fetch(base, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => null); setStatus(j?.error ?? `reset failed (${res.status})`); return; }
      await load();
    } catch (e) { setStatus(e instanceof Error ? e.message : 'reset failed'); }
    finally { setBusy(''); }
  };

  const changePreset = async (v: string) => {
    setPreset(v);
    if (!data || data.derived) return;
    setBusy('preset');
    try { await post({ action: 'set', preset: v }); await load(); }
    catch (e) { setStatus(e instanceof Error ? e.message : 'preset failed'); }
    finally { setBusy(''); }
  };

  const spec = data?.spec;
  const line = !data ? 'loading…'
    : data.derived ? 'derived default · Kokoro'
    : spec?.lockedAt ? `designed · ${spec.engine} · locked ${new Date(spec.lockedAt).toLocaleDateString()}`
    : `designed · ${spec?.engine}`;
  const disabled = busy !== '' || playing;
  const btn: React.CSSProperties = {
    minHeight: 36, minWidth: 68, padding: '0 14px', border: 0, cursor: 'pointer',
    fontFamily: bebas, fontSize: 20, letterSpacing: '0.06em', backgroundColor: '#002f6c', color: '#ffcc78',
    opacity: disabled ? 0.55 : 1,
  };

  return (
    <div data-testid="voice-section" className="max-w-lg mx-auto" style={{ padding: '12px 0', borderTop: '2px solid #000' }}>
      <div style={{ fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em', color: '#002f6c' }}>VOICE</div>
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={3}
        disabled={!data}
        aria-label="Voice description"
        className="text-base md:text-sm"
        style={{ width: '100%', fontFamily: bodyFont, background: '#fafaf8', border: '1px solid #000', padding: 8, margin: '8px 0', color: '#111' }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select
          value={preset}
          disabled={!data || disabled}
          onChange={e => void changePreset(e.target.value)}
          aria-label="Voice preset"
          className="text-base md:text-sm"
          style={{ minHeight: 36, fontFamily: mono, background: '#fafaf8', border: '1px solid #000', padding: '0 6px' }}
        >
          {(data?.presets ?? ['human']).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button style={btn} disabled={disabled || !data} onClick={() => void hear()}>HEAR</button>
        <button style={btn} disabled={disabled || !data} onClick={() => void design()}>DESIGN</button>
        {data && !data.derived && !spec?.lockedAt && (
          <button style={btn} disabled={disabled} onClick={() => void lock()}>LOCK</button>
        )}
        <button style={btn} disabled={disabled || !data} onClick={() => void reset()}>RESET</button>
      </div>
      <div role="status" style={{ fontFamily: mono, fontSize: 12, marginTop: 8, color: '#333' }}>
        {line}{status ? ` — ${status}` : ''}
      </div>
    </div>
  );
}
