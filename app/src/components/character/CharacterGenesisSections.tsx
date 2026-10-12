"use client";

/**
 * CharacterGenesisSections (2026-10-12 sheet audit) — the sections that show
 * everything genesis made, from the right sources:
 *   ORIGIN      Seed / Roots / Branches   ← CharacterBlockLink ⨝ ForgeItem (local name first, archetype beneath)
 *   TRAITS      Nectars / Thorns          ← same, with rule text + KV + maturity ⚠ chips
 *   CARRY       Equipped / Carried / Owned← /inventory (CampaignItem paint + 'owns' links), lbs vs Clout×10
 *   GRO.VINES   Goal / Resistance / Opp.  ← Goal rows ("AI-chosen" when authoredBy==='ai')
 *   + age (cycle rule, never 0), fated age, TKV, memory count/last time, completion badge.
 * Legacy sheet fields are the fallback only when no links exist.
 *
 * Canvas-object style (rulebook): gold frame, black header bars, pillar
 * tier-2/3 surfaces, dark navy text. Single column — phone-first.
 */
import React from 'react';
import {
  blocksOfKind,
  blockTooltip,
  formatAge,
  readCompletion,
  type CharacterBlockView,
  type CharacterSheetFacts,
} from '@/lib/character-sheet-facts';
import type { InventoryTiers, InventoryItemView } from '@/services/inventory';
import { useCharacterInventory, useCharacterSheetFacts } from './useCharacterSheetFacts';

const C = {
  gold: '#ffcc78',
  navy: '#002f6c',
  red: '#f7525f', red2: '#ea9999', red3: '#f4cccc',
  purple: '#582a72', purple2: '#8e7cc3', purple3: '#b4a7d6',
  blue2: '#6fa8dc', blue3: '#9fc5e8',
  teal: '#22ab94',
  powder: '#CBD9E8',
  ink: '#0b1a33',
};
const BEBAS = 'var(--font-bebas-neue), "Bebas Neue", sans-serif';
const MONO = 'Consolas, "Courier New", monospace';
const COMFORTAA = 'var(--font-comfortaa), Comfortaa, sans-serif';

/** Legacy sheet shape (fallback only). */
export interface LegacySheetLike {
  creation?: { seed?: { name?: string; baseFateDie?: string }; root?: { name?: string; description?: string } | null; branches?: Array<{ name?: string; description?: string }> } | null;
  traits?: Array<{ name: string; type: string; description?: string; mechanicalEffect?: string }> | null;
  fatedAge?: number;
  tkv?: number | string;
}

function Bar({ children, color = C.gold }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: '#000', color, fontFamily: BEBAS, fontSize: 15, letterSpacing: '0.08em', padding: '3px 8px', display: 'inline-block' }}>
      {children}
    </div>
  );
}

function Chip({ children, bg, fg = '#fff', title }: { children: React.ReactNode; bg: string; fg?: string; title?: string }) {
  return (
    <span title={title} style={{ background: bg, color: fg, fontFamily: BEBAS, fontSize: 12, letterSpacing: '0.05em', padding: '1px 5px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function KvChip({ kv }: { kv: number | null }) {
  if (kv === null) return null;
  return <Chip bg={C.purple} fg={C.gold} title="Karmic value">{kv > 0 ? `+${kv}` : kv} KV</Chip>;
}

function MaturityChips({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <>
      {flags.map(f => (
        <Chip key={f} bg="#000" fg={C.gold} title={`Maturity flag: ${f}`}>⚠ {f}</Chip>
      ))}
    </>
  );
}

const KIND_SURFACE: Record<string, { bg: string; tag: string; tagBg: string }> = {
  seed: { bg: C.purple3, tag: 'SEED', tagBg: C.purple },
  root: { bg: C.red3, tag: 'ROOT', tagBg: C.red },
  branch: { bg: C.blue3, tag: 'BRANCH', tagBg: C.navy },
  nectar: { bg: '#fff3dc', tag: 'NECTAR', tagBg: '#a8741a' },
  blossom: { bg: '#d6f2ec', tag: 'BLOSSOM', tagBg: C.teal },
  thorn: { bg: C.red3, tag: 'THORN', tagBg: '#8a1c26' },
};

/** One painted block: LOCAL name first, archetype beneath; tap to read the story. */
export function BlockRow({ block, showRule = false }: { block: CharacterBlockView; showRule?: boolean }) {
  const s = KIND_SURFACE[block.kind] ?? { bg: '#eee', tag: block.kind.toUpperCase(), tagBg: '#333' };
  const rule = block.ruleText ?? (showRule ? block.description : null);
  return (
    <details data-block-kind={block.kind} data-testid="block-row" style={{ background: s.bg, borderLeft: `4px solid ${s.tagBg}`, padding: '6px 8px', color: C.ink }}>
      <summary title={blockTooltip(block)} style={{ cursor: 'pointer', listStyle: 'none' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Chip bg={s.tagBg}>{s.tag}</Chip>
          <span data-testid="block-display-name" style={{ fontFamily: COMFORTAA, fontWeight: 700, fontSize: 14 }}>{block.displayName}</span>
          <KvChip kv={block.kv} />
          {block.ageAdded !== null && (block.kind === 'root' || block.kind === 'branch') && (
            <Chip bg={C.teal}>{block.ageAdded} yrs</Chip>
          )}
          <MaturityChips flags={block.maturityFlags} />
        </div>
        {block.localName && block.localName !== block.archetypeName && (
          <div data-testid="block-archetype" style={{ fontFamily: MONO, fontSize: 11, opacity: 0.75, marginTop: 2 }}>
            ↳ archetype: {block.archetypeName}
          </div>
        )}
        {showRule && rule && (
          <div style={{ fontFamily: MONO, fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>{rule}</div>
        )}
      </summary>
      {block.story && (
        <div style={{ fontFamily: COMFORTAA, fontSize: 12, marginTop: 6, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{block.story}</div>
      )}
      {block.history.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, marginTop: 4, opacity: 0.7 }}>
          {block.history.map((h, i) => (
            <div key={i}>{h.at ? new Date(h.at).toISOString().slice(0, 10) : ''} · {h.text}</div>
          ))}
        </div>
      )}
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: MONO, fontSize: 12, color: C.ink, opacity: 0.6, padding: '4px 2px' }}>{children}</div>;
}

function Section({ title, color, children, testId }: { title: string; color?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Bar color={color}>{title}</Bar>
      {children}
    </section>
  );
}

function itemLine(i: InventoryItemView, prefix?: string) {
  const title = [i.archetypeName && i.archetypeName !== i.name ? `archetype: ${i.archetypeName}` : null, i.story].filter(Boolean).join('\n\n');
  return (
    <div key={i.id} title={title || undefined} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontFamily: COMFORTAA, fontSize: 12, color: C.ink, padding: '2px 0' }}>
      {prefix && <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7 }}>{prefix}</span>}
      <span style={{ fontWeight: 700 }}>{i.name}</span>
      {i.archetypeName && i.archetypeName !== i.name && <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7 }}>↳ {i.archetypeName}</span>}
      <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11 }}>{i.weightLbs} lbs</span>
    </div>
  );
}

export function CarrySection({ inventory, loaded }: { inventory: InventoryTiers | null; loaded: boolean }) {
  const regionLabel = (key: string) => inventory?.regions.find(r => r.key === key)?.partName ?? key.split('/').pop() ?? key;
  return (
    <Section title="EQUIPPED · INVENTORY · POSSESSIONS" testId="carry-section">
      {!loaded ? <Empty>reading…</Empty> : !inventory ? <Empty>none yet</Empty> : (
        <div style={{ background: C.blue3, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div style={{ fontFamily: BEBAS, fontSize: 13, color: C.navy }}>EQUIPPED</div>
            {inventory.equipped.length ? inventory.equipped.map(i => itemLine(i, regionLabel(i.equippedTo ?? ''))) : <Empty>none yet</Empty>}
          </div>
          <div>
            <div style={{ fontFamily: BEBAS, fontSize: 13, color: C.navy }}>INVENTORY (CARRIED)</div>
            {inventory.carried.length ? inventory.carried.map(i => itemLine(i)) : <Empty>none yet</Empty>}
          </div>
          <div>
            <div style={{ fontFamily: BEBAS, fontSize: 13, color: C.navy }}>POSSESSIONS (OWNED, NOT CARRIED)</div>
            {inventory.possessions.length ? inventory.possessions.map(p => (
              <div key={p.id} title={p.note ?? undefined} style={{ fontFamily: COMFORTAA, fontSize: 12, color: C.ink, padding: '2px 0' }}>
                <span style={{ fontWeight: 700 }}>{p.targetName}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7 }}> · {(p.targetSubtype ?? p.targetType).toLowerCase()}</span>
              </div>
            )) : <Empty>none yet</Empty>}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.ink, background: '#000', padding: '2px 6px' }}>
            <span style={{ color: '#fff' }}>LOAD {inventory.encumbrance.totalLbs} / {inventory.encumbrance.capacityLbs} lbs</span>
            <span style={{ color: C.gold }}> · Clout×10 · {inventory.encumbrance.status}</span>
          </div>
        </div>
      )}
    </Section>
  );
}

export function VinesSection({ vines, loaded }: { vines: CharacterSheetFacts['vines'] | null; loaded: boolean }) {
  return (
    <Section title="GRO.VINES" testId="vines-section">
      {!loaded ? <Empty>reading…</Empty> : !vines || vines.length === 0 ? <Empty>no vines yet</Empty> : vines.map((v, i) => (
        <div key={v.id} style={{ background: i % 2 ? C.red3 : C.red2, padding: '6px 8px', color: C.ink, fontFamily: COMFORTAA, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip bg={C.navy}>G</Chip>
            <span style={{ fontWeight: 700 }}>{v.goal}</span>
            {v.authoredBy === 'ai' && <Chip bg={C.teal} title="An AI chose this vine">AI-CHOSEN</Chip>}
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10 }}>{v.status.toLowerCase()}</span>
          </div>
          <div style={{ marginTop: 3 }}><Chip bg={C.red}>R</Chip> {v.resistance ?? <span style={{ opacity: 0.6 }}>no resistance named yet</span>}</div>
          <div style={{ marginTop: 3 }}><Chip bg={C.teal}>O</Chip> {v.opportunity ?? <span style={{ opacity: 0.6 }}>no opportunity yet</span>}</div>
        </div>
      ))}
    </Section>
  );
}

/** TKV per the display standard: red label over light-purple number, gold border. */
export function TkvPill({ value }: { value: number | string }) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', border: `2px solid ${C.gold}`, fontFamily: BEBAS, minWidth: 64, textAlign: 'center' }}>
      <div style={{ background: C.red, color: C.gold, fontSize: 12, letterSpacing: '0.08em', padding: '2px 8px' }}>
        T<span style={{ fontFamily: "'Inknut Antiqua', var(--font-inknut-antiqua), serif", fontWeight: 900 }}>Ҝ</span>V
      </div>
      <div style={{ background: C.purple3, color: C.purple, fontSize: 18, padding: '1px 8px' }}>{value}</div>
    </div>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

export function FactsStrip({ facts, completion, tkvOverride }: { facts: CharacterSheetFacts | null; completion?: unknown; tkvOverride?: number | string }) {
  const c = readCompletion(completion);
  return (
    <div data-testid="facts-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <TkvPill value={tkvOverride ?? facts?.tkv ?? '—'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontFamily: MONO, fontSize: 12, color: C.ink }}>
        <div>
          <b style={{ fontFamily: BEBAS, fontSize: 14 }}>AGE</b> <span data-testid="age-value">{formatAge(facts?.age)}</span>
          {facts?.age.fatedAge != null && <> · <b style={{ fontFamily: BEBAS, fontSize: 14 }}>FATED</b> {facts.age.fatedAge}</>}
        </div>
        <div data-testid="memories-line" style={{ opacity: 0.8 }}>
          {facts ? `${facts.memories.count} memories · last ${relTime(facts.memories.lastAt)}` : 'memories —'}
        </div>
      </div>
      {c && (
        <span data-testid="completion-badge" style={{ background: '#000', color: c.awaitingImage ? C.gold : '#fff', fontFamily: MONO, fontSize: 11, padding: '2px 6px' }}>
          [{c.label.toUpperCase()}]
        </span>
      )}
    </div>
  );
}

/** Legacy fallback: synthesise views from sheet fields when no links exist. */
function legacyBlocks(sheet: LegacySheetLike | null | undefined): CharacterBlockView[] {
  if (!sheet) return [];
  const mk = (kind: string, name: string, description: string | null, extra: Partial<CharacterBlockView> = {}): CharacterBlockView => ({
    linkId: `legacy-${kind}-${name}`, forgeItemId: '', kind, archetypeName: name, localName: null, displayName: name,
    story: '', history: [], description, ruleText: null, kv: null, maturityFlags: [], status: 'legacy', pillar: null, ageAdded: null, ...extra,
  });
  const out: CharacterBlockView[] = [];
  const cr = sheet.creation;
  if (cr?.seed?.name) out.push(mk('seed', cr.seed.name, null));
  if (cr?.root?.name) out.push(mk('root', cr.root.name, cr.root.description ?? null));
  for (const b of cr?.branches ?? []) if (b?.name) out.push(mk('branch', b.name, b.description ?? null));
  for (const t of sheet.traits ?? []) if (t?.name) out.push(mk(t.type, t.name, t.description ?? null, { ruleText: t.mechanicalEffect ?? null }));
  return out;
}

/** Blocks to render: links first; legacy sheet fields only when no links exist. */
export function resolveBlocks(facts: CharacterSheetFacts | null, sheet?: LegacySheetLike | null): CharacterBlockView[] {
  const legacy = legacyBlocks(sheet);
  if (!facts || facts.blocks.length === 0) return legacy;
  // Links win. Traits added on the sheet by hand (GM ✎) still show, once.
  const names = new Set(facts.blocks.flatMap(b => [b.archetypeName.toLowerCase(), b.displayName.toLowerCase()]));
  const manualTraits = legacy.filter(b => ['nectar', 'blossom', 'thorn'].includes(b.kind) && !names.has(b.archetypeName.toLowerCase()));
  return [...facts.blocks, ...manualTraits];
}

export function OriginSection({ blocks }: { blocks: CharacterBlockView[] }) {
  const seed = blocksOfKind(blocks, 'seed');
  const roots = blocksOfKind(blocks, 'root');
  const branches = blocksOfKind(blocks, 'branch');
  return (
    <Section title="ORIGIN — SEED · ROOTS · BRANCHES" testId="origin-section">
      {seed.length ? seed.map(b => <BlockRow key={b.linkId} block={b} />) : <Empty>seed: none yet</Empty>}
      {roots.length ? roots.map(b => <BlockRow key={b.linkId} block={b} />) : <Empty>roots: none yet</Empty>}
      {branches.length ? branches.map(b => <BlockRow key={b.linkId} block={b} />) : <Empty>branches: none yet</Empty>}
    </Section>
  );
}

export function TraitsSection({ blocks }: { blocks: CharacterBlockView[] }) {
  const traits = blocks.filter(b => b.kind === 'nectar' || b.kind === 'blossom' || b.kind === 'thorn');
  return (
    <Section title="NECTARS · BLOSSOMS · THORNS" testId="traits-section">
      {traits.length ? traits.map(b => <BlockRow key={b.linkId} block={b} showRule />) : <Empty>none yet</Empty>}
    </Section>
  );
}

export default function CharacterGenesisSections({
  characterId,
  sheet,
  completion,
  framed = true,
  showCarry = true,
}: {
  characterId: string;
  sheet?: LegacySheetLike | null;
  completion?: unknown;
  /** Draw the gold canvas-object frame + powder surface (default). */
  framed?: boolean;
  /** Render the 3-tier carry section (off where a Paperdoll already shows it). */
  showCarry?: boolean;
}) {
  const { data: facts, loaded } = useCharacterSheetFacts(characterId);
  const { data: inventory, loaded: invLoaded } = useCharacterInventory(characterId, showCarry);
  const blocks = resolveBlocks(facts, sheet);
  const sheetTkv = sheet?.tkv !== undefined && sheet?.tkv !== null && sheet?.tkv !== '' ? sheet.tkv : undefined;

  return (
    <div
      data-testid="character-genesis-sections"
      style={framed
        ? { background: C.powder, border: `2px solid ${C.gold}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 10, color: C.ink }
        : { display: 'flex', flexDirection: 'column', gap: 10, color: C.ink }}
    >
      <FactsStrip facts={facts} completion={completion} tkvOverride={sheetTkv} />
      {!loaded && blocks.length === 0 ? <Empty>reading…</Empty> : (
        <>
          <OriginSection blocks={blocks} />
          <TraitsSection blocks={blocks} />
        </>
      )}
      {showCarry && <CarrySection inventory={inventory} loaded={invLoaded} />}
      <VinesSection vines={facts?.vines ?? null} loaded={loaded} />
    </div>
  );
}
