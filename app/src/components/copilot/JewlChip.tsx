/**
 * Co-pilot chip — persistent floating presence on every campaign surface.
 *
 * Mounts once in the root layout. Self-detects whether we're inside a
 * campaign route (/campaign/[id]/... or /watcher/campaign/[id]/...) and
 * renders only there. Outside a campaign, returns null.
 *
 * Hotkeys: "/" opens (when not typing in another input); Ctrl/Cmd-K
 * toggles from anywhere; Esc closes. Click the chip to toggle.
 *
 * The chip itself is the always-visible "presence." The expand panel is
 * a small chat surface bound to the existing /api/campaigns/[id]/copilot
 * endpoints. Action confirmations stay in the Terminal panel's CopilotChat
 * for now — this MVP is conversation + send only.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

/**
 * JEWL's name is private canon ([[jewl-identity-and-wallet-private]]). All
 * player-facing builds say "Copilot"; only dev/Prime builds with the env
 * flag set show "JEWL". The hotkey hint stays identity-neutral either way.
 */
const REVEAL_JEWL = process.env.NEXT_PUBLIC_REVEAL_JEWL === 'true';
const COPILOT_LABEL = REVEAL_JEWL ? 'JEWL' : 'Copilot';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  username?: string;
  /** JSON of either { toolCalls, reasoning } (assistant) or
   *  { source, canvasAction } (user, when prompt came from a canvas gesture). */
  actions?: string | null;
  createdAt: string;
}

interface ToolCallView {
  name: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: string;
}

interface UserActionView {
  source?: string;
  canvasAction?: {
    kind?: string;
    targetType?: string;
    targetId?: string;
    intent?: string;
  };
}

function parseAssistantActions(actions?: string | null): ToolCallView[] | null {
  if (!actions) return null;
  try {
    const parsed = JSON.parse(actions) as { toolCalls?: ToolCallView[] };
    if (Array.isArray(parsed?.toolCalls) && parsed.toolCalls.length > 0) {
      return parsed.toolCalls;
    }
  } catch { /* malformed — skip */ }
  return null;
}

function parseUserAction(actions?: string | null): UserActionView | null {
  if (!actions) return null;
  try {
    const parsed = JSON.parse(actions) as UserActionView;
    if (parsed?.canvasAction || parsed?.source) return parsed;
  } catch { /* malformed — skip */ }
  return null;
}

interface SessionUser {
  id: string;
  username: string;
  role: string;
}

function extractCampaignId(pathname: string): string | null {
  const m1 = pathname.match(/^\/campaign\/([^/?#]+)/);
  if (m1) return m1[1];
  const m2 = pathname.match(/^\/watcher\/campaign\/([^/?#]+)/);
  if (m2) return m2[1];
  return null;
}

export function JewlChip() {
  const pathname = usePathname();
  const campaignId = extractCampaignId(pathname);

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Pending image attachments — added via the paperclip button or by pasting
  // images into the input. Cleared after each successful send.
  // See [[jewl-full-vision-2026-06-14]] (multimodal Day-1).
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  // Always-on audio per [[jewl-always-on-audio-when-active]]. The chip mounts
  // on every campaign page; the moment it mounts, we try to start the mic
  // and run a continuous MediaRecorder. Chunks emit every 10s, hit /copilot
  // with source=TABLE_AMBIENT. Mute toggles whether chunks actually fire.
  const [audioStatus, setAudioStatus] = useState<
    'idle' | 'requesting' | 'listening' | 'muted' | 'denied' | 'unsupported'
  >('idle');
  const [audioMuted, setAudioMuted] = useState(false);
  const audioMutedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Mistake-bounty (Phase 2). When a GM clicks the flag, the message id goes
  // here; only one flag picker can be open at a time. Submitted message ids
  // land in `flaggedIds` so we can show the badge and lock the affordance.
  // See [[jewl-is-the-interface-2026-06-15]] (mistake-bounty canonical design).
  const [flagTarget, setFlagTarget] = useState<string | null>(null);
  const [flagSeverity, setFlagSeverity] = useState<'minor' | 'major' | 'critical'>('minor');
  const [flagNote, setFlagNote] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  // Map of copilotMessageId -> latest mistake status ('flagged' | 'acknowledged' | 'disputed').
  // Lets the badge surface JEWL's resolution, not just the initial flag.
  const [flagStatusById, setFlagStatusById] = useState<Map<string, string>>(new Map());

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hotkeys
  useEffect(() => {
    if (!campaignId) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );

      // Ctrl/Cmd-K toggles from anywhere
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      // "/" opens when not typing
      if (e.key === '/' && !isTyping && !open) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // Esc closes when open
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [campaignId, open]);

  // Lazy-load session + history when first opened
  useEffect(() => {
    if (!open || !campaignId) return;

    if (!session) {
      fetch('/api/auth/me')
        .then(r => (r.ok ? r.json() : null))
        .then(s => {
          if (s?.user) setSession(s.user);
        })
        .catch(() => {});
    }

    fetch(`/api/campaigns/${campaignId}/copilot/history`)
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then(d => setMessages(d.messages || []))
      .catch(() => {});

    // Load this campaign's mistake flags. The endpoint returns all GMs' flags;
    // we filter to the current GM by id so the badge only locks messages THIS
    // GM has already flagged. Per-message unique constraint enforces the rule
    // server-side either way.
    fetch(`/api/campaigns/${campaignId}/jewl-mistakes`)
      .then(r => (r.ok ? r.json() : { mistakes: [] }))
      .then(d => {
        const myId = session?.id;
        const next = new Map<string, string>();
        for (const m of (d.mistakes || []) as Array<{
          gmUserId: string;
          copilotMessageId: string;
          status: string;
        }>) {
          if (myId && m.gmUserId !== myId) continue;
          // If multiple rows exist (shouldn't, but just in case), prefer the
          // latest non-flagged status. JSON arrives newest-first.
          if (!next.has(m.copilotMessageId)) {
            next.set(m.copilotMessageId, m.status);
          }
        }
        setFlagStatusById(next);
      })
      .catch(() => {});

    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, campaignId, session]);

  // Live poll for JEWL reactions to observation events. While the chip is
  // open, refetch history every 5s and append any new messages by id. Only
  // additive — never removes local optimistic messages mid-flight.
  // See [[jewl-is-the-interface-2026-06-15]] (async observation path).
  useEffect(() => {
    if (!open || !campaignId) return;
    const tick = async () => {
      try {
        const [r, mr] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}/copilot/history`),
          fetch(`/api/campaigns/${campaignId}/jewl-mistakes`),
        ]);
        if (r.ok) {
          const d = await r.json();
          const fetched = (d.messages || []) as CopilotMessage[];
          setMessages(prev => {
            const seen = new Set(prev.map(m => m.id));
            const additions = fetched.filter(m => !seen.has(m.id));
            if (additions.length === 0) return prev;
            return [...prev, ...additions];
          });
        }
        if (mr.ok) {
          const d = await mr.json();
          const myId = session?.id;
          const next = new Map<string, string>();
          for (const m of (d.mistakes || []) as Array<{
            gmUserId: string;
            copilotMessageId: string;
            status: string;
          }>) {
            if (myId && m.gmUserId !== myId) continue;
            if (!next.has(m.copilotMessageId)) {
              next.set(m.copilotMessageId, m.status);
            }
          }
          setFlagStatusById(next);
        }
      } catch {}
    };
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [open, campaignId, session]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const openFlagPicker = useCallback((messageId: string) => {
    setFlagTarget(messageId);
    setFlagSeverity('minor');
    setFlagNote('');
  }, []);

  const cancelFlag = useCallback(() => {
    setFlagTarget(null);
    setFlagSeverity('minor');
    setFlagNote('');
  }, []);

  const submitFlag = useCallback(async () => {
    if (!campaignId || !flagTarget || flagSubmitting) return;
    setFlagSubmitting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/jewl-mistakes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copilotMessageId: flagTarget,
          severity: flagSeverity,
          note: flagNote.trim() || undefined,
        }),
      });
      if (res.ok) {
        setFlagStatusById(prev => {
          const next = new Map(prev);
          next.set(flagTarget, 'flagged');
          return next;
        });
        setFlagTarget(null);
        setFlagSeverity('minor');
        setFlagNote('');
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Failed to flag mistake');
      }
    } catch {
      alert('Connection failed');
    } finally {
      setFlagSubmitting(false);
    }
  }, [campaignId, flagTarget, flagSeverity, flagNote, flagSubmitting]);

  // Convert a File (from paste or file picker) into a data: URL the chip can
  // hand straight to the /copilot endpoint. Bound by MAX_IMAGE_BYTES below
  // since we ship them inline rather than uploading first.
  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB per image — keeps payload sane

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const accepted: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        alert(`"${file.name}" is over 4MB; pick a smaller image`);
        continue;
      }
      try {
        const url = await fileToDataUrl(file);
        accepted.push(url);
      } catch {
        // skip unreadable
      }
    }
    if (accepted.length > 0) {
      setPendingImages(prev => [...prev, ...accepted]);
    }
  }, [fileToDataUrl]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await addImageFiles(files);
    }
  }, [addImageFiles]);

  const handleSend = useCallback(async () => {
    if (!campaignId) return;
    const msg = input.trim();
    const hasImages = pendingImages.length > 0;
    if ((!msg && !hasImages) || loading) return;

    setInput('');
    const sentImages = pendingImages;
    setPendingImages([]);
    setLoading(true);

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: tempId,
        role: 'user',
        content: msg || (hasImages ? `[sent ${sentImages.length} image${sentImages.length === 1 ? '' : 's'}]` : ''),
        username: session?.username,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: {
            source: 'GM_TEXT',
            text: msg,
            media: sentImages.map(dataUrl => ({ kind: 'image', dataUrl })),
          },
        }),
      });

      if (res.ok) {
        // Don't append an optimistic assistant message — the persisted ones
        // come back from history with their real CUIDs. Replacing messages
        // wholesale with the canonical fetch drops the temp- user row and
        // shows the real (user, assistant) pair. Anything that arrived in
        // parallel (observation reactions) stays included.
        try {
          const h = await fetch(`/api/campaigns/${campaignId}/copilot/history`);
          if (h.ok) {
            const d = await h.json();
            setMessages(d.messages || []);
          }
        } catch {
          // history refresh failed — leave temp items in place; the 5s poll
          // will eventually reconcile (with possible transient duplicates).
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${data.error || 'Failed to get response'}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Error: connection failed.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, campaignId, session, pendingImages]);

  // Keep the muted-ref in sync — the recorder's ondataavailable handler
  // captures it without re-binding on every state change.
  useEffect(() => { audioMutedRef.current = audioMuted; }, [audioMuted]);

  // Send a single audio chunk to the copilot endpoint as a TABLE_AMBIENT
  // prompt. Empty / muted / unauthed chunks short-circuit. Errors swallow —
  // a single bad chunk should not stop the recorder.
  const sendAudioChunk = useCallback(async (blob: Blob) => {
    if (audioMutedRef.current) return;
    if (!campaignId) return;
    if (blob.size < 1024) return; // skip empty / noise-floor chunks
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      await fetch(`/api/campaigns/${campaignId}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: {
            source: 'TABLE_AMBIENT',
            text: '',
            media: [{ kind: 'audio', dataUrl }],
          },
        }),
      });
    } catch {
      // best-effort — one dropped chunk is fine
    }
  }, [campaignId]);

  // Always-on audio: start a MediaRecorder the moment the chip mounts on
  // a campaign page. Permission is requested once per origin; subsequent
  // mounts auto-resume if granted. Chunks emit every 10s.
  useEffect(() => {
    if (!campaignId) return;
    if (typeof window === 'undefined') return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setAudioStatus('unsupported');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setAudioStatus('unsupported');
      return;
    }

    let cancelled = false;
    let recorder: MediaRecorder | null = null;
    let stream: MediaStream | null = null;

    (async () => {
      setAudioStatus('requesting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        // Pick the most widely supported codec the browser advertises.
        const preferredTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];
        const mimeType = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        recorder.ondataavailable = ev => {
          if (ev.data && ev.data.size > 0) {
            void sendAudioChunk(ev.data);
          }
        };
        recorder.onerror = () => setAudioStatus('idle');

        recorder.start(10_000); // emit a chunk every 10 seconds
        mediaRecorderRef.current = recorder;
        mediaStreamRef.current = stream;
        setAudioStatus(audioMutedRef.current ? 'muted' : 'listening');
      } catch {
        if (!cancelled) setAudioStatus('denied');
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch { /* ignore */ }
      try {
        stream?.getTracks().forEach(t => t.stop());
      } catch { /* ignore */ }
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
    };
  }, [campaignId, sendAudioChunk]);

  // Reflect mute state into the visible status label without restarting
  // the recorder — the chunk uploader gates on audioMutedRef.
  useEffect(() => {
    setAudioStatus(prev => {
      if (prev === 'denied' || prev === 'unsupported' || prev === 'idle' || prev === 'requesting') {
        return prev;
      }
      return audioMuted ? 'muted' : 'listening';
    });
  }, [audioMuted]);

  if (!campaignId) return null;

  return (
    <>
      {/* Floating chip — always-visible presence */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? `Close ${COPILOT_LABEL}` : `Open ${COPILOT_LABEL}`}
        title={`${COPILOT_LABEL}  ( / or Ctrl-K )`}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'rgba(0, 0, 0, 0.85)',
          border: '1px solid rgba(208, 160, 48, 0.5)',
          boxShadow: open
            ? '0 0 16px rgba(208, 160, 48, 0.45)'
            : '0 2px 12px rgba(0,0,0,0.6)',
          color: '#D0A030',
          fontFamily: 'Consolas, monospace',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 0 18px rgba(208, 160, 48, 0.55)';
          e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.9)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = open
            ? '0 0 16px rgba(208, 160, 48, 0.45)'
            : '0 2px 12px rgba(0,0,0,0.6)';
          e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.5)';
        }}
      >
        <span style={{ letterSpacing: '1px' }}>{'>_'}</span>
        {/* Audio status dot — bottom-right of the pill. Color-coded so the
            GM can glance at JEWL and know if he's listening, muted, or off. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 5,
            right: 5,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background:
              audioStatus === 'listening' ? '#22ab94'
              : audioStatus === 'muted' ? '#888'
              : audioStatus === 'denied' || audioStatus === 'unsupported' ? '#e74c3c'
              : '#444',
            boxShadow:
              audioStatus === 'listening'
                ? '0 0 6px rgba(34, 171, 148, 0.7)'
                : 'none',
            transition: 'background 0.2s ease, box-shadow 0.2s ease',
          }}
        />
      </button>

      {/* Expand panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Co-pilot"
          style={{
            position: 'fixed',
            bottom: 84,
            right: 20,
            width: 380,
            height: 500,
            maxHeight: 'calc(100vh - 120px)',
            background: 'rgba(0, 0, 0, 0.96)',
            border: '1px solid rgba(208, 160, 48, 0.4)',
            boxShadow:
              '0 8px 32px rgba(0,0,0,0.85), 0 0 24px rgba(208, 160, 48, 0.18)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Consolas, monospace',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid rgba(208, 160, 48, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                color: '#D0A030',
                fontSize: 10,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
              }}
            >
              ✦ {COPILOT_LABEL}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Audio status label + mute toggle. Always rendered so the
                  GM knows the mic state at a glance. Per
                  [[jewl-always-on-audio-when-active]]: audio runs
                  whenever the chip is mounted; mute is the privacy lever. */}
              <span
                style={{
                  fontSize: 8,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color:
                    audioStatus === 'listening' ? 'rgba(34, 171, 148, 0.8)'
                    : audioStatus === 'muted' ? 'rgba(255,255,255,0.4)'
                    : audioStatus === 'denied' ? 'rgba(231, 76, 60, 0.8)'
                    : audioStatus === 'unsupported' ? 'rgba(231, 76, 60, 0.6)'
                    : audioStatus === 'requesting' ? 'rgba(208, 160, 48, 0.6)'
                    : 'rgba(255,255,255,0.3)',
                }}
              >
                {audioStatus === 'listening' ? '● live'
                  : audioStatus === 'muted' ? '◌ muted'
                  : audioStatus === 'denied' ? '✕ mic blocked'
                  : audioStatus === 'unsupported' ? '✕ no mic'
                  : audioStatus === 'requesting' ? '... mic'
                  : '○ off'}
              </span>
              {(audioStatus === 'listening' || audioStatus === 'muted') && (
                <button
                  onClick={() => setAudioMuted(m => !m)}
                  aria-label={audioMuted ? 'Unmute' : 'Mute'}
                  title={audioMuted ? 'Unmute' : 'Mute (audio keeps recording but is dropped)'}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: audioMuted ? 'rgba(231, 76, 60, 0.85)' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '2px 6px',
                    fontFamily: 'Consolas, monospace',
                    lineHeight: 1,
                  }}
                >
                  {audioMuted ? '🔇' : '🔊'}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 4px',
                  fontFamily: 'Consolas, monospace',
                  lineHeight: 1,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                }}
              >
                ⊗
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {messages.length === 0 && !loading ? (
              <div
                style={{
                  textAlign: 'center',
                  marginTop: 40,
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 10,
                  padding: '0 20px',
                  lineHeight: 1.7,
                }}
              >
                <div
                  style={{
                    color: 'rgba(208, 160, 48, 0.5)',
                    fontSize: 9,
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  ✦ {COPILOT_LABEL}
                </div>
                Ask. I&apos;ve been watching.
              </div>
            ) : (
              messages.map(m => {
                const toolCalls = m.role === 'assistant' ? parseAssistantActions(m.actions) : null;
                const userAction = m.role === 'user' ? parseUserAction(m.actions) : null;
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '88%',
                      padding: '6px 10px',
                      fontSize: 11,
                      lineHeight: 1.5,
                      background:
                        m.role === 'user'
                          ? 'rgba(34, 171, 148, 0.12)'
                          : 'rgba(255,255,255,0.05)',
                      border:
                        m.role === 'user'
                          ? '1px solid rgba(34, 171, 148, 0.25)'
                          : '1px solid rgba(255,255,255,0.1)',
                      color:
                        m.role === 'user' ? '#22ab94' : 'rgba(255,255,255,0.88)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.role === 'assistant' && (
                      <div
                        style={{
                          fontSize: 8,
                          color: 'rgba(208, 160, 48, 0.65)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.18em',
                          marginBottom: 2,
                        }}
                      >
                        {COPILOT_LABEL}
                      </div>
                    )}
                    {m.role === 'user' && m.username && (
                      <div
                        style={{
                          fontSize: 8,
                          color: 'rgba(34, 171, 148, 0.65)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.18em',
                          marginBottom: 2,
                        }}
                      >
                        {m.username}
                        {userAction?.source === 'GM_CANVAS_ACTION' && userAction.canvasAction?.kind ? (
                          <span style={{ marginLeft: 6, color: 'rgba(208, 160, 48, 0.7)' }}>
                            · {userAction.canvasAction.kind}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {m.content}
                    {toolCalls && toolCalls.length > 0 && (
                      <div
                        style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: '1px dashed rgba(208, 160, 48, 0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        {toolCalls.map((tc, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 9,
                              color: tc.error
                                ? 'rgba(231, 76, 60, 0.85)'
                                : 'rgba(208, 160, 48, 0.75)',
                              fontFamily: 'Consolas, monospace',
                            }}
                          >
                            {tc.error ? '✗' : '→'} {tc.name}
                            {tc.input ? `(${Object.entries(tc.input)
                              .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                              .join(', ')})` : '()'}
                            {tc.error ? ` — ${tc.error}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Mistake-bounty: flag affordance on persisted assistant
                        messages. Temp ids (temp-/resp-/err-) get skipped — they
                        aren't in the DB yet so a flag would 404. */}
                    {m.role === 'assistant' &&
                      !m.id.startsWith('temp-') &&
                      !m.id.startsWith('resp-') &&
                      !m.id.startsWith('err-') && (
                        <div
                          style={{
                            marginTop: 6,
                            paddingTop: 4,
                            borderTop: '1px dashed rgba(255,255,255,0.06)',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {flagStatusById.has(m.id) ? (
                            (() => {
                              const status = flagStatusById.get(m.id)!;
                              const label =
                                status === 'acknowledged' ? '✓ owned'
                                : status === 'disputed' ? '⚡ disputed'
                                : '⚐ flagged';
                              const color =
                                status === 'acknowledged' ? 'rgba(34, 171, 148, 0.85)'
                                : status === 'disputed' ? 'rgba(208, 160, 48, 0.85)'
                                : 'rgba(231, 76, 60, 0.75)';
                              return (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color,
                                    letterSpacing: '0.15em',
                                    textTransform: 'uppercase',
                                  }}
                                  title={
                                    status === 'acknowledged' ? 'JEWL acknowledged the mistake'
                                    : status === 'disputed' ? 'JEWL disputes the flag'
                                    : 'Flagged — JEWL has not responded yet'
                                  }
                                >
                                  {label}
                                </span>
                              );
                            })()
                          ) : flagTarget === m.id ? null : (
                            <button
                              onClick={() => openFlagPicker(m.id)}
                              title="Flag a copilot mistake — KRMA bounty"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'rgba(255,255,255,0.3)',
                                fontSize: 9,
                                cursor: 'pointer',
                                letterSpacing: '0.1em',
                                padding: '0 2px',
                                fontFamily: 'Consolas, monospace',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.color = 'rgba(231, 76, 60, 0.85)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
                              }}
                            >
                              ⚐ flag
                            </button>
                          )}
                        </div>
                      )}
                    {flagTarget === m.id && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: 6,
                          background: 'rgba(231, 76, 60, 0.06)',
                          border: '1px solid rgba(231, 76, 60, 0.25)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 5,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: 4,
                            justifyContent: 'space-between',
                          }}
                        >
                          {(['minor', 'major', 'critical'] as const).map(sev => {
                            const selected = flagSeverity === sev;
                            const bounty = { minor: 10, major: 100, critical: 1000 }[sev];
                            return (
                              <button
                                key={sev}
                                onClick={() => setFlagSeverity(sev)}
                                style={{
                                  flex: 1,
                                  background: selected
                                    ? 'rgba(231, 76, 60, 0.2)'
                                    : 'rgba(255,255,255,0.04)',
                                  border: selected
                                    ? '1px solid rgba(231, 76, 60, 0.6)'
                                    : '1px solid rgba(255,255,255,0.1)',
                                  color: selected
                                    ? 'rgba(231, 76, 60, 0.95)'
                                    : 'rgba(255,255,255,0.55)',
                                  fontSize: 9,
                                  letterSpacing: '0.1em',
                                  textTransform: 'uppercase',
                                  padding: '4px 4px',
                                  cursor: 'pointer',
                                  fontFamily: 'Consolas, monospace',
                                }}
                              >
                                {sev}
                                <div style={{ fontSize: 7, opacity: 0.7, marginTop: 1 }}>
                                  {bounty} K
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <textarea
                          value={flagNote}
                          onChange={e => setFlagNote(e.target.value.slice(0, 1000))}
                          placeholder="Why? (optional — helps the copilot learn)"
                          rows={2}
                          style={{
                            background: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(231, 76, 60, 0.2)',
                            color: 'rgba(255,255,255,0.85)',
                            fontSize: 10,
                            padding: 4,
                            fontFamily: 'Consolas, monospace',
                            resize: 'none',
                            outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            onClick={cancelFlag}
                            disabled={flagSubmitting}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'rgba(255,255,255,0.55)',
                              fontSize: 9,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              padding: '3px 8px',
                              cursor: 'pointer',
                              fontFamily: 'Consolas, monospace',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={submitFlag}
                            disabled={flagSubmitting}
                            style={{
                              background: 'rgba(231, 76, 60, 0.2)',
                              border: '1px solid rgba(231, 76, 60, 0.5)',
                              color: 'rgba(231, 76, 60, 0.95)',
                              fontSize: 9,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              padding: '3px 8px',
                              cursor: flagSubmitting ? 'wait' : 'pointer',
                              fontFamily: 'Consolas, monospace',
                              opacity: flagSubmitting ? 0.5 : 1,
                            }}
                          >
                            {flagSubmitting ? 'Submitting…' : 'Submit flag'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {loading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '88%',
                  padding: '6px 10px',
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                <span
                  style={{ animation: 'jewlchip-pulse 1.4s ease-in-out infinite' }}
                >
                  Thinking...
                </span>
              </div>
            )}
          </div>

          {/* Pending image thumbnails */}
          {pendingImages.length > 0 && (
            <div
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderTop: '1px solid rgba(208, 160, 48, 0.15)',
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              {pendingImages.map((url, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`attachment ${idx + 1}`}
                    style={{
                      width: 44,
                      height: 44,
                      objectFit: 'cover',
                      border: '1px solid rgba(208, 160, 48, 0.4)',
                    }}
                  />
                  <button
                    onClick={() =>
                      setPendingImages(prev => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove attachment"
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.85)',
                      border: '1px solid rgba(208, 160, 48, 0.6)',
                      color: '#D0A030',
                      cursor: 'pointer',
                      fontSize: 9,
                      lineHeight: 1,
                      padding: 0,
                      fontFamily: 'Consolas, monospace',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div
            style={{
              flexShrink: 0,
              padding: '10px 12px',
              borderTop: '1px solid rgba(208, 160, 48, 0.2)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={async e => {
                if (e.target.files) {
                  await addImageFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-label="Attach image"
              title="Attach image (or paste one)"
              style={{
                background: 'transparent',
                border: '1px solid rgba(208, 160, 48, 0.25)',
                color: 'rgba(208, 160, 48, 0.8)',
                fontSize: 13,
                width: 28,
                height: 28,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'Consolas, monospace',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ⊕
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the co-pilot..."
              disabled={loading}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(208, 160, 48, 0.25)',
                color: '#fff',
                fontSize: 11,
                padding: '6px 8px',
                fontFamily: 'Consolas, monospace',
                outline: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.6)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'rgba(208, 160, 48, 0.25)';
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && pendingImages.length === 0)}
              style={{
                background: 'rgba(34, 171, 148, 0.2)',
                color: '#22ab94',
                border: '1px solid rgba(34, 171, 148, 0.4)',
                fontSize: 9,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                padding: '0 12px',
                fontFamily: 'Consolas, monospace',
                cursor:
                  loading || (!input.trim() && pendingImages.length === 0)
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  loading || (!input.trim() && pendingImages.length === 0) ? 0.4 : 1,
              }}
            >
              Send
            </button>
          </div>

          <style>{`
            @keyframes jewlchip-pulse {
              0%, 100% { opacity: 0.45; }
              50% { opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
