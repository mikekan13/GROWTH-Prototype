"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import TerminalEventRow from './TerminalEventRow';
import CommandInput from './CommandInput';
import type { CommandInputHandle } from './CommandInput';
import type { TerminalEvent, TerminalFilter, ChangeLogPayload, GameSessionInfo } from '@/types/terminal';
import type { ChangeLogEntry } from '@/types/changelog';
import type { GrowthCharacter } from '@/types/growth';
import { executeCommand, type DiceApiIntent } from '@/lib/terminal-commands';
import { spendAttribute, type AttributeName } from '@/lib/character-actions';
import { diceEvents } from '@/lib/dice-events';
import type { RollResult } from '@/types/dice';
import type { DiceRollPayload, CommandPayload } from '@/types/terminal';

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
  /** Current user info */
  userId?: string;
  username?: string;
  userRole?: string;
}

// ── Filter Config ──────────────────────────────────────────────────────────

const FILTERS: { key: TerminalFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '' },
  { key: 'chat', label: 'Chat', icon: '\uD83D\uDCAC' },
  { key: 'dice', label: 'Dice', icon: '\uD83C\uDFB2' },
  { key: 'changes', label: 'Changes', icon: '\u25C8' },
  { key: 'events', label: 'Events', icon: '\u2550' },
];

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
  userId: _userId,
  username: _username,
  userRole: _userRole,
}: CampaignTerminalProps) {
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<TerminalFilter>('all');
  const [reverting, setReverting] = useState<string | null>(null);
  const [sessions, setSessions] = useState<GameSessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<GameSessionInfo | null>(null);
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<CommandInputHandle>(null);

  // ── Fetch merged events ──────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    try {
      const filterTypes = filterToTypes(activeFilter);

      // Fetch changelog entries
      const clParams = new URLSearchParams({ campaignId, limit: '100' });
      const clRes = await fetch(`/api/changelog?${clParams}`, { cache: 'no-store' });
      const clData = clRes.ok ? await clRes.json() : { entries: [] };

      // Fetch campaign events
      const evParams = new URLSearchParams({ limit: '100' });
      if (filterTypes && activeFilter !== 'changes') {
        evParams.set('types', filterTypes.filter(t => t !== 'changelog').join(','));
      }
      const evRes = await fetch(`/api/campaigns/${campaignId}/events?${evParams}`, { cache: 'no-store' });
      const evData = evRes.ok ? await evRes.json() : { events: [] };

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

      setEvents(merged);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [campaignId, activeFilter]);

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
      fetchEvents();
      fetchSessions();
    }
  }, [visible, fetchEvents, fetchSessions]);

  // Auto-poll every 5s when visible
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      fetchEvents();
      fetchSessions();
    }, 5000);
    return () => clearInterval(interval);
  }, [visible, fetchEvents, fetchSessions]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

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

    // Parse and execute command
    const result = executeCommand(trimmed, character?.data || null);

    // If command returned a dice API intent, execute it server-side
    if (result.diceApiCall) {
      await executeDiceApiCall(result.diceApiCall);
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
  }, [campaignId, character, onCharacterUpdate, fetchEvents, fetchSessions, executeDiceApiCall]);

  const toggleSessionCollapse = (sessionId: string) => {
    setCollapsedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  // ── Group events by session ──────────────────────────────────────────────

  interface EventGroup {
    sessionId: string | null;
    sessionInfo: GameSessionInfo | null;
    label: string;
    events: TerminalEvent[];
  }

  const groupedEvents: EventGroup[] = (() => {
    if (sessions.length === 0) {
      // No sessions — show all events flat
      return [{ sessionId: null, sessionInfo: null, label: 'All Activity', events }];
    }

    const groups: EventGroup[] = [];

    // Group events by sessionId
    const bySession = new Map<string | null, TerminalEvent[]>();
    for (const ev of events) {
      const sid = ev.sessionId ?? null;
      if (!bySession.has(sid)) bySession.set(sid, []);
      bySession.get(sid)!.push(ev);
    }

    // Build ordered groups: between-session events come between sessions
    // For now, simple: null session first, then each session in order
    const betweenEvents = bySession.get(null) || [];
    if (betweenEvents.length > 0) {
      groups.push({ sessionId: null, sessionInfo: null, label: 'Between Sessions', events: betweenEvents });
    }

    for (const session of sessions) {
      const sessionEvents = bySession.get(session.id) || [];
      groups.push({
        sessionId: session.id,
        sessionInfo: session,
        label: `Session ${session.number}${session.name ? `: ${session.name}` : ''}`,
        events: sessionEvents,
      });
    }

    return groups;
  })();

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#0a0a1a' }}>
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b" style={{ borderColor: 'rgba(34, 171, 148, 0.3)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span style={{ color: '#22ab94', fontSize: '14px' }}>{'\u25C8'}</span>
            <h2 className="text-sm uppercase tracking-widest" style={{
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              color: '#22ab94',
              fontSize: '18px',
            }}>CAMPAIGN TERMINAL</h2>
            {activeSession && (
              <span className="text-[13px] px-2 py-0.5" style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                color: '#22ab94',
                border: '1px solid rgba(34,171,148,0.4)',
                borderRadius: '2px',
              }}>
                SESSION {activeSession.number} ACTIVE
              </span>
            )}
          </div>
          <button
            onClick={() => { fetchEvents(); fetchSessions(); }}
            className="px-2 py-1 text-[12px] uppercase tracking-wider transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: '#22ab94',
              border: '1px solid rgba(34, 171, 148, 0.4)',
              backgroundColor: 'transparent',
            }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(34, 171, 148, 0.15)')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            REFRESH
          </button>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className="px-2 py-1 text-[13px] uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                letterSpacing: '0.05em',
                color: activeFilter === f.key ? '#0a0a1a' : '#888',
                backgroundColor: activeFilter === f.key ? '#22ab94' : 'transparent',
                border: `1px solid ${activeFilter === f.key ? '#22ab94' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '2px',
              }}
            >
              {f.icon && <span className="mr-1">{f.icon}</span>}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Event Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && events.length === 0 && (
          <div className="text-center py-8 text-[13px]" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            color: 'rgba(34, 171, 148, 0.5)',
          }}>Loading...</div>
        )}

        {!loading && events.length === 0 && (
          <div className="text-center py-8">
            <div className="text-[13px] mb-1" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(34, 171, 148, 0.4)',
            }}>Terminal ready</div>
            <div className="text-[13px]" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255,255,255,0.2)',
            }}>Type a message or use /commands. Activity will appear here.</div>
          </div>
        )}

        {groupedEvents.map((group, gi) => {
          const isCollapsed = group.sessionId ? collapsedSessions.has(group.sessionId) : false;

          return (
            <div key={group.sessionId || `between-${gi}`}>
              {/* Session header (only show if there are sessions) */}
              {sessions.length > 0 && (
                <div
                  className="flex items-center gap-2 px-2 py-1 cursor-pointer my-1"
                  onClick={() => group.sessionId && toggleSessionCollapse(group.sessionId)}
                  style={{
                    backgroundColor: 'rgba(34,171,148,0.08)',
                    borderRadius: '2px',
                    border: '1px solid rgba(34,171,148,0.15)',
                  }}
                >
                  {group.sessionId && (
                    <span className="text-[12px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {isCollapsed ? '\u25B6' : '\u25BC'}
                    </span>
                  )}
                  <span className="text-[12px] uppercase tracking-wider flex-1" style={{
                    fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                    color: '#22ab94',
                    letterSpacing: '0.1em',
                  }}>
                    {group.label}
                  </span>
                  <span className="text-[12px]" style={{
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                    color: 'rgba(255,255,255,0.2)',
                  }}>
                    {group.events.length} events
                  </span>
                  {group.sessionInfo?.endedAt && (
                    <span className="text-[12px]" style={{
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      color: 'rgba(255,255,255,0.15)',
                    }}>ended</span>
                  )}
                </div>
              )}

              {/* Events (hidden if session is collapsed) */}
              {!isCollapsed && (
                <div className="space-y-1">
                  {group.events.map(event => (
                    <TerminalEventRow
                      key={event.id}
                      event={event}
                      onRevert={handleRevert}
                      reverting={reverting}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Command Input */}
      <CommandInput
        ref={commandInputRef}
        onSubmit={handleCommandSubmit}
        placeholder={character ? `Type a message or /command as ${character.name}...` : 'Type a message or /command...'}
      />
    </div>
  );
}
