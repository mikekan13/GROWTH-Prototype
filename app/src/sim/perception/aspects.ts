/**
 * Aspect kinds + the knowledge-domain tree (perception build unit 2).
 *
 * Mike 2026-10-09: familiarity is PER FACET of a thing, not per thing; facets
 * are finer than item fields (each enchantment / item ability is its own
 * aspect); every aspect KIND carries a knowledge domain ("domain tagging
 * works and parallels godhead domain tagging"); and those knowledge domains
 * are a TREE under the ten Godhead domains — "The ten godhead domains are the
 * head domains... History, swords whatever would all fall under a main
 * domain." The head domains live in `daya/domains.ts`; this file only adds
 * sub-domains beneath them, never a parallel top-level list.
 *
 * Pure data + pure functions. Nothing reads this yet (units 3/4/11/12 will).
 */
import { domainByKey, type DomainDef } from '@/daya/domains';
import type { GrowthWorldItem } from '@/types/item';

// ── Knowledge sub-domains (each under one head domain) ────────────────────

export interface KnowledgeDomainDef {
  key: string;
  label: string;
  /** Head domain key in daya/domains.ts. */
  parent: string;
  /** What this knowledge covers — the skill→domain scorer (unit 3) reads it. */
  covers: string;
}

/**
 * Parent picks are read from the head domains' keyword lists (daya/domains.ts).
 * Picks marked [QUESTION] are best fits awaiting Mike.
 */
export const KNOWLEDGE_DOMAINS = [
  { key: 'senses', label: 'Senses', parent: 'divination', covers: 'what a thing is and looks like, its heft — knowing by seeing, noticing, handling' },
  { key: 'weapons', label: 'Weapons', parent: 'force', covers: 'how a weapon strikes and what damage it deals' },
  // [QUESTION] materials/hardness: Conjuration (craft/forge/make) vs Abjuration (resist/protect).
  { key: 'materials', label: 'Materials', parent: 'conjuration', covers: 'what a thing is made of, how hard it is, its material properties' },
  { key: 'craftsmanship', label: 'Craftsmanship', parent: 'conjuration', covers: 'how well a thing was made' },
  { key: 'upkeep', label: 'Upkeep', parent: 'alteration', covers: 'wear, damage, breakage and repair of a thing' },
  { key: 'trade', label: 'Trade', parent: 'fortune', covers: 'worth, price and scarcity' },
  // [QUESTION] history: Divination (know/learn/read) vs Dissolution (what has passed).
  { key: 'history', label: 'History', parent: 'divination', covers: 'where a thing came from and what it has been through' },
  // [QUESTION] arcana: magic spans all ten (the domains parallel the schools); generic magic-reading parked under Divination.
  { key: 'arcana', label: 'Arcana', parent: 'divination', covers: 'magic bound into a thing — how an enchantment or item ability works' },
  // [QUESTION] minds: Enchantment (feeling/trust/fear) vs Divination (mind reading as seeing).
  { key: 'minds', label: 'Minds', parent: 'enchantment', covers: 'what another being thinks and feels' },
] as const satisfies readonly KnowledgeDomainDef[];

export type KnowledgeDomainKey = (typeof KNOWLEDGE_DOMAINS)[number]['key'];

const subByKey = new Map<string, KnowledgeDomainDef>(KNOWLEDGE_DOMAINS.map((d) => [d.key, d]));

export function knowledgeDomain(key: string): KnowledgeDomainDef | undefined {
  return subByKey.get(key);
}

// ── Aspect kinds ──────────────────────────────────────────────────────────

export interface AspectKindDef {
  key: string;
  label: string;
  domain: KnowledgeDomainKey;
  /** One aspect per instance (keyed `<kind>:<instanceId>`), e.g. each item ability. */
  perInstance?: boolean;
}

export const ASPECT_KINDS = [
  { key: 'identity', label: 'What it is', domain: 'senses' },
  { key: 'appearance', label: 'Appearance', domain: 'senses' },
  { key: 'weight', label: 'Weight', domain: 'senses' },
  { key: 'damage', label: 'Damage', domain: 'weapons' },
  { key: 'hardness', label: 'Hardness (base resist)', domain: 'materials' },
  { key: 'material', label: 'Material', domain: 'materials' },
  { key: 'properties', label: 'Properties', domain: 'materials' },
  { key: 'quality', label: 'Quality', domain: 'craftsmanship' },
  { key: 'condition', label: 'Condition', domain: 'upkeep' },
  { key: 'rarity', label: 'Rarity', domain: 'trade' },
  { key: 'value', label: 'Value', domain: 'trade' },
  { key: 'history', label: 'History', domain: 'history' },
  { key: 'ability', label: 'Ability / enchantment', domain: 'arcana', perInstance: true },
  { key: 'thoughts', label: 'Thoughts', domain: 'minds' },
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

/** An aspect key's knowledge sub-domain and the head domain it sits under. */
export function domainOfAspect(key: string): { sub: KnowledgeDomainDef; head: DomainDef } | null {
  const kind = aspectKind(parseAspectKey(key).kind);
  const sub = kind ? subByKey.get(kind.domain) : undefined;
  const head = sub ? domainByKey(sub.parent) : undefined;
  return sub && head ? { sub, head } : null;
}

// ── Item aspects ──────────────────────────────────────────────────────────

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

const has = (v: unknown) => v !== undefined && v !== null && v !== '';
const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;

/**
 * The aspect keys an item has, read from CampaignItem.data (GrowthWorldItem,
 * parsed or raw JSON). identity / appearance / history / value belong to any
 * thing; the rest are present when the item carries the field (deprecated
 * aliases included). Unparseable data → the intrinsic four only. Pure.
 */
export function listAspects(subject: GrowthWorldItem | string | null | undefined): string[] {
  let d: Partial<GrowthWorldItem> = {};
  if (typeof subject === 'string') {
    try { d = (JSON.parse(subject) ?? {}) as Partial<GrowthWorldItem>; } catch { d = {}; }
  } else if (subject) d = subject;
  if (typeof d !== 'object' || Array.isArray(d)) d = {};

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
