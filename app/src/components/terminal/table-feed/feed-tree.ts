/**
 * The one feed as a FOLD TREE (Mike 2026-10-08: "a big one for chapters then
 * sessions and within sessions sleeping and rests and then within those
 * encounters. That way everything can be tidy and easily searchable").
 *
 *   chapter → session | between sessions → rest stretch → encounter → lines
 *
 * Data sources: chapters — none recorded anywhere, so one implicit "Chapter 1";
 * sessions — GameSession (feed-sections.ts); rests — `short_rest`/`long_rest`
 * game events; encounters — `encounter_begin` … `encounter_end` game events
 * (payload.encounterId/encounterName since 2026-10-08, else the name in the
 * text). The live path is open; everything else folds by default.
 *
 * Search: `matchEvent` / `filterTree` keep only matching lines and the nodes
 * that hold them, so the caller can open exactly those.
 *
 * Pure.
 */
import type { TerminalEvent, GameSessionInfo, GameEventPayload } from '@/types/terminal';
import { buildSections } from './feed-sections';

export type FoldKind = 'chapter' | 'session' | 'between' | 'rest' | 'encounter';

export interface FoldNode {
  key: string;
  kind: FoldKind;
  label: string;
  /** On the live path (open by default). */
  live: boolean;
  items: FoldItem[];
  /** Lines inside, at any depth. */
  lines: number;
  cycles: [number, number] | null;
  /** Encounter only: its id or name, so the live one can be matched to the running encounter. */
  encounter?: { id: string | null; name: string; ended: boolean };
  /** Chapter only: sessions inside, and the harvest that closed it (null = the current chapter). */
  chapter?: { number: number; sessions: number; harvest: { timestamp: string; cycle: number | null } | null };
}

/**
 * A harvest line — what closes a chapter (Mike 2026-10-08: "chapters are
 * delimited by harvests in-game"). Today the only recorded trace is a
 * character changelog entry in category `harvest`; a `game_event` of type
 * `harvest` counts too, for when the harvest flow posts one.
 */
export function isHarvest(e: TerminalEvent): boolean {
  const p = e.payload as unknown as { kind?: string; category?: string; eventType?: string };
  return (p?.kind === 'changelog' && p.category === 'harvest') || (p?.kind === 'game_event' && p.eventType === 'harvest');
}

export type FoldItem = { type: 'event'; event: TerminalEvent } | { type: 'node'; node: FoldNode };

const gp = (e: TerminalEvent) => (e.payload?.kind === 'game_event' ? (e.payload as GameEventPayload & { encounterId?: string; encounterName?: string }) : null);

function encounterOf(e: TerminalEvent): { id: string | null; name: string } {
  const p = gp(e)!;
  if (p.encounterName) return { id: p.encounterId ?? null, name: p.encounterName };
  const m = p.description.match(/^Encounter (?:begins|resolved): (.+?)\.(?:\s|$)/);
  return { id: p.encounterId ?? null, name: m ? m[1] : 'Encounter' };
}

function addCycle(node: FoldNode, c: unknown) {
  if (typeof c !== 'number') return;
  node.cycles = node.cycles ? [Math.min(node.cycles[0], c), Math.max(node.cycles[1], c)] : [c, c];
}

function pushEvent(node: FoldNode, e: TerminalEvent) {
  node.items.push({ type: 'event', event: e });
  node.lines += 1;
  addCycle(node, (e.payload as { cycle?: unknown }).cycle);
}

function pushNode(parent: FoldNode, child: FoldNode) {
  parent.items.push({ type: 'node', node: child });
  parent.lines += child.lines;
  if (child.cycles) { addCycle(parent, child.cycles[0]); addCycle(parent, child.cycles[1]); }
}

/** Lines of one stretch, with every encounter (begin → end) folded into its own node. */
function withEncounters(parent: FoldNode, events: TerminalEvent[], live: { liveSession: boolean; liveEncounter: { id: string | null; name: string } | null }) {
  let enc: FoldNode | null = null;
  const close = () => { if (enc) { pushNode(parent, enc); enc = null; } };
  for (const e of events) {
    const p = gp(e);
    if (p?.eventType === 'encounter_begin') {
      close();
      const who = encounterOf(e);
      enc = { key: `enc-${e.id}`, kind: 'encounter', label: who.name, live: false, items: [], lines: 0, cycles: null, encounter: { ...who, ended: false } };
      pushEvent(enc, e);
      continue;
    }
    if (enc) {
      pushEvent(enc, e);
      if (p?.eventType === 'encounter_end') { enc.encounter!.ended = true; close(); }
      continue;
    }
    pushEvent(parent, e);
  }
  if (enc) {
    const node = enc as FoldNode;
    const le = live.liveEncounter;
    node.live = live.liveSession && !!le && (le.id ? le.id === node.encounter!.id || le.name === node.encounter!.name : le.name === node.encounter!.name);
    close();
  }
}

/**
 * Events (oldest first) + sessions → the tree. Chapters: Chapter 1 runs from
 * the start to the first harvest; a chapter closes after the session (or
 * between-stretch) its harvest happened in. No harvest yet = all Chapter 1.
 * Chapter numbers count from the oldest LOADED history, so while earlier pages
 * are unloaded they are relative (`chapterOffset` shifts them when known).
 */
export function buildFoldTree(
  events: TerminalEvent[],
  sessions: GameSessionInfo[],
  opts: { emptyFrom?: string | null; liveEncounter?: { id: string | null; name: string } | null; chapterOffset?: number } = {},
): FoldNode[] {
  const chapters: FoldNode[] = [];
  const newChapter = (): FoldNode => {
    const number = chapters.length + 1 + (opts.chapterOffset ?? 0);
    const c: FoldNode = { key: `chapter-${number}`, kind: 'chapter', label: `Chapter ${number}`, live: false, items: [], lines: 0, cycles: null, chapter: { number, sessions: 0, harvest: null } };
    chapters.push(c);
    return c;
  };
  let chapter = newChapter();
  const sections = buildSections(events, sessions, opts.emptyFrom ?? null);
  const anyLive = sections.some((s) => s.live);
  sections.forEach((s, si) => {
    const node: FoldNode = {
      key: s.key, kind: s.kind,
      label: s.kind === 'between' ? 'Between sessions' : `Session ${s.session!.number}${s.session!.name ? ` · ${s.session!.name}` : ''}`,
      live: s.live || (s.kind === 'between' && !anyLive && si === sections.length - 1),
      items: [], lines: 0, cycles: null,
    };
    s.parts.forEach((part, pi) => {
      const ctx = { liveSession: s.live, liveEncounter: opts.liveEncounter ?? null };
      if (!part.rest) { withEncounters(node, part.events, ctx); return; }
      const rp = part.rest.payload as GameEventPayload;
      const rest: FoldNode = {
        key: part.key, kind: 'rest',
        label: rp.eventType === 'short_rest' ? 'Short rest' : rp.eventType === 'long_rest' ? 'Long rest' : rp.eventType === 'sleep' ? 'Sleep' : 'Rest',
        live: s.live && pi === s.parts.length - 1, items: [], lines: 0, cycles: null,
      };
      addCycle(rest, (rp as { cycle?: unknown }).cycle);
      withEncounters(rest, part.events, ctx);
      pushNode(node, rest);
    });
    pushNode(chapter, node);
    if (s.kind === 'session') chapter.chapter!.sessions += 1;
    const harvest = [...s.parts.flatMap((p) => p.events)].reverse().find(isHarvest);
    if (harvest && si < sections.length - 1) {
      const c = (harvest.payload as { cycle?: unknown }).cycle;
      chapter.chapter!.harvest = { timestamp: harvest.timestamp, cycle: typeof c === 'number' ? c : null };
      chapter = newChapter();
    } else if (harvest) {
      const c = (harvest.payload as { cycle?: unknown }).cycle;
      chapter.chapter!.harvest = { timestamp: harvest.timestamp, cycle: typeof c === 'number' ? c : null };
    }
  });
  // The current chapter (the last one) is on the live path.
  const kept = chapters.filter((c) => c.items.length > 0);
  if (kept.length) kept[kept.length - 1].live = true;
  return kept;
}

/** Every node on the live path, plus anything containing a live node. */
export function openByDefaultKeys(tree: FoldNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (n: FoldNode): boolean => {
    let liveInside = false;
    for (const it of n.items) if (it.type === 'node' && walk(it.node)) liveInside = true;
    if (n.live || liveInside) { keys.add(n.key); return true; }
    return false;
  };
  tree.forEach(walk);
  return keys;
}

// ── search ───────────────────────────────────────────────────────────────────

/** The searchable text of a line: what it says, who, and the raw text. */
export function eventText(e: TerminalEvent): string {
  const p = e.payload as unknown as Record<string, unknown>;
  const parts = [e.characterName, e.actorName, p.message, p.description, p.context, p.input, p.result, p.raw];
  if (Array.isArray(p.speech)) for (const s of p.speech as Array<{ speakerLabel?: string; text?: string }>) parts.push(s.speakerLabel, s.text);
  return parts.filter((x): x is string => typeof x === 'string').join(' • ');
}

export function matchEvent(e: TerminalEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !!q && eventText(e).toLowerCase().includes(q);
}

/** Only matching lines and the nodes holding them (labels match too: a node whose name matches keeps all of it). */
export function filterTree(tree: FoldNode[], query: string): { tree: FoldNode[]; hits: number; openKeys: Set<string> } {
  const q = query.trim().toLowerCase();
  let hits = 0;
  const openKeys = new Set<string>();
  const walk = (n: FoldNode): FoldNode | null => {
    if (n.kind !== 'chapter' && n.label.toLowerCase().includes(q)) {
      const count = (x: FoldNode): number => x.items.reduce((s, it) => s + (it.type === 'event' ? 1 : count(it.node)), 0);
      hits += count(n);
      const mark = (x: FoldNode) => { openKeys.add(x.key); x.items.forEach((it) => it.type === 'node' && mark(it.node)); };
      mark(n);
      return n;
    }
    const items: FoldItem[] = [];
    for (const it of n.items) {
      if (it.type === 'event') { if (matchEvent(it.event, q)) { items.push(it); hits += 1; } continue; }
      const child = walk(it.node);
      if (child) items.push({ type: 'node', node: child });
    }
    if (!items.length) return null;
    openKeys.add(n.key);
    return { ...n, items };
  };
  const out = q ? tree.map(walk).filter((n): n is FoldNode => !!n) : tree;
  return { tree: out, hits, openKeys };
}
