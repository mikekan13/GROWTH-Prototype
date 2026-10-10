'use client';

/**
 * TABLE feed rows (ruling-feed-segment-colours-pillars, Mike 2026-10-07).
 * One row grammar: [portrait chip] · body · right column (the ⌨/🎙 badge,
 * which IS the raw toggle). Colour marks WHAT a segment is, never WHO said it.
 * The chip and every named thing in the world open a ComplexTooltip (hover +
 * lock on desktop, tap on touch, bottom sheet under 600 px). Nothing here is
 * hold-triggered; taps are `click`.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import { segmentMarks, splitEntities, presentCycle, realClock, type FeedSegment, type FeedTimescale, type EntityName } from '@/lib/feed-segments';
import type { FeedRowModel, CharacterRowModel, NarrationRowModel, BarRowModel, WithdrawnRowModel, BeatRowModel, Via } from './feed-rows';
import { splitPerceived } from '@/lib/perceived-text';
import type { PerceivedFact } from '@/types/terminal';

/** A thing in the world the feed can name: a character, a place, an item. */
export interface FeedEntity {
  id: string;
  name: string;
  kind: 'character' | 'npc' | 'location' | 'item';
  portrait?: string | null;
  /** Location type / item type. */
  subtype?: string;
  /** Where it is (an item's holder or place). */
  where?: string;
  description?: string;
  status?: string;
  /** Perceived feed: what the viewer knows of each known aspect, at their fidelity. Present = the tooltip shows ONLY these. */
  known?: PerceivedFact[];
}

interface FeedContextValue {
  entities: Map<string, FeedEntity>;
  names: EntityName[];
  timescale: FeedTimescale | null;
  /** Perceived feed (unit 9): spans come only from the line's own tokens ({@id|label}, {gap}); no name matching. */
  perceived?: boolean;
  /** Revert a character change (changelog entry id); absent = no revert control. */
  onRevert?: (entryId: string) => void;
  reverting?: string | null;
  /** A feed line's link to the mechanical rows behind it (opens the jEWL tab's Log). */
  onOpenLog?: (ids: string[]) => void;
  /** Rows to mark (the Log rows a feed link jumped to). */
  highlight?: Set<string>;
}

const FeedContext = createContext<FeedContextValue>({ entities: new Map(), names: [], timescale: null });

export function TableFeedProvider({ entities, timescale, onRevert, reverting, onOpenLog, highlight, perceived, children }: {
  entities: FeedEntity[]; timescale: FeedTimescale | null;
  onRevert?: (entryId: string) => void; reverting?: string | null;
  onOpenLog?: (ids: string[]) => void; highlight?: Set<string>;
  perceived?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<FeedContextValue>(() => ({
    entities: new Map(entities.map((e) => [e.id, e])),
    names: perceived ? [] : entities.map((e) => ({ id: e.id, name: e.name })),
    timescale,
    onRevert,
    reverting,
    onOpenLog,
    highlight,
    ...(perceived ? { perceived: true } : {}),
  }), [entities, timescale, onRevert, reverting, onOpenLog, highlight, perceived]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

// ── small pieces ─────────────────────────────────────────────────────────────

const VIA_GLYPH: Record<Via, string> = { typed: '⌨', spoken: '🎙', being: '◈' };
const VIA_WORD: Record<Via, string> = { typed: 'typed', spoken: 'spoken', being: 'answered by the being' };
const VIA_RAW: Record<Via, string> = { typed: 'AS TYPED', spoken: 'AS HEARD', being: 'AS ANSWERED' };

function hhmm(iso: string): string {
  return realClock(iso).slice(0, 5);
}

function useInWorld(cycle: number | undefined): string {
  const { timescale } = useContext(FeedContext);
  return cycle === undefined ? 'not recorded' : presentCycle(cycle, timescale);
}

/** The typed/spoken badge — the control that expands the raw text (Mike 10-07). */
function RawToggle({ via, open, onToggle }: { via: Via; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`md${open ? ' open' : ''}`}
      aria-expanded={open}
      aria-label={`${VIA_WORD[via]}: ${open ? 'hide' : 'show'} raw`}
      data-no-hold
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      <span className="tg">{VIA_GLYPH[via]}</span>
    </button>
  );
}

/** What was missed: the rulebook's gap — a short black glitch dash, never a word (perceived feed, unit 9). */
function Gap() {
  return <span className="gap" role="img" aria-label="…" data-gap />;
}

/** A perceived line's raw text: labels inline, gaps drawn. */
function PerceivedPlain({ text }: { text: string }) {
  return <>{splitPerceived(text).map((p, i) => (p.kind === 'gap' ? <Gap key={i} /> : <React.Fragment key={i}>{p.kind === 'text' ? p.text : p.label}</React.Fragment>))}</>;
}

function RawBlock({ raw, via, cycle, timestamp }: { raw: string; via: Via; cycle?: number; timestamp: string }) {
  const inWorld = useInWorld(cycle);
  const { perceived } = useContext(FeedContext);
  return (
    <div className="rawbox" data-raw>
      <div className="hd">RAW · {VIA_RAW[via]} · {inWorld} · <span className="real">{realClock(timestamp)}</span></div>
      <div className="line"><span className="bar">{perceived ? <PerceivedPlain text={raw} /> : raw}</span></div>
    </div>
  );
}

function entityKindLine(e: FeedEntity): string {
  const kind = e.kind === 'npc' ? 'NPC' : e.kind === 'character' ? 'PC' : e.kind === 'location' ? 'Place' : 'Item';
  return e.subtype ? `${kind} · ${e.subtype}` : kind;
}

/** A named thing in the world, as a black Terminal span that opens its card. */
function EntitySpan({ entity, text, source }: { entity: FeedEntity; text: string; source: string }) {
  const [open, setOpen] = useState(false);
  const description = entity.description && entity.description.length > 240 ? `${entity.description.slice(0, 237)}…` : entity.description;
  return (
    <ComplexTooltip
      title={entity.name}
      modifiers={[]}
      totalValue={0}
      skin="terminal"
      inline
      triggerAs="span"
      triggerClassName={`ent${open ? ' open' : ''}`}
      triggerStyle={{ display: 'inline' }}
      triggerProps={{ role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'data-entity': `${entity.kind}:${entity.id}`, 'data-no-hold': '' }}
      onOpenChange={setOpen}
      content={entity.known ? (
        <>
          {/* Perceived: only what the viewer knows of it, phrased at their fidelity — never a level, never an unknown aspect. */}
          <dl className="tft-f">
            <dt>Seen as</dt><dd>{entity.name}</dd>
            <dt>Type</dt><dd>{entityKindLine(entity)}</dd>
            {entity.known.length
              ? entity.known.map((k) => (<React.Fragment key={k.aspect}><dt>{k.label}</dt><dd className={k.value.length > 40 ? 'long' : undefined}>{k.value}</dd></React.Fragment>))
              : (<><dt>Known</dt><dd>nothing yet</dd></>)}
          </dl>
          <p className="tft-src">[{source}]</p>
        </>
      ) : (
        <>
          <dl className="tft-f">
            <dt>Name</dt><dd>{entity.name}</dd>
            <dt>Type</dt><dd>{entityKindLine(entity)}</dd>
            {entity.status && (<><dt>Status</dt><dd>{entity.status}</dd></>)}
            {entity.where && (<><dt>Where</dt><dd>{entity.where}</dd></>)}
            {description && (<><dt>About</dt><dd className="long">{description}</dd></>)}
          </dl>
          <p className="tft-src">[{source}]</p>
        </>
      )}
    >
      {text}
    </ComplexTooltip>
  );
}

/** Plain text with every named thing in the world turned into an entity span. */
function EntityText({ text, exclude, source }: { text: string; exclude?: string[]; source: string }) {
  const { entities, names, perceived } = useContext(FeedContext);
  const pieces = useMemo(() => (perceived ? [] : splitEntities(text, names, exclude ?? [])), [perceived, text, names, exclude]);
  if (perceived) {
    // The line's own tokens only: {gap} → the gap dash; {@id|label} → a span with what the viewer knows.
    return (
      <>
        {splitPerceived(text).map((p, i) => {
          if (p.kind === 'gap') return <Gap key={i} />;
          if (p.kind === 'text') return <React.Fragment key={i}>{p.text}</React.Fragment>;
          const entity = entities.get(p.id);
          return entity && !(exclude ?? []).includes(p.id)
            ? <EntitySpan key={i} entity={{ ...entity, name: entity.known ? p.label : entity.name }} text={p.label} source={source} />
            : <React.Fragment key={i}>{p.label}</React.Fragment>;
        })}
      </>
    );
  }
  return (
    <>
      {pieces.map((p, i) => {
        const entity = p.entityId ? entities.get(p.entityId) : undefined;
        return entity ? <EntitySpan key={i} entity={entity} text={p.text} source={source} /> : <React.Fragment key={i}>{p.text}</React.Fragment>;
      })}
    </>
  );
}

const SEG_CLASS: Record<FeedSegment['kind'], string> = { action: 'act', speech: 'say', thought: 'think' };

function Segments({ segments, exclude, name, at, caret }: { segments: FeedSegment[]; exclude?: string[]; name: string; at: string; caret?: boolean }) {
  return (
    <div className="line">
      {segments.map((s, i) => {
        const [open, close] = segmentMarks(s.kind);
        const last = i === segments.length - 1;
        return (
          <span key={i} className={`seg ${SEG_CLASS[s.kind]}`} data-seg={s.kind}>
            <span className="mk">{open}</span>
            <EntityText text={s.text} exclude={exclude} source={`from: <${name}> ${open}${s.kind}${close} · ${at}`} />
            {!(caret && last) && <span className="mk">{close}</span>}
            {caret && last && <span className="caret" aria-hidden>▍</span>}
          </span>
        );
      })}
      {caret && segments.length === 0 && <span className="seg say"><span className="caret" aria-hidden>▍</span></span>}
    </div>
  );
}

/** The portrait chip with the p 10 `<Name>:` tag under it — a tooltip trigger. */
function PortraitChip({ row }: { row: CharacterRowModel }) {
  const { entities, perceived } = useContext(FeedContext);
  const [open, setOpen] = useState(false);
  const entity = row.characterId ? entities.get(row.characterId) : undefined;
  // Perceived feed: who voiced it at the real table is not something the character perceived.
  const showVoice = !(perceived && entity?.known);
  const inWorld = useInWorld(row.cycle);
  const role = entity ? (entity.kind === 'npc' ? `NPC${entity.status ? ` · ${entity.status.toLowerCase()}` : ''}` : entity.kind === 'character' ? 'PC' : entityKindLine(entity)) : 'Not on the roster';
  const voiced = row.voice === 'Being' ? 'The being · DAYA' : `${row.voice}${row.voicedBy ? ` · ${row.voicedBy}` : ''}`;
  return (
    <ComplexTooltip
      title={`<${row.name}>`}
      modifiers={[]}
      totalValue={0}
      skin="terminal"
      triggerClassName={`chip${open ? ' open' : ''}`}
      triggerStyle={{ width: 80 }}
      triggerProps={{ role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': `${row.name}: who, how, when`, 'data-no-hold': '' }}
      onOpenChange={setOpen}
      content={(
        <>
          <dl className="tft-f">
            <dt>Role</dt><dd>{role}</dd>
            {showVoice && (<><dt>Voiced by</dt><dd>{voiced}</dd>
            <dt>Received</dt><dd>{VIA_GLYPH[row.via]} {VIA_WORD[row.via]}</dd></>)}
            <dt>In-world</dt><dd>{inWorld}</dd>
            <dt>Real</dt><dd className="real">{realClock(row.timestamp)}</dd>
          </dl>
          {row.fromNarration && <p className="tft-src">[parsed from narration · {hhmm(row.timestamp)}]</p>}
        </>
      )}
    >
      {entity?.portrait
        // eslint-disable-next-line @next/next/no-img-element -- portraits are local files of any size; next/image adds nothing here
        ? <img className="pt" src={entity.portrait} alt="" />
        : <div className="pt" aria-hidden />}
      <span className="who"><span className="lt">&lt;</span><span className="nm">{row.name}&gt;</span><span className="co">:</span></span>
    </ComplexTooltip>
  );
}

/** The small link from a feed line to the mechanical rows behind it in the Log. */
function LogLink({ refs }: { refs?: string[] }) {
  const { onOpenLog } = useContext(FeedContext);
  if (!refs || refs.length === 0 || !onOpenLog) return null;
  return (
    <button
      type="button"
      className="md loglink"
      aria-label={`Show the ${refs.length} mechanical row${refs.length === 1 ? '' : 's'} behind this line in the Log`}
      title="Show in the Log"
      data-no-hold
      data-log-link={refs.join(',')}
      onClick={(e) => { e.stopPropagation(); onOpenLog(refs); }}
    >
      <span className="tg lg">{'⌗'}{refs.length > 1 ? refs.length : ''}</span>
    </button>
  );
}

/** Row attributes: the key (for jumping to it) and the mark when a link jumped here. */
function useRowAttrs(key: string): { 'data-key': string; 'data-hl'?: '' } {
  const { highlight } = useContext(FeedContext);
  return highlight?.has(key) ? { 'data-key': key, 'data-hl': '' } : { 'data-key': key };
}

// ── rows ─────────────────────────────────────────────────────────────────────

export function CharacterRow({ row, caret, withdrawn }: { row: CharacterRowModel; caret?: boolean; withdrawn?: boolean }) {
  const [rawOpen, setRawOpen] = useState(false);
  const exclude = useMemo(() => (row.characterId ? [row.characterId] : []), [row.characterId]);
  const attrs = useRowAttrs(row.key);
  return (
    <div className={`row cl${withdrawn ? ' gone' : ''}`} data-row="character" data-via={row.via} {...attrs}>
      <PortraitChip row={row} />
      <div className="body">
        <Segments segments={row.segments} exclude={exclude} name={row.name} at={hhmm(row.timestamp)} caret={caret} />
        {withdrawn && <span className="fix">Line withdrawn</span>}
      </div>
      <div className="side">{!caret && !withdrawn && <RawToggle via={row.via} open={rawOpen} onToggle={() => setRawOpen((o) => !o)} />}{!caret && <LogLink refs={row.logRefs} />}</div>
      {rawOpen && <RawBlock raw={row.raw} via={row.via} cycle={row.cycle} timestamp={row.timestamp} />}
    </div>
  );
}

export function NarrationRow({ row }: { row: NarrationRowModel }) {
  const [rawOpen, setRawOpen] = useState(false);
  const attrs = useRowAttrs(row.key);
  return (
    <div className={`row nx${row.mechanical ? ' told' : ''}`} data-row="narration" data-via={row.mechanical ? 'mechanical' : row.via} {...attrs}>
      <div className="body"><div className="line"><EntityText text={row.text} source={`from ${row.mechanical ? 'the record' : 'narration'} · ${hhmm(row.timestamp)}`} /></div></div>
      <div className="side">{!row.mechanical && <RawToggle via={row.via} open={rawOpen} onToggle={() => setRawOpen((o) => !o)} />}<LogLink refs={row.logRefs} /></div>
      {rawOpen && <RawBlock raw={row.raw} via={row.via} cycle={row.cycle} timestamp={row.timestamp} />}
    </div>
  );
}

const BAR_CLASS: Record<BarRowModel['type'], string> = { check: 'check', event: 'event', jewl: 'jewl', system: 'sys' };

export function BarRow({ row }: { row: BarRowModel }) {
  const { onRevert, reverting } = useContext(FeedContext);
  const canRevert = !!(row.revertId && onRevert);
  const attrs = useRowAttrs(row.key);
  return (
    <div className={`row bx bars ${BAR_CLASS[row.type]}`} data-row={row.type} {...attrs}>
      <div className="body">
        {row.lines.map((l, i) => (
          <div className="line" key={i}>
            <span className="bar">{i === 0 && row.tag ? `${row.tag} ` : ''}{l}</span>
          </div>
        ))}
      </div>
      <div className="side">
        {canRevert && (
          <button
            type="button"
            className="md"
            aria-label="Revert this change"
            title="Revert this change"
            data-no-hold
            disabled={reverting === row.revertId}
            onClick={(e) => { e.stopPropagation(); onRevert!(row.revertId!); }}
          >
            <span className="tg rv">{reverting === row.revertId ? '…' : '↶'}</span>
          </button>
        )}
        <LogLink refs={row.logRefs} />
      </div>
    </div>
  );
}

export function WithdrawnRow({ row }: { row: WithdrawnRowModel }) {
  const attrs = useRowAttrs(row.key);
  return (
    <div className="row bx gone" data-row="withdrawn" {...attrs}>
      <div className="body">
        <div className="line">{row.text}</div>
        <span className="fix">{row.fix}</span>
      </div>
      <div className="side" />
    </div>
  );
}

/** Spoken sentences of one beat: the first shows, the rest fold behind a [...+N SPOKEN LINES...] bar (tap toggles). */
export function BeatRow({ row }: { row: BeatRowModel }) {
  const [open, setOpen] = useState(false);
  const more = row.groups.length - 1;
  const shown = open ? row.groups : row.groups.slice(0, 1);
  return (
    <div data-spoken-beat={row.beatId} data-open={open ? '1' : '0'}>
      {shown.flat().map((r) => (r.type === 'narration' ? <NarrationRow key={r.key} row={r} /> : <CharacterRow key={r.key} row={r} />))}
      {more > 0 && (
        <div className="row bx">
          <button type="button" className="foldbtn" aria-expanded={open} data-no-hold onClick={() => setOpen((o) => !o)}>
            <span>{open ? `[...FOLD ${row.groups.length} SPOKEN LINES...]` : `[...+${more} SPOKEN LINE${more === 1 ? '' : 'S'} · ${hhmm(row.timestamp)}–${hhmm(row.lastTimestamp)}...]`}</span>
          </button>
          <div className="side" />
        </div>
      )}
    </div>
  );
}

export function FeedRow({ row }: { row: FeedRowModel }) {
  switch (row.type) {
    case 'character': return <CharacterRow row={row} />;
    case 'narration': return <NarrationRow row={row} />;
    case 'withdrawn': return <WithdrawnRow row={row} />;
    case 'beat': return <BeatRow row={row} />;
    default: return <BarRow row={row} />;
  }
}
