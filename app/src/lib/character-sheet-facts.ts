/**
 * Character sheet facts — the client-safe shapes + pure readers behind
 * GET /api/characters/[id]/blocks (2026-10-12 sheet audit).
 *
 * Genesis writes a character's Seed/Roots/Branches/Nectars/Thorns as
 * CharacterBlockLink rows (with NARRATIVE PAINT: localName, story, history)
 * pointing at ForgeItem archetypes — NOT into the sheet JSON's
 * `creation.root` / `traits`. These helpers turn those rows into what the
 * card, the sheet and the Tapestry CharacterTab render.
 *
 * Narrative paint rule (Mike 2026-10-12): show the LOCAL name; the archetype
 * name sits beneath it / in the tooltip. Paint never changes mechanics.
 */

export type BlockKind = 'seed' | 'root' | 'branch' | 'nectar' | 'blossom' | 'thorn' | 'skill' | 'item' | string;

export interface BlockHistoryEntry {
  kind: string;
  at: string;
  text: string;
}

export interface CharacterBlockView {
  linkId: string;
  forgeItemId: string;
  kind: BlockKind;
  /** The global archetype's name (workspace tags like " [w:y0d7]" stripped). */
  archetypeName: string;
  /** The campaign instance's local name, when painted. */
  localName: string | null;
  /** What the UI shows first: localName ?? archetypeName. */
  displayName: string;
  /** Bearer-specific story (the paint). */
  story: string;
  history: BlockHistoryEntry[];
  /** Archetype description (bearer-agnostic). */
  description: string | null;
  /** Rule text — the archetype's mechanical effect (traits). */
  ruleText: string | null;
  /** Locked karmic value, else the declared KV, else null. */
  kv: number | null;
  maturityFlags: string[];
  /** ForgeItem.status (draft | published | global | superseded …). */
  status: string;
  pillar: string | null;
  /** Roots/branches: years the block adds to the bearer's age. */
  ageAdded: number | null;
}

export interface CharacterVineView {
  id: string;
  goal: string;
  resistance: string | null;
  opportunity: string | null;
  status: string;
  /** 'ai' when an AI chose this vine (field added by genesis — read defensively). */
  authoredBy: string | null;
}

export interface CharacterAgeView {
  /** Display age, or null = unknown (render "—", never 0). */
  value: number | null;
  source: 'cycle' | 'identity' | null;
  fatedAge: number | null;
}

export interface CharacterSheetFacts {
  blocks: CharacterBlockView[];
  age: CharacterAgeView;
  /** Sheet `tkv` when written, else computed from the sheet. */
  tkv: number;
  memories: { count: number; lastAt: string | null };
  vines: CharacterVineView[];
}

/** Statuses that mean "this archetype is not the live one" — hidden on the sheet. */
const DEAD_STATUSES = new Set(['superseded', 'withdrawn', 'rejected', 'dissolved', 'retired']);

/** Strip genesis workspace tags (" [w:y0d7]") from an archetype name. */
export function cleanArchetypeName(name: string): string {
  return name.replace(/\s*\[w:[^\]]*\]\s*$/i, '').trim();
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  return null;
}

export interface RawBlockLinkRow {
  id: string;
  forgeItemId: string;
  localName: string | null;
  story: string;
  history: string;
  createdAt: Date | string;
  forgeItem: {
    id: string;
    type: string;
    name: string;
    status: string;
    data: string;
    karmicValue: bigint | number | null;
  } | null;
}

/** Order the sheet reads in: Seed → Roots → Branches → Nectars → Blossoms → Thorns → rest. */
const KIND_ORDER: Record<string, number> = { seed: 0, root: 1, branch: 2, nectar: 3, blossom: 4, thorn: 5 };

/**
 * Shape + dedupe raw link rows.
 *  - dedupe by forgeItemId (first wins)
 *  - hide links whose archetype is superseded/withdrawn — UNLESS that would
 *    leave the kind empty (then the newest dead one stays, so nothing vanishes)
 *  - within a kind, one link per cleaned archetype name (live beats dead, newer beats older)
 */
export function shapeBlockLinks(rows: RawBlockLinkRow[]): CharacterBlockView[] {
  const seen = new Set<string>();
  const views: Array<CharacterBlockView & { _at: number; _dead: boolean }> = [];
  for (const r of rows) {
    if (!r.forgeItem || seen.has(r.forgeItemId)) continue;
    seen.add(r.forgeItemId);
    const d = parseJson<Record<string, unknown>>(r.forgeItem.data, {});
    const archetypeName = cleanArchetypeName(r.forgeItem.name);
    const localName = r.localName?.trim() ? r.localName.trim() : null;
    const history = parseJson<unknown>(r.history, []);
    views.push({
      linkId: r.id,
      forgeItemId: r.forgeItemId,
      kind: r.forgeItem.type,
      archetypeName,
      localName,
      displayName: localName ?? archetypeName,
      story: r.story ?? '',
      history: Array.isArray(history) ? (history as BlockHistoryEntry[]) : [],
      description: typeof d.description === 'string' ? d.description : null,
      ruleText: typeof d.mechanicalEffect === 'string' ? d.mechanicalEffect : null,
      kv: num(r.forgeItem.karmicValue) ?? num(d.declaredKv) ?? num(d.kv),
      maturityFlags: Array.isArray(d.maturityFlags) ? (d.maturityFlags as unknown[]).filter((f): f is string => typeof f === 'string') : [],
      status: r.forgeItem.status,
      pillar: typeof d.pillar === 'string' ? d.pillar : null,
      ageAdded: num(d.ageAdded),
      _at: new Date(r.createdAt).getTime() || 0,
      _dead: DEAD_STATUSES.has(r.forgeItem.status.toLowerCase()),
    });
  }

  // One per (kind, archetype name): live beats dead, newer beats older.
  const byName = new Map<string, (typeof views)[number]>();
  for (const v of views) {
    const key = `${v.kind}::${v.archetypeName.toLowerCase()}`;
    const cur = byName.get(key);
    if (!cur) { byName.set(key, v); continue; }
    const better = cur._dead !== v._dead ? !v._dead : v._at > cur._at;
    if (better) byName.set(key, v);
  }
  const unique = [...byName.values()];

  // Hide dead archetypes unless the kind would go empty.
  const liveKinds = new Set(unique.filter(v => !v._dead).map(v => v.kind));
  const kept = unique.filter(v => !v._dead || !liveKinds.has(v.kind));

  kept.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a._at - b._at);
  return kept.map(({ _at: _a, _dead: _d, ...v }) => v);
}

/**
 * Age rule (canon): age = currentCycle − birthCycle when birthCycle exists;
 * else the legacy `identity.age`; else unknown (null → "—", never 0).
 * Fated age is the top-level `fatedAge` (meta cycles).
 */
export function computeDisplayAge(
  sheet: { birthCycle?: unknown; identity?: { age?: unknown; [k: string]: unknown } | null; fatedAge?: unknown; age?: unknown } | null | undefined,
  currentCycle: number | null | undefined,
): CharacterAgeView {
  const fated = num(sheet?.fatedAge);
  const fatedAge = fated !== null && fated > 0 ? fated : null;
  const birth = num(sheet?.birthCycle);
  if (birth !== null && typeof currentCycle === 'number' && Number.isFinite(currentCycle)) {
    return { value: Math.max(0, Math.floor(currentCycle - birth)), source: 'cycle', fatedAge };
  }
  const idAgeRaw = sheet?.identity?.age;
  const idAge = num(idAgeRaw) ?? (typeof idAgeRaw === 'string' && idAgeRaw.trim() && Number.isFinite(Number(idAgeRaw)) ? Number(idAgeRaw) : null);
  if (idAge !== null && idAge > 0) return { value: idAge, source: 'identity', fatedAge };
  return { value: null, source: null, fatedAge };
}

/** Render helper: "—" for unknown, never 0. */
export function formatAge(age: CharacterAgeView | null | undefined): string {
  return age && age.value !== null ? String(age.value) : '—';
}

/** Blocks of one kind (convenience for renderers). */
export function blocksOfKind(blocks: CharacterBlockView[] | null | undefined, kind: string): CharacterBlockView[] {
  return (blocks ?? []).filter(b => b.kind === kind);
}

export interface CompletionView {
  awaitingImage: boolean;
  label: string;
}

/**
 * Read the character-completion field defensively (another lane adds it —
 * `characterCompletion`; shape not fixed yet). Accepts a string, or an object
 * with any of {label, state|status|stage, awaitingImage, missing[]}.
 * Returns null when absent or complete.
 */
export function readCompletion(raw: unknown): CompletionView | null {
  if (raw === null || raw === undefined || raw === false) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s || /^(complete|completed|done|ready)$/i.test(s)) return null;
    return { awaitingImage: /image|portrait/i.test(s), label: s.replace(/_/g, ' ').toLowerCase() };
  }
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.complete === true || o.isComplete === true) return null;
  const missing = Array.isArray(o.missing) ? (o.missing as unknown[]).map(String) : [];
  const state = [o.state, o.status, o.stage].find((v): v is string => typeof v === 'string') ?? '';
  const awaitingImage = o.awaitingImage === true
    || missing.some(m => /image|portrait/i.test(m))
    || /image|portrait/i.test(state);
  if (typeof o.label === 'string' && o.label.trim()) return { awaitingImage, label: o.label.trim() };
  if (awaitingImage) return { awaitingImage, label: 'awaiting image' };
  if (state && !/^(complete|completed|done|ready)$/i.test(state)) return { awaitingImage, label: state.replace(/_/g, ' ').toLowerCase() };
  if (missing.length) return { awaitingImage, label: `awaiting ${missing.join(', ')}` };
  return null;
}

/** Tooltip text for a painted block: archetype line + story + KV. */
export function blockTooltip(b: CharacterBlockView): string {
  const lines = [b.localName ? `${b.localName} — archetype: ${b.archetypeName}` : b.archetypeName];
  if (b.story) lines.push(b.story);
  if (b.kv !== null) lines.push(`KV ${b.kv}`);
  if (b.maturityFlags.length) lines.push(`⚠ ${b.maturityFlags.join(', ')}`);
  return lines.join('\n\n');
}
