"use client";

import React, { useState } from 'react';
import type { TerminalEvent, ChangeLogPayload, DiceRollPayload, ChatPayload, CommandPayload, AIMessagePayload, GameEventPayload } from '@/types/terminal';

interface TerminalEventRowProps {
  event: TerminalEvent;
  onRevert?: (entryId: string) => void;
  reverting?: string | null;
}

// ── Actor Badge Colors ─────────────────────────────────────────────────────

const ACTOR_COLORS: Record<string, string> = {
  player: '#22ab94',
  gm: '#ffcc78',
  ai_copilot: '#7050A8',
  system: '#666',
};

const ACTOR_LABELS: Record<string, string> = {
  player: 'PLR',
  gm: 'GM',
  ai_copilot: 'AI',
  system: 'SYS',
};

// ── Changelog Category Icons ───────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  attribute: '\u25C8', condition: '\u26A0', inventory: '\uD83C\uDF92',
  equipment: '\u2694', skill: '\u2605', magic: '\u2728', trait: '\u2736',
  grovine: '\u2618', vitals: '\u2695', identity: '\u263A', levels: '\u2191',
  fear: '\u2620', harvest: '\u2618', backstory: '\u270E', campaign: '\u2302', status: '\u25CF',
};

// ── Time Formatter ─────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TerminalEventRow({ event, onRevert, reverting }: TerminalEventRowProps) {
  const payload = event.payload;

  switch (payload.kind) {
    case 'changelog':
      return <ChangeLogRow event={event} payload={payload} onRevert={onRevert} reverting={reverting} />;
    case 'dice_roll':
      return <DiceRollRow event={event} payload={payload} />;
    case 'chat':
      return <ChatRow event={event} payload={payload} />;
    case 'command':
      return <CommandRow event={event} payload={payload} />;
    case 'ai_message':
      return <AIMessageRow event={event} payload={payload} />;
    case 'game_event':
      return <GameEventRow event={event} payload={payload} />;
    default:
      return null;
  }
}

// ── ChangeLog Row ──────────────────────────────────────────────────────────

function ChangeLogRow({ event, payload, onRevert, reverting }: {
  event: TerminalEvent;
  payload: ChangeLogPayload;
  onRevert?: (entryId: string) => void;
  reverting?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const actorColor = ACTOR_COLORS[event.actor] || '#666';
  const icon = CATEGORY_ICONS[payload.category] || '\u25CF';

  return (
    <div
      style={{
        backgroundColor: payload.reverted ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,204,120,0.1)',
        borderRadius: '2px',
        opacity: payload.reverted ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <ActorBadge actor={event.actor} color={actorColor} />
        <span className="text-xs flex-shrink-0" style={{ color: '#ffcc78' }}>{icon}</span>
        {event.characterName && (
          <span className="text-[13px] flex-shrink-0" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#8e7cc3' }}>
            {event.characterName}
          </span>
        )}
        <span className="text-[12px] flex-1 truncate" style={{
          fontFamily: 'var(--font-terminal), Consolas, monospace',
          color: payload.reverted ? '#666' : '#ccc',
          textDecoration: payload.reverted ? 'line-through' : 'none',
        }}>{payload.description}</span>
        <Timestamp iso={event.timestamp} />
        <span className="text-[12px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
      </div>

      {expanded && (
        <div className="px-3 pb-2 pt-1 border-t" style={{ borderColor: 'rgba(255,204,120,0.08)' }}>
          <div className="space-y-1 mb-2">
            {payload.changes.map((change, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                <span style={{ color: '#666', minWidth: '140px' }}>{change.path}</span>
                <span style={{ color: '#ff6b6b' }}>{JSON.stringify(change.previousValue)}</span>
                <span style={{ color: '#666' }}>{'\u2192'}</span>
                <span style={{ color: '#22ab94' }}>{JSON.stringify(change.newValue)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.2)' }}>
              {payload.source && `source: ${payload.source}`}
              {payload.reverted && ' \u2022 reverted'}
            </span>
            {payload.revertible && !payload.reverted && onRevert && (
              <button
                onClick={e => { e.stopPropagation(); onRevert(payload.entryId); }}
                disabled={reverting === payload.entryId}
                className="text-[13px] px-2 py-0.5 transition-colors"
                style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  color: '#ff6b6b',
                  border: '1px solid rgba(255,107,107,0.3)',
                  backgroundColor: 'transparent',
                  borderRadius: '2px',
                  cursor: reverting === payload.entryId ? 'wait' : 'pointer',
                  opacity: reverting === payload.entryId ? 0.5 : 1,
                }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255,107,107,0.1)')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {reverting === payload.entryId ? 'REVERTING...' : 'REVERT'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dice Roll Row ──────────────────────────────────────────────────────────

const DIE_MAX: Record<string, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };

function dieValueColor(dieType: string, value: number): string {
  if (value === 1) return '#FF4444';
  if (value === (DIE_MAX[dieType] ?? 0)) return '#44FF66';
  return '#ffcc78';
}

function getTotalExtreme(payload: DiceRollPayload): 'min' | 'max' | null {
  if (payload.physicalDice && payload.physicalDice.length > 0) {
    const allMin = payload.physicalDice.every(d => d.value === 1);
    const allMax = payload.physicalDice.every(d => d.value === (DIE_MAX[d.dieType] ?? 0));
    if (allMin) return 'min';
    if (allMax) return 'max';
  } else if (payload.fateDie) {
    if (payload.fateDie.value === 1) return 'min';
    if (payload.fateDie.value === (DIE_MAX[payload.fateDie.die] ?? 0)) return 'max';
  }
  return null;
}

function DiceRollRow({ event, payload }: { event: TerminalEvent; payload: DiceRollPayload }) {
  const actorColor = ACTOR_COLORS[event.actor] || '#666';
  const successColor = payload.success === true ? '#22ab94' : payload.success === false ? '#ff6b6b' : '#ffcc78';
  const resultLabel = payload.success === true ? 'SUCCESS' : payload.success === false ? 'FAILURE' : '';
  const totalExtreme = getTotalExtreme(payload);
  const totalColor = totalExtreme === 'min' ? '#FF4444' : totalExtreme === 'max' ? '#44FF66' : '#ffcc78';

  return (
    <div style={{
      backgroundColor: 'rgba(255,204,120,0.06)',
      borderLeft: '3px solid #ffcc78',
      borderRadius: '2px',
    }}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <ActorBadge actor={event.actor} color={actorColor} />
        <span className="text-xs flex-shrink-0" style={{ color: '#ffcc78' }}>{'\uD83C\uDFB2'}</span>
        {event.characterName && (
          <span className="text-[13px] flex-shrink-0" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#8e7cc3' }}>
            {event.characterName}
          </span>
        )}
        <span className="text-[12px] flex-1" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#ccc' }}>
          {payload.physicalDice && payload.physicalDice.length > 0 ? (
            <>
              {payload.physicalDice.length === 1
                ? `${payload.physicalDice[0].dieType.toUpperCase()} roll: `
                : `${payload.physicalDice.length} dice roll: `}
              {payload.physicalDice.map((d, i) => (
                <span key={i}>
                  {i > 0 && ' + '}
                  {d.dieType.toUpperCase()}→
                  <b style={{ color: dieValueColor(d.dieType, d.value) }}>{d.value}</b>
                </span>
              ))}
              {' = '}<b style={{ color: '#ffcc78' }}>{payload.total}</b>
            </>
          ) : (
            payload.context
          )}
        </span>
        {resultLabel && (
          <span className="text-[13px] font-bold px-1.5 py-0.5" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            color: successColor,
            letterSpacing: '0.1em',
          }}>
            {resultLabel}
          </span>
        )}
        <Timestamp iso={event.timestamp} />
      </div>

      {/* Roll breakdown */}
      <div className="px-3 pb-2 flex flex-wrap gap-3 text-[13px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        {payload.isSkilled ? (
          <>
            {payload.skillDie && !payload.skillDie.isFlat && (
              <span style={{ color: '#D0A030' }}>
                SD {payload.skillDie.die}[<b style={{ color: dieValueColor(payload.skillDie.die, payload.skillDie.value) }}>{payload.skillDie.value}</b>]
              </span>
            )}
            {payload.skillDie?.isFlat && payload.skillDie.value > 0 && (
              <span style={{ color: '#D0A030' }}>
                SD {payload.skillDie.die}
              </span>
            )}
            <span style={{ color: '#3EB89A' }}>
              FD {payload.fateDie.die}[<b style={{ color: dieValueColor(payload.fateDie.die, payload.fateDie.value) }}>{payload.fateDie.value}</b>]
            </span>
            {payload.effort !== undefined && payload.effort > 0 && (
              <span style={{ color: '#E8585A' }}>
                +{payload.effort} effort{payload.effortAttribute ? ` (${payload.effortAttribute})` : ''}
              </span>
            )}
            {payload.flatModifiers !== undefined && payload.flatModifiers !== 0 && (
              <span style={{ color: '#888' }}>
                {payload.flatModifiers > 0 ? '+' : ''}{payload.flatModifiers} mod
              </span>
            )}
            <span style={{ color: totalColor }}>
              = <b>{payload.total}</b>
              {totalExtreme && (
                <b style={{ marginLeft: '4px', fontSize: '10px' }}>
                  ({totalExtreme === 'max' ? 'MAX' : 'MIN'})
                </b>
              )}
            </span>
            {payload.dr !== undefined && (
              <span style={{ color: '#888' }}>
                vs DR {payload.dr} ({payload.margin !== undefined && payload.margin >= 0 ? '+' : ''}{payload.margin})
              </span>
            )}
          </>
        ) : (
          <span style={{ color: totalColor }}>
            Result = <b>{payload.total}</b>
            {totalExtreme && (
              <b style={{ marginLeft: '4px', fontSize: '10px' }}>
                ({totalExtreme === 'max' ? 'MAX' : 'MIN'})
              </b>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Chat Row ───────────────────────────────────────────────────────────────

function ChatRow({ event, payload }: { event: TerminalEvent; payload: ChatPayload }) {
  const actorColor = ACTOR_COLORS[event.actor] || '#666';

  return (
    <div className="flex items-start gap-2 px-2 py-1.5">
      <ActorBadge actor={event.actor} color={actorColor} />
      <div className="flex-1 min-w-0">
        <span className="text-[12px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#ccc' }}>
          <span style={{ color: actorColor, fontWeight: 'bold' }}>{event.actorName}</span>
          {': '}
          {payload.message}
        </span>
      </div>
      <Timestamp iso={event.timestamp} />
    </div>
  );
}

// ── Command Row ────────────────────────────────────────────────────────────

function CommandRow({ event, payload }: { event: TerminalEvent; payload: CommandPayload }) {
  return (
    <div className="px-2 py-1" style={{ opacity: 0.7 }}>
      <div className="text-[13px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        <span style={{ color: '#22ab94' }}>{'>'} </span>
        <span style={{ color: '#888' }}>{payload.input}</span>
      </div>
      {payload.result && (
        <div className="text-[13px] pl-3" style={{
          fontFamily: 'var(--font-terminal), Consolas, monospace',
          color: payload.success ? '#22ab94' : '#ff6b6b',
        }}>
          {payload.result}
        </div>
      )}
    </div>
  );
}

// ── AI Message Row ─────────────────────────────────────────────────────────

function AIMessageRow({ event, payload }: { event: TerminalEvent; payload: AIMessagePayload }) {
  const severityColors: Record<string, string> = {
    info: '#7050A8',
    warning: '#ffcc78',
    action: '#22ab94',
    question: '#E8585A',
  };
  const color = severityColors[payload.severity] || '#7050A8';

  return (
    <div style={{ borderLeft: `3px solid ${color}`, borderRadius: '2px' }}>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <ActorBadge actor="ai_copilot" color="#7050A8" />
        <span className="text-xs flex-shrink-0" style={{ color }}>{'\u25C6'}</span>
        <span className="text-[12px] flex-1 italic" style={{
          fontFamily: 'var(--font-terminal), Consolas, monospace',
          color: '#ccc',
        }}>{payload.message}</span>
        <Timestamp iso={event.timestamp} />
      </div>
    </div>
  );
}

// ── Game Event Row ─────────────────────────────────────────────────────────

function GameEventRow({ event, payload }: { event: TerminalEvent; payload: GameEventPayload }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1" style={{ opacity: 0.6 }}>
      <div className="flex-1 text-center text-[13px] uppercase tracking-widest" style={{
        fontFamily: 'var(--font-terminal), Consolas, monospace',
        color: '#22ab94',
      }}>
        {'═══ '}{payload.description}{' ═══'}
      </div>
      <Timestamp iso={event.timestamp} />
    </div>
  );
}

// ── Shared Sub-Components ──────────────────────────────────────────────────

function ActorBadge({ actor, color }: { actor: string; color: string }) {
  return (
    <span className="text-[12px] font-bold px-1.5 py-0.5 flex-shrink-0" style={{
      backgroundColor: color,
      color: actor === 'gm' ? '#1a1a2e' : '#fff',
      fontFamily: 'var(--font-terminal), Consolas, monospace',
      borderRadius: '1px',
      minWidth: '28px',
      textAlign: 'center',
    }}>
      {ACTOR_LABELS[actor] || actor.toUpperCase().slice(0, 3)}
    </span>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return (
    <span className="text-[12px] flex-shrink-0" style={{
      fontFamily: 'var(--font-terminal), Consolas, monospace',
      color: 'rgba(255,255,255,0.3)',
    }}>
      {formatTime(iso)}
    </span>
  );
}
