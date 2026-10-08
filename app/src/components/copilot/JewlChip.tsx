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

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { JEWL_CHAT_CSS, fs, MONO, BEBAS, READ } from '@/components/terminal/jewlChatCss';
import { useCampaignStream } from '@/hooks/useCampaignStream';

/**
 * JEWL's name is private canon ([[jewl-identity-and-wallet-private]]). All
 * player-facing builds say "Copilot"; only dev/Prime builds with the env
 * flag set show "JEWL". The hotkey hint stays identity-neutral either way.
 */
const REVEAL_JEWL = process.env.NEXT_PUBLIC_REVEAL_JEWL === 'true';
const JEWL_TAG = REVEAL_JEWL ? 'jEWL' : 'Copilot';

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

/** Phone layout threshold: below this the JEWL window becomes a bottom sheet. */
/** Always-on audio chunk length. Each chunk is a standalone recording (stop +
 *  restart), transcribed on its own. DEFAULT = today's behaviour. LIVE is the
 *  value to use while a GameSession is live AND the engine's split loop is on
 *  (U2c): shorter chunks = beings hear the table sooner. Set at runtime via the
 *  window event growth:recorder-chunk { ms } — the recorder restarts cleanly. */
export const RECORDER_CHUNK_MS_DEFAULT = 5_000;
export const RECORDER_CHUNK_MS_LIVE = 3_000;
export const RECORDER_CHUNK_EVENT = 'growth:recorder-chunk';
/** Fired after every mic chunk the TABLE heard (U2c-4): { fed, heard, asked, holding }.
 *  fed:false is sent when the feed stops (mute, or no fed chunk for TABLE_FEED_TTL_MS)
 *  so mirrors (the TERMINAL tab) can clear their glyph. */
export const TABLE_FEED_EVENT = 'growth:table-feed';
/** How long the ◆ indicator stays lit after the last fed chunk (2–3 chunk lengths). */
export const TABLE_FEED_TTL_MS = 12_000;

const SHEET_QUERY = '(max-width: 599px)';
const sheetMq = () => (typeof window !== 'undefined' ? window.matchMedia(SHEET_QUERY) : null);
function useSheetMode(): boolean {
  return useSyncExternalStore(
    cb => { const q = sheetMq(); q?.addEventListener('change', cb); return () => q?.removeEventListener('change', cb); },
    () => sheetMq()?.matches ?? false,
    () => false,
  );
}

/** Finger device: the only way to summon JEWL without a right-click is the
 *  long-press on empty canvas, which is undiscoverable — so coarse pointers get
 *  a floating ◈ summon button. */
const coarseMq = () => (typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null);
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    cb => { const q = coarseMq(); q?.addEventListener('change', cb); return () => q?.removeEventListener('change', cb); },
    () => coarseMq()?.matches ?? false,
    () => false,
  );
}

/** Soft-keyboard tracking via visualViewport: how far the visible bottom sits
 *  above the layout bottom (inset) and how tall the visible area is. */
function useKeyboardInset(active: boolean): { inset: number; viewportHeight: number } {
  const [state, setState] = useState({ inset: 0, viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800 });
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const update = () => {
      if (!vv) { setState({ inset: 0, viewportHeight: window.innerHeight }); return; }
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setState({ inset, viewportHeight: Math.round(vv.height) });
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => { vv?.removeEventListener('resize', update); vv?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [active]);
  return state;
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
  // and run a continuous MediaRecorder. Chunks emit every RECORDER_CHUNK_MS_DEFAULT ms (5 s), hit /copilot
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

  // Phones (2026-10-06, with the mobile session): below 600 px the fixed
  // 380×500 window is wider than the screen, so JEWL becomes a BOTTOM SHEET —
  // full width, ~70vh, drag handle + ⊗ to dismiss, a backdrop that swallows
  // the tap-away so closing him never drops a carried card. The anchor is
  // kept only for the seed text. useSyncExternalStore so SSR (false) matches.
  const sheetMode = useSheetMode();
  // The soft keyboard shrinks the visual viewport, not the layout viewport:
  // track it so the input row stays pinned ABOVE the keyboard.
  const kb = useKeyboardInset(open && sheetMode);
  const sheetDragRef = useRef<{ y0: number } | null>(null);
  // Recorder chunk length (see RECORDER_CHUNK_MS_*). Read per cycle from a ref
  // so a change never restarts the mic; it only shortens the cycle in flight.
  const chunkMsRef = useRef<number>(RECORDER_CHUNK_MS_DEFAULT);
  // P1 — "the mic is feeding the table": set from the audio-chunk response
  // (table.fed), cleared by mute or by silence longer than TABLE_FEED_TTL_MS.
  // The GM must see at a glance that what he says is becoming the world.
  const [tableFeed, setTableFeed] = useState<{ heard: number; asked: number; holding: boolean } | null>(null);
  const tableFeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTableFeed = useCallback((feed: { heard: number; asked: number; holding: boolean } | null) => {
    setTableFeed(feed);
    window.dispatchEvent(new CustomEvent(TABLE_FEED_EVENT, { detail: feed ? { fed: true, ...feed } : { fed: false } }));
    if (tableFeedTimerRef.current) clearTimeout(tableFeedTimerRef.current);
    tableFeedTimerRef.current = feed ? setTimeout(() => announceTableFeedRef.current(null), TABLE_FEED_TTL_MS) : null;
  }, []);
  const announceTableFeedRef = useRef(announceTableFeed);
  useEffect(() => { announceTableFeedRef.current = announceTableFeed; }, [announceTableFeed]);
  useEffect(() => {
    const onChunk = (e: Event) => {
      const ms = Number((e as CustomEvent<{ ms?: number }>).detail?.ms);
      if (!Number.isFinite(ms) || ms < 1000 || ms > 60_000 || ms === chunkMsRef.current) return;
      chunkMsRef.current = ms;
      // Cut the cycle in flight short: stop() sends what was said so far and
      // onstop chains the next cycle at the new length — same stream, same
      // permission, never two recorders.
      const rec = mediaRecorderRef.current;
      try { if (rec && rec.state === 'recording') rec.stop(); } catch { /* ignore */ }
    };
    window.addEventListener(RECORDER_CHUNK_EVENT, onChunk);
    return () => window.removeEventListener(RECORDER_CHUNK_EVENT, onChunk);
  }, []);
  // Floating ◈ summon button for fingers (2026-10-06). Hidden while JEWL is
  // open and while the campaign terminal drawer is open (CampaignCanvas
  // broadcasts growth:terminal-drawer {open}) so it never sits on the table log.
  const coarsePointer = useCoarsePointer();
  const [terminalOpen, setTerminalOpen] = useState(false);
  useEffect(() => {
    const onDrawer = (e: Event) => setTerminalOpen(!!(e as CustomEvent<{ open?: boolean }>).detail?.open);
    window.addEventListener('growth:terminal-drawer', onDrawer);
    return () => window.removeEventListener('growth:terminal-drawer', onDrawer);
  }, []);

  // Summoned, not resident: clicking anywhere OUTSIDE the panel dismisses
  // it (a right-click outside dismisses-then-resummons at the new spot via
  // the contextmenu listener). Esc already closes via the hotkey handler.
  // Sheet mode uses a backdrop instead, so the outside tap never reaches the canvas.
  useEffect(() => {
    if (!open || sheetMode) return;
    // pointerdown in the capture phase: the canvas cancels the compatibility
    // mousedown, so a click on empty canvas never reached a mousedown listener.
    function onDocPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [open, sheetMode]);

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
          // U2c-4: present only when the mic fed the table (switch on, GM, live session).
          const t = data?.table as { fed?: boolean; heard?: number; asked?: number; holding?: boolean } | undefined;
          if (t?.fed) announceTableFeedRef.current({ heard: t.heard ?? 0, asked: t.asked ?? 0, holding: !!t.holding });
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

  // Always-on audio: every chunkMsRef.current ms we stop and restart the MediaRecorder
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
      }, chunkMsRef.current);
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
          // Keep onstop attached: it SENDS the chunk in flight (the words said
          // in the last few seconds are not thrown away on a chunk-length change
          // or on leaving the page). It will not chain a new cycle, because
          // startCycle checks the `cancelled` flag, which is already true here.
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

  // Sheet geometry: sits on the visual viewport's bottom (above the soft
  // keyboard), 70% of the visible height, never taller than what is visible.
  const sheetStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: kb.inset,
    width: '100%',
    height: `min(70vh, ${Math.max(240, kb.viewportHeight - 24)}px)`,
    maxHeight: `${Math.max(240, kb.viewportHeight - 24)}px`,
    borderRadius: '12px 12px 0 0',
    // safe-area inset lives on the input row (JEWL_OVERLAY_CSS) so the white
    // bar runs to the bottom edge; same total height as before.
  };

  const visibleMessages = messages.filter(m => m.username !== '[system]' && m.username !== '[ui]');
  const feeding = audioStatus === 'listening' ? tableFeed : null;
  // The mic state in the drawer header's grammar: a coloured ◆/● glyph + navy Bebas words.
  const audioGlyph = feeding ? '◆'
    : audioStatus === 'listening' ? '●'
    : audioStatus === 'muted' ? '◌'
    : audioStatus === 'denied' || audioStatus === 'unsupported' ? '✕'
    : audioStatus === 'requesting' ? '…'
    : '○';
  const audioGlyphColour = feeding ? (feeding.holding ? '#b07a00' : '#2f6fb0')
    : audioStatus === 'listening' ? '#0f6e5e'
    : audioStatus === 'denied' || audioStatus === 'unsupported' ? '#b0303b'
    : audioStatus === 'requesting' ? '#b07a00'
    : '#6b7380';
  const audioWords = feeding ? `Table · ${feeding.heard}${feeding.holding ? ' …' : ''}`
    : audioStatus === 'listening' ? 'Live'
    : audioStatus === 'muted' ? 'Muted'
    : audioStatus === 'denied' ? 'Mic blocked'
    : audioStatus === 'unsupported' ? 'No mic'
    : audioStatus === 'requesting' ? 'Mic'
    : 'Off';
  const sendDisabled = loading || (!input.trim() && pendingImages.length === 0);

  return (
    <>
      {/* No corner chip on desktop — JEWL is summoned by right-click (anywhere
          in the campaign) or "/" / Ctrl-K. He appears where you call him.
          Fingers get a floating ◈ (above the carry tray, clear of the terminal
          toggle); tap = click, per the canvas touch tracker's contract. */}
      {!open && coarsePointer && !terminalOpen && (
        <button
          type="button"
          onClick={() => { setAnchor(null); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          aria-label="Summon JEWL"
          title="Summon JEWL"
          data-no-hold
          style={{
            position: 'fixed',
            right: 14,
            bottom: 'calc(160px + env(safe-area-inset-bottom))',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: '#002f6c',
            border: '2px solid #ffcc78',
            boxShadow: '0 4px 14px rgba(0,47,108,0.45), 0 1px 3px rgba(0,0,0,0.3)',
            color: '#ffcc78',
            fontSize: 'calc(22px * var(--jewl-fs, 1))',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9996,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          ◈
        </button>
      )}
      {open && sheetMode && (
        // Backdrop: dims the canvas and SWALLOWS the tap-away, so dismissing
        // JEWL on a phone never lands as a tap on the canvas (which would
        // drop a carried card or move the camera).
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          onPointerDown={e => e.stopPropagation()}
          data-no-hold
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9997 }}
        />
      )}
      {open && (
        // Look (2026-10-08): the drawer's jEWL Conversation, floating — same
        // shared CSS (terminal/jewlChatCss). Powder-blue page under a navy
        // frame; the header is the drawer's tab row (navy/gold title, ◆ mic
        // state in navy Bebas); NOW and the mistake flags speak the same calm
        // row language. Behaviour unchanged.
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Co-pilot"
          data-no-hold
          data-jewl-sheet={sheetMode ? '1' : undefined}
          data-jewl-overlay
          className={`jc jo ${sheetMode ? 'jo-sheet' : 'jo-win'}`}
          style={{
            // Readability knob: every type size in the panel is
            // calc(Npx * var(--jewl-fs)). The shared look is already sized for
            // a phone (≥ 12 px everywhere), so both modes sit at 1; turn it up
            // here if the sheet needs to read bigger.
            ...({ '--jewl-fs': 1 } as React.CSSProperties),
            position: 'fixed',
            ...(sheetMode ? sheetStyle : { ...anchoredPos, width: PANEL_W, height: PANEL_H, maxHeight: 'calc(100vh - 120px)' }),
            zIndex: 9998,
          }}
        >
          <style>{JEWL_CHAT_CSS}</style>
          <style>{JEWL_OVERLAY_CSS}</style>
          {sheetMode && (
            // Drag handle: swipe down ~80 px to dismiss. Pointer events, not
            // touch events, so the canvas's touch tracker contract holds.
            <div
              className="jo-grip"
              onPointerDown={e => { sheetDragRef.current = { y0: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={e => { const d = sheetDragRef.current; if (d && e.clientY - d.y0 > 80) { sheetDragRef.current = null; setOpen(false); } }}
              onPointerUp={() => { sheetDragRef.current = null; }}
              onPointerCancel={() => { sheetDragRef.current = null; }}
              aria-label="Drag down to close"
            >
              <i />
            </div>
          )}
          {/* Header — the drawer's tab row */}
          <div className="jo-head">
            <h2 className="jo-title">{JEWL_TAG}</h2>
            <span className="jo-spacer" />
            {/* Audio status + mute toggle. Always rendered so the GM knows the
                mic state at a glance. Per [[jewl-always-on-audio-when-active]]:
                audio runs whenever the chip is mounted; mute is the privacy lever. */}
            <span className="jo-audio" data-jewl-audio={audioStatus}>
              <i style={{ color: audioGlyphColour }}>{audioGlyph}</i>{audioWords}
            </span>
            {(audioStatus === 'listening' || audioStatus === 'muted') && (
              <button
                onClick={() => {
                  setAudioMuted(m => !m);
                  // Mute is the STOP for the table feed: nothing said while muted is heard.
                  if (!audioMuted) announceTableFeedRef.current(null);
                }}
                aria-label={audioMuted ? 'Unmute mic' : 'Mute mic'}
                aria-pressed={audioMuted}
                title={audioMuted ? 'Unmute mic' : 'Mute mic (audio keeps recording but is dropped)'}
                className={`jo-tool${audioMuted ? ' jo-off' : ''}`}
              >
                Mic
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
              aria-pressed={voiceMuted}
              title={voiceMuted ? 'Voice output OFF — JEWL will not speak aloud' : 'Voice output ON — click to silence'}
              className={`jo-tool${voiceMuted ? ' jo-off' : ''}`}
            >
              Voice
            </button>
            <button onClick={() => setOpen(false)} aria-label="Close" className="jo-x">⊗</button>
          </div>

          {/* NOW — live view of what JEWL is doing right now: in-flight
              dispatch ticks + his open jobs. Always rendered so the GM can
              summon him any time and see where his hands are. */}
          <div className="jo-now" data-jewl-now>
            <div className="jo-now-head">
              <span className="jc-kind">Now</span>
              {!nowTick && workSessions.length === 0 && <span className="jo-idle">idle — watching</span>}
            </div>
            {nowTick && (
              <p className="jc-note"><span className="jc-bar">[⟳ {nowTick.label}]</span></p>
            )}
            {workSessions.map(s => {
              const blocked = s.status === 'blocked';
              const note = blocked ? s.blockedReason : s.lastNote;
              return (
                <div key={s.id} className={`jo-job${blocked ? ' jo-blocked' : ''}`} data-work-session={s.status}>
                  <div className="jc-who">
                    <span className="jo-goal">{formatGoal(s.goal)}</span>
                    <span className="jc-time">cycle {s.cycleCount}</span>
                  </div>
                  {note && (
                    <p className="jo-jobnote">{blocked ? <><b>waiting on you —</b> {note}</> : note}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="jc-scroll">
            {visibleMessages.length === 0 && !loading ? (
              <div className="jc-turn jc-jewl">
                <p className="jc-msg"><span className="jc-aside"><b>[{JEWL_TAG}]:</b> Ask. I&apos;ve been watching.</span></p>
              </div>
            ) : (
              visibleMessages.map(m => {
                const toolCalls = m.role === 'assistant' ? parseAssistantActions(m.actions) : null;
                const userAction = m.role === 'user' ? parseUserAction(m.actions) : null;
                const persisted = !m.id.startsWith('temp-') && !m.id.startsWith('resp-') && !m.id.startsWith('err-');
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="jc-turn jc-user">
                      <div className="jc-who">
                        <span className="jc-tag">
                          {m.username || 'You'}:
                          {userAction?.source === 'GM_CANVAS_ACTION' && userAction.canvasAction?.kind ? (
                            <span className="jo-via"> · {userAction.canvasAction.kind}</span>
                          ) : null}
                        </span>
                        <span className="jc-time">{fmtTime(m.createdAt)}</span>
                      </div>
                      <p className="jc-said">{m.content}</p>
                    </div>
                  );
                }
                const failed = toolCalls ? toolCalls.filter(tc => tc.error).length : 0;
                return (
                  <div key={m.id} className="jc-turn jc-jewl" data-jewl-msg={m.id}>
                    <p className="jc-msg"><span className="jc-aside"><b>[{JEWL_TAG}]:</b> {m.content}</span></p>
                    {/* Collapsed by default (Mike 2026-08-21): the action log
                        is a click away, never a wall in the chat. Errors are
                        flagged in the summary so failures stay visible. */}
                    {toolCalls && toolCalls.length > 0 && (
                      <details className="jo-tools">
                        <summary>
                          <span className="jc-bar">[⚙ {toolCalls.length} action{toolCalls.length === 1 ? '' : 's'}]</span>
                          {failed > 0 && <span className="jo-fail">[{failed} failed]</span>}
                        </summary>
                        {toolCalls.map((tc, i) => (
                          <p key={i} className={`jo-toolrow${tc.error ? ' jo-err' : ''}`}>
                            {tc.error ? '✗' : '→'} {tc.name}
                            {tc.input ? `(${Object.entries(tc.input)
                              .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                              .join(', ')})` : '()'}
                            {tc.error ? ` — ${tc.error}` : ''}
                          </p>
                        ))}
                      </details>
                    )}
                    {/* Mistake-bounty: flag affordance on persisted assistant
                        messages. Temp ids (temp-/resp-/err-) get skipped — they
                        aren't in the DB yet so a flag would 404. */}
                    {persisted && flagTarget !== m.id && (
                      <div className="jo-flagrow">
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
                            const tone =
                              status === 'acknowledged' ? 'good'
                              : status === 'disputed' ? 'gold'
                              : status === 'resolved' ? (resolution === 'upheld' ? 'good' : 'plain')
                              : 'red';
                            return (
                              <span
                                className={`jo-badge jo-b-${tone}`}
                                data-jewl-flag={status}
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
                                [{label}]
                              </span>
                            );
                          })()
                        ) : (
                          <button
                            onClick={() => openFlagPicker(m.id)}
                            title="Flag a copilot mistake — KRMA bounty"
                            className="jo-flag"
                          >
                            ⚐ Flag
                          </button>
                        )}
                      </div>
                    )}
                    {/* The flag picker is a held question (p 64): navy/gold kind
                        tag + the grey aside bar, answers in navy/gold Bebas. */}
                    {flagTarget === m.id && (
                      <div className="jc-ask jo-picker" data-jewl-flag-picker>
                        <p className="jc-msg">
                          <span className="jc-kind">Flag a mistake</span>
                          <span className="jc-aside">How bad was it? The bounty pays if the flag stands.</span>
                        </p>
                        <div className="jc-answers" role="group" aria-label="Severity">
                          {(['minor', 'major', 'critical'] as const).map(sev => {
                            const selected = flagSeverity === sev;
                            const bounty = { minor: 10, major: 100, critical: 1000 }[sev];
                            return (
                              <button
                                key={sev}
                                onClick={() => setFlagSeverity(sev)}
                                aria-pressed={selected}
                                className={selected ? 'jc-yes' : 'jc-no'}
                              >
                                {sev} · {bounty} K
                              </button>
                            );
                          })}
                        </div>
                        <textarea
                          value={flagNote}
                          onChange={e => setFlagNote(e.target.value.slice(0, 1000))}
                          placeholder="Why? (optional — helps the copilot learn)"
                          aria-label="Why it was a mistake"
                          rows={2}
                          className="jo-note"
                          // 16px on phones: below that iOS zooms the page when the note box is tapped.
                          style={{ fontSize: sheetMode ? 16 : 14 }}
                        />
                        <div className="jc-answers">
                          <button onClick={submitFlag} disabled={flagSubmitting} className="jc-yes" style={{ cursor: flagSubmitting ? 'wait' : undefined }}>
                            {flagSubmitting ? 'Submitting…' : 'Submit flag'}
                          </button>
                          <button onClick={cancelFlag} disabled={flagSubmitting} className="jc-no">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {(loading || thinking) && (
              // Snappy ack (Mike 2026-08-21): instant "On it", then the live
              // jewl_working tick narrates what he's doing tool-by-tool until
              // the real reply replaces this bar.
              <p className="jc-note" data-jewl-thinking>
                <span className="jc-bar">
                  [{loading
                    ? (nowTick?.label ? `ON IT — ${nowTick.label}` : 'ON IT')
                    : `${JEWL_TAG} IS THINKING`}<span className="jc-caret">_</span>]
                </span>
              </p>
            )}
          </div>

          {/* Pending image thumbnails */}
          {pendingImages.length > 0 && (
            <div className="jo-thumbs">
              {pendingImages.map((url, idx) => (
                <div key={idx} className="jo-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`attachment ${idx + 1}`} />
                  <button
                    onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input — the speak bar's shape: ⊕ attach, white field under a navy rule, navy/gold Send */}
          <div className="jc-input">
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
              className="jo-attach"
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
              placeholder={`Ask ${JEWL_TAG}…`}
              aria-label={`Ask ${JEWL_TAG}`}
              disabled={loading}
              // 16px on phones: anything smaller makes iOS zoom the page on focus.
              style={{ fontSize: sheetMode ? 16 : 14 }}
            />
            <button onClick={handleSend} disabled={sendDisabled}>
              {loading ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Overlay-only rules on top of the shared jEWL conversation CSS. */
const JEWL_OVERLAY_CSS = `
.jo{overflow:hidden}
.jo-win{border:3px solid #002f6c;box-shadow:0 12px 32px rgba(0,47,108,.35),0 2px 6px rgba(0,0,0,.25)}
.jo-sheet{border-top:3px solid #002f6c;box-shadow:0 -8px 28px rgba(0,0,0,.35)}
.jo-sheet .jc-input{padding-bottom:calc(10px + max(6px, env(safe-area-inset-bottom)))}
.jo button{min-height:36px;min-width:36px}
.jo button:focus-visible{outline:3px solid #ffcc78;outline-offset:2px}
.jo-grip{flex:none;display:flex;justify-content:center;padding:8px 0 4px;cursor:grab;touch-action:none;background:#CBD9E8}
.jo-grip i{display:block;width:44px;height:4px;border-radius:2px;background:#002f6c;opacity:.45}
.jo-head{flex:none;display:flex;align-items:stretch;gap:4px;height:44px;background:#CBD9E8;border-bottom:3px solid #002f6c;padding:0 4px 0 0}
.jo-title{display:flex;align-items:center;margin:0;padding:3px 14px 0;background:#002f6c;color:#ffcc78;font:400 ${fs(22)}/1 ${BEBAS};letter-spacing:.05em}
.jo-spacer{flex:1;min-width:4px}
.jo-audio{align-self:center;white-space:nowrap;padding-top:3px;color:#002f6c;font:400 ${fs(17)}/1 ${BEBAS};letter-spacing:.05em}
.jo-audio i{font:400 ${fs(13)}/1 ${MONO};font-style:normal;margin-right:3px;vertical-align:1px}
.jo-tool{align-self:center;height:36px;padding:3px 8px 0;border:0;cursor:pointer;background:none;white-space:nowrap;color:#002f6c;box-shadow:inset 0 0 0 2px #002f6c;font:400 ${fs(16)}/1 ${BEBAS};letter-spacing:.06em}
.jo-tool.jo-off{color:#b0303b;box-shadow:inset 0 0 0 2px #b0303b;text-decoration:line-through;text-decoration-thickness:2px}
.jo-x{align-self:center;width:40px;height:36px;border:0;background:none;cursor:pointer;color:#002f6c;font:400 ${fs(20)}/1 ${MONO}}
.jo-tool:hover,.jo-x:hover{background:rgba(0,47,108,.08)}
.jo-now{flex:none;max-height:34%;overflow-y:auto;overflow-x:hidden;padding:8px 12px 10px 14px;background:#CBD9E8;border-bottom:1px solid rgba(0,47,108,.35)}
.jo-now-head{display:flex;align-items:baseline;gap:4px}
.jo-idle{font:400 ${fs(13)}/1.5 ${MONO};color:#393937}
.jo-now .jc-note{margin:6px 0 0}
.jo-job{margin:8px 0 0;border-left:4px solid #22ab94;padding:0 0 0 10px}
.jo-job.jo-blocked{border-left-color:#b0303b}
.jo-goal{min-width:0;overflow-wrap:anywhere;font:400 ${fs(14)}/1.5 ${READ}}
.jo-jobnote{margin:2px 0 0;font:400 ${fs(13)}/1.5 ${MONO};color:#393937;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.jo-blocked .jo-jobnote{color:#000}
.jo-blocked .jo-jobnote b{color:#b0303b}
.jo-tools{margin:6px 0 0}
.jo-tools summary{list-style:none;cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:36px;font:700 ${fs(13)}/1.62 ${MONO}}
.jo-tools summary::-webkit-details-marker{display:none}
.jo-tools summary:focus-visible{outline:3px solid #ffcc78;outline-offset:2px}
.jo-fail{background:#f7525f;color:#000;padding:1px 5px}
.jo-toolrow{margin:4px 0 0;padding:0 0 0 8px;border-left:2px solid #393937;color:#222;overflow-wrap:anywhere;font:400 ${fs(12)}/1.5 ${MONO}}
.jo-toolrow.jo-err{border-left-color:#b0303b;color:#8a1c26}
.jo-flagrow{display:flex;justify-content:flex-end;align-items:center;min-height:36px;margin:2px 0 0}
.jo-flag{padding:3px 8px 0;border:0;background:none;cursor:pointer;color:#393937;font:400 ${fs(16)}/1 ${BEBAS};letter-spacing:.06em}
.jo-flag:hover{color:#b0303b}
.jo-badge{padding:1px 5px;text-transform:uppercase;font:700 ${fs(12)}/1.62 ${MONO}}
.jo-b-good{background:#22ab94;color:#222}
.jo-b-gold{background:#ffcc78;color:#000}
.jo-b-red{background:#f7525f;color:#000}
.jo-b-plain{background:#000;color:#f5f4ef}
.jo-note{display:block;width:100%;min-height:64px;margin:8px 0 0;padding:8px;border:0;border-left:4px solid #002f6c;background:#fff;color:#000;font-family:${READ};resize:none;outline:0}
.jo-note:focus-visible{outline:2px solid #002f6c}
.jo-via{color:#393937;font-weight:400}
.jo-thumbs{flex:none;display:flex;flex-wrap:wrap;gap:8px;padding:8px 10px;background:#fafaf8;border-top:1px solid rgba(0,47,108,.35)}
.jo-thumb{position:relative;width:64px;height:64px}
.jo-thumb img{display:block;width:64px;height:64px;object-fit:cover;border:2px solid #002f6c}
.jo-thumb button{position:absolute;top:0;right:0;width:36px;height:36px;padding:0;border:0;cursor:pointer;background:#002f6c;color:#ffcc78;font:400 ${fs(20)}/1 ${MONO}}
.jc-input .jo-attach{width:44px;background:none;color:#002f6c;box-shadow:inset 0 0 0 2px #002f6c;font:400 ${fs(20)}/1 ${MONO}}
`;
