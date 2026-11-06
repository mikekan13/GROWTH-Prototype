'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalEvent } from '@/types/terminal';
import { utterancesFor, type Utterance } from './table-reader-utterances';

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const DOWN_MS = 30_000;

interface Item { u: Utterance; blob: Promise<Blob | null> | null }

function isNotAllowed(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotAllowedError';
}

/**
 * Reads each NEW line aloud — narration in the campaign's narrator voice, a character's speech in its own
 * (table-reader-utterances). Never history.
 *
 * Browsers refuse play() until a user gesture has touched audio. unlock() runs inside a gesture (the AUDIO
 * button); when the preference was restored from storage without one (stress test 2026-11-06: the phone played
 * nothing all session), the first refused play() marks the reader `locked`, keeps the line, and the next
 * tap or key anywhere on the page unlocks and resumes.
 */
export function useTableReader({ enabled, events, roster, campaignId }: {
  enabled: boolean;
  events: TerminalEvent[];
  roster: { id: string; name: string }[];
  campaignId: string;
}): { speaking: boolean; unavailable: boolean; locked: boolean; stop: () => void; unlock: () => Promise<boolean> } {
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const handled = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const queue = useRef<Item[]>([]);
  const playing = useRef(false);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const aborter = useRef<AbortController | null>(null);
  const downUntil = useRef(0);
  const downTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const lockedRef = useRef(false);

  const audio = useCallback(() => {
    if (!audioEl.current) audioEl.current = new Audio();
    return audioEl.current;
  }, []);

  const markDown = useCallback(() => {
    downUntil.current = Date.now() + DOWN_MS;
    setUnavailable(true);
    if (downTimer.current) clearTimeout(downTimer.current);
    downTimer.current = setTimeout(() => { downUntil.current = 0; setUnavailable(false); }, DOWN_MS);
  }, []);

  /** Start (once) the fetch for an item. */
  const ensure = useCallback((item: Item): Promise<Blob | null> => {
    if (item.blob) return item.blob;
    if (!aborter.current) aborter.current = new AbortController();
    item.blob = fetch('/api/speech/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: item.u.text, characterId: item.u.characterId, campaignId }),
      signal: aborter.current.signal,
    }).then(async (res) => {
      if (!res.ok) { if (res.status === 503) markDown(); return null; }
      return await res.blob();
    }).catch((err) => {
      if (!(err instanceof DOMException && err.name === 'AbortError')) markDown();
      return null;
    });
    return item.blob;
  }, [markDown, campaignId]);

  const pump = useCallback(async () => {
    if (playing.current || lockedRef.current) return;
    playing.current = true;
    const myGen = gen.current;
    setSpeaking(true);
    while (queue.current.length > 0 && gen.current === myGen) {
      const head = queue.current[0];
      const blobPromise = ensure(head);
      // Prefetch exactly one ahead while this one plays.
      if (queue.current[1]) void ensure(queue.current[1]);
      const blob = await blobPromise;
      if (gen.current !== myGen) break;
      if (!blob || blob.size === 0) { queue.current.shift(); continue; }
      const url = URL.createObjectURL(blob);
      const el = audio();
      const refused = await new Promise<boolean>((resolve) => {
        const done = () => { el.onended = null; el.onerror = null; URL.revokeObjectURL(url); resolve(false); };
        el.onended = done;
        el.onerror = done;
        el.src = url;
        el.play().catch((err: unknown) => {
          el.onended = null; el.onerror = null; URL.revokeObjectURL(url);
          resolve(isNotAllowed(err));
        });
      });
      if (gen.current !== myGen) break;
      if (refused) {
        // No gesture yet: keep the line at the head and wait for one (the blob is kept, it replays).
        lockedRef.current = true;
        setLocked(true);
        break;
      }
      queue.current.shift();
    }
    if (gen.current === myGen) { playing.current = false; setSpeaking(false); }
  }, [audio, ensure]);

  const stop = useCallback(() => {
    gen.current += 1;
    queue.current = [];
    aborter.current?.abort();
    aborter.current = new AbortController();
    const el = audioEl.current;
    if (el) { el.onended = null; el.onerror = null; try { el.pause(); } catch { /* ignore */ } }
    playing.current = false;
    setSpeaking(false);
  }, []);

  /** Run inside a user gesture. Returns true when the browser now allows playback. */
  const unlock = useCallback(async (): Promise<boolean> => {
    try {
      const el = audio();
      el.src = SILENT_WAV;
      await el.play();
      lockedRef.current = false;
      setLocked(false);
      if (queue.current.length > 0) void pump();
      return true;
    } catch {
      return false; // gesture refused or no audio device
    }
  }, [audio, pump]);

  // Enable / disable: on enable, everything already here is history. When the preference is restored on a page
  // load, `enabled` can flip before the events have been fetched (an empty list) — priming then would make the
  // whole record "new" and the reader would read the campaign from the top (16 lines after a reload, 2026-11-06).
  // So priming waits for the first non-empty events list.
  useEffect(() => {
    if (!enabled) { stop(); primed.current = false; return; }
    aborter.current = new AbortController();
    if (events.length === 0) { primed.current = false; return; }
    for (const e of events) handled.current.add(e.id);
    primed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, campaignId]);

  // Locked: the next tap or key anywhere unlocks and resumes.
  useEffect(() => {
    if (!enabled || !locked || typeof document === 'undefined') return;
    const onGesture = () => { void unlock(); };
    document.addEventListener('pointerdown', onGesture, { capture: true });
    document.addEventListener('keydown', onGesture, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onGesture, { capture: true });
      document.removeEventListener('keydown', onGesture, { capture: true });
    };
  }, [enabled, locked, unlock]);

  // New events.
  useEffect(() => {
    if (!enabled) return;
    if (!primed.current) {
      // First non-empty list after enabling = history, never read.
      if (events.length === 0) return;
      for (const e of events) handled.current.add(e.id);
      primed.current = true;
      return;
    }
    const fresh: Utterance[] = [];
    for (const e of events) {
      if (handled.current.has(e.id)) continue;
      handled.current.add(e.id);
      fresh.push(...utterancesFor(e, rosterRef.current));
    }
    if (fresh.length === 0 || Date.now() < downUntil.current) return;
    for (const u of fresh) queue.current.push({ u, blob: null });
    if (playing.current && queue.current[1]) void ensure(queue.current[1]);
    void pump();
  }, [enabled, events, ensure, pump]);

  useEffect(() => () => {
    stop();
    if (downTimer.current) clearTimeout(downTimer.current);
  }, [stop]);

  return { speaking, unavailable, locked, stop, unlock };
}
