"use client";

import React, { useEffect, useState } from 'react';

export interface PossessionRow {
  id: string;
  targetId: string;
  targetType: string;
  targetName: string;
  targetSubtype: string | null;
  status: string | null;
  krmaValue: number;
  note: string | null;
  createdAt: string;
  contentsCount: number;
}

export interface ContentsChildRow {
  id: string;
  childId: string;
  childType: string;
  childName: string;
  childSubtype: string | null;
  childStatus: string | null;
  note: string | null;
  position: number | null;
  childContentsCount: number;
}

interface PossessionsCardProps {
  characterId: string;
  characterName: string;
  onClose?: () => void;
}

const SUBTYPE_GLYPH: Record<string, string> = {
  settlement: '⌂',
  wilderness: '☘',
  dungeon: '⚰',
  building: '⌂',
  region: '⛰',
  point_of_interest: '✪',
  cosmic_landmark: '❈',
  force: '⚔',
  artifact: '❖',
  weapon: '⚔',
  armor: '⛨',
  consumable: '⛺',
  tool: '⚒',
  GODHEAD: '◈',
  GOAL: '❇',
  CHARACTER: '✴',
  NPC: '✴',
};

function glyphFor(targetType: string, subtype: string | null): string {
  if (subtype && SUBTYPE_GLYPH[subtype]) return SUBTYPE_GLYPH[subtype];
  if (SUBTYPE_GLYPH[targetType]) return SUBTYPE_GLYPH[targetType];
  return '❖';
}

function formatKrma(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/**
 * Recursive contents list. Loads its own data on first expand.
 * Used for both top-level possessions and any nested entity.
 */
function ContentsTree({ parentEntityId, depth }: { parentEntityId: string; depth: number }) {
  const [rows, setRows] = useState<ContentsChildRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/entities/${parentEntityId}/contents`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: 'Failed to load contents' }));
          if (!cancelled) setErr(e.error || 'Failed to load contents');
          return;
        }
        const j = await res.json();
        if (!cancelled) setRows(j.contents ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [parentEntityId]);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (err) {
    return (
      <div
        className="text-xs px-2 py-1"
        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#E8585A' }}
      >
        ✗ {err}
      </div>
    );
  }
  if (rows === null) {
    return (
      <div
        className="text-xs px-2 py-1"
        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.35)' }}
      >
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        className="text-xs px-2 py-1"
        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.35)' }}
      >
        (empty)
      </div>
    );
  }

  return (
    <div className="space-y-1" style={{ paddingLeft: `${depth * 14}px` }}>
      {rows.map((r) => {
        const isOpen = openIds.has(r.id);
        const canExpand = r.childContentsCount > 0;
        return (
          <div key={r.id}>
            <button
              onClick={(e) => { e.stopPropagation(); if (canExpand) toggle(r.id); }}
              disabled={!canExpand}
              className="w-full flex items-center gap-2 px-2 py-1 text-left transition-colors"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '2px',
                cursor: canExpand ? 'pointer' : 'default',
              }}
              title={r.note ?? undefined}
            >
              <span
                style={{
                  width: '12px',
                  textAlign: 'center',
                  fontFamily: 'Consolas, monospace',
                  fontSize: '10px',
                  color: canExpand ? '#22ab94' : 'rgba(255,255,255,0.2)',
                }}
              >
                {canExpand ? (isOpen ? '▾' : '▸') : '·'}
              </span>
              <span
                style={{
                  width: '16px',
                  textAlign: 'center',
                  fontFamily: 'Consolas, monospace',
                  fontSize: '12px',
                  color: '#ffcc78',
                  flexShrink: 0,
                }}
              >
                {glyphFor(r.childType, r.childSubtype)}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{
                    color: '#fff',
                    fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                    fontSize: '11px',
                  }}
                >
                  {r.childName}
                </div>
                <div
                  className="truncate"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                    fontSize: '8px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {r.childSubtype ?? r.childType.toLowerCase()}
                  {r.childStatus && ` · ${r.childStatus.toLowerCase()}`}
                </div>
              </div>
              {r.childContentsCount > 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                    fontSize: '9px',
                    color: 'rgba(34,171,148,0.85)',
                    flexShrink: 0,
                  }}
                >
                  ↳ {r.childContentsCount}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="mt-1">
                <ContentsTree parentEntityId={r.childId} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PossessionsCard({ characterId, characterName, onClose }: PossessionsCardProps) {
  const [rows, setRows] = useState<PossessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/characters/${characterId}/possessions`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: 'Failed to load possessions' }));
          if (!cancelled) setErr(e.error || 'Failed to load possessions');
          return;
        }
        const j = await res.json();
        if (!cancelled) setRows(j.possessions ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [characterId]);

  const total = rows ? rows.reduce((acc, r) => acc + (r.krmaValue || 0), 0) : 0;

  const toggleRow = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="border transition-all duration-200"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        borderColor: '#ffcc78',
        borderRadius: '3px',
        width: '440px',
      }}
    >
      {/* Header */}
      <div
        className="p-3 text-white cursor-grab"
        style={{
          background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)',
          borderRadius: '2px 2px 0 0',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'❖'}</span>
            <div>
              <h3
                className="font-semibold"
                style={{
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                  letterSpacing: '0.08em',
                  fontSize: '15px',
                }}
              >
                POSSESSIONS
              </h3>
              <p
                className="text-xs"
                style={{
                  color: '#ffcc78',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  fontSize: '10px',
                }}
              >
                {characterName} owns {rows?.length ?? 0} {rows && rows.length === 1 ? 'entity' : 'entities'}
                {rows && rows.length > 0 && ` · ${formatKrma(total)} Ҝ total`}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded-full flex items-center justify-center text-white hover:text-red-300"
              style={{ width: '24px', height: '24px', background: 'rgba(0,0,0,0.3)', fontSize: '14px', lineHeight: 1 }}
              title="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="p-3" style={{ minHeight: '80px' }}>
          {err && (
            <div
              className="border p-2 text-xs"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                borderColor: '#E8585A55',
                background: 'rgba(232,88,90,0.08)',
                color: '#E8585A',
              }}
            >
              ✗ {err}
            </div>
          )}
          {!err && rows === null && (
            <div
              className="text-center text-xs"
              style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.4)' }}
            >
              Loading…
            </div>
          )}
          {!err && rows && rows.length === 0 && (
            <div
              className="text-center text-xs"
              style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.4)' }}
            >
              No possessions.
            </div>
          )}
          {!err && rows && rows.length > 0 && (
            <div className="space-y-1.5">
              {rows.map((r) => {
                const isOpen = openIds.has(r.id);
                const canExpand = r.contentsCount > 0;
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => { if (canExpand) toggleRow(r.id); }}
                      disabled={!canExpand}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors"
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,204,120,0.25)',
                        borderRadius: '2px',
                        cursor: canExpand ? 'pointer' : 'default',
                      }}
                      title={r.note ?? undefined}
                    >
                      <span
                        style={{
                          width: '12px',
                          textAlign: 'center',
                          fontFamily: 'Consolas, monospace',
                          fontSize: '11px',
                          color: canExpand ? '#22ab94' : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {canExpand ? (isOpen ? '▾' : '▸') : '·'}
                      </span>
                      <span
                        style={{
                          width: '20px',
                          textAlign: 'center',
                          fontFamily: 'Consolas, monospace',
                          color: '#ffcc78',
                          fontSize: '14px',
                          flexShrink: 0,
                        }}
                      >
                        {glyphFor(r.targetType, r.targetSubtype)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div
                          className="truncate"
                          style={{
                            color: '#fff',
                            fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                            fontSize: '12px',
                          }}
                        >
                          {r.targetName}
                        </div>
                        <div
                          className="truncate"
                          style={{
                            color: 'rgba(255,255,255,0.45)',
                            fontFamily: 'var(--font-terminal), Consolas, monospace',
                            fontSize: '9px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {r.targetSubtype ?? r.targetType.toLowerCase()}
                          {r.status && ` · ${r.status.toLowerCase()}`}
                          {r.contentsCount > 0 && ` · ${r.contentsCount} inside`}
                        </div>
                      </div>
                      {r.krmaValue > 0 && (
                        <div
                          className="text-right flex-shrink-0"
                          style={{
                            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                            color: '#ffcc78',
                            fontSize: '13px',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {formatKrma(r.krmaValue)} <span style={{ fontSize: '10px', opacity: 0.7 }}>Ҝ</span>
                        </div>
                      )}
                    </button>
                    {isOpen && canExpand && (
                      <div className="mt-1.5 mb-1">
                        <ContentsTree parentEntityId={r.targetId} depth={1} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
