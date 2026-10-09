/**
 * VISIBLE FORM — perception build unit 8 (Mike 2026-10-09, Q6 + Q7; memory
 * `ruling-passive-active-perception-familiarity-2026-10-08`).
 *
 * A being's feed line is a VIEW of its memory row (truthRef → canon event),
 * not a copy (Q6). This module turns the truth line into what THIS viewer
 * perceived, in the SAME segment structure the TABLE feed renders
 * (ruling-feed-segment-colours-pillars: `Name:` + ::action:: / "speech" /
 * ((thought)) segments; narration with entity spans that open tooltips):
 *
 *   - speech heard poorly → only the caught words; every run of missed words
 *     is ONE gap piece ({gap} in flat text) the feed styles as the rulebook's
 *     gap/glitch. Heard nothing but saw it said → a lone gap.
 *   - an action (or a sim act in narration) seen poorly → a vaguer rewrite
 *     ("someone moves near the door"): the small model when the perception
 *     pass is on, else / on any failure the deterministic "someone <verb>".
 *   - narration taken in poorly → caught fragments, the same gap language.
 *   - entity spans named at the viewer's familiarity with that entity's
 *     IDENTITY aspect: F0 a generic ("a figure"), F1–F2 a short description,
 *     F3+ the proper name; each span carries only the aspects the viewer knows
 *     (the tooltip shows those; F5 = raw stats).
 *   - ((thought)) kept only for the thinker itself or through a sense that
 *     reaches minds (Mike Q7: "mind reading spell"); otherwise removed.
 *   - full clarity on every sense + known names → exactly the truth line.
 *
 * Never a number, a level or the word "distorted" in what it renders
 * (TABLE-RHYTHM §4: "murk rendered as murk … never labeled").
 *
 * Deterministic first: which words are caught is a seeded RNG keyed on the
 * memory row id, so a row always renders the same. The rendered form is
 * cached on the row (DayaMemoryEntry.visibleForm, keyed by a signature of its
 * inputs); a canon correction clears it (services/reconciliation correctCanon).
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { parseSegments, splitEntities, type FeedSegment } from '@/lib/feed-segments';
import { parseTableProse } from '@/services/table-prose';
import { SENSE_KINDS, mindSensesOf, senseProfileFromSheet, type SenseKind } from '@/sim/senses/field';
import { perceptionReachOn } from '@/sim/senses/reach';
import { familiarityAt, scoreToFidelity, witMaxFromSheet } from '@/services/familiarity';
import { currentCycleOf } from '@/services/history';
import { decodePerceivedVia } from '@/daya/perceived-via';
import { route, anthropicChatText, openAiCompatChat, recordAiCall } from '@/ai/network';

// ── Shapes ────────────────────────────────────────────────────────────────

/** The inline gap marker in flat segment text. The feed draws it as the rulebook gap/glitch — never as words. */
export const GAP_TOKEN = '{gap}';

export type EntityKind = 'CHARACTER' | 'NPC' | 'ITEM' | 'LOCATION';

/** A named thing in the truth line. */
export interface TruthEntity {
  id: string;
  kind: EntityKind;
  name: string;
  /** What can be seen of it, free text (sheet description / appearance). F1–F2 name it by this. */
  description?: string | null;
}

export type TruthRow =
  | { type: 'character'; speakerId: string | null; name: string; segments: FeedSegment[] }
  /** `act` = a sim act (an encounter swing, a move): degraded like an action, not fragmented like scene prose. */
  | { type: 'narration'; text: string; act?: boolean; actorId?: string | null };

export interface TruthLine {
  /** Canon event ids this line renders, in order. */
  refs: string[];
  rows: TruthRow[];
  entities: TruthEntity[];
}

/** One viewer's perception of the line (from the memory row + the viewer's senses). */
export interface ViewerPerception {
  /** The viewer's character id. */
  viewerId: string;
  /** false = sensed-but-unnoticed: not in the feed. */
  noticed: boolean;
  /** Senses that carried it (DayaMemoryEntry.perceivedVia): organ senses, a mind sense's name, or 'self'. Empty = not judged (pre-unit-6 rows / flag off). */
  via: string[];
  /** Per sense, how well it works for this viewer, 0..1 (organ effectiveness; a mind sense's own). Missing = 1 for a carried sense. */
  clarity: Partial<Record<string, number>>;
}

/** Per entity, per aspect: the viewer's familiarity level F0–F5 (already faded to now). */
export type ViewerFamiliarity = Record<string, Record<string, number>>;

export interface VisibleEntity {
  id: string;
  kind: EntityKind;
  /** What the viewer calls it — a generic, a short description, or the name. */
  label: string;
  /** Aspects the viewer knows (level ≥ 1); the tooltip shows only these. Level 5 = the raw stats. Data for the tooltip, never printed. */
  known: Array<{ aspectKind: string; fidelity: number }>;
}

export type VisiblePiece =
  | { kind: 'text'; text: string }
  | { kind: 'gap' }
  | { kind: 'entity'; text: string; entityId: string };

/** A feed segment (FeedSegment-compatible: kind + flat text with {gap}) plus its structured pieces. */
export interface VisibleSegment extends FeedSegment { pieces: VisiblePiece[] }

export type VisibleRow =
  | { type: 'character'; speakerId: string | null; name: string; segments: VisibleSegment[] }
  | { type: 'narration'; text: string; pieces: VisiblePiece[] };

export interface VisibleForm {
  memoryId: string;
  truthRefs: string[];
  rows: VisibleRow[];
  /** Every entity a span points at, as this viewer knows it. */
  entities: VisibleEntity[];
}

/** The small-model rewrite of a poorly seen action. Returns null to fall back. */
export type VagueRewriteModel = (input: { text: string; seen: 'poorly' | 'heard only' }) => Promise<string | null>;

// ── Tuning ────────────────────────────────────────────────────────────────

/** TUNING — placeholders, like every perception number (Mike 2026-10-09: set from a live run). */
export const VISIBLE_FORM_TUNING = {
  /** Identity level at which a thing is called by its proper name. */
  nameAt: 3,
  /** Identity level at which a short description replaces the generic. */
  describeAt: 1,
  /** Words kept from a description for the F1–F2 label. */
  describeWords: 6,
  /** The model's rewrite is refused past this many words. */
  rewriteMaxWords: 16,
  rewriteTimeoutMs: 3000,
} as const;

const GENERIC: Record<EntityKind, string> = { CHARACTER: 'a figure', NPC: 'a figure', ITEM: 'something', LOCATION: 'a place' };

// ── Small pure helpers ────────────────────────────────────────────────────

/** FNV-1a 32-bit. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 — a seeded RNG in [0, 1). Pure given the seed. */
export function seededRng(seed: string): () => number {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Tall, grey-eyed guard in mail. Wears…" → "a tall, grey-eyed guard in mail". Pure. */
export function shortDescription(description: string | null | undefined): string | null {
  const first = (description ?? '').split(/[.;\n]/)[0]?.trim();
  if (!first) return null;
  const words = first.split(/\s+/).slice(0, VISIBLE_FORM_TUNING.describeWords).join(' ').replace(/[,:\-–—]+$/, '');
  const lower = words[0].toLowerCase() + words.slice(1);
  return /^(a|an|the|some)\s/i.test(lower) ? lower : `${/^[aeiou]/i.test(lower) ? 'an' : 'a'} ${lower}`;
}

/** What the viewer calls an entity, by its identity level. The viewer itself is always itself. Pure. */
export function labelFor(e: TruthEntity, identity: number, viewerId: string): string {
  if (e.id === viewerId || identity >= VISIBLE_FORM_TUNING.nameAt) return e.name;
  if (identity >= VISIBLE_FORM_TUNING.describeAt) {
    const d = e.kind === 'ITEM' || e.kind === 'LOCATION' || e.kind === 'CHARACTER' || e.kind === 'NPC' ? shortDescription(e.description) : null;
    if (d) return d;
  }
  return GENERIC[e.kind];
}

function visibleEntity(e: TruthEntity, fam: ViewerFamiliarity, viewerId: string): VisibleEntity {
  const aspects = fam[e.id] ?? {};
  const known = Object.entries(aspects).filter(([, f]) => f >= 1).map(([aspectKind, fidelity]) => ({ aspectKind, fidelity })).sort((a, b) => a.aspectKind.localeCompare(b.aspectKind));
  return { id: e.id, kind: e.kind, label: labelFor(e, aspects.identity ?? 0, viewerId), known };
}

// ── Tokens: text → word groups → (dropped) pieces ─────────────────────────

/** A word group: the tokens between two runs of whitespace (an entity and its "'s" stay together). */
type Tok = { kind: 'text'; text: string } | { kind: 'entity'; text: string; entityId: string };
interface Word { toks: Tok[] }

/** Cut pieces into whitespace-separated words, keeping entity tokens whole. */
function toWords(pieces: Tok[]): Word[] {
  const words: Word[] = [];
  let cur: Tok[] = [];
  const flush = () => { if (cur.length) words.push({ toks: cur }); cur = []; };
  for (const p of pieces) {
    if (p.kind === 'entity') { cur.push(p); continue; }
    const parts = p.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { flush(); continue; }
      cur.push({ kind: 'text', text: part });
    }
  }
  flush();
  return words;
}

/**
 * Keep each word with probability `clarity` (seeded); a run of missed words
 * becomes ONE gap. clarity ≥ 1 keeps everything; nothing caught → a lone gap.
 * Returns the pieces and the flat text ({gap} inline). Pure.
 */
function catchWords(words: Word[], clarity: number, rng: () => number): { pieces: VisiblePiece[]; text: string } {
  const out: Array<Word | 'gap'> = [];
  for (const w of words) {
    if (clarity >= 1 || rng() < clarity) out.push(w);
    else if (out[out.length - 1] !== 'gap') out.push('gap');
  }
  if (!out.some((x) => x !== 'gap')) return { pieces: [{ kind: 'gap' }], text: GAP_TOKEN };
  const pieces: VisiblePiece[] = [];
  const flat: string[] = [];
  const pushText = (t: string) => {
    const last = pieces[pieces.length - 1];
    if (last && last.kind === 'text') last.text += t; else pieces.push({ kind: 'text', text: t });
  };
  out.forEach((x, i) => {
    const sep = i > 0 ? ' ' : '';
    if (x === 'gap') {
      if (sep) pushText(sep);
      pieces.push({ kind: 'gap' });
      flat.push(GAP_TOKEN);
      return;
    }
    if (sep) pushText(sep);
    for (const t of x.toks) {
      if (t.kind === 'entity') pieces.push({ kind: 'entity', text: t.text, entityId: t.entityId });
      else pushText(t.text);
    }
    flat.push(x.toks.map((t) => t.text).join(''));
  });
  return { pieces, text: flat.join(' ') };
}

/**
 * Text → tokens with every entity name as an entity token. `relabel` replaces
 * the name with the viewer's label (narration, actions); without it the words
 * stay as said (speech is heard literally). Sentence-initial labels are
 * capitalised; "the Warden" seen as "a figure" drops the stranded article.
 */
function entityToks(text: string, entities: TruthEntity[], relabel: ((id: string) => string) | null): Tok[] {
  const pieces = splitEntities(text, entities.map((e) => ({ id: e.id, name: e.name })));
  const out: Tok[] = [];
  for (const p of pieces) {
    if (!p.entityId) { out.push({ kind: 'text', text: p.text }); continue; }
    if (!relabel) { out.push({ kind: 'entity', text: p.text, entityId: p.entityId }); continue; }
    let label = relabel(p.entityId);
    const ent = entities.find((e) => e.id === p.entityId);
    if (ent && label === ent.name) { out.push({ kind: 'entity', text: p.text, entityId: p.entityId }); continue; }
    const prev = out[out.length - 1];
    let prevText = prev && prev.kind === 'text' ? prev.text : '';
    let articleCap = false;
    const art = prevText.match(/(^|\s)(the|a|an)\s+$/i);
    if (art && /^(a|an|the|some)\b/i.test(label)) {
      articleCap = /^[A-Z]/.test(art[2]);
      prevText = prevText.slice(0, prevText.length - art[0].length + art[1].length);
      if (prev && prev.kind === 'text') prev.text = prevText;
    }
    const sentenceStart = out.length === 0 || /^\s*$/.test(out.map((t) => t.text).join('')) || /[.!?]["”')\]]*\s*$/.test(prevText) || articleCap;
    if (sentenceStart) label = cap(label);
    out.push({ kind: 'entity', text: label, entityId: p.entityId });
  }
  return out.filter((t) => t.text !== '');
}

// ── Senses → clarity per segment ──────────────────────────────────────────

const ORGAN = new Set<string>(SENSE_KINDS);

export interface SegmentClarity {
  /** Everything at full: the viewer's own line. */
  self: boolean;
  hearing: number;
  sight: number;
  /** Best physical sense that carried it (scene prose). */
  scene: number;
  /** Best mind sense that carried it (thoughts). 0 = none. */
  mind: number;
}

/**
 * Clarity per sense for THIS row. Only senses in `via` carried it; an empty
 * `via` (a row from before the reach pass) is read as the stub would have:
 * sight + hearing at the viewer's own effectiveness, no mind sense. Pure.
 */
export function clarityOf(p: ViewerPerception): SegmentClarity {
  const via = p.via.length ? p.via : ['sight', 'hearing'];
  if (via.includes('self')) return { self: true, hearing: 1, sight: 1, scene: 1, mind: 1 };
  const c = (s: string) => (via.includes(s) ? clamp01(p.clarity[s] ?? 1) : 0);
  const organs = (SENSE_KINDS as readonly SenseKind[]).map((s) => c(s));
  const minds = via.filter((v) => !ORGAN.has(v)).map((v) => clamp01(p.clarity[v] ?? 1));
  return { self: false, hearing: c('hearing'), sight: c('sight'), scene: Math.max(0, ...organs), mind: Math.max(0, ...minds) };
}

// ── Vague action rewrite (deterministic fallback) ─────────────────────────

/**
 * "someone <verb>" from an action: the word after the actor's name, or the
 * first word when the action has no subject (a `::jumps up and down::`
 * segment's subject is its row). Pure.
 */
export function fallbackVague(text: string, entities: TruthEntity[], actorId: string | null | undefined, sentence: boolean): string {
  const words = toWords(entityToks(text, entities, null));
  let i = 0;
  const actorAt = words.findIndex((w) => w.toks.some((t) => t.kind === 'entity' && (!actorId || t.entityId === actorId)));
  if (actorAt >= 0 && actorAt < 2) i = actorAt + 1;
  const raw = words[i]?.toks.map((t) => t.text).join('') ?? '';
  const verb = raw.toLowerCase().replace(/[^\p{L}'-]/gu, '');
  const body = verb && /\p{L}/u.test(verb) ? `someone ${verb}` : 'someone moves';
  return sentence ? `${cap(body)}.` : body;
}

/** The model's rewrite, held to the laws: one short line, no digits, no "distort", no name the viewer does not know. Pure. */
export function lawfulRewrite(out: string | null | undefined, unknownNames: string[]): string | null {
  const t = (out ?? '').trim().replace(/^["“']|["”']$/g, '').trim();
  if (!t || /\n/.test(t) || /\d/.test(t) || /distort/i.test(t)) return null;
  if (t.split(/\s+/).length > VISIBLE_FORM_TUNING.rewriteMaxWords) return null;
  const lower = t.toLowerCase();
  if (unknownNames.some((n) => n.length >= 3 && new RegExp(`(?<![\\p{L}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(lower))) return null;
  return t;
}

// ── Render ────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Seeds the caught-words RNG — the memory row id, so a row always renders the same. */
  seed: string;
  /** The small-model rewrite for poorly seen actions; absent → the deterministic fallback. */
  rewrite?: VagueRewriteModel | null;
}

/**
 * The perceived line. Pure apart from the optional rewrite call. Returns no
 * rows for an unnoticed perception (sensed-but-unnoticed is not in the feed).
 */
export async function renderVisibleForm(truth: TruthLine, perception: ViewerPerception, familiarity: ViewerFamiliarity, opts: RenderOptions): Promise<Omit<VisibleForm, 'memoryId'>> {
  const viewerId = perception.viewerId;
  const byId = new Map(truth.entities.map((e) => [e.id, e]));
  const visible = new Map(truth.entities.map((e) => [e.id, visibleEntity(e, familiarity, viewerId)]));
  const label = (id: string) => visible.get(id)?.label ?? byId.get(id)?.name ?? 'someone';
  if (!perception.noticed) return { truthRefs: truth.refs, rows: [], entities: [] };
  const cl = clarityOf(perception);
  const unknownNames = truth.entities.filter((e) => e.id !== viewerId && (familiarity[e.id]?.identity ?? 0) < VISIBLE_FORM_TUNING.nameAt).map((e) => e.name);

  const whole = (text: string) => catchWords(toWords(entityToks(text, truth.entities, label)), 1, () => 0);
  const vague = async (text: string, actorId: string | null | undefined, sentence: boolean, seen: 'poorly' | 'heard only') => {
    let line: string | null = null;
    if (opts.rewrite) {
      try { line = lawfulRewrite(await opts.rewrite({ text, seen }), unknownNames); } catch { line = null; }
    }
    if (line && sentence) line = cap(line);
    return whole(line ?? fallbackVague(text, truth.entities, actorId, sentence));
  };

  /** The viewer's own doing (ruling: the viewer's own lines in full) — never dimmed by its senses. */
  const ownBy = (id: string | null | undefined) => !!viewerId && id === viewerId;

  /** An action (a ::segment:: or a sim act): own or full sight = as it happened; less = vaguer; heard only = vaguer still; neither = gone. */
  const action = async (text: string, actorId: string | null | undefined, sentence: boolean) => {
    if (cl.self || ownBy(actorId) || cl.sight >= 1) return whole(text);
    if (cl.sight > 0) return vague(text, actorId, sentence, 'poorly');
    if (cl.hearing > 0) return vague(text, actorId, sentence, 'heard only');
    return null;
  };

  const rows: VisibleRow[] = [];
  let n = 0;
  for (const row of truth.rows) {
    const key = `${opts.seed}#${n++}`;
    if (row.type === 'narration') {
      if (row.act) {
        const r = await action(row.text, row.actorId, true);
        if (r) rows.push({ type: 'narration', text: r.text, pieces: r.pieces });
        continue;
      }
      if (cl.scene <= 0) continue;
      const r = catchWords(toWords(entityToks(row.text, truth.entities, label)), cl.scene, seededRng(key));
      rows.push({ type: 'narration', text: r.text, pieces: r.pieces });
      continue;
    }
    const segments: VisibleSegment[] = [];
    let s = 0;
    const own = ownBy(row.speakerId);
    for (const seg of row.segments) {
      const skey = `${key}.${s++}`;
      if (own && seg.kind !== 'action') {
        // Their own words and thoughts, as they said / thought them.
        const r = catchWords(toWords(entityToks(seg.text, truth.entities, null)), 1, () => 0);
        segments.push({ kind: seg.kind, text: r.text, pieces: r.pieces });
        continue;
      }
      if (seg.kind === 'speech') {
        // Heard: the caught words, literally. Not heard but seen said: a lone gap. Neither: gone.
        if (cl.hearing > 0) {
          const r = catchWords(toWords(entityToks(seg.text, truth.entities, null)), cl.hearing, seededRng(skey));
          segments.push({ kind: 'speech', text: r.text, pieces: r.pieces });
        } else if (cl.sight > 0) {
          segments.push({ kind: 'speech', text: GAP_TOKEN, pieces: [{ kind: 'gap' }] });
        }
      } else if (seg.kind === 'thought') {
        if (cl.mind <= 0) continue;
        const r = catchWords(toWords(entityToks(seg.text, truth.entities, null)), cl.mind, seededRng(skey));
        segments.push({ kind: 'thought', text: r.text, pieces: r.pieces });
      } else {
        const r = await action(seg.text, row.speakerId, false);
        if (r) segments.push({ kind: 'action', text: r.text, pieces: r.pieces });
      }
    }
    if (!segments.length) continue;
    rows.push({ type: 'character', speakerId: row.speakerId, name: row.speakerId && byId.has(row.speakerId) ? cap(label(row.speakerId)) : row.name, segments });
  }

  const used = new Set<string>();
  for (const r of rows) {
    if (r.type === 'character' && r.speakerId) used.add(r.speakerId);
    const pieces = r.type === 'narration' ? r.pieces : r.segments.flatMap((sg) => sg.pieces);
    for (const p of pieces) if (p.kind === 'entity') used.add(p.entityId);
  }
  return { truthRefs: truth.refs, rows, entities: [...used].map((id) => visible.get(id)).filter((e): e is VisibleEntity => !!e) };
}

/** The truth line in the same structure — what a full-clarity viewer who knows every name sees (the Watcher's view). */
export async function truthForm(truth: TruthLine, seed = 'truth'): Promise<VisibleRow[]> {
  const viewerId = '';
  const known: ViewerFamiliarity = Object.fromEntries(truth.entities.map((e) => [e.id, { identity: 5 }]));
  return (await renderVisibleForm(truth, { viewerId, noticed: true, via: ['self'], clarity: {} }, known, { seed })).rows;
}

// ── Truth line from canon ─────────────────────────────────────────────────

export interface CanonRowForm { id: string; kind: string; narration: string; detail: string; actorId: string | null; sourceType?: string | null }

/**
 * A canon event as the feed reads it (pure): table dialogue → the speaker's
 * character row (its segments as typed); the Watcher's declaration → narration
 * + the speech the preprocessor pulls out of it (services/table-prose, the
 * same split feed-rows uses); any other act with an actor → a sim act.
 */
export function truthRowsFromCanon(ev: CanonRowForm, entities: TruthEntity[]): TruthRow[] {
  let detail: { message?: string; speakerLabel?: string } = {};
  try { detail = JSON.parse(ev.detail) as typeof detail; } catch { detail = {}; }
  const nameOf = (id: string | null) => (id ? entities.find((e) => e.id === id)?.name ?? null : null);
  if (ev.kind === 'dialogue') {
    const text = detail.message ?? ev.narration;
    return [{ type: 'character', speakerId: ev.actorId, name: nameOf(ev.actorId) ?? detail.speakerLabel ?? 'someone present', segments: parseSegments(text) }];
  }
  if (ev.kind === 'declaration' || ev.sourceType === 'gm') {
    const roster = entities.filter((e) => e.kind === 'CHARACTER' || e.kind === 'NPC').map((e) => ({ id: e.id, name: e.name }));
    const parsed = parseTableProse(ev.narration, roster);
    const rows: TruthRow[] = [];
    if (parsed.narration?.trim()) rows.push({ type: 'narration', text: parsed.narration.trim() });
    for (const q of parsed.quotes) rows.push({ type: 'character', speakerId: q.speakerId, name: q.speakerLabel, segments: [{ kind: 'speech', text: q.text }] });
    if (!rows.length && ev.narration.trim()) rows.push({ type: 'narration', text: ev.narration.trim() });
    return rows;
  }
  return ev.narration.trim() ? [{ type: 'narration', text: ev.narration.trim(), act: !!ev.actorId, actorId: ev.actorId }] : [];
}

/** Several canon rows (a memory's chain), in order; a dialogue row already inside an earlier row's text is not repeated (reconciliation's rule). Pure. */
export function truthLineFromCanon(events: CanonRowForm[], entities: TruthEntity[]): TruthLine {
  const rows: TruthRow[] = [];
  const texts: string[] = [];
  for (const ev of events) {
    let message: string | null = null;
    try { message = (JSON.parse(ev.detail) as { message?: string }).message ?? null; } catch { message = null; }
    if (ev.kind === 'dialogue' && message && texts.some((t) => t.includes(message!))) continue;
    texts.push(ev.narration);
    rows.push(...truthRowsFromCanon(ev, entities));
  }
  return { refs: events.map((e) => e.id), rows, entities };
}

// ── The small-model rewrite (classify lane) ───────────────────────────────

const REWRITE_SYSTEM = [
  'You rewrite one action from a tabletop roleplaying game the way a person who perceived it badly would remember it.',
  'Rules: ONE short sentence, at most 12 words. Vaguer than the original. Call whoever acts "someone". Use no names.',
  'Keep only what could be made out: rough movement, rough direction. No numbers. Never mention senses, distortion or doubt.',
  'If it was only heard, describe the sound of it. Answer with the sentence only.',
].join('\n');

/** The rewrite on the 'classify' lane (Haiku today; the local small model when that lane points at it), time-capped. */
export function vagueRewriteModelFor(campaignId: string): VagueRewriteModel {
  return async ({ text, seen }) => {
    const lane = route({ caller: 'visible-form', lane: 'classify', campaignId, privacy: 'trusted-dev' });
    const user = `Action: ${JSON.stringify(text.slice(0, 400))}\nPerceived: ${seen === 'poorly' ? 'seen badly' : 'heard, not seen'}`;
    const opts = { maxTokens: 40, temperature: 0 };
    const call = async () => {
      if (lane.provider === 'anthropic') return anthropicChatText({ model: lane.model, system: REWRITE_SYSTEM, cacheSystem: true, messages: [{ role: 'user', content: user }], ...opts });
      if (lane.provider === 'openai-compat' && lane.baseUrl) return openAiCompatChat({ baseUrl: lane.baseUrl, apiKey: lane.apiKey, model: lane.model, messages: [{ role: 'system', content: REWRITE_SYSTEM }, { role: 'user', content: user }], ...opts });
      throw new Error(`visible-form: unsupported provider ${lane.provider}`);
    };
    const res = await new Promise<Awaited<ReturnType<typeof call>>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('visible-form: rewrite timed out')), VISIBLE_FORM_TUNING.rewriteTimeoutMs);
      call().then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
    recordAiCall({ lane: lane.lane, provider: lane.provider, model: res.model, caller: 'visible-form', campaignId, usage: res.usage });
    return res.text;
  };
}

// ── DB: one viewer's context, then rows ───────────────────────────────────

type SheetBits = { bodyAnatomy?: unknown; identity?: { physicalDescription?: unknown }; _improv?: { description?: string }; _npc?: { description?: string; appearance?: string } };

/** What can be seen of a character — the same sources the mirror uses (daya/perceive present list). Pure. */
export function characterDescription(sheet: SheetBits | null): string | null {
  if (!sheet) return null;
  const pd = sheet.identity?.physicalDescription;
  const structured = pd && typeof pd === 'object'
    ? Object.entries(pd as Record<string, unknown>).filter(([k, v]) => typeof v === 'string' && v && !['underclothing', 'measurements'].includes(k)).map(([, v]) => v as string).join(', ')
    : typeof pd === 'string' ? pd : '';
  return (sheet._improv?.description ?? sheet._npc?.appearance ?? sheet._npc?.description ?? structured ?? '').slice(0, 200) || null;
}

export interface ViewerContext {
  campaignId: string;
  viewerId: string;
  viewerEntityId: string;
  entities: TruthEntity[];
  familiarity: ViewerFamiliarity;
  /** The viewer's sense effectiveness now (organ condition) plus its mind senses. */
  clarity: Record<string, number>;
  rewrite: VagueRewriteModel | null;
  /** The campaign clock the familiarity was faded to (kept on the first-render snapshot). */
  nowCycle?: number;
}

/** Bound on the campaign items a context names (spans only; never a feed limit). */
const CONTEXT_ITEM_CAP = 400;

/**
 * Everything one viewer's rows need, read once: the campaign's named things,
 * the viewer's familiarity (faded to the campaign clock → F-levels), its senses.
 * `rewrite`: undefined = the classify-lane model when PERCEPTION_REACH is on,
 * else none (deterministic); null = never call a model.
 */
export async function loadViewerContext(campaignId: string, viewerCharacterId: string, opts: { rewrite?: VagueRewriteModel | null } = {}): Promise<ViewerContext | null> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId: viewerCharacterId }, select: { id: true } });
  if (!entity) return null;
  const [chars, items, locs, fams, nowCycle] = await Promise.all([
    prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true, data: true, entityType: true } }),
    prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true, type: true, data: true, holderId: true }, take: CONTEXT_ITEM_CAP }),
    prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true, data: true } }),
    prisma.familiarity.findMany({ where: { campaignId, perceiverId: entity.id }, select: { subjectId: true, aspectKind: true, score: true, lastCycle: true } }),
    currentCycleOf(campaignId),
  ]);
  const parse = <T,>(s: string | null | undefined): T | null => { try { return s ? JSON.parse(s) as T : null; } catch { return null; } };
  let viewerSheet: SheetBits | null = null;
  const entities: TruthEntity[] = [
    ...chars.map((c) => {
      const sheet = parse<SheetBits>(c.data);
      if (c.id === viewerCharacterId) viewerSheet = sheet;
      return { id: c.id, kind: (c.entityType === 'NPC' ? 'NPC' : 'CHARACTER') as EntityKind, name: c.name, description: characterDescription(sheet) };
    }),
    ...items.map((i) => ({ id: i.id, kind: 'ITEM' as const, name: i.name, description: parse<{ description?: string }>(i.data)?.description ?? (i.type && i.type !== 'misc' ? i.type : null) })),
    ...locs.map((l) => ({ id: l.id, kind: 'LOCATION' as const, name: l.name, description: parse<{ description?: string }>(l.data)?.description ?? null })),
  ];
  const familiarity: ViewerFamiliarity = {};
  const witMax = witMaxFromSheet(viewerSheet); // WIT = RETENTION: the viewer's own Wit fades what it knows
  for (const f of fams) (familiarity[f.subjectId] ??= {})[f.aspectKind] = scoreToFidelity(familiarityAt(f, nowCycle, witMax));
  // Sense grants from anything active on the viewer: organs, traits/blossoms (sheet) and the items it holds.
  const senses = senseProfileFromSheet(viewerSheet, { items: items.filter((i) => i.holderId === viewerCharacterId), nowCycle });
  const clarity: Record<string, number> = { ...senses.effectiveness };
  for (const m of mindSensesOf(senses)) clarity[m.name] = m.effectiveness;
  const rewrite = opts.rewrite !== undefined ? opts.rewrite : perceptionReachOn() ? vagueRewriteModelFor(campaignId) : null;
  return { campaignId, viewerId: viewerCharacterId, viewerEntityId: entity.id, entities, familiarity, clarity, rewrite, nowCycle };
}

/** Bumped when the render rules change, so cached forms re-render (2: the viewer's own doings in full). */
const RENDER_VERSION = 2;

/** A stable signature of everything a render depends on — the cache key. Pure. */
export function renderSignature(truth: TruthLine, perception: ViewerPerception, familiarity: ViewerFamiliarity): string {
  const ids = new Set(truth.entities.map((e) => e.id));
  const fam = Object.keys(familiarity).filter((id) => ids.has(id)).sort().map((id) => [id, Object.entries(familiarity[id]).sort()]);
  const ents = truth.entities.map((e) => [e.id, e.name, e.description ?? '']).sort();
  return createHash('sha1').update(JSON.stringify([RENDER_VERSION, truth.refs, truth.rows, ents, perception, fam])).digest('hex');
}

/** Only the entities a line can name: those whose name occurs in its text (keeps the signature and the span search small). Pure. */
function entitiesIn(texts: string[], all: TruthEntity[], alsoIds: Array<string | null>): TruthEntity[] {
  const hay = texts.join('\n').toLowerCase();
  const also = new Set(alsoIds.filter((x): x is string => !!x));
  return all.filter((e) => also.has(e.id) || (e.name.trim().length >= 3 && hay.includes(e.name.trim().toLowerCase())));
}

/**
 * Unit 9's entry: the perceived feed rows of a set of the viewer's memory
 * rows. Memory ids that are not the viewer's, not noticed, or rest on no
 * canon event map to null (no feed line). Cached per row; a cache hit costs
 * no model call.
 */
export async function renderViewerFeed(campaignId: string, viewerCharacterId: string, memoryIds: string[], opts: { rewrite?: VagueRewriteModel | null } = {}): Promise<Map<string, VisibleForm | null>> {
  const out = new Map<string, VisibleForm | null>(memoryIds.map((id) => [id, null]));
  if (!memoryIds.length) return out;
  const ctx = await loadViewerContext(campaignId, viewerCharacterId, opts);
  if (!ctx) return out;
  for (const { r, truth, perception, fam } of await prepareViewerRows(ctx, memoryIds)) {
    const sig = renderSignature(truth, perception, fam);
    const cached = (() => { try { return r.visibleForm ? JSON.parse(r.visibleForm) as { sig?: string; form?: VisibleForm } : null; } catch { return null; } })();
    if (cached?.sig === sig && cached.form) { out.set(r.id, cached.form); continue; }
    const form: VisibleForm = { memoryId: r.id, ...(await renderVisibleForm(truth, perception, fam, { seed: r.id, rewrite: ctx.rewrite })) };
    out.set(r.id, form);
    const visibleForm = JSON.stringify({ sig, form });
    try {
      if (r.firstVisibleForm === null) {
        // First render ever: freeze it beside the live cache, in ONE write guarded on null (never overwritten).
        const first = JSON.stringify(firstRenderSnapshot(form, sig, fam, perception, ctx.nowCycle ?? null));
        const n = await prisma.dayaMemoryEntry.updateMany({ where: { id: r.id, firstVisibleForm: null }, data: { visibleForm, firstVisibleForm: first } });
        if (n.count === 0) await prisma.dayaMemoryEntry.update({ where: { id: r.id }, data: { visibleForm } });
      } else {
        await prisma.dayaMemoryEntry.update({ where: { id: r.id }, data: { visibleForm } });
      }
    } catch (err) { console.warn('[visible-form] cache write failed (render kept)', err); }
  }
  return out;
}

/** What DayaMemoryEntry.firstVisibleForm holds: the first rendered form + the knowledge and senses it used. */
export interface FirstVisibleFormSnapshot {
  form: VisibleForm;
  sig: string;
  /** Per entity, per aspect F-level the render used (faded to `nowCycle`). */
  familiarity: ViewerFamiliarity;
  perception: ViewerPerception;
  nowCycle: number | null;
  renderedAt: string;
}

/** Pure: the immutable first-render record. */
export function firstRenderSnapshot(form: VisibleForm, sig: string, familiarity: ViewerFamiliarity, perception: ViewerPerception, nowCycle: number | null, at = new Date()): FirstVisibleFormSnapshot {
  return { form, sig, familiarity, perception, nowCycle, renderedAt: at.toISOString() };
}

/** The frozen first render of a memory row (null = never rendered, or unreadable). Read-only. */
export async function getFirstVisibleForm(memoryId: string): Promise<FirstVisibleFormSnapshot | null> {
  const row = await prisma.dayaMemoryEntry.findUnique({ where: { id: memoryId }, select: { firstVisibleForm: true } });
  try { return row?.firstVisibleForm ? JSON.parse(row.firstVisibleForm) as FirstVisibleFormSnapshot : null; } catch { return null; }
}

/** What a heard line of speech gave this viewer: the caught pieces (gaps where words were missed), by speaker. */
export interface CaughtSpeech { memoryId: string; speakerId: string | null; pieces: VisiblePiece[] }

/**
 * The speech this viewer CAUGHT in these memory rows — the same seeded
 * fragmenting the feed renders (same seed = the memory row id, same stored
 * clarity), so a name lost in a `{gap}` in the feed is lost here too. Speech
 * is literal (no model rewrite), so this never calls a model and writes no
 * cache. The viewer's own speech is left out. Introductions read it
 * (services/introductions).
 */
export async function caughtSpeech(campaignId: string, viewerCharacterId: string, memoryIds: string[]): Promise<{ ctx: ViewerContext; speech: CaughtSpeech[] } | null> {
  if (!memoryIds.length) return null;
  const ctx = await loadViewerContext(campaignId, viewerCharacterId, { rewrite: null });
  if (!ctx) return null;
  const speech: CaughtSpeech[] = [];
  for (const { r, truth, perception, fam } of await prepareViewerRows(ctx, memoryIds)) {
    const form = await renderVisibleForm(truth, perception, fam, { seed: r.id, rewrite: null });
    for (const row of form.rows) {
      if (row.type !== 'character' || row.speakerId === ctx.viewerId) continue;
      for (const seg of row.segments) if (seg.kind === 'speech') speech.push({ memoryId: r.id, speakerId: row.speakerId, pieces: seg.pieces });
    }
  }
  return { ctx, speech };
}

/** The viewer's noticed rows with their truth line, perception (stored clarity) and familiarity — shared by the feed render and caughtSpeech. */
async function prepareViewerRows(ctx: ViewerContext, memoryIds: string[]) {
  const rows = await prisma.dayaMemoryEntry.findMany({
    where: { id: { in: memoryIds }, entityId: ctx.viewerEntityId },
    select: { id: true, truthRef: true, chain: true, noticed: true, perceivedVia: true, visibleForm: true, firstVisibleForm: true },
  });
  const refsOf = (r: { truthRef: string | null; chain: string }) => {
    let refs: string[] = [];
    try { refs = ((JSON.parse(r.chain) as { truthRefs?: unknown }).truthRefs as string[] | undefined)?.filter((x) => typeof x === 'string') ?? []; } catch { refs = []; }
    return [...new Set(refs.length ? refs : r.truthRef ? [r.truthRef] : [])];
  };
  const allRefs = [...new Set(rows.flatMap(refsOf))];
  const events = allRefs.length ? await prisma.canonEvent.findMany({ where: { id: { in: allRefs }, campaignId: ctx.campaignId }, select: { id: true, kind: true, narration: true, detail: true, actorId: true, sourceType: true } }) : [];
  const evById = new Map(events.map((e) => [e.id, e]));
  const prepared: Array<{ r: (typeof rows)[number]; truth: TruthLine; perception: ViewerPerception; fam: ViewerFamiliarity }> = [];
  for (const r of rows) {
    if (!r.noticed) continue;
    const evs = refsOf(r).map((id) => evById.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (!evs.length) continue;
    // D3: clarity AS STORED at perception time (a moment perceived while blinded stays blurry after healing);
    // the viewer's body now only for senses the row carries no stored value for (rows from before D3).
    const stored = decodePerceivedVia(r.perceivedVia);
    const via = stored.via;
    const ents = entitiesIn(evs.map((e) => `${e.narration}\n${e.detail}`), ctx.entities, [...evs.map((e) => e.actorId), ctx.viewerId]);
    const truth = truthLineFromCanon(evs, ents);
    const perception: ViewerPerception = { viewerId: ctx.viewerId, noticed: true, via, clarity: Object.fromEntries((via.length ? via : ['sight', 'hearing']).filter((v) => v !== 'self').map((v) => [v, stored.clarity[v] ?? ctx.clarity[v] ?? 1])) };
    const fam: ViewerFamiliarity = Object.fromEntries(ents.filter((e) => ctx.familiarity[e.id]).map((e) => [e.id, ctx.familiarity[e.id]]));
    prepared.push({ r, truth, perception, fam });
  }
  return prepared;
}

/** One row (convenience over renderViewerFeed): the memory's own being is the viewer. */
export async function renderMemoryForViewer(memoryId: string, opts: { rewrite?: VagueRewriteModel | null } = {}): Promise<VisibleForm | null> {
  const row = await prisma.dayaMemoryEntry.findUnique({ where: { id: memoryId }, select: { entity: { select: { characterId: true, character: { select: { campaignId: true } } } } } });
  const characterId = row?.entity.characterId;
  const campaignId = row?.entity.character?.campaignId;
  if (!characterId || !campaignId) return null;
  return (await renderViewerFeed(campaignId, characterId, [memoryId], opts)).get(memoryId) ?? null;
}

/** Drop the cached visible form of these memory rows (a correction re-renders them on next read). */
export async function clearVisibleFormCache(memoryIds: string[]): Promise<number> {
  if (!memoryIds.length) return 0;
  const r = await prisma.dayaMemoryEntry.updateMany({ where: { id: { in: memoryIds } }, data: { visibleForm: null } });
  return r.count;
}
