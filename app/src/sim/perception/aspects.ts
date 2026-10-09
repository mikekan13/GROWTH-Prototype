/**
 * Aspect kinds + their head-domain TAGS (perception build unit 2, fixed to
 * multi-tag 2026-10-09).
 *
 * Mike 2026-10-09: familiarity is PER FACET of a thing, not per thing; facets
 * are finer than item fields (each enchantment / item ability is its own
 * aspect); every aspect KIND carries knowledge-domain tags ("domain tagging
 * works and parallels godhead domain tagging"); the knowledge domains are the
 * ten Godhead head domains in `daya/domains.ts` — never a parallel list.
 *
 * DOMAIN TAGS ARE MULTI (Mike, reviewing unit 2): an aspect carries a SET of
 * head-domain tags, not a single parent.
 * - History → Divination. Thoughts/minds → Enchantment.
 * - Material composition ("what it's made of") → Alteration; hardness /
 *   breaking → Abjuration; each material adds its own tags on its definition.
 * - "fortune is the domain of enchantments on things... fire enchantment
 *   would be force and fortune" → every item ability = Fortune + its school.
 *
 * Pure data + pure functions. Units 3/4/11/12 read this.
 */
import type { GrowthWorldItem, ItemAbility } from '@/types/item';
import type { MagicSchool } from '@/types/growth';
import { getMaterial } from '@/lib/materials';

// ── Head domains (the ten in daya/domains.ts) ─────────────────────────────

/** A head-domain key in daya/domains.ts — the lower-cased magic-school parallel. */
export type HeadDomainKey = Lowercase<MagicSchool>;

export const HEAD_DOMAIN_KEYS = [
  'dissolution', 'restoration', 'force', 'abjuration', 'divination',
  'enchantment', 'illusion', 'alteration', 'conjuration', 'fortune',
] as const satisfies readonly HeadDomainKey[];

const headSet = new Set<string>(HEAD_DOMAIN_KEYS);

export function isHeadDomain(key: unknown): key is HeadDomainKey {
  return typeof key === 'string' && headSet.has(key);
}

/** 'Force' / 'force' / ' FORCE ' → 'force'; anything else → null. */
export function schoolToDomain(school: unknown): HeadDomainKey | null {
  if (typeof school !== 'string') return null;
  const k = school.trim().toLowerCase();
  return isHeadDomain(k) ? k : null;
}

/** Order-preserving de-duplication, head keys only. */
function tagSet(tags: Iterable<unknown>): HeadDomainKey[] {
  const out: HeadDomainKey[] = [];
  for (const t of tags) if (isHeadDomain(t) && !out.includes(t)) out.push(t);
  return out;
}

// ── Aspect kinds ──────────────────────────────────────────────────────────

export interface AspectKindDef {
  key: string;
  label: string;
  /** Base head-domain tags for every aspect of this kind (a set; instance data may add more). */
  domains: readonly HeadDomainKey[];
  /** One aspect per instance (keyed `<kind>:<instanceId>`), e.g. each item ability. */
  perInstance?: boolean;
}

export const ASPECT_KINDS = [
  { key: 'identity', label: 'What it is', domains: ['divination'] },
  { key: 'appearance', label: 'Appearance', domains: ['divination'] },
  { key: 'weight', label: 'Weight', domains: ['divination'] },
  { key: 'damage', label: 'Damage', domains: ['force'] },
  { key: 'hardness', label: 'Hardness (base resist)', domains: ['abjuration'] },
  // + each listed material's own tags (Material.domains) — see aspectDomains.
  { key: 'material', label: 'Material', domains: ['alteration'] },
  { key: 'properties', label: 'Properties', domains: ['alteration'] },
  { key: 'quality', label: 'Quality', domains: ['conjuration'] },
  { key: 'condition', label: 'Condition', domains: ['alteration'] },
  { key: 'rarity', label: 'Rarity', domains: ['fortune'] },
  { key: 'value', label: 'Value', domains: ['fortune'] },
  { key: 'history', label: 'History', domains: ['divination'] },
  // + the ability's own school (ItemAbility.school) — see aspectDomains.
  { key: 'ability', label: 'Ability / enchantment', domains: ['fortune'], perInstance: true },
  { key: 'thoughts', label: 'Thoughts', domains: ['enchantment'] },
] as const satisfies readonly AspectKindDef[];

export type AspectKindKey = (typeof ASPECT_KINDS)[number]['key'];

const kindByKey = new Map<string, AspectKindDef>(ASPECT_KINDS.map((k) => [k.key, k]));

export function aspectKind(key: string): AspectKindDef | undefined {
  return kindByKey.get(key);
}

/** 'damage' → 'damage'; ('ability', 'flame-tongue') → 'ability:flame-tongue'. */
export function aspectKey(kind: AspectKindKey, instanceId?: string): string {
  return instanceId ? `${kind}:${instanceId}` : kind;
}

export function parseAspectKey(key: string): { kind: string; instanceId: string | null } {
  const i = key.indexOf(':');
  return i < 0 ? { kind: key, instanceId: null } : { kind: key.slice(0, i), instanceId: key.slice(i + 1) };
}

// ── Item data ─────────────────────────────────────────────────────────────

type ItemSubject = GrowthWorldItem | string | null | undefined;

/** CampaignItem.data (GrowthWorldItem, parsed or raw JSON) → object; junk → {}. */
function readItem(subject: ItemSubject): Partial<GrowthWorldItem> {
  let d: unknown = {};
  if (typeof subject === 'string') {
    try { d = JSON.parse(subject) ?? {}; } catch { d = {}; }
  } else if (subject) d = subject;
  return typeof d === 'object' && d !== null && !Array.isArray(d) ? (d as Partial<GrowthWorldItem>) : {};
}

/**
 * Item abilities carry no id in GrowthWorldItem, so the instance id is the
 * slug of the ability's name, suffixed -2, -3… when two share a name.
 */
export function itemAbilityIds(abilities: GrowthWorldItem['itemAbilities']): string[] {
  const seen = new Map<string, number>();
  return (abilities ?? []).map((a, i) => {
    const base = (a?.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `ability-${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/**
 * An item ability's tags: Fortune + its school's domain. When the school
 * cannot be read from the ability's data (no `school`, or not one of the ten)
 * the tags are Fortune only and `schoolKnown` is false — callers may surface
 * that as "school unknown" rather than guessing from the prose.
 */
export function abilityDomains(ability: Partial<ItemAbility> | null | undefined): { domains: HeadDomainKey[]; schoolKnown: boolean } {
  const school = schoolToDomain(ability?.school);
  return { domains: tagSet(['fortune', school]), schoolKnown: school !== null };
}

/** Tags the named materials add on their own definitions (Material.domains in lib/materials). */
export function materialDomains(names: Iterable<string | null | undefined>): HeadDomainKey[] {
  const tags: unknown[] = [];
  for (const n of names) if (n) tags.push(...(getMaterial(n)?.domains ?? []));
  return tagSet(tags);
}

function itemMaterialNames(d: Partial<GrowthWorldItem>): string[] {
  const subs = Array.isArray(d.subordinateMaterials) ? d.subordinateMaterials : [];
  return [d.primaryMaterial, d.material, ...subs].filter((n): n is string => typeof n === 'string' && n !== '');
}

/**
 * The head-domain tag SET of one aspect key, best-known first. The kind's
 * base tags always apply; with the subject's item data:
 * - `material` adds each of the item's materials' own tags;
 * - `ability:<id>` adds that ability's school (Fortune only if unknown).
 * Unknown kind → []. Pure.
 */
export function aspectDomains(key: string, subject?: ItemSubject): HeadDomainKey[] {
  const { kind, instanceId } = parseAspectKey(key);
  const def = aspectKind(kind);
  if (!def) return [];
  const tags: unknown[] = [...def.domains];
  if (subject !== undefined && (kind === 'material' || kind === 'ability')) {
    const d = readItem(subject);
    if (kind === 'material') tags.push(...materialDomains(itemMaterialNames(d)));
    if (kind === 'ability' && instanceId) {
      const abilities = Array.isArray(d.itemAbilities) ? d.itemAbilities : [];
      const i = itemAbilityIds(abilities).indexOf(instanceId);
      if (i >= 0) tags.push(...abilityDomains(abilities[i]).domains);
    }
  }
  return tagSet(tags);
}

// ── Item aspects ──────────────────────────────────────────────────────────

const has = (v: unknown) => v !== undefined && v !== null && v !== '';
const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;

/**
 * The aspect keys an item has, read from CampaignItem.data (GrowthWorldItem,
 * parsed or raw JSON). identity / appearance / history / value belong to any
 * thing; the rest are present when the item carries the field (deprecated
 * aliases included). Unparseable data → the intrinsic four only. Pure.
 */
export function listAspects(subject: ItemSubject): string[] {
  const d = readItem(subject);
  const out: string[] = ['identity', 'appearance'];
  if (has(d.weightLbs) || has(d.weightLevel)) out.push('weight');
  if (d.damage && typeof d.damage === 'object') out.push('damage');
  if (has(d.baseResist) || has(d.resistance)) out.push('hardness');
  if (has(d.primaryMaterial) || has(d.material) || nonEmpty(d.subordinateMaterials) || has(d.materialClass)) out.push('material');
  if (nonEmpty(d.properties) || nonEmpty(d.weaponProperties) || nonEmpty(d.materialModifiers)) out.push('properties');
  if (has(d.quality)) out.push('quality');
  if (has(d.condition)) out.push('condition');
  if (has(d.rarity)) out.push('rarity');
  out.push('value', 'history');
  for (const id of itemAbilityIds(Array.isArray(d.itemAbilities) ? d.itemAbilities : [])) out.push(aspectKey('ability', id));
  return out;
}
