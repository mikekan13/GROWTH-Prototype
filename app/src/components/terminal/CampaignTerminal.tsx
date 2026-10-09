"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import CommandInput from './CommandInput';
import type { CommandInputHandle } from './CommandInput';
import type { TerminalEvent, TerminalFilter, ChangeLogPayload, GameSessionInfo } from '@/types/terminal';
import type { ChangeLogEntry } from '@/types/changelog';
import type { GrowthCharacter } from '@/types/growth';
import { executeCommand, type DiceApiIntent, type RestApiIntent } from '@/lib/terminal-commands';
import { spendAttribute, type AttributeName } from '@/lib/character-actions';
import { diceEvents } from '@/lib/dice-events';
import type { RollResult } from '@/types/dice';
import type { DiceRollPayload, CommandPayload } from '@/types/terminal';
import CopilotChat from './CopilotChat';
import TableSpeakBar from './TableSpeakBar';
import BeingSpeakingLines from './BeingSpeakingLines';
import { RECORDER_CHUNK_EVENT, RECORDER_CHUNK_MS_DEFAULT, RECORDER_CHUNK_MS_LIVE, TABLE_FEED_EVENT } from '@/components/copilot/JewlChip';
import TableFeed from './table-feed/TableFeed';
import { perceptionFeedOn, PERCEIVED_FEED_STALE_EVENT } from '@/lib/perception-feed';
import ViewAsPicker, { readViewAs, writeViewAs, type ViewAsCharacter } from './table-feed/ViewAsPicker';
import { pageCutoff, keepFrom, mergeEvents, withoutLoggedSessionLines } from './table-feed/feed-paging';
import { matchEvent, type FoldKeep } from './table-feed/feed-tree';
import { withNarration, feedKeep, isFeedLine } from './table-feed/feed-split';
import MechanicalLog from './MechanicalLog';
import type { FeedEntity } from './table-feed/TableFeedRows';
import EncounterPanel from './EncounterPanel';
import SessionWarmupOverlay from './SessionWarmupOverlay';

// ── Props ──────────────────────────────────────────────────────────────────

interface CampaignTerminalProps {
  campaignId: string;
  visible: boolean;
  /** The current user's character in this campaign (auto-detected) */
  character?: { id: string; name: string; data: GrowthCharacter } | null;
  /** Called when a command modifies character state */
  onCharacterUpdate?: (characterId: string, character: GrowthCharacter, changes: string[]) => void;
  /** Called on revert to refresh canvas */
  onRevert?: () => void;
  /** Called after a rest completes so parent can refresh all character data */
  onRestComplete?: () => void;
  /** Current user info */
  userId?: string;
  username?: string;
  userRole?: string;
  /** Real-time SSE events from the campaign stream */
  streamEvents?: TerminalEvent[];
  /** Tick counter to detect new stream events without reference comparison */
  streamEventsTick?: number;
  /** Whether the SSE stream is connected */
  connected?: boolean;
  /** Users currently connected via SSE */
  connectedUsers?: Array<{ userId: string; username: string; role: string }>;
  /** All characters in this campaign (for GM skill check targeting) */
  campaignCharacters?: Array<{ id: string; name: string }>;
  /** Characters, places and items of the campaign — the TABLE feed's portraits and entity spans. */
  tableEntities?: FeedEntity[];
  /** Fold the drawer (the ▾ at the end of the tab row). */
  onClose?: () => void;
}

// ── Filter Config ──────────────────────────────────────────────────────────

/** Rows per source per page of the one feed's history. */
const FEED_PAGE = 60;

/** The Terminal feed shows narrative lines only (Mike 2026-10-08); the mechanics are in the jEWL tab's Log. */
const FEED_KEEP: FoldKeep = (e) => feedKeep(e);


// Map filter keys to event types for querying
function filterToTypes(filter: TerminalFilter): string[] | undefined {
  switch (filter) {
    case 'all': return undefined;
    case 'chat': return ['chat'];
    case 'dice': return ['dice_roll'];
    case 'changes': return ['changelog'];
    case 'ai': return ['ai_message'];
    case 'events': return ['game_event', 'command'];
    default: return undefined;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CampaignTerminal({
  campaignId,
  visible,
  character,
  onCharacterUpdate,
  onRevert,
  onRestComplete,
  userId: _userId,
  username: _username,
  userRole: _userRole,
  streamEvents,
  streamEventsTick,
  connected,
  connectedUsers,
  campaignCharacters,
  tableEntities,
  onClose,
}: CampaignTerminalProps) {
  // 'terminal' = the one feed (TERMINAL and TABLE merged, Mike 2026-10-08).
  const [terminalMode, setTerminalMode] = useState<'terminal' | 'copilot'>('terminal');
  // Inside the jEWL tab: the conversation, or the mechanical Log (Mike 2026-10-08).
  const [jewlView, setJewlView] = useState<'conversation' | 'log'>('conversation');
  /** The Log rows a feed line's link jumped to. */
  const [logReveal, setLogReveal] = useState<Set<string> | null>(null);
  const openLog = useCallback((ids: string[]) => {
    setLogReveal(new Set(ids));
    setJewlView('log');
    setTerminalMode('copilot');
  }, []);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // Perception unit 9 (NEXT_PUBLIC_PERCEPTION_FEED): the server says whether this feed is the viewer's
  // perceived one (a Trailblazer) — it filters; the client only renders the tokens and re-reads on a nudge.
  const [perceivedFeed, setPerceivedFeed] = useState(false);
  // Unit 10: the Watcher's "view as character" — null = the truth record. Remembered per viewer (localStorage only).
  const [viewAs, setViewAsState] = useState<string | null>(null);
  const viewAsOffered = perceptionFeedOn() && (_userRole === 'WATCHER' || _userRole === 'GODHEAD' || _userRole === 'ADMIN');
  const viewer = _userId ?? 'anon';
  useEffect(() => { if (viewAsOffered) setViewAsState(readViewAs(campaignId, viewer)); }, [viewAsOffered, campaignId, viewer]);
  const setViewAs = useCallback((id: string | null) => { writeViewAs(campaignId, viewer, id); setViewAsState(id); }, [campaignId, viewer]);
  const viewAsRef = useRef<string | null>(null);
  viewAsRef.current = viewAs;
  const viewAsCharacters = useMemo<ViewAsCharacter[]>(() => (tableEntities ?? [])
    .filter((e) => e.kind === 'character' || e.kind === 'npc')
    .map((e) => ({ id: e.id, name: e.name, kind: e.kind as ViewAsCharacter['kind'] }))
    .sort((a, b) => a.name.localeCompare(b.name)), [tableEntities]);
  // No filter chips (Mike 2026-10-08): the one feed is searched, not filtered.
  const activeFilter = 'all' as TerminalFilter;
  const [reverting, setReverting] = useState<string | null>(null);
  const [sessions, setSessions] = useState<GameSessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<GameSessionInfo | null>(null);
  // Session-start loading screen (Mike 2026-10-01): shown once per active
  // session, for the GM, while the self-hosted core cold-starts.
  const [warmup, setWarmup] = useState<{ startedAt: string; number: number } | null>(null);
  const warmupSeenRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<CommandInputHandle>(null);

  // TABLE mode = GM roleplay through NPCs; only exists while a session is
  // live (Mike 2026-09-02: "another tab there that is only available when
  // the canvas is in session mode").
  const isGM = _userRole === 'WATCHER' || _userRole === 'GODHEAD' || _userRole === 'ADMIN';
  const tableAvailable = isGM && !!activeSession;

  // Recorder chunk length (U2c): while a session is live AND the engine's split
  // loop is on, the always-on mic sends shorter chunks so beings hear the table
  // sooner. `splitLoop` comes from GET /table (a missing field = false), so this
  // is a no-op until the server exposes it and the switch is on.
  const [splitLoop, setSplitLoop] = useState(false);
  useEffect(() => {
    if (!activeSession || !isGM) { setSplitLoop(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/table`);
        if (!res.ok) return;
        const data = (await res.json()) as { splitLoop?: boolean };
        if (!cancelled) setSplitLoop(data.splitLoop === true);
      } catch { /* leave false */ }
    })();
    return () => { cancelled = true; };
  }, [campaignId, activeSession, isGM]);
  useEffect(() => {
    const ms = activeSession && splitLoop ? RECORDER_CHUNK_MS_LIVE : RECORDER_CHUNK_MS_DEFAULT;
    window.dispatchEvent(new CustomEvent(RECORDER_CHUNK_EVENT, { detail: { ms } }));
  }, [activeSession, splitLoop]);

  // P1 ◆ on the TABLE tab while the mic feeds the table (same source as the
  // JEWL header and the TERMINAL toggle; JewlChip owns the 12 s TTL).
  const [tableFeedLive, setTableFeedLive] = useState<{ heard: number; holding: boolean } | null>(null);
  useEffect(() => {
    const onFeed = (e: Event) => {
      const d = (e as CustomEvent<{ fed?: boolean; heard?: number; holding?: boolean }>).detail;
      setTableFeedLive(d?.fed ? { heard: d.heard ?? 0, holding: !!d.holding } : null);
    };
    window.addEventListener(TABLE_FEED_EVENT, onFeed);
    return () => window.removeEventListener(TABLE_FEED_EVENT, onFeed);
  }, []);


  // A session just became active (started here, or already live on a reload):
  // one lane check; if the core is not answering yet, raise the loading screen.
  useEffect(() => {
    if (!activeSession || !isGM) return;
    if (warmupSeenRef.current === activeSession.id) return;
    warmupSeenRef.current = activeSession.id;
    const { id, startedAt, number } = activeSession;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/lane`);
        if (!res.ok || cancelled) return;
        const lane = (await res.json()) as { phase: string };
        if (cancelled || warmupSeenRef.current !== id) return;
        if (lane.phase !== 'ready' && lane.phase !== 'disabled') setWarmup({ startedAt, number });
      } catch { /* the speak bar's status strip still covers it */ }
    })();
    return () => { cancelled = true; };
  }, [activeSession, isGM, campaignId]);
  useEffect(() => { if (!activeSession) setWarmup(null); }, [activeSession]);
  const closeWarmup = useCallback(() => setWarmup(null), []);

  // ── Fetch merged events ──────────────────────────────────────────────────

  // One feed, paged (Mike 2026-10-08): the newest page on open, earlier
  // sessions as the reader scrolls back. `olderCursor` = where the next older
  // page starts; null = the campaign's beginning is loaded.
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Set right before older rows are prepended, so the view can hold its place. */
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);

  const fetchPage = useCallback(async (cursor?: string): Promise<{ rows: TerminalEvent[]; cutoff: string | null }> => {
      const filterTypes = filterToTypes(activeFilter);
      const wantEvents = activeFilter !== 'changes';
      const wantChanges = activeFilter === 'all' || activeFilter === 'changes';

      // Fetch changelog entries
      const clParams = new URLSearchParams({ campaignId, limit: String(FEED_PAGE) });
      if (cursor) clParams.set('cursor', cursor);
      if (viewAs) clParams.set('viewAs', viewAs);
      const clRes = wantChanges ? await fetch(`/api/changelog?${clParams}`, { cache: 'no-store' }) : null;
      const clData = clRes?.ok ? await clRes.json() : { entries: [], nextCursor: null };

      // Fetch campaign events
      const evParams = new URLSearchParams({ limit: String(FEED_PAGE) });
      if (cursor) evParams.set('cursor', cursor);
      if (viewAs) evParams.set('viewAs', viewAs);
      if (filterTypes && activeFilter !== 'changes') {
        evParams.set('types', filterTypes.filter(t => t !== 'changelog').join(','));
      }
      const evRes = wantEvents ? await fetch(`/api/campaigns/${campaignId}/events?${evParams}`, { cache: 'no-store' }) : null;
      // A view the server refuses (not this campaign's Watcher, character gone) falls back to the truth record.
      if (viewAs && evRes && (evRes.status === 403 || evRes.status === 404)) { setViewAs(null); return { rows: [], cutoff: null }; }
      const evData = evRes?.ok ? await evRes.json() : { events: [], nextCursor: null };
      if (perceptionFeedOn() && evRes?.ok) setPerceivedFeed(evData.perceived === true);

      // Wrap changelog entries as TerminalEvents
      const changelogEvents: TerminalEvent[] = (clData.entries || []).map((entry: ChangeLogEntry) => ({
        id: `cl-${entry.id}`,
        type: 'changelog' as const,
        timestamp: entry.createdAt,
        campaignId: entry.campaignId,
        actor: entry.actor,
        actorUserId: entry.actorUserId,
        actorName: entry.actor === 'gm' ? 'GM' : entry.characterName || 'Unknown',
        characterId: entry.characterId,
        characterName: entry.characterName,
        payload: {
          kind: 'changelog' as const,
          entryId: entry.id,
          category: entry.category,
          description: entry.description,
          changes: entry.changes,
          source: entry.source,
          revertible: entry.revertible,
          reverted: !!entry.revertedAt,
        } as ChangeLogPayload,
      }));

      // Wrap campaign events as TerminalEvents
      const campaignEvents: TerminalEvent[] = (evData.events || []).map((ev: {
        id: string; campaignId: string; sessionId: string | null; type: string;
        actor: string; actorUserId: string; actorName: string;
        characterId: string | null; characterName: string | null;
        payload: Record<string, unknown>; createdAt: string;
      }) => ({
        id: `ev-${ev.id}`,
        type: ev.type,
        timestamp: ev.createdAt,
        campaignId: ev.campaignId,
        actor: ev.actor,
        actorUserId: ev.actorUserId,
        actorName: ev.actorName,
        characterId: ev.characterId || undefined,
        characterName: ev.characterName || undefined,
        sessionId: ev.sessionId,
        payload: ev.payload,
      }));

      // Merge and sort by timestamp (newest first for display, we'll reverse for render)
      let merged = [...changelogEvents, ...campaignEvents];

      // Apply client-side filter for 'changes' (already server-filtered for campaign events)
      if (activeFilter === 'changes') {
        merged = merged.filter(e => e.type === 'changelog');
      } else if (activeFilter === 'chat') {
        merged = merged.filter(e => e.payload.kind === 'chat');
      } else if (activeFilter === 'dice') {
        merged = merged.filter(e => e.payload.kind === 'dice_roll');
      } else if (activeFilter === 'events') {
        merged = merged.filter(e => e.payload.kind === 'game_event' || e.payload.kind === 'command');
      }

      merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Both sources come newest-first; keep only what is newer than the later
      // of their oldest rows (while a source has more), so no gap shows.
      const evRows = (evData.events || []) as Array<{ createdAt: string }>;
      const clRows = (clData.entries || []) as Array<{ createdAt: string }>;
      const cutoff = pageCutoff([
        { oldest: evRows.length ? evRows[evRows.length - 1].createdAt : null, hasMore: wantEvents && !!evData.nextCursor },
        { oldest: clRows.length ? clRows[clRows.length - 1].createdAt : null, hasMore: wantChanges && !!clData.nextCursor },
      ]);
      return { rows: keepFrom(merged, cutoff), cutoff };
  }, [campaignId, activeFilter, viewAs, setViewAs]);

  /** The newest page. `reset` (open / filter change) replaces the feed; otherwise new rows merge in and older pages stay. */
  const fetchEvents = useCallback(async (reset = false) => {
    try {
      const asked = viewAsRef.current;
      const { rows, cutoff } = await fetchPage();
      if (asked !== viewAsRef.current) return; // the view changed meanwhile — never mix two views' rows
      setEvents(prev => (reset ? rows : mergeEvents(prev, rows)));
      if (reset) setOlderCursor(cutoff);
    } catch { /* keep what is shown */ }
    setLoading(false);
  }, [fetchPage]);

  /** Scrolled back to the top: the next older page, held in place. */
  const loadOlder = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const asked = viewAsRef.current;
      const { rows, cutoff } = await fetchPage(olderCursor);
      if (asked !== viewAsRef.current) { setLoadingOlder(false); return; }
      const el = scrollRef.current;
      if (el) prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setEvents(prev => mergeEvents(prev, rows));
      setOlderCursor(cutoff);
    } catch { /* try again on the next scroll */ }
    setLoadingOlder(false);
  }, [olderCursor, loadingOlder, fetchPage]);

  // ── Fetch sessions ─────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
      setActiveSession(data.active || null);
    } catch { /* silent */ }
  }, [campaignId]);

  useEffect(() => {
    if (visible) {
      fetchEvents(true);
      fetchSessions();
    }
  }, [visible, fetchEvents, fetchSessions]);

  // Merge stream events into the event list (replaces 5s polling)
  useEffect(() => {
    if (!streamEvents || streamEvents.length === 0) return;
    // Viewing as a character: the Watcher's stream carries the truth — the view re-reads on the memory push instead.
    if (viewAsRef.current) return;
    setEvents(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const newEvents = streamEvents.filter(e => !existingIds.has(e.id));
      if (newEvents.length === 0) return prev;
      const merged = [...prev, ...newEvents];
      merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      return merged;
    });
  }, [streamEventsTick, streamEvents]);

  // Fallback poll every 30s (in case SSE reconnects and misses events)
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      fetchEvents();
      fetchSessions();
    }, 30_000);
    return () => clearInterval(interval);
  }, [visible, fetchEvents, fetchSessions]);

  // Perceived feed: the server pushes a text-free nudge to this viewer alone when their character's memory
  // row is written (lib/perceived-feed-push; CampaignCanvas relays it) — read the feed once. The 30 s
  // fallback poll above is the only timer.
  useEffect(() => {
    if (!visible || !perceptionFeedOn() || !perceivedFeed) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onStale = (e: Event) => {
      // Viewing as a character: only that character's memory moving matters.
      const cid = (e as CustomEvent<{ characterId?: string | null }>).detail?.characterId;
      if (viewAsRef.current && cid && cid !== viewAsRef.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => { void fetchEvents(); }, 150);
    };
    window.addEventListener(PERCEIVED_FEED_STALE_EVENT, onStale);
    return () => { window.removeEventListener(PERCEIVED_FEED_STALE_EVENT, onStale); if (t) clearTimeout(t); };
  }, [visible, perceivedFeed, fetchEvents]);

  // Newest at the bottom: new rows pin the view to the bottom — unless older
  // rows were just prepended (scrolling back), then the view holds its place.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = prependAnchorRef.current;
    if (anchor) {
      prependAnchorRef.current = null;
      el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  // Scrolled to the top of what is loaded → the next older page.
  const onFeedScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop < 80 && olderCursor && !loadingOlder) void loadOlder();
  }, [olderCursor, loadingOlder, loadOlder]);

  // Listen for roll-skill events from SkillsCard
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.skillName && commandInputRef.current) {
        const governors: string[] = detail.governors || [];
        const defaultAttr = governors[0] || 'willpower';
        commandInputRef.current.prefill(`/check ${detail.skillName} dr: effort:0 attr:${defaultAttr}`);
      }
    };
    window.addEventListener('growth:roll-skill', handler);
    return () => window.removeEventListener('growth:roll-skill', handler);
  }, []);

  // Listen for 3D dice settling on the canvas — post results to campaign terminal
  // Only posts events for physical dice throws (spawned/flung on canvas).
  // Service-initiated rolls (skill checks, etc.) already post their own events.
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        dice: Array<{ dieType: string; color: string; value: number; label: string }>;
        source: 'physical' | 'service';
      };
      if (!detail?.dice || detail.dice.length === 0) return;

      // Service rolls already post their own terminal event — skip to avoid duplicates
      if (detail.source === 'service') return;

      const { dice } = detail;
      const total = dice.reduce((sum, d) => sum + d.value, 0);
      const diceStr = dice.map(d => `${d.dieType.toUpperCase()}→${d.value}`).join(' + ');
      const context = dice.length === 1
        ? `${dice[0].dieType.toUpperCase()} roll`
        : `${dice.length} dice roll`;

      // Build a minimal DiceRollPayload for the terminal
      const payload: DiceRollPayload = {
        kind: 'dice_roll',
        context,
        fateDie: { die: dice[0].dieType, value: dice[0].value },
        total,
        isSkilled: false,
        physicalDice: dice.map(d => ({ dieType: d.dieType, value: d.value })),
      };

      // Post to campaign events
      await fetch(`/api/campaigns/${campaignId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dice_roll',
          characterId: character?.id,
          characterName: character?.name,
          payload: {
            ...payload,
            context: `${context}: ${diceStr} = ${total}`,
          },
        }),
      });

      fetchEvents();
    };
    window.addEventListener('growth:dice-settled', handler);
    return () => window.removeEventListener('growth:dice-settled', handler);
  }, [campaignId, character, fetchEvents]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRevert = async (entryId: string) => {
    if (!confirm('Revert this change? The previous value will be restored.')) return;
    setReverting(entryId);
    try {
      const res = await fetch(`/api/changelog/${entryId}/revert`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Revert failed');
        return;
      }
      fetchEvents();
      onRevert?.();
    } catch {
      alert('Connection failed');
    } finally {
      setReverting(null);
    }
  };

  // ── Dice API Intent Handler ──────────────────────────────────────────────

  const executeDiceApiCall = useCallback(async (intent: DiceApiIntent) => {
    try {
      const res = await fetch(intent.endpoint, {
        method: intent.method,
        headers: intent.body ? { 'Content-Type': 'application/json' } : undefined,
        body: intent.body ? JSON.stringify(intent.body) : undefined,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        // Post error as command event
        await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'command',
            characterId: character?.id,
            characterName: character?.name,
            payload: { kind: 'command', input: intent.context.input, result: err.error || 'Roll failed', success: false },
          }),
        });
        return;
      }

      const data = await res.json();

      // Handle injection commands (GET list, POST register, DELETE)
      if (intent.endpoint.includes('/inject')) {
        let resultText = '';
        if (intent.method === 'GET') {
          const injections = data.injections || [];
          resultText = injections.length === 0
            ? 'No active injections'
            : injections.map((inj: { id: string; filterType: string; overrideType: string; reason: string }) =>
                `[${inj.id}] filter:${inj.filterType} override:${inj.overrideType} — ${inj.reason}`
              ).join('\n');
        } else if (intent.method === 'DELETE') {
          resultText = data.cleared ? 'All injections cleared' : (data.removed ? `Removed ${data.id}` : `Not found: ${data.id}`);
        } else {
          resultText = data.id ? `Injection ${data.id} registered` : 'Injection registered';
        }

        await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'command',
            payload: { kind: 'command', input: intent.context.input, result: resultText, success: true } as CommandPayload,
          }),
        });
        fetchEvents();
        return;
      }

      // Handle dice roll results — build terminal event and emit to 3D viz
      const rolls = data.rolls || [];
      const sdRoll = rolls.find((r: { label: string }) => r.label === 'Skill Die');
      const fdRoll = rolls.find((r: { label: string }) => r.label === 'Fate Die') || rolls[0];

      const isDeathSave = intent.endpoint.includes('/deathsave');
      const isCheck = intent.endpoint.includes('/check') || (intent.context.skillName && !isDeathSave);
      const skillName = intent.context.skillName;

      const payload: DiceRollPayload = {
        kind: 'dice_roll',
        context: isDeathSave
          ? `Death Save vs Lady Death (DR ${data.dr})`
          : skillName
            ? `${skillName} check vs DR ${data.dr}`
            : `Quick roll`,
        skillName: isCheck ? skillName : undefined,
        skillLevel: isCheck ? (intent.body as Record<string, unknown>)?.skillLevel as number : undefined,
        skillDie: sdRoll ? { die: sdRoll.die, value: sdRoll.value, isFlat: sdRoll.die === 'flat' } : undefined,
        fateDie: fdRoll ? { die: fdRoll.die, value: fdRoll.value } : { die: 'unknown', value: 0 },
        effort: (intent.body as Record<string, unknown>)?.effort as number,
        effortAttribute: (intent.body as Record<string, unknown>)?.effortAttribute as string,
        total: data.total,
        dr: data.dr,
        success: data.success,
        margin: data.margin,
        isSkilled: !!(intent.body as Record<string, unknown>)?.isSkilled,
      };

      // Emit to event bus for 3D dice visualization
      const rollResult: RollResult = {
        id: data.id,
        request: {
          id: data.id,
          source: isDeathSave
            ? { type: 'death_save', characterId: String((intent.body as Record<string, unknown>)?.characterId || '') }
            : skillName
              ? { type: 'skill_check', skillName, skillLevel: Number((intent.body as Record<string, unknown>)?.skillLevel) || 0, characterId: String((intent.body as Record<string, unknown>)?.characterId || '') }
              : { type: 'quick_roll', context: `Quick roll` },
          dice: rolls.map((r: { die: string; label: string; maxValue: number }) => ({
            die: r.die,
            label: r.label,
            sides: r.maxValue || 0,
          })),
        },
        rolls: rolls.map((r: { die: string; label: string; value: number; maxValue: number }) => ({
          die: r.die,
          label: r.label,
          value: r.value,
          maxValue: r.maxValue || 0,
          natural: r.value,
          wasInjected: false,
        })),
        total: data.total,
        dr: data.dr,
        success: data.success,
        margin: data.margin,
        timestamp: data.timestamp || Date.now(),
        injected: false,
        injectionVisible: false,
      };
      diceEvents.emit(rollResult);

      // Spend effort from character (deterministic, client-side)
      if (intent.effortSpend && character && onCharacterUpdate) {
        const spendResult = spendAttribute(
          character.data,
          intent.effortSpend.attribute as AttributeName,
          intent.effortSpend.amount,
        );
        if (spendResult.character) {
          onCharacterUpdate(character.id, spendResult.character, spendResult.changes);
        }
      }

      // Post dice event to campaign events
      await fetch(`/api/campaigns/${campaignId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dice_roll',
          characterId: character?.id,
          characterName: character?.name,
          payload,
        }),
      });

      fetchEvents();
    } catch {
      // Post connection error
      await fetch(`/api/campaigns/${campaignId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'command',
          payload: { kind: 'command', input: intent.context.input, result: 'Connection failed', success: false },
        }),
      }).catch(() => {});
    }
  }, [campaignId, character, onCharacterUpdate, fetchEvents]);

  // ── Command Submit Handler ──────────────────────────────────────────────

  const handleCommandSubmit = useCallback(async (input: string) => {
    const trimmed = input.trim();

    // Plain text = chat message
    if (!trimmed.startsWith('/')) {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'chat',
            characterId: character?.id,
            characterName: character?.name,
            payload: { kind: 'chat', message: trimmed },
          }),
        });
        if (!res.ok) {
          console.error('[Terminal] Chat POST failed:', res.status);
        }
        await fetchEvents();
      } catch (err) {
        console.error('[Terminal] Chat POST error:', err);
      }
      return;
    }

    // Handle /session commands server-side
    if (trimmed.startsWith('/session')) {
      const parts = trimmed.split(/\s+/);
      const action = parts[1]?.toLowerCase();
      if (action === 'start' || action === 'end') {
        try {
          const res = await fetch(`/api/campaigns/${campaignId}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              name: action === 'start' ? parts.slice(2).join(' ') || undefined : undefined,
            }),
          });
          if (res.ok) {
            const sessionData = await res.json();
            await fetch(`/api/campaigns/${campaignId}/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'game_event',
                payload: {
                  kind: 'game_event',
                  eventType: action === 'start' ? 'session_start' : 'session_end',
                  description: action === 'start'
                    ? `Session ${sessionData.session.number} started${sessionData.session.name ? `: ${sessionData.session.name}` : ''}`
                    : `Session ${sessionData.session.number} ended`,
                },
              }),
            });
            fetchEvents();
            fetchSessions();
          }
        } catch { /* silent */ }
        return;
      }
    }

    // Handle /skillcheck — GM initiates multi-step skill check
    // Usage: /skillcheck <characterName> <skillName> dr:<n>
    // Usage: /skillcheck <characterName> attr:<attribute> dr:<n>
    if (trimmed.startsWith('/skillcheck')) {
      const parts = trimmed.split(/\s+/);
      const charName = parts[1];
      if (!charName) {
        await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'command',
            payload: { kind: 'command', input: trimmed, result: 'Usage: /skillcheck <character> <skill> dr:<n>\n       /skillcheck <character> attr:<attribute> dr:<n>', success: false },
          }),
        });
        fetchEvents();
        return;
      }

      // Parse remaining args
      const remaining = parts.slice(2);
      let skillName: string | undefined;
      let attrName: string | undefined;
      let dr: number | undefined;
      for (const arg of remaining) {
        if (arg.startsWith('dr:')) dr = parseInt(arg.slice(3));
        else if (arg.startsWith('attr:')) attrName = arg.slice(5);
        else if (!skillName) skillName = arg;
      }

      if (!dr) {
        await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'command',
            payload: { kind: 'command', input: trimmed, result: 'Missing dr:<number>', success: false },
          }),
        });
        fetchEvents();
        return;
      }

      // Look up character by name from campaign characters
      try {
        const target = (campaignCharacters || []).find(c =>
          c.name.toLowerCase() === charName.toLowerCase()
        );

        if (!target) {
          await fetch(`/api/campaigns/${campaignId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'command',
              payload: { kind: 'command', input: trimmed, result: `Character "${charName}" not found in this campaign`, success: false },
            }),
          });
          fetchEvents();
          return;
        }

        // Initiate the skill check
        const checkRes = await fetch(`/api/campaigns/${campaignId}/skill-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: target.id,
            skillName: skillName || undefined,
            attributeName: attrName || (skillName ? undefined : 'willpower'),
            dr,
          }),
        });

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          await fetch(`/api/campaigns/${campaignId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'game_event',
              payload: {
                kind: 'game_event',
                eventType: 'skill_check',
                description: `Skill check initiated for ${checkData.characterName}: ${checkData.skillName || 'unskilled'} vs DR ${dr} — SD: ${checkData.sdDie.toUpperCase()} → ${checkData.sdResult} [${checkData.difficultyHint.toUpperCase()}]`,
              },
            }),
          });
        } else {
          const err = await checkRes.json();
          await fetch(`/api/campaigns/${campaignId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'command',
              payload: { kind: 'command', input: trimmed, result: err.error || 'Skill check failed', success: false },
            }),
          });
        }
        fetchEvents();
      } catch {
        await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'command',
            payload: { kind: 'command', input: trimmed, result: 'Connection failed', success: false },
          }),
        }).catch(() => {});
      }
      return;
    }

    // Parse and execute command
    const result = executeCommand(trimmed, character?.data || null);

    // If command returned a dice API intent, execute it server-side
    if (result.diceApiCall) {
      await executeDiceApiCall(result.diceApiCall);
      return;
    }

    // If command returned a rest API intent, execute server-side
    if (result.restApiCall) {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/rest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: result.restApiCall.type,
            characterIds: result.restApiCall.characterIds,
          }),
        });
        if (res.ok) {
          onRestComplete?.();
          fetchEvents();
        } else {
          const err = await res.json();
          await fetch(`/api/campaigns/${campaignId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'command',
              payload: { kind: 'command', input: `/rest ${result.restApiCall.type}`, result: err.error || 'Rest failed', success: false },
            }),
          });
          fetchEvents();
        }
      } catch { /* silent */ }
      return;
    }

    // If command modified character (spend/restore), push update
    if (result.character && character && onCharacterUpdate) {
      onCharacterUpdate(character.id, result.character, result.changes);
    }

    // Post events to server
    for (const event of result.events) {
      try {
        await fetch(`/api/campaigns/${campaignId}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: event.type,
            characterId: character?.id,
            characterName: character?.name,
            payload: event.payload,
          }),
        });
      } catch { /* silent */ }
    }

    fetchEvents();
  }, [campaignId, character, onCharacterUpdate, onRestComplete, fetchEvents, fetchSessions, executeDiceApiCall]);

  // ── The one feed (Mike 2026-10-08) ─────────────────────────────────────────
  // One feed, laid out as a fold tree (chapter > session > rest > encounter),
  // with one search field. The logged session_start/_end lines give way to the
  // session folds.
  const feedEvents = useMemo(() => withoutLoggedSessionLines(events), [events]);
  const emptyFrom = olderCursor ? (events[0]?.timestamp ?? null) : null;
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  // Narrative only, play only: mechanical rows become numberless lines where the
  // mapper knows them, and every feed line links to the mechanics behind it.
  const narrated = useMemo(() => withNarration(feedEvents, sessions), [feedEvents, sessions]);
  const hits = useMemo(() => {
    if (!searching) return 0;
    const q = query.trim().toLowerCase();
    return narrated.events.filter(e => isFeedLine(e, sessions) && matchEvent(e, q)).length;
  }, [narrated, sessions, query, searching]);

  const refreshEvents = useCallback(() => { void fetchEvents(); }, [fetchEvents]);

  // The encounter folds into the tree (no tab): its running state is matched to
  // its fold, whose body carries the full EncounterPanel. GM, live session only.
  const [liveEncounter, setLiveEncounter] = useState<{ id: string | null; name: string } | null>(null);
  const refreshEncounter = useCallback(async () => {
    if (!tableAvailable) { setLiveEncounter(null); return; }
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/encounters`);
      if (!res.ok) return;
      const j = (await res.json()) as { encounters?: Array<{ id: string; name: string; status: string }> };
      const live = (j.encounters ?? []).find(e => e.status === 'ACTIVE' || e.status === 'PAUSED');
      setLiveEncounter(live ? { id: live.id, name: live.name } : null);
    } catch { /* the fold just shows the create form */ }
  }, [campaignId, tableAvailable]);
  useEffect(() => { void refreshEncounter(); }, [refreshEncounter]);
  const onEncounterEvent = useCallback(() => { void refreshEncounter(); void fetchEvents(); }, [refreshEncounter, fetchEvents]);
  const encounter = useMemo(() => (tableAvailable ? {
    live: liveEncounter,
    render: () => <EncounterPanel campaignId={campaignId} campaignCharacters={campaignCharacters || []} onEvent={onEncounterEvent} />,
  } : undefined), [tableAvailable, liveEncounter, campaignId, campaignCharacters, onEncounterEvent]);

  // No text input when no session is live (Mike 2026-10-08: "No need for
  // inputs when not in play… They work with JEWL for any of that"). The
  // session itself still needs a switch, and `/session` typed into the old
  // input was the only one — so the GM gets a button that runs that same path.
  const [sessionBusy, setSessionBusy] = useState(false);
  const toggleSession = useCallback(async () => {
    if (sessionBusy) return;
    if (activeSession && !window.confirm(`End session ${activeSession.number}? Improvisations settle at session end.`)) return;
    setSessionBusy(true);
    try { await handleCommandSubmit(activeSession ? '/session end' : '/session start'); } finally { setSessionBusy(false); }
  }, [sessionBusy, activeSession, handleCommandSubmit]);

  const bebas = 'var(--font-bebas-neue), Bebas Neue, sans-serif';
  const mono = 'var(--font-terminal), Consolas, monospace';
  const tabStyle = (on: boolean): React.CSSProperties => ({
    fontFamily: bebas, fontSize: 19, letterSpacing: '0.07em', height: 36, padding: '3px 9px 0', border: 0,
    whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none',
    background: on ? '#002f6c' : 'none', color: on ? '#ffcc78' : '#002f6c', transform: on ? 'rotate(-1deg)' : undefined,
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#cfe2f2' }} data-drawer>
      {warmup && isGM && (
        <SessionWarmupOverlay
          campaignId={campaignId}
          startedAt={warmup.startedAt}
          sessionNumber={warmup.number}
          onReady={closeWarmup}
          onDismiss={closeWarmup}
        />
      )}

      {/* Header (v7 tab row): the feed · JEWL · ◆ state · session switch (GM) · fold. */}
      <div role="tablist" aria-label="Terminal drawer" data-drawer-tabs style={{
        display: 'flex', alignItems: 'center', height: 42, flex: 'none', padding: '0 0 0 6px', gap: 2,
        background: '#CBD9E8', borderBottom: '3px solid #002f6c', overflow: 'hidden',
      }}>
        <button role="tab" aria-selected={terminalMode === 'terminal'} onClick={() => setTerminalMode('terminal')} style={tabStyle(terminalMode === 'terminal')}>Terminal</button>
        <button role="tab" aria-selected={terminalMode === 'copilot'} onClick={() => setTerminalMode('copilot')} style={tabStyle(terminalMode === 'copilot')}>jEWL</button>
        <span style={{ flex: 1, minWidth: 4 }} />
        {(tableFeedLive || activeSession) && (
          <span
            data-table-feed-indicator={tableFeedLive ? '' : undefined}
            title={tableFeedLive
              ? (tableFeedLive.holding ? 'Holding an unfinished sentence for the next chunk' : 'The mic is feeding the table')
              : `Session ${activeSession!.number} is live`}
            style={{ fontFamily: bebas, fontSize: 17, letterSpacing: '0.05em', color: '#002f6c', whiteSpace: 'nowrap', flex: 'none', paddingTop: 3 }}
          >
            <span style={{ fontFamily: mono, fontSize: 13, verticalAlign: '1px', marginRight: 3, color: tableFeedLive ? (tableFeedLive.holding ? '#b07a00' : '#2f6fb0') : '#0f6e5e' }}>{'◆'}</span>
            {tableFeedLive ? `Table · ${tableFeedLive.heard}` : `Live · S${activeSession!.number}`}
          </span>
        )}
        {isGM && (
          <button onClick={() => void toggleSession()} disabled={sessionBusy} data-no-hold title={activeSession ? 'End the session' : 'Start a session'} style={{
            fontFamily: bebas, fontSize: 16, letterSpacing: '0.06em', height: 36, minWidth: 36, padding: '2px 8px 0', border: 0, cursor: 'pointer', flex: 'none',
            whiteSpace: 'nowrap', background: 'none', color: activeSession ? '#b0303b' : '#0f6e5e',
            boxShadow: `inset 0 0 0 2px ${activeSession ? '#b0303b' : '#0f6e5e'}`, marginLeft: 4,
          }}>
            {sessionBusy ? '…' : activeSession ? '■ End' : '▶ Session'}
          </button>
        )}
        <span
          title={connected ? `Live${connectedUsers?.length ? ` — ${connectedUsers.map(u => u.username).join(', ')}` : ''}` : 'Disconnected (polling)'}
          style={{ fontFamily: mono, fontSize: 12, color: connected ? '#0f6e5e' : '#6b7380', whiteSpace: 'nowrap', flex: 'none', marginLeft: 6 }}
        >
          {connected ? '◈' : '○'}
        </span>
        {onClose && (
          <button aria-label="Fold the terminal" data-no-hold onClick={onClose} style={{ width: 40, height: 36, flex: 'none', border: 0, background: 'none', color: '#002f6c', fontSize: 16, cursor: 'pointer' }}>{'▾'}</button>
        )}
      </div>

      {/* JEWL — his own tab (Mike 2026-10-08): the conversation, or the Log of mechanics. */}
      {terminalMode === 'copilot' && (
        <div role="tablist" aria-label="jEWL view" data-jewl-view style={{
          display: 'flex', flex: 'none', gap: 6, padding: '6px 10px 6px 14px', background: '#cfe2f2', borderBottom: '1px solid rgba(0,47,108,0.25)',
        }}>
          {(['conversation', 'log'] as const).map(v => (
            <button key={v} role="tab" aria-selected={jewlView === v} data-no-hold onClick={() => { setJewlView(v); if (v === 'conversation') setLogReveal(null); }} style={{
              minHeight: 36, padding: '2px 10px 0', border: 0, cursor: 'pointer', fontFamily: bebas, fontSize: 17, letterSpacing: '0.06em',
              background: jewlView === v ? '#000' : 'transparent', color: jewlView === v ? '#f5f4ef' : '#002f6c',
              boxShadow: jewlView === v ? undefined : 'inset 0 0 0 1.5px #002f6c',
            }}>
              {v === 'conversation' ? 'Conversation' : 'Log'}
            </button>
          ))}
        </div>
      )}
      {terminalMode === 'copilot' && jewlView === 'conversation' && (
        <CopilotChat
          campaignId={campaignId}
          visible={visible && terminalMode === 'copilot'}
          userId={_userId}
          username={_username}
          userRole={_userRole}
        />
      )}
      {terminalMode === 'copilot' && jewlView === 'log' && (
        <MechanicalLog
          campaignId={campaignId}
          events={feedEvents}
          sessions={sessions}
          entities={tableEntities ?? []}
          emptyFrom={emptyFrom}
          isGM={isGM}
          perceived={perceivedFeed}
          onRevert={handleRevert}
          reverting={reverting}
          reveal={logReveal}
          hasOlder={!!olderCursor}
          loadingOlder={loadingOlder}
          onLoadOlder={() => void loadOlder()}
        />
      )}

      {terminalMode === 'terminal' && (<>
        {/* One search field over the feed: matching lines, their folds opened. */}
        <div style={{ flex: 'none', padding: '6px 10px 6px 14px', background: '#cfe2f2', borderBottom: '1px solid rgba(0,47,108,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search the record"
              aria-label="Search the record"
              className="text-[16px] md:text-[14px]"
              data-feed-search
              style={{
                flex: 1, minWidth: 0, height: 36, outline: 0, padding: '0 8px',
                fontFamily: mono, color: '#000', background: '#fff', border: 0, borderLeft: '4px solid #002f6c',
              }}
            />
            {viewAsOffered && (
              <ViewAsPicker characters={viewAsCharacters} value={viewAs} onChange={setViewAs} />
            )}
          </div>
          {searching && (
            <div data-search-status style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, fontFamily: mono, fontSize: 12, color: '#393937' }}>
              <span>{hits} match{hits === 1 ? '' : 'es'} in loaded history{olderCursor ? ' — earlier history is not searched yet' : ''}</span>
              {olderCursor && (
                <button onClick={() => void loadOlder()} disabled={loadingOlder} data-no-hold style={{
                  minHeight: 36, padding: '0 4px', border: 0, background: 'none', cursor: 'pointer', fontFamily: mono, fontWeight: 700, fontSize: 12,
                }}>
                  <span style={{ background: '#000', color: '#f5f4ef', padding: '1px 5px' }}>{loadingOlder ? '[...LOADING...]' : '[SEARCH EARLIER]'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          onScroll={onFeedScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ backgroundColor: '#cfe2f2', minHeight: 0 }}
          data-feed-scroll
        >
          {olderCursor && !searching && (
            <div style={{ padding: '8px 12px 0 14px' }}>
              <button onClick={() => void loadOlder()} disabled={loadingOlder} data-no-hold style={{
                minHeight: 36, padding: 0, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: mono, fontWeight: 700, fontSize: 13, lineHeight: 1.62,
              }}>
                <span style={{ background: '#000', color: '#f5f4ef', padding: '1px 5px' }}>{loadingOlder ? '[...LOADING EARLIER...]' : '[...EARLIER HISTORY...]'}</span>
              </button>
            </div>
          )}
          {!olderCursor && !loading && !searching && feedEvents.length > 0 && (
            <div style={{ padding: '10px 14px 0', fontFamily: mono, fontSize: 12, color: '#393937' }}>[BEGINNING OF THE RECORD]</div>
          )}
          <TableFeed
            campaignId={campaignId}
            events={narrated.events}
            keep={FEED_KEEP}
            dropBetween
            logRefs={narrated.logRefs}
            onOpenLog={openLog}
            entities={tableEntities ?? []}
            loading={loading}
            onRevert={handleRevert}
            reverting={reverting}
            sessions={sessions}
            emptyFrom={emptyFrom}
            foldKey={`growth:feed-folds:${campaignId}`}
            perceived={perceivedFeed}
            query={query}
            encounter={encounter}
          />
          {/* Beings still speaking (U2c): their lines grow here, under the last
              logged event, and yield to the logged chat row when it lands. */}
          <BeingSpeakingLines
            active={!!activeSession && !searching && !viewAs}
            events={events}
            entities={tableEntities}
            onGrow={() => {
              const el = scrollRef.current;
              if (!el) return;
              const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
              if (nearBottom) el.scrollTop = el.scrollHeight;
            }}
          />
        </div>

        {/* Input only in play: the GM narrates through the speak bar; a
            Trailblazer speaks as their character. Out of play there is none
            (the /command path lives on in handleCommandSubmit + CommandInput). */}
        {activeSession && (isGM ? (
          <TableSpeakBar campaignId={campaignId} onEvent={refreshEvents} />
        ) : (
          <CommandInput
            ref={commandInputRef}
            onSubmit={handleCommandSubmit}
            placeholder={character ? `Speak or act as ${character.name}…` : 'Type a message…'}
          />
        ))}
      </>)}
    </div>
  );
}
