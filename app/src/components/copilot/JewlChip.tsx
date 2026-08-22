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
import { usePathname, useRouter } from 'next/navigation';
import { CtxMenuBorder, CtxMenuScanlines, ctxMenuStyle } from '@/components/ui/ContextMenu';
import { useCampaignStream } from '@/hooks/useCampaignStream';

/**
 * JEWL's name is private canon ([[jewl-identity-and-wallet-private]]). All
 * player-facing builds say "Copilot"; only dev/Prime builds with the env
 * flag set show "JEWL". The hotkey hint stays identity-neutral either way.
 */
const REVEAL_JEWL = process.env.NEXT_PUBLIC_REVEAL_JEWL === 'true';
const COPILOT_LABEL = REVEAL_JEWL ? 'JEWL' : 'Copilot';

/**
 * Collapse a mistake row's (status, resolution) into the single string the
 * badge renders. A 'resolved' row carries its adjudicated outcome so the GM
 * sees whether their bounty was upheld or overturned by Et'herling.
 */
function badgeKey(status: string, resolution?: string | null): string {
  if (status === 'resolved' && resolution) return `resolved:${resolution}`;
  return status;
}

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

/** One of JEWL's open jobs, as served by GET /campaigns/[id]/work-sessions. */
interface WorkSessionView {
  id: string;
  status: string;
  goal: string;
  cycleCount: number;
  blockedReason: string | null;
  lastNote: string | null;
}

/** Goals carry entity ids for dedup (`Violet [cms60...]`) — not for eyes. */
function formatGoal(goal: string): string {
  const clean = goal.replace(/\s*\[[a-z0-9]+\]/gi, '');
  return clean.length > 72 ? `${clean.slice(0, 72)}…` : clean;
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
  const router = useRouter();
  const campaignId = extractCampaignId(pathname);

  const [open, setOpen] = useState(false);
  // Where JEWL materializes. Right-click anchors him AT the click point —
  // he uses the context of where (and what) the GM clicked. null = the
  // hotkey fallback position (lower right). Per Mike 2026-07-29: no
  // corner chip; JEWL appears where you summon him.
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
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
  // Voice output (TTS) — speak each new assistant message via the browser's
  // Web Speech API. Default on; toggle off if you want quiet.
  const [voiceMuted, setVoiceMuted] = useState(false);
  const lastSpokenIdRef = useRef<string | null>(null);
  // True until the chip has done its FIRST history load. Anything already in
  // history when the chip mounts is treated as "already spoken" so we don't
  // replay yesterday's reply every page refresh.
  const initialHistoryLoadedRef = useRef(false);
  // "Thinking" indicator — flipped on when the classifier verdict says
  // JEWL is about to reason (react/act/proact). Cleared when his next
  // assistant message lands.
  const [thinking, setThinking] = useState(false);
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
  const panelRef = useRef<HTMLDivElement>(null);

  // Summoned, not resident: clicking anywhere OUTSIDE the panel dismisses
  // it (a right-click outside dismisses-then-resummons at the new spot via
  // the contextmenu listener). Esc already closes via the hotkey handler.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

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

      // Ctrl/Cmd-K toggles from anywhere (hotkey = no click point, so the
      // panel uses its fallback position)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAnchor(null);
        setOpen(o => !o);
        return;
      }
      // "/" opens when not typing
      if (e.key === '/' && !isTyping && !open) {
        e.preventDefault();
        setAnchor(null);
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

  // Any surface can summon JEWL via this event with a context seed (the
  // clicked spot / subject) and the click position. One JEWL dialog,
  // contextual payload — per [[one-contextual-jewl-dialog-2026-06-07]].
  // The seed lands as VISIBLE, editable text in the input, never hidden
  // context; the panel opens AT the click point.
  useEffect(() => {
    if (!campaignId) return;
    function onJewlOpen(e: Event) {
      const detail = (e as CustomEvent<{ seed?: string; x?: number; y?: number }>).detail;
      setAnchor(detail?.x != null && detail?.y != null ? { x: detail.x, y: detail.y } : null);
      setOpen(true);
      if (detail?.seed) setInput(prev => (prev ? prev : detail.seed!));
      // Panel may still be mounting this tick — focus after paint.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener('jewl:open', onJewlOpen);
    return () => window.removeEventListener('jewl:open', onJewlOpen);
  }, [campaignId]);

  // JEWL is the DEFAULT right-click everywhere in a campaign — canvas,
  // tapestry, forge, any page under the campaign route. A more specific
  // contextual menu (location chooser, character-card menu) preventDefaults
  // its own event and wins; anything unhandled reaches here and summons
  // JEWL at the cursor. A [data-jewl-subject] ancestor names the subject
  // for the seed text.
  useEffect(() => {
    if (!campaignId) return;
    function onContextMenu(e: MouseEvent) {
      if (e.defaultPrevented) return; // a contextual menu already claimed it
      const target = e.target as HTMLElement | null;
      // Native browser menu stays for text inputs (copy/paste matters).
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      // Right-click inside the open panel is not a re-summon.
      if (target && panelRef.current?.contains(target)) return;
      e.preventDefault();
      const subject = target?.closest?.('[data-jewl-subject]')?.getAttribute('data-jewl-subject');
      setAnchor({ x: e.clientX, y: e.clientY });
      setOpen(true);
      if (subject) setInput(prev => (prev ? prev : `[re: ${subject}] `));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, [campaignId]);

  // UI-activity breadcrumbs — JEWL watches the whole session, not just the
  // chat. Every surface change inside the campaign posts a small [ui]
  // breadcrumb; the server-side classifier watches the trail and lets JEWL
  // burst through when someone looks stuck or keeps bouncing around.
  const prevPathRef = useRef<string | null>(null);
  const lastCrumbAtRef = useRef(0);
  useEffect(() => {
    if (!campaignId || !pathname) return;
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev === null || prev === pathname) return; // first mount / no change
    const now = Date.now();
    if (now - lastCrumbAtRef.current < 3000) return; // rapid transits collapse
    lastCrumbAtRef.current = now;
    const surface = (p: string) =>
      p.replace(/^\/(watcher\/)?campaign\/[^/]+/, '').replace(/^\//, '') || 'canvas';
    fetch(`/api/campaigns/${campaignId}/ui-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `navigated ${surface(prev)} -> ${surface(pathname)}` }),
      // Survive the very navigation that triggered the breadcrumb — an
      // aborted send arrives server-side as an empty body.
      keepalive: true,
    }).catch(() => { /* breadcrumbs are best-effort */ });
  }, [campaignId, pathname]);

  // Burst-through — JEWL can reach out FIRST. While the panel is closed, a
  // slow poll watches for a new assistant message (a proact reply the
  // classifier let through, or a reply that landed after the GM closed
  // him); when one appears he opens himself and speaks. The baseline is
  // set on the first closed poll so history never replays as a burst.
  const burstBaselineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.id.startsWith('temp-') && !m.id.startsWith('resp-') && !m.id.startsWith('err-'));
    if (lastAssistant) burstBaselineRef.current = lastAssistant.id;
  }, [open, messages]);
  useEffect(() => {
    if (!campaignId || open) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/copilot/history`);
        if (!res.ok || cancelled) return;
        const d = await res.json();
        const msgs: CopilotMessage[] = d.messages || [];
        const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
        if (!lastAssistant || cancelled) return;
        if (burstBaselineRef.current === null) {
          burstBaselineRef.current = lastAssistant.id;
          return;
        }
        if (lastAssistant.id !== burstBaselineRef.current) {
          burstBaselineRef.current = lastAssistant.id;
          initialHistoryLoadedRef.current = true; // he may speak this one aloud
          setMessages(msgs);
          setAnchor(null);
          setOpen(true);
        }
      } catch { /* poll is best-effort */ }
    };
    const interval = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(interval); };
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
      .then(d => {
        const loaded = (d.messages || []) as CopilotMessage[];
        // Mark the most recent assistant message as "already spoken" so
        // TTS doesn't read history out loud on first mount.
        const latestAssistantId = [...loaded]
          .reverse()
          .find(m => m.role === 'assistant')?.id;
        if (latestAssistantId) {
          lastSpokenIdRef.current = latestAssistantId;
        } else {
          // No assistant yet — still mark as initialized so the next
          // message (which IS new) will speak.
          lastSpokenIdRef.current = '__none__';
        }
        initialHistoryLoadedRef.current = true;
        setMessages(loaded);
      })
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
          resolution?: string | null;
        }>) {
          if (myId && m.gmUserId !== myId) continue;
          // If multiple rows exist (shouldn't, but just in case), prefer the
          // latest non-flagged status. JSON arrives newest-first.
          if (!next.has(m.copilotMessageId)) {
            next.set(m.copilotMessageId, badgeKey(m.status, m.resolution));
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
            // The server persists the user prompt at dispatch START, so the
            // poll can fetch it (real CUID) while the optimistic temp- row is
            // still on screen waiting for the long reply — that was the
            // double-message bug (Mike 2026-08-21). When a persisted copy
            // arrives, drop the matching temp row.
            const withoutEchoedTemps = prev.filter(m =>
              !(m.id.startsWith('temp-') &&
                additions.some(a => a.role === m.role && a.content === m.content)));
            return [...withoutEchoedTemps, ...additions];
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
            resolution?: string | null;
          }>) {
            if (myId && m.gmUserId !== myId) continue;
            if (!next.has(m.copilotMessageId)) {
              next.set(m.copilotMessageId, badgeKey(m.status, m.resolution));
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

  // Canvas refresh — JEWL's tool calls mutate the world server-side, but
  // the page's server-component data doesn't know. When a NEW assistant
  // message lands carrying toolCalls (direct reply, 5s poll, or burst),
  // refresh the route so his builds appear without a manual reload.
  const lastRefreshedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialHistoryLoadedRef.current) return;
    const latestWithTools = [...messages]
      .reverse()
      .find(
        m =>
          m.role === 'assistant' &&
          !m.id.startsWith('temp-') &&
          !m.id.startsWith('resp-') &&
          !m.id.startsWith('err-') &&
          (parseAssistantActions(m.actions)?.length ?? 0) > 0,
      );
    if (!latestWithTools) return;
    if (lastRefreshedIdRef.current === latestWithTools.id) return;
    lastRefreshedIdRef.current = latestWithTools.id;
    // Never refresh out from under a live canvas gesture (remount-storm
    // audit 2026-08-03) — RelationsCanvas stamps the timestamp.
    const doRefresh = () => {
      const lastGesture = (window as unknown as { __growthLastGestureAt?: number }).__growthLastGestureAt ?? 0;
      if (Date.now() - lastGesture < 600) {
        setTimeout(doRefresh, 800);
        return;
      }
      router.refresh();
    };
    doRefresh();
  }, [messages, router]);

  // TTS — speak each new assistant message via Web Speech API. The
  // browser's voice is robotic, which fits JEWL's Archon/Vegeta-pride
  // canon. We can swap to OpenAI/Eleven TTS later through the same hook.
  // Also clear the "thinking" indicator the moment JEWL's reply lands.
  useEffect(() => {
    if (messages.length === 0) return;
    // Defer until first history fetch has completed — otherwise the very
    // first render would mark the latest historical assistant message as
    // "new" and read it aloud.
    if (!initialHistoryLoadedRef.current) return;
    // Find the most recent assistant message with a real (persisted) id.
    const latestAssistant = [...messages]
      .reverse()
      .find(
        m =>
          m.role === 'assistant' &&
          !m.id.startsWith('temp-') &&
          !m.id.startsWith('resp-') &&
          !m.id.startsWith('err-'),
      );
    if (!latestAssistant) return;
    if (lastSpokenIdRef.current === latestAssistant.id) return;
    lastSpokenIdRef.current = latestAssistant.id;
    setThinking(false);

    if (voiceMuted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const synth = window.speechSynthesis;
      // Cancel anything currently speaking — newer reply supersedes.
      synth.cancel();
      const u = new SpeechSynthesisUtterance(latestAssistant.content || '');
      u.rate = 1.05;
      u.pitch = 0.9;
      u.volume = 0.95;
      // Prefer a male-ish English voice if available — closer to JEWL's
      // canonical voice. Falls back to whatever the OS provides.
      const voices = synth.getVoices();
      const preferred =
        voices.find(v => /en[-_]?US/i.test(v.lang) && /male|david|mark|guy/i.test(v.name)) ||
        voices.find(v => /en/i.test(v.lang)) ||
        null;
      if (preferred) u.voice = preferred;
      synth.speak(u);
    } catch { /* TTS optional; never block the chip */ }
  }, [messages, voiceMuted]);

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

  // Track whether the last chunk produced a transcript — pulses the chip
  // dot briefly so the GM can see audio IS flowing even when JEWL stays
  // silent (his default for ambient).
  const [chunkPulse, setChunkPulse] = useState(0);

  // Send a single audio chunk to the audio-chunk endpoint. Empty / muted /
  // unauthed chunks short-circuit. This is intentionally separate from the
  // /copilot endpoint: ambient chunks transcribe + log only; they do NOT
  // invoke Claude per chunk (6 round-trips/min would burn cost and noise).
  // Per [[jewl-always-on-audio-when-active]].
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
      const res = await fetch(`/api/campaigns/${campaignId}/audio-chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (res.ok) {
        const ts = Date.now();
        setChunkPulse(ts);
        setTimeout(() => {
          setChunkPulse(prev => (prev === ts ? 0 : prev));
        }, 1600);
        // If the classifier woke JEWL, flip the thinking indicator on so
        // the GM knows a reply is coming. The next assistant message that
        // lands via the history poll clears it. Safety timeout at 45s so
        // a silently-failed dispatch can't lock the indicator on forever.
        try {
          const data = await res.json();
          const v = data?.classifierVerdict as string | undefined;
          if (v && v !== 'silent') {
            setThinking(true);
            setTimeout(() => setThinking(false), 45_000);
          }
        } catch { /* response body wasn't json — ignore */ }
      }
    } catch {
      // best-effort — one dropped chunk is fine
    }
  }, [campaignId]);

  // Always-on audio: every CHUNK_MS we stop and restart the MediaRecorder
  // so each emitted blob is a complete, standalone container (valid webm
  // header etc.) that the server can decode in isolation. Using
  // `MediaRecorder.start(timeslice)` produces header-less fragment chunks
  // that ffmpeg/pyav reject — that's the trap we hit in the first wiring.
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

    // 5s chunks — halves worst-case latency from end-of-speech to JEWL
    // reply. Doubles chunk count but each is cheap.
    const CHUNK_MS = 5_000;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let currentRecorder: MediaRecorder | null = null;
    let cycleTimer: ReturnType<typeof setTimeout> | null = null;

    const startCycle = (mimeType: string) => {
      if (cancelled || !stream) return;
      // Pick parts collected during this cycle. ondataavailable usually
      // fires once on stop(), but we accumulate just in case.
      const parts: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch {
        setAudioStatus('idle');
        return;
      }
      currentRecorder = recorder;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = ev => {
        if (ev.data && ev.data.size > 0) parts.push(ev.data);
      };
      recorder.onerror = () => setAudioStatus('idle');
      recorder.onstop = () => {
        if (parts.length > 0) {
          const finalBlob = new Blob(parts, { type: recorder.mimeType || mimeType });
          void sendAudioChunk(finalBlob);
        }
        // Chain the next cycle immediately — micro-gap (~ms) is acceptable.
        if (!cancelled) startCycle(mimeType);
      };

      recorder.start();
      cycleTimer = setTimeout(() => {
        try {
          if (recorder.state === 'recording') recorder.stop();
        } catch { /* ignore */ }
      }, CHUNK_MS);
    };

    (async () => {
      setAudioStatus('requesting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        const preferredTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];
        const mimeType = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
        mediaStreamRef.current = stream;
        setAudioStatus(audioMutedRef.current ? 'muted' : 'listening');
        startCycle(mimeType);
      } catch {
        if (!cancelled) setAudioStatus('denied');
      }
    })();

    return () => {
      cancelled = true;
      if (cycleTimer) clearTimeout(cycleTimer);
      try {
        if (currentRecorder && currentRecorder.state !== 'inactive') {
          // Detach onstop so it doesn't restart a new cycle after cleanup.
          currentRecorder.onstop = null;
          currentRecorder.stop();
        }
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

  // ── NOW strip — the always-there answer to "what is JEWL doing?"
  // (Mike 2026-08-17). Two feeds: jewl_working SSE ticks show the
  // in-flight dispatch tool-by-tool; open work sessions show the longer
  // arc (goal + latest heartbeat note, or what he's blocked on). The SSE
  // subscription only lives while the panel is open.
  const [nowTick, setNowTick] = useState<{ label: string } | null>(null);
  const nowTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workSessions, setWorkSessions] = useState<WorkSessionView[]>([]);

  const fetchWorkSessions = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/work-sessions`);
      if (res.ok) {
        const data = await res.json();
        setWorkSessions(Array.isArray(data.sessions) ? data.sessions : []);
      }
    } catch { /* strip is best-effort */ }
  }, [campaignId]);

  const { on: onStreamEvent } = useCampaignStream({
    campaignId: campaignId ?? '',
    enabled: open && !!campaignId,
  });

  useEffect(() => onStreamEvent('jewl_working', data => {
    if (data.phase === 'done') {
      // Linger a beat so fast dispatches are still seen, then refresh the
      // session list — the finished turn may have moved a job's state.
      if (nowTickTimerRef.current) clearTimeout(nowTickTimerRef.current);
      nowTickTimerRef.current = setTimeout(() => setNowTick(null), 1500);
      void fetchWorkSessions();
    } else {
      if (nowTickTimerRef.current) { clearTimeout(nowTickTimerRef.current); nowTickTimerRef.current = null; }
      setNowTick({ label: data.phase === 'tool' && data.label ? data.label : 'working…' });
    }
  }), [onStreamEvent, fetchWorkSessions]);

  useEffect(() => onStreamEvent('daya_work_session', () => {
    void fetchWorkSessions();
  }), [onStreamEvent, fetchWorkSessions]);

  useEffect(() => {
    if (!open || !campaignId) return;
    void fetchWorkSessions();
    // Slow fallback poll — SSE covers the live path.
    const t = setInterval(() => { void fetchWorkSessions(); }, 15000);
    return () => clearInterval(t);
  }, [open, campaignId, fetchWorkSessions]);

  if (!campaignId) return null;

  // Anchored placement: JEWL materializes AT the click point, clamped so
  // the panel never runs off-screen. No anchor (hotkey) = lower right.
  const PANEL_W = 380;
  const PANEL_H = 500;
  const anchoredPos = anchor
    ? {
        left: Math.max(8, Math.min(anchor.x, window.innerWidth - PANEL_W - 10)),
        top: Math.max(8, Math.min(anchor.y, window.innerHeight - PANEL_H - 10)),
      }
    : { bottom: 84, right: 20 };

  return (
    <>
      {/* No corner chip — JEWL is summoned by right-click (anywhere in the
          campaign) or "/" / Ctrl-K. He appears where you call him. */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Co-pilot"
          style={{
            position: 'fixed',
            ...anchoredPos,
            width: PANEL_W,
            height: PANEL_H,
            maxHeight: 'calc(100vh - 120px)',
            background: '#000',
            border: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Consolas, monospace',
            padding: '6px',
          }}
        >
          {/* The ^v^v undulating chrome — same skin as every context menu.
              JEWL is the OS runner; his overlay IS a Terminal surface.
              count sized up so the strip wraps the full 380x500 panel. */}
          <CtxMenuBorder count={90} />
          <CtxMenuScanlines />
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                color: '#fff',
                fontSize: 12,
                fontFamily: "'Inknut Antiqua', serif",
              }}
            >
              {ctxMenuStyle(COPILOT_LABEL)}
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
                  aria-label={audioMuted ? 'Unmute mic' : 'Mute mic'}
                  title={audioMuted ? 'Unmute mic' : 'Mute mic (audio keeps recording but is dropped)'}
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
                  {audioMuted ? '🎤̸' : '🎤'}
                </button>
              )}
              <button
                onClick={() => {
                  setVoiceMuted(v => !v);
                  // If muting, stop any currently-speaking utterance.
                  if (!voiceMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
                aria-label={voiceMuted ? 'Unmute voice output' : 'Mute voice output'}
                title={voiceMuted ? 'Voice output OFF — JEWL will not speak aloud' : 'Voice output ON — click to silence'}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: voiceMuted ? 'rgba(231, 76, 60, 0.85)' : 'rgba(255,255,255,0.55)',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '2px 6px',
                  fontFamily: 'Consolas, monospace',
                  lineHeight: 1,
                }}
              >
                {voiceMuted ? '🔇' : '🔊'}
              </button>
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

          {/* NOW — live view of what JEWL is doing right now: in-flight
              dispatch ticks + his open jobs. Always rendered so the GM can
              right-click any time and see where his hands are. */}
          <div
            style={{
              padding: '6px 14px 7px',
              borderBottom: '1px solid #222',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            <div
              style={{
                fontSize: 8,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'rgba(34, 171, 148, 0.65)',
              }}
            >
              now
            </div>
            {nowTick && (
              <div style={{ fontSize: 9, color: '#ffcc78', lineHeight: 1.5 }}>
                ⟳ {nowTick.label}
              </div>
            )}
            {workSessions.map(s => (
              <div key={s.id} style={{ lineHeight: 1.5 }}>
                <div
                  style={{
                    fontSize: 9,
                    color: s.status === 'blocked' ? 'rgba(231, 76, 60, 0.85)' : 'rgba(34, 171, 148, 0.85)',
                  }}
                >
                  {s.status === 'blocked' ? '◼' : '⟳'} {formatGoal(s.goal)}
                  <span style={{ color: 'rgba(255,255,255,0.25)' }}> · cycle {s.cycleCount}</span>
                </div>
                {(s.status === 'blocked' ? s.blockedReason : s.lastNote) && (
                  <div
                    style={{
                      fontSize: 8.5,
                      color: 'rgba(255,255,255,0.45)',
                      paddingLeft: 12,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {s.status === 'blocked' ? `waiting on you — ${s.blockedReason}` : s.lastNote}
                  </div>
                )}
              </div>
            ))}
            {!nowTick && workSessions.length === 0 && (
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                ◦ idle — watching
              </div>
            )}
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
            {messages.filter(m => m.username !== '[system]' && m.username !== '[ui]').length === 0 && !loading ? (
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
              messages.filter(m => m.username !== '[system]' && m.username !== '[ui]').map(m => {
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
                        m.role === 'user' ? 'var(--terminal-prime)' : 'rgba(255,255,255,0.88)',
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
                    {/* Collapsed by default (Mike 2026-08-21): the action log
                        is a click away, never a wall in the chat. Errors are
                        flagged in the summary so failures stay visible. */}
                    {toolCalls && toolCalls.length > 0 && (
                      <details
                        style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: '1px dashed rgba(208, 160, 48, 0.2)',
                        }}
                      >
                        <summary
                          style={{
                            cursor: 'pointer',
                            fontSize: 9,
                            fontFamily: 'Consolas, monospace',
                            color: toolCalls.some(tc => tc.error)
                              ? 'rgba(231, 76, 60, 0.85)'
                              : 'rgba(208, 160, 48, 0.55)',
                            listStyle: 'none',
                          }}
                        >
                          ⚙ {toolCalls.length} action{toolCalls.length === 1 ? '' : 's'}
                          {toolCalls.some(tc => tc.error)
                            ? ` · ${toolCalls.filter(tc => tc.error).length} failed`
                            : ''}
                        </summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
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
                      </details>
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
                              const [status, resolution] = flagStatusById.get(m.id)!.split(':');
                              const label =
                                status === 'acknowledged' ? '✓ owned'
                                : status === 'disputed' ? '⚡ disputed'
                                : status === 'resolved'
                                  ? (resolution === 'upheld' ? '⚖ upheld'
                                    : resolution === 'overturned' ? '⚖ overturned'
                                    : '⚖ resolved')
                                : '⚐ flagged';
                              const color =
                                status === 'acknowledged' ? 'rgba(34, 171, 148, 0.85)'
                                : status === 'disputed' ? 'rgba(208, 160, 48, 0.85)'
                                : status === 'resolved'
                                  ? (resolution === 'upheld' ? 'rgba(34, 171, 148, 0.85)'
                                    : 'rgba(255,255,255,0.4)')
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
                                    status === 'acknowledged' ? 'JEWL acknowledged the mistake — bounty paid'
                                    : status === 'disputed' ? 'JEWL disputes the flag — Et\'erling adjudicating'
                                    : status === 'resolved'
                                      ? (resolution === 'upheld' ? 'Et\'erling upheld the flag — bounty paid'
                                        : resolution === 'overturned' ? 'Et\'erling overturned the flag — no bounty'
                                        : 'Adjudicated by Et\'erling')
                                    : 'Flagged — bounty pending JEWL\'s response'
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
            {(loading || thinking) && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '88%',
                  padding: '6px 10px',
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(34, 171, 148, 0.3)',
                  color: 'rgba(34, 171, 148, 0.85)',
                }}
              >
                <span
                  style={{ animation: 'jewlchip-pulse 1.4s ease-in-out infinite' }}
                >
                  {/* Snappy ack (Mike 2026-08-21): instant "On it", then the
                      live jewl_working tick narrates what he's actually doing
                      tool-by-tool until the real reply replaces this bubble. */}
                  {loading
                    ? (nowTick?.label ? `On it — ${nowTick.label}` : 'On it.')
                    : 'Reasoning on what you said...'}
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
                color: 'var(--terminal-prime)',
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
