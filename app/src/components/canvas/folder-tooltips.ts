/**
 * Tooltip models for Location folder headers (Mike 2026-10-06: "utilize our
 * dynamic tooltips that have inception tooltips built in … on our location
 * folders too"). Pure builders — FolderGroup feeds them into ComplexTooltip.
 *
 * Rows with value 0 are INFO rows (no number shown). A row's `source` is the
 * inception layer: hover/tap it and a second tooltip opens with the detail.
 */
import type { CanvasFolder } from '@/types/canvas';
import type { GrowthCharacter, GrowthAttribute } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';
import { formatDamage, getConditionLabel, getRarityLabel } from '@/types/item';
import type { TooltipModifier } from '@/components/ui/ComplexTooltip';
import { footprintSizeLabel, levelLabel, type Footprint, type PassageLink } from '@/lib/canvas-geometry';

type LocationInfo = NonNullable<CanvasFolder['locationInfo']>;

export interface TooltipCharacter {
  id: string;
  name: string;
  data: GrowthCharacter;
}

export interface TooltipModel {
  title: string;
  modifiers: TooltipModifier[];
  totalLabel?: string;
  totalText?: string;
  hideTotal?: boolean;
}

export function formatKrma(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e15) return `${(n / 1e15).toFixed(2)}P`;
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

const info = (name: string, source?: TooltipModifier['source']): TooltipModifier => ({ name, value: 0, source });

const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/** Names of the folder's members of one node type, via the optional id→name map. */
export function memberNames(
  folder: CanvasFolder,
  nodeTypes: Map<string, string>,
  type: string,
  nodeNames?: Map<string, string>,
): string[] | null {
  if (!nodeNames) return null;
  const out: string[] = [];
  for (const id of folder.nodeIds) {
    if (nodeTypes.get(id) === type) {
      const n = nodeNames.get(id);
      if (n) out.push(n);
    }
  }
  return out;
}

/** Sub-location names: child location ids are members too, but render as folders. */
export function subLocationNames(
  folder: CanvasFolder,
  childFolderRects: Map<string, unknown> | undefined,
  nodeNames?: Map<string, string>,
): string[] | null {
  if (!nodeNames || !childFolderRects) return null;
  const out: string[] = [];
  for (const id of childFolderRects.keys()) {
    const n = nodeNames.get(id);
    if (n) out.push(n);
  }
  return out;
}

const listOrUnknown = (names: string[] | null, count: number, noun: string) =>
  names && names.length > 0
    ? names.map(n => `• ${n}`).join('\n')
    : `${count} ${noun}${count === 1 ? '' : 's'} (names not loaded on this canvas)`;

/** The title badge: everything about the place at a glance. */
export function locationTitleTooltip(
  folder: CanvasFolder,
  li: LocationInfo,
  chars: TooltipCharacter[],
  itemNames: string[] | null,
  subNames: string[] | null,
): TooltipModel {
  const m: TooltipModifier[] = [];
  if (li.locationType) m.push(info(`Type: ${titleCase(li.locationType)}`));
  if (li.status) m.push(info(`Status: ${titleCase(li.status)}`));
  if (li.depth != null && li.depth > 0) m.push(info(`Depth: ${li.depth} level${li.depth === 1 ? '' : 's'} in`));
  if (li.dangerLevel != null) m.push(info(`Danger: ${li.dangerLevel} / 10`));
  if (li.environment) m.push(info(`Environment: ${li.environment}`));
  if (li.population) m.push(info(`Population: ${li.population}`));
  if (li.controlledBy) m.push(info(`Controlled by: ${li.controlledBy}`));
  if (li.tags && li.tags.length > 0) m.push(info(`Tags: ${li.tags.join(', ')}`));
  // The map (2026-10-16): shape, story, ceiling; a passage lists what it links.
  if (li.footprint) m.push(info(`Footprint: ${footprintLine(li.footprint)}`, {
    name: 'Footprint',
    type: 'top-down map',
    description: `${li.footprint.points.length} corners · 1 unit = ${li.footprint.scale} ft · level ${levelLabel(li.footprint.level)}${li.footprint.height ? ` · ${li.footprint.height} ft ceiling` : ''}`,
  }));
  if (li.connects && li.connects.length > 0) m.push(info(`Passage: links ${passageLine(li.connects)}`));

  const cc = li.contentCounts ?? {};
  const subCount = cc.locations ?? subNames?.length ?? 0;
  if (subCount > 0) {
    m.push(info(`Sub-locations: ${subCount}`, {
      name: 'Inside this place',
      type: 'sub-locations',
      description: listOrUnknown(subNames, subCount, 'sub-location'),
    }));
  }
  const peopleCount = chars.length || ((cc.characters ?? 0) + (cc.npcs ?? 0));
  if (peopleCount > 0) {
    m.push(info(`People here: ${peopleCount}`, {
      name: 'Who is here',
      type: 'characters & NPCs',
      description: listOrUnknown(chars.map(c => c.name), peopleCount, 'person'),
      stats: chars.length > 0
        ? Object.fromEntries(chars.slice(0, 8).map(c => [c.name, c.data?.tkv != null ? `TKV ${c.data.tkv.toLocaleString()}` : '—']))
        : undefined,
    }));
  }
  const itemCount = cc.items ?? itemNames?.length ?? 0;
  if (itemCount > 0) {
    m.push(info(`Items: ${itemCount}`, {
      name: 'Things in this place',
      type: 'items',
      description: listOrUnknown(itemNames, itemCount, 'item'),
    }));
  }
  if (m.length === 0) m.push(info('No details recorded yet — JEWL fills these in as the place is built.'));

  return {
    title: folder.name,
    modifiers: m,
    totalLabel: 'KRMA Reserve:',
    totalText: li.krmaReserve != null ? `${formatKrma(li.krmaReserve)} Ҝ` : undefined,
    hideTotal: li.krmaReserve == null,
  };
}

/** One count glyph in the action row (⌂ 3 · ✴ 4 · ❖ 16). */
export function countTooltip(
  kind: 'locations' | 'characters' | 'npcs' | 'items',
  count: number,
  names: string[] | null,
  chars?: TooltipCharacter[],
): TooltipModel {
  const label = { locations: 'Sub-locations', characters: 'Characters', npcs: 'NPCs', items: 'Items' }[kind];
  const noun = { locations: 'sub-location', characters: 'character', npcs: 'NPC', items: 'item' }[kind];
  let m: TooltipModifier[];
  if (chars && chars.length > 0) {
    m = chars.map(c => info(c.name, characterSource(c)));
  } else if (names && names.length > 0) {
    m = names.map(n => info(n));
  } else {
    m = [info(`${count} ${noun}${count === 1 ? '' : 's'} (names not loaded on this canvas)`)];
  }
  return { title: `${label} · ${count}`, modifiers: m, hideTotal: true };
}

const attrMax = (a?: GrowthAttribute) => a ? a.level + (a.augmentPositive || 0) - (a.augmentNegative || 0) : 0;
const attrText = (a?: GrowthAttribute) => a ? `${a.current} / ${attrMax(a)}` : '—';

/** The inception layer for a person: a compact sheet. */
export function characterSource(c: TooltipCharacter): NonNullable<TooltipModifier['source']> {
  const d = c.data;
  const a = d?.attributes;
  const stats: Record<string, string | number> = {};
  if (d?.tkv != null) stats['TKV'] = d.tkv.toLocaleString();
  if (d?.identity?.age != null) stats['Age'] = d.identity.age;
  if (a) {
    stats['Body'] = `CLO ${attrText(a.clout)} · CEL ${attrText(a.celerity)} · CON ${attrText(a.constitution)}`;
    stats['Spirit'] = `FLO ${attrText(a.flow)} · FRQ ${a.frequency ? `${a.frequency.current} / ${a.frequency.level}` : '—'} · FOC ${attrText(a.focus)}`;
    stats['Soul'] = `WIL ${attrText(a.willpower)} · WIS ${attrText(a.wisdom)} · WIT ${attrText(a.wit)}`;
  }
  const active = d?.conditions ? Object.entries(d.conditions).filter(([, v]) => v).map(([k]) => titleCase(k.replace(/([A-Z])/g, '_$1'))) : [];
  if (active.length > 0) stats['Conditions'] = active.join(', ');
  return {
    name: c.name,
    type: 'character',
    description: d?.identity?.description || undefined,
    stats: Object.keys(stats).length > 0 ? stats : undefined,
  };
}

/** A who-is-here chip: the person, with each pillar as an inception row. */
export function characterChipTooltip(c: TooltipCharacter): TooltipModel {
  const d = c.data;
  const a = d?.attributes;
  const m: TooltipModifier[] = [];
  if (a) {
    m.push(info(`Body · CLO ${attrText(a.clout)} · CEL ${attrText(a.celerity)} · CON ${attrText(a.constitution)}`, {
      name: 'Body', type: 'pillar · Salt', stats: { Clout: attrText(a.clout), Celerity: attrText(a.celerity), Constitution: attrText(a.constitution) },
    }));
    m.push(info(`Spirit · FLO ${attrText(a.flow)} · FRQ ${a.frequency ? `${a.frequency.current} / ${a.frequency.level}` : '—'} · FOC ${attrText(a.focus)}`, {
      name: 'Spirit', type: 'pillar · Sulfur', stats: { Flow: attrText(a.flow), Frequency: a.frequency ? `${a.frequency.current} / ${a.frequency.level}` : '—', Focus: attrText(a.focus) },
    }));
    m.push(info(`Soul · WIL ${attrText(a.willpower)} · WIS ${attrText(a.wisdom)} · WIT ${attrText(a.wit)}`, {
      name: 'Soul', type: 'pillar · Mercury', stats: { Willpower: attrText(a.willpower), Wisdom: attrText(a.wisdom), Wit: attrText(a.wit) },
    }));
  }
  const active = d?.conditions ? Object.entries(d.conditions).filter(([, v]) => v).map(([k]) => titleCase(k.replace(/([A-Z])/g, '_$1'))) : [];
  if (active.length > 0) m.push(info(`Conditions: ${active.join(', ')}`));
  if (d?.identity?.description) {
    m.push(info('Description', { name: c.name, type: 'description', description: d.identity.description }));
  }
  if (m.length === 0) m.push(info('No sheet data on this canvas yet.'));
  return {
    title: c.name,
    modifiers: m,
    totalLabel: 'TKV:',
    totalText: d?.tkv != null ? d.tkv.toLocaleString() : '—',
  };
}

function footprintLine(fp: Footprint): string {
  return `${footprintSizeLabel(fp)} · ${levelLabel(fp.level)}${fp.height ? ` · ${fp.height} ft` : ''}`;
}
function passageLine(links: PassageLink[]): string {
  return links.map(l => levelLabel(l.level)).join(' ⇅ ');
}

export interface TooltipItem {
  id: string;
  name: string;
  type: string;
  data: GrowthWorldItem | null;
  holderName?: string;
  locationName?: string;
  /** Things inside this thing (a bookcase, a box). */
  containsCount?: number;
}

/**
 * A thing's token (Mike 2026-10-16: "things should just be tokens for now…
 * all that info could be done using our complex dynamic tooltips"). Everything
 * the WorldItemCard showed, as rows with inception layers.
 */
export function itemTokenTooltip(it: TooltipItem): TooltipModel {
  const d = it.data ?? ({} as GrowthWorldItem);
  const m: TooltipModifier[] = [];
  const typeLabel = titleCase(it.type || 'misc');
  m.push(info(`Type: ${typeLabel}${d.rarity != null ? ` · ${getRarityLabel(d.rarity)}` : ''}${d.quality != null ? ` · Q${d.quality}` : ''}`));
  if (d.condition != null) m.push(info(`Condition: ${getConditionLabel(d.condition)}`));
  const material = d.primaryMaterial || d.material;
  const props = d.properties ?? d.weaponProperties ?? d.materialModifiers ?? [];
  if (material || props.length > 0) {
    m.push(info(`Material: ${material ?? '—'}${d.baseResist != null ? ` · R${d.baseResist}` : d.resistance != null ? ` · R${d.resistance}` : ''}`, {
      name: material ?? 'Materials',
      type: d.materialClass ? `${d.materialClass} material` : 'material',
      description: [
        d.subordinateMaterials && d.subordinateMaterials.length > 0 ? `With ${d.subordinateMaterials.join(', ')}` : null,
        props.length > 0 ? `Properties: ${props.join(', ')}` : null,
      ].filter(Boolean).join('\n') || undefined,
    }));
  }
  if (d.weightLbs != null) m.push(info(`Weight: ${d.weightLbs} lbs`));
  else if (d.weightLevel != null) m.push(info(`Weight level: ${d.weightLevel}`));
  if (d.damage && Object.values(d.damage).some(v => v > 0)) {
    m.push(info(`Damage: ${formatDamage(d.damage)}`, {
      name: 'Damage · P:S:H/D\\C:B:E',
      type: it.type === 'weapon' ? 'weapon' : 'item',
      stats: {
        Piercing: d.damage.piercing, Slashing: d.damage.slashing, Heat: d.damage.heat, Decay: d.damage.decay,
        Cold: d.damage.cold, Bashing: d.damage.bashing, Energy: d.damage.energy,
        ...(d.range ? { Range: d.range } : {}),
        ...(d.targetAttribute ? { Target: d.targetAttribute } : {}),
      },
    }));
  }
  if (d.armorCategory || d.armorLayer) m.push(info(`Armor: ${d.armorCategory ?? titleCase(d.armorLayer ?? '')}`));
  if (d.primaMateria) {
    m.push(info(`Prima Materia · ${d.primaMateria.school} L${d.primaMateria.level}`, {
      name: 'Prima Materia', type: d.primaMateria.school,
      stats: { Level: d.primaMateria.level, State: d.primaMateria.stable ? 'Stable' : 'Unstable', ...(d.primaMateria.charges != null ? { Charges: d.primaMateria.charges } : {}) },
    }));
  }
  if (d.itemAbilities && d.itemAbilities.length > 0) {
    m.push(info(`Abilities: ${d.itemAbilities.length}`, {
      name: 'Abilities', type: 'item abilities',
      description: d.itemAbilities.map(a => `• ${a.name}${a.description ? ` — ${a.description}` : ''}`).join('\n'),
    }));
  }
  if (it.containsCount && it.containsCount > 0) {
    m.push(info(`Contains: ${it.containsCount} thing${it.containsCount === 1 ? '' : 's'}`, {
      name: 'Inside', type: 'container', description: 'Tap the token to open its contents.',
    }));
  }
  if (it.holderName) m.push(info(`Held by: ${it.holderName}`));
  else if (it.locationName) m.push(info(`At: ${it.locationName}`));
  if (d.description) {
    const short = d.description.length > 90 ? `${d.description.slice(0, 89)}…` : d.description;
    m.push(info(short, { name: it.name, type: 'description', description: d.description }));
  }
  if (d.notes) m.push(info('GM Notes', { name: 'GM Notes', type: 'Watcher-only', description: d.notes }));
  if (m.length === 0) m.push(info('No details recorded yet.'));
  return {
    title: it.name,
    modifiers: m,
    totalLabel: 'Value:',
    totalText: d.value != null ? `${d.value} KV` : undefined,
    hideTotal: d.value == null,
  };
}

/** The dETAILS strip: the full description a hover away, GM notes one layer in. */
export function detailsTooltip(li: LocationInfo): TooltipModel {
  const m: TooltipModifier[] = [];
  m.push(info(li.description || '(no description yet)'));
  if (li.notes) {
    m.push(info('GM Notes', { name: 'GM Notes', type: 'Watcher-only', description: li.notes }));
  }
  return { title: 'Description', modifiers: m, hideTotal: true };
}
