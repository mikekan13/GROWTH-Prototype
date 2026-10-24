"use client";

/**
 * EntityView (Mike 2026-10-12) — "everything about this entity", the
 * exhaustive place opened from Tapestry > Entities (and /character/[id]).
 * Three sections, one on screen at a time, behind a touch-sized switcher:
 *   Appearance — seed, reference photos, physical identity, style, visual
 *                identity (portrait/token + identity wizard, Finetune visible)
 *   Sheet      — name, genome, what genesis made, inventory, backstory,
 *                open threads, Complete, Save / Submit
 *   Persona    — AI persona, memories, vines, (world facts / work sessions
 *                not surfaced yet)
 * All character state stays in CharacterTab (one instance), so Save/Submit
 * work across sections. This file owns the switcher and the default section:
 * creation → Sheet; born + awaiting image → Appearance; born + image → Sheet.
 */

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import GodheadPersonaPanel from '@/components/character/GodheadPersonaPanel';
import { VinesSection } from '@/components/character/CharacterGenesisSections';
import { useCharacterSheetFacts } from '@/components/character/useCharacterSheetFacts';
import {
  ENTITY_SECTIONS, defaultEntitySection, entityLifecycle, isAfterBirthSection,
  type EntitySection, type EntityStateReport,
} from '@/lib/entity-view';

const CharacterTab = dynamic(() => import('@/components/character/CharacterTab'), { ssr: false });

const SOUL = '#002f6c';
const SOUL_2 = '#6fa8dc';
const SOUL_3 = '#9fc5e8';
const POWDER = '#CBD9E8';
const MONO = 'var(--font-terminal), Consolas, monospace';
const BEBAS = 'var(--font-bebas-neue), Bebas Neue, sans-serif';

export interface EntityViewProps {
  campaignId: string;
  isGM: boolean;
  userId?: string;
  userRole?: string;
  userCharacter?: { id: string; name: string; data: string; entityType?: string; status?: string } | null;
  selectedCharacterId?: string | null;
  openAppearanceFor?: { id: string; nonce: number } | null;
  canEdit?: boolean;
  /** AI is choosing this character's actions (page knows it; canvas may not). */
  aiActionMode?: boolean;
  /** Back to the Entities list. Omitted = no back affordance. */
  onBack?: () => void;
  /** 'fill' = absolute inset-0 inside a positioned parent (canvas tab); 'page' = its own tall box. */
  layout?: 'fill' | 'page';
}

export default function EntityView({
  campaignId, isGM, userId, userRole, userCharacter, selectedCharacterId, openAppearanceFor,
  canEdit, aiActionMode = false, onBack, layout = 'fill',
}: EntityViewProps) {
  const [rawReport, setReport] = useState<EntityStateReport | null>(null);
  // A report for a previously open entity is ignored until the new one lands.
  const targetId = selectedCharacterId ?? userCharacter?.id ?? null;
  const report = rawReport && (!targetId || rawReport.characterId === targetId) ? rawReport : null;
  // Default-by-state applies until the user picks a segment (per character).
  const [picked, setPicked] = useState<{ forId: string | null; section: EntitySection } | null>(null);

  const facts = useCharacterSheetFacts(report?.characterId ?? null);
  const enriched = useMemo<EntityStateReport | null>(() => {
    if (!report) return null;
    // Sheet facts carry completion even when no genesis progress is visible (players, legacy).
    const completion = report.completion ?? facts.data?.completion ?? null;
    return { ...report, completion };
  }, [report, facts.data?.completion]);
  const lifecycle = useMemo(() => (enriched ? entityLifecycle(enriched) : null), [enriched]);

  // Wait for the sheet facts (completion) unless genesis progress already
  // carries it, so a born entity does not flicker Sheet → Appearance.
  const ready = !!enriched && (!enriched.characterId || !!report?.completion || facts.loaded);
  const currentId = report?.characterId ?? targetId;
  const section: EntitySection = picked && picked.forId === currentId
    ? picked.section
    : ready && lifecycle ? defaultEntitySection(lifecycle) : 'sheet';

  const pick = useCallback((s: EntitySection) => {
    setPicked({ forId: currentId, section: s });
  }, [currentId]);

  const onEntityState = useCallback((r: EntityStateReport) => setReport(r), []);

  const born = lifecycle?.born ?? false;
  const afterBirth = lifecycle ? isAfterBirthSection(section, lifecycle) : false;

  const persona = (
    <PersonaSection
      characterId={report?.characterId ?? null}
      name={report?.name ?? ''}
      entityType={report?.entityType ?? null}
      showAiPersona={isGM && (report?.entityType === 'GODHEAD' || aiActionMode)}
      facts={facts}
    />
  );

  const outer = layout === 'fill'
    ? 'absolute inset-0 flex flex-col'
    : 'relative flex flex-col';
  return (
    <div
      className={outer}
      data-testid="entity-view"
      style={{ backgroundColor: '#0a0a1a', ...(layout === 'page' ? { height: 'calc(100dvh - 160px)', minHeight: 520 } : {}) }}
    >
      <div className="shrink-0 px-3 pt-2 pb-2" style={{ backgroundColor: SOUL, borderBottom: `2px solid ${SOUL_2}` }}>
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="shrink-0 px-3 text-xs uppercase tracking-wider"
              style={{ minHeight: 44, minWidth: 44, background: '#000', color: POWDER, fontFamily: MONO, border: 'none', cursor: 'pointer' }}
              aria-label="Back to Entities"
              data-testid="entity-view-back"
            >
              ← Entities
            </button>
          )}
          <div
            className="min-w-0 truncate text-lg px-2"
            style={{ fontFamily: BEBAS, letterSpacing: '0.12em', color: '#fff', background: '#000', lineHeight: '28px' }}
          >
            {report?.name || 'Unnamed'}
          </div>
          {lifecycle && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5" style={{ fontFamily: MONO, color: SOUL, background: SOUL_3 }}>
              {!born ? 'in creation' : lifecycle.awaitingImage ? 'awaiting image' : 'born'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1 mt-2" role="tablist" aria-label="Entity sections">
          {ENTITY_SECTIONS.map(s => {
            const active = s.key === section;
            const later = lifecycle ? isAfterBirthSection(s.key, lifecycle) : false;
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                onClick={() => pick(s.key)}
                data-testid={`entity-section-${s.key}`}
                className="flex flex-col items-center justify-center px-1"
                style={{
                  minHeight: 44,
                  background: active ? POWDER : 'rgba(0,0,0,0.35)',
                  color: active ? SOUL : SOUL_3,
                  border: `1px solid ${active ? POWDER : SOUL_2}`,
                  fontFamily: BEBAS, letterSpacing: '0.1em', fontSize: 16, cursor: 'pointer',
                }}
              >
                <span>{s.label}</span>
                {later && (
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.05em', opacity: 0.85, textTransform: 'uppercase' }}>
                    after birth
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {afterBirth && (
          <div className="mt-2 text-xs px-2 py-1" role="status" style={{ background: '#000', color: SOUL_3, fontFamily: MONO, borderLeft: `3px solid ${SOUL_2}` }}>
            After birth: this fills in once JEWL finishes genesis. The creation path is on Sheet.
          </div>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <CharacterTab
          key={selectedCharacterId ?? 'own'}
          campaignId={campaignId}
          userId={userId}
          userRole={userRole}
          isGM={isGM}
          userCharacter={userCharacter}
          selectedCharacterId={selectedCharacterId}
          openAppearanceFor={openAppearanceFor}
          canEdit={canEdit}
          section={section}
          onEntityState={onEntityState}
          onRequestSection={pick}
          personaSlot={persona}
        />
      </div>
    </div>
  );
}

// ── Persona ─────────────────────────────────────────────────────────────

function PersonaSection({ characterId, name, entityType, showAiPersona, facts }: {
  characterId: string | null;
  name: string;
  entityType: string | null;
  showAiPersona: boolean;
  facts: ReturnType<typeof useCharacterSheetFacts>;
}) {
  const mem = facts.data?.memories;
  return (
    <div className="space-y-4" data-testid="entity-persona">
      <PersonaBlock title="AI Persona">
        {showAiPersona && name ? (
          <GodheadPersonaPanel godheadName={name} />
        ) : (
          <Line>
            {entityType === 'GODHEAD'
              ? 'The persona editor is Watcher/ADMIN only.'
              : 'No AI persona: this character is not a GodHead and AI is not choosing its actions.'}
          </Line>
        )}
      </PersonaBlock>
      <PersonaBlock title="Memory Threads">
        {!characterId ? <Line>No character record yet.</Line>
          : !facts.loaded ? <Line>reading…</Line>
          : mem ? (
            <Line>
              {mem.count} memories{mem.lastAt ? ` · latest ${new Date(mem.lastAt).toLocaleString()}` : ''}. Individual threads: not surfaced yet.
            </Line>
          ) : <Line>not surfaced yet</Line>}
      </PersonaBlock>
      <PersonaBlock title="World Facts">
        <Line>not surfaced yet</Line>
      </PersonaBlock>
      {characterId && <VinesSection vines={facts.data?.vines ?? null} loaded={facts.loaded} />}
      <PersonaBlock title="Open Work Sessions">
        <Line>not surfaced yet (JEWL&apos;s work screen lists every session)</Line>
      </PersonaBlock>
    </div>
  );
}

function PersonaBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border p-3" style={{ borderColor: SOUL_2, borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
      <div className="text-base uppercase mb-2" style={{ color: 'var(--krma-gold)', fontFamily: BEBAS, letterSpacing: '0.08em' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <div className="text-xs" style={{ color: '#aaa', fontFamily: MONO, wordBreak: 'break-word' }}>{children}</div>;
}
