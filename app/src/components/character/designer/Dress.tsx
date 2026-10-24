"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { C, F, ActionBar, Chip, GhostButton, Readout, SectionBar } from './parts';
import {
  applyOutfit, loadWardrobe, proposeOutfit, setDressState,
  type OutfitPieceView, type OutfitProposalView, type PaintBrief, type WardrobeRow, type WardrobeView,
} from './api';
import { pronounsFor, type Pronouns } from '@/lib/appearance-designer';

/** Mirrors services/dress WARDROBE_EMPTY_LINE (that module is server-only). */
export const WARDROBE_EMPTY_LINE = 'The wardrobe is empty — a life is built in the WORLD stage first.';
export const dressFirstLine = (p: Pronouns) => `Nothing is worn yet. Wear something from ${p.possessive} things, or let JEWL dress ${p.object}.`;

const STATE_LABEL: Record<WardrobeRow['state'], string> = { worn: 'WORN', carried: 'CARRIED', owned: 'AT HOME' };
const stateTone = (s: WardrobeRow['state']) => (s === 'worn' ? 'spirit' : s === 'carried' ? 'ink' : 'ink') as 'spirit' | 'ink';
const regionLabel = (key: string | null) => (key ? (key.split('/').filter(Boolean).pop() ?? key) : '');

/**
 * 1 · DRESS (Mike, 16 Oct 2026): "either dress their character using their
 * items that the character has deeds to, or let the AI pick an outfit."
 * Her wardrobe and kit — nothing invented, nothing granted; every row is a
 * thing she already owns. WEAR / TAKE OFF / CARRY / PUT DOWN write the state
 * at once; LET JEWL DRESS HER returns a proposal from the same things that
 * the player or GM approves (JEWL never approves).
 */
export function DressSection({ characterId, editable, disabled, onWardrobe, pronouns: p = pronounsFor(null) }: {
  characterId: string;
  editable: boolean;
  disabled: boolean;
  /** The character's pronouns (from the sheet's sex); they/them when unknown. */
  pronouns?: Pronouns;
  /** Fires after every load / change so the parent can gate the paint on what is worn. */
  onWardrobe: (w: WardrobeView) => void;
}) {
  const [wardrobe, setWardrobe] = useState<WardrobeView | null>(null);
  const [line, setLine] = useState<string | null>(null);
  // Starts in 'load': the mount effect fetches; no synchronous setState inside the effect.
  const [busy, setBusy] = useState<null | 'load' | 'set' | 'propose' | 'apply'>('load');
  const [proposal, setProposal] = useState<OutfitProposalView | null>(null);
  const [open, setOpen] = useState(true);

  const take = useCallback((w: WardrobeView) => { setWardrobe(w); onWardrobe(w); }, [onWardrobe]);

  useEffect(() => {
    let cancelled = false;
    void loadWardrobe(characterId).then(r => {
      if (cancelled) return;
      setBusy(null);
      if (r.ok) { take(r.value); setLine(null); } else setLine(r.line);
    });
    return () => { cancelled = true; };
  }, [characterId, take]);

  const off = disabled || busy !== null || !editable;

  const set = async (row: WardrobeRow, state: WardrobeRow['state'], region?: string | null) => {
    if (off) return;
    setBusy('set'); setLine(null);
    const r = await setDressState(characterId, row.id, state, region);
    if (!r.ok) { setBusy(null); setLine(r.line); return; }
    const w = await loadWardrobe(characterId);
    setBusy(null);
    if (w.ok) take(w.value); else setLine(w.line);
  };

  const propose = async () => {
    if (off) return;
    setBusy('propose'); setLine(null); setProposal(null);
    const r = await proposeOutfit(characterId);
    setBusy(null);
    if (!r.ok) { setLine(r.line); return; }
    if (r.value.empty) { setLine(WARDROBE_EMPTY_LINE); return; }
    setProposal(r.value);
  };

  const approve = async () => {
    if (off || !proposal) return;
    setBusy('apply'); setLine(null);
    const r = await applyOutfit(characterId, proposal.pieces);
    setBusy(null);
    if (!r.ok) { setLine(r.line); return; }
    setProposal(null);
    take(r.value);
  };

  const worn = wardrobe ? wardrobe.garments.filter(g => g.state === 'worn').length : 0;
  const hint = !wardrobe ? `reading ${p.possessive} things…` : wardrobe.empty ? 'nothing to wear' : `${worn} worn · ${wardrobe.garments.length} garment${wardrobe.garments.length === 1 ? '' : 's'} · ${wardrobe.things.length} thing${wardrobe.things.length === 1 ? '' : 's'}`;

  return (
    <section className="space-y-2" data-testid="designer-dress">
      <SectionBar n={1} title="Dress" hint={hint} right={wardrobe && !wardrobe.empty ? <GhostButton label={open ? 'hide' : 'show'} onClick={() => setOpen(o => !o)} testId="designer-dress-toggle" /> : undefined} />
      {line && <Readout tone={line === WARDROBE_EMPTY_LINE ? 'note' : 'error'} testId="designer-dress-line">{line}</Readout>}
      {busy === 'load' && !wardrobe && <Readout>[ reading {p.possessive} wardrobe… ]</Readout>}
      {wardrobe?.empty && <Readout tone="note" testId="designer-wardrobe-empty">{WARDROBE_EMPTY_LINE}</Readout>}

      {wardrobe && !wardrobe.empty && open && (
        <>
          {editable && (
            <ActionBar label={`LET JEWL DRESS ${p.object.toUpperCase()}`} onClick={() => { void propose(); }} disabled={off} busy={busy === 'propose'} tone="spirit" testId="designer-dress-propose" />
          )}

          {proposal && (
            <div className="space-y-1" data-testid="designer-outfit-proposal" style={{ border: `1px solid ${C.spirit}`, padding: 6 }}>
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.spirit, letterSpacing: '0.06em' }}>
                {proposal.byJewl ? `JEWL PROPOSES, FROM ${p.possessive.toUpperCase()} OWN THINGS` : `A PLAIN TAKE (JEWL did not answer) FROM ${p.possessive.toUpperCase()} OWN THINGS`}
              </div>
              {proposal.pieces.map(p => <ProposalRow key={p.itemId} piece={p} />)}
              {proposal.pieces.length === 0 && <Readout tone="note">Nothing proposed.</Readout>}
              <div className="flex gap-2 items-stretch">
                <div className="flex-1"><ActionBar label="APPROVE OUTFIT" onClick={() => { void approve(); }} disabled={off || proposal.pieces.length === 0} busy={busy === 'apply'} tone="soul" testId="designer-outfit-approve" /></div>
                <GhostButton label="another take" onClick={() => { void propose(); }} disabled={off} testId="designer-outfit-again" />
                <GhostButton label="dismiss" onClick={() => setProposal(null)} disabled={busy !== null} testId="designer-outfit-dismiss" />
              </div>
            </div>
          )}

          <div className="space-y-1" data-testid="designer-wardrobe">
            {wardrobe.garments.map(g => (
              <WardrobeLine key={g.id} row={g} regions={wardrobe.regions} off={off} editable={editable} onSet={set} />
            ))}
            {wardrobe.things.length > 0 && (
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.soul, marginTop: 6 }}>THE REST · what {p.subject} {p.has === 'has' ? 'carries' : 'carry'}</div>
            )}
            {wardrobe.things.map(t => (
              <WardrobeLine key={t.id} row={t} regions={wardrobe.regions} off={off} editable={editable} onSet={set} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ProposalRow({ piece }: { piece: OutfitPieceView }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" style={{ minHeight: 36 }} data-testid="designer-outfit-piece">
      <span style={{ fontFamily: F.body, fontSize: 13 }}>{piece.name}</span>
      <Chip label={piece.state === 'worn' ? `WORN · ${regionLabel(piece.region)}` : 'CARRIED'} tone={piece.state === 'worn' ? 'spirit' : 'ink'} on />
      {piece.why && <span style={{ fontFamily: F.mono, fontSize: 11, color: C.soul }}>{piece.why}</span>}
    </div>
  );
}

function WardrobeLine({ row, regions, off, editable, onSet }: {
  row: WardrobeRow;
  regions: string[];
  off: boolean;
  editable: boolean;
  onSet: (row: WardrobeRow, state: WardrobeRow['state'], region?: string | null) => Promise<void>;
}) {
  const detail = [row.archetype && row.archetype !== row.name ? row.archetype : null, row.material, row.state === 'owned' && row.where ? `@ ${row.where}` : null].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-2 flex-wrap" style={{ minHeight: 48, borderBottom: '1px solid rgba(20,20,19,0.2)', padding: '2px 0' }} data-testid={`designer-wardrobe-${row.id}`} data-state={row.state}>
      <div className="min-w-0 flex-1">
        <div style={{ fontFamily: F.body, fontSize: 13, lineHeight: 1.3 }}>{row.name}</div>
        {detail && <div style={{ fontFamily: F.mono, fontSize: 10, color: C.soul }}>{detail}</div>}
      </div>
      <Chip label={row.state === 'worn' ? `${STATE_LABEL.worn} · ${regionLabel(row.region)}` : STATE_LABEL[row.state]} tone={stateTone(row.state)} on={row.state === 'worn'} />
      {editable && row.state === 'worn' && regions.length > 1 && (
        <select
          aria-label={`Where ${row.name} is worn`}
          value={row.region ?? ''}
          onChange={e => { void onSet(row, 'worn', e.target.value); }}
          disabled={off}
          data-testid={`designer-wardrobe-region-${row.id}`}
          style={{ minHeight: 36, fontFamily: F.mono, fontSize: 11, background: C.powder, color: C.ink, border: `1px solid ${C.ink}` }}
        >
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {editable && (row.garment
        ? (row.state === 'worn'
          ? <Chip label="TAKE OFF" onClick={() => { void onSet(row, 'carried'); }} disabled={off} testId={`designer-wear-off-${row.id}`} />
          : <Chip label="WEAR" tone="spirit" onClick={() => { void onSet(row, 'worn'); }} disabled={off} testId={`designer-wear-${row.id}`} />)
        : (row.state === 'owned'
          ? <Chip label="CARRY" tone="spirit" onClick={() => { void onSet(row, 'carried'); }} disabled={off} testId={`designer-carry-${row.id}`} />
          : <Chip label="PUT DOWN" onClick={() => { void onSet(row, 'owned'); }} disabled={off} testId={`designer-put-down-${row.id}`} />))}
    </div>
  );
}

/** 2 · PAINT — what the last brief said (JEWL's words), and the gate line when nothing is worn. */
export function BriefReadout({ brief, worn, hasPaint, pronouns: p = pronounsFor(null) }: { brief: PaintBrief | null; worn: boolean | null; hasPaint: boolean; pronouns?: Pronouns }) {
  const rows: Array<[string, string]> = brief
    ? [['setting', brief.setting], ['bearing', brief.pose], ['expression', brief.expression], ['clothes', brief.clothes], ['marks', brief.marks], ['light', brief.light]].filter((r): r is [string, string] => !!r[1])
    : [];
  return (
    <section className="space-y-2" data-testid="designer-paint-section">
      <SectionBar n={2} title="Paint" hint={hasPaint ? 'REGENERATE re-rolls the seed · APPROVE PORTRAIT makes it the canvas image' : 'JEWL writes the brief from everything known, then paints from the face and body'} />
      {worn === false && <Readout tone="note" testId="designer-dress-first">{dressFirstLine(p)}</Readout>}
      {rows.length > 0 && (
        <div data-testid="designer-brief" style={{ border: `1px solid rgba(20,20,19,0.35)`, padding: 6 }}>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: C.spirit, letterSpacing: '0.06em', marginBottom: 2 }}>
            {brief?.byJewl ? 'THE BRIEF · JEWL' : 'THE BRIEF · plain draft (JEWL did not answer)'}
          </div>
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2" style={{ fontSize: 12, lineHeight: 1.35 }}>
              <span style={{ fontFamily: F.mono, fontSize: 10, color: C.soul, minWidth: 72, paddingTop: 2 }}>{k.toUpperCase()}</span>
              <span style={{ fontFamily: F.body }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
