/**
 * What a viewer KNOWS of one aspect, at their fidelity — the tooltip's value line (perception hardening,
 * Q7 2026-10-09: "tooltip shows only known aspects (F5 = raw stats); never a level number").
 *
 * The ladder follows the mirror's own content ladder (daya/renderer-math computeNumericContent /
 * computeDescriptiveContent), without its seeded noise (a tooltip must read the same every time):
 *   F5  the raw value / stat                       "12 lbs", "slashing 4", "Worn"
 *   F4  nearly exact                               "12-ish lbs"
 *   F3  a rough band                               "roughly 9–15 lbs"
 *   F2  relational / descriptive                   "about as heavy as a full pack"
 *   F1  a vague impression                         "heavy"
 *   F0  unknown → no line at all.
 * Categorical facts (material, condition, rarity, properties, abilities) are named from F3 up and
 * described more loosely below. Aspects with no stored value (history), identity (the label already says
 * it) and thoughts (no standing value) give no line. Pure, client-safe.
 */
import { ASPECT_KINDS, parseAspectKey, itemAbilityIds } from './aspects';
import type { GrowthWorldItem } from '@/types/item';
import { QUALITY_TIER_NAMES } from '@/types/item';
import { CONDITION_LABELS } from '@/types/material';

export interface AspectFact {
  /** The aspect key (`weight`, `property:sharp`, `ability:flame-tongue`). */
  aspect: string;
  /** Shown label ("Weight", "Property"). */
  label: string;
  /** What the viewer knows of it, at their fidelity. */
  value: string;
}

export interface AspectSubject {
  /** What can be seen of it (appearance). */
  description?: string | null;
  /** CampaignItem.data when the subject is an item. */
  item?: Partial<GrowthWorldItem> | null;
  /** A being's own numbers (encounter participant): attribute pools and action pools. */
  being?: {
    attrs?: Partial<Record<string, { current: number; max: number }>>;
    pools?: { body: number; spirit: number; soul: number };
  } | null;
}

const LABEL = new Map<string, string>(ASPECT_KINDS.map((k) => [k.key, k.label.replace(/\s*\(.*\)$/, '').replace(' / enchantment', '')]));

const fmt = (n: number) => (Math.abs(n) >= 10 || Number.isInteger(n) ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const nice = (n: number) => (n >= 20 ? Math.round(n / 5) * 5 : n >= 2 ? Math.round(n) : Math.round(n * 2) / 2);

interface Scale { max: number; f2: string; f1: string }
function pick(scale: Scale[], v: number): Scale {
  return scale.find((s) => v <= s.max) ?? scale[scale.length - 1];
}

/** One numeric value up the ladder. Pure. */
export function numericAt(v: number, fidelity: number, unit: string, scale: Scale[]): string {
  if (fidelity >= 5) return `${fmt(v)}${unit}`;
  if (fidelity === 4) return `${fmt(nice(v))}-ish${unit}`;
  if (fidelity === 3) {
    const lo = nice(v * 0.75);
    const hi = nice(v * 1.25);
    return lo === hi ? `roughly ${fmt(lo)}${unit}` : `roughly ${fmt(lo)}–${fmt(hi)}${unit}`;
  }
  const s = pick(scale, v);
  return fidelity === 2 ? s.f2 : s.f1;
}

const WEIGHT: Scale[] = [
  { max: 1, f2: 'lighter than a knife', f1: 'light' },
  { max: 5, f2: 'about as heavy as a sword', f1: 'light' },
  { max: 15, f2: 'about as heavy as a war hammer', f1: 'weighty' },
  { max: 40, f2: 'about as heavy as a full pack', f1: 'heavy' },
  { max: 120, f2: 'about as heavy as a sack of grain', f1: 'heavy' },
  { max: Infinity, f2: 'heavier than a grown man', f1: 'very heavy' },
];
const HARDNESS: Scale[] = [
  { max: 5, f2: 'gives easily', f1: 'soft' },
  { max: 15, f2: 'tough, but it would give', f1: 'firm' },
  { max: 30, f2: 'hard — it would take real force', f1: 'hard' },
  { max: Infinity, f2: 'harder than almost anything', f1: 'very hard' },
];
const WORTH: Scale[] = [
  { max: 0, f2: 'worth nothing much', f1: 'cheap' },
  { max: 5, f2: 'worth a little', f1: 'cheap' },
  { max: 25, f2: 'worth a fair amount', f1: 'worth something' },
  { max: 100, f2: 'worth a great deal', f1: 'valuable' },
  { max: Infinity, f2: 'worth a fortune', f1: 'valuable' },
];
const TEN: Scale[] = [
  { max: 2, f2: 'well below the usual', f1: 'poor' },
  { max: 4, f2: 'about the usual', f1: 'ordinary' },
  { max: 7, f2: 'well above the usual', f1: 'good' },
  { max: Infinity, f2: 'beyond anything usual', f1: 'remarkable' },
];
const DMG_VERB: Record<string, string> = { slashing: 'cuts', piercing: 'pierces', bashing: 'crushes', heat: 'burns', cold: 'freezes', decay: 'rots', energy: 'shocks' };
const DMG_HOW: Scale[] = [
  { max: 2, f2: 'lightly', f1: '' },
  { max: 5, f2: 'well', f1: '' },
  { max: 10, f2: 'hard', f1: '' },
  { max: Infinity, f2: 'terribly', f1: '' },
];

/** An attribute pool's level (canon attribute scale; descriptive words = TUNING). */
const ATTR: Scale[] = [
  { max: 3, f2: 'weaker than most', f1: 'not much' },
  { max: 8, f2: 'about what most have', f1: 'ordinary' },
  { max: 15, f2: 'well beyond most', f1: 'strong' },
  { max: Infinity, f2: 'far beyond anyone you know', f1: 'formidable' },
];
const ATTR_LABEL: Record<string, string> = {
  clout: 'Clout', celerity: 'Celerity', constitution: 'Constitution', flow: 'Flow', frequency: 'Frequency',
  focus: 'Focus', willpower: 'Willpower', wisdom: 'Wisdom', wit: 'Wit',
};
/** How spent a pool looks (current / max) — the loose rungs. */
const spentWord = (cur: number, max: number, f: number) => {
  const r = max > 0 ? cur / max : 0;
  if (r <= 0) return f >= 2 ? 'spent' : 'flagging';
  if (r < 0.4) return f >= 2 ? 'running low' : 'flagging';
  if (r < 0.75) return f >= 2 ? 'holding up' : 'steady';
  return f >= 2 ? 'fresh' : 'steady';
};

const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();
const firstWords = (t: string, n: number) => {
  const w = t.trim().split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(' ')}…` : t.trim();
};
const clip = (t: string, n = 200) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Text (appearance, an ability's description) up the ladder. Pure. */
export function textAt(t: string, fidelity: number): string {
  const s = t.trim();
  if (fidelity >= 4) return clip(s);
  if (fidelity === 3) return clip(firstSentence(s));
  if (fidelity === 2) return firstWords(s, 6);
  return 'a vague picture of it';
}

/** A named category (material, condition label…) up the ladder: named from F3, looser below. Pure. */
function namedAt(name: string, fidelity: number, loose: string, raw?: string): string {
  if (fidelity >= 5 && raw) return `${name} (${raw})`;
  if (fidelity >= 3) return name;
  return fidelity === 2 ? loose : loose.replace(/^probably /, 'maybe ');
}

/**
 * The tooltip line for one aspect at one fidelity, or null (unknown, or nothing standing to say). Pure.
 */
export function aspectFact(key: string, fidelity: number, subject: AspectSubject): AspectFact | null {
  const f = Math.max(0, Math.min(5, Math.floor(fidelity)));
  if (f < 1) return null;
  const { kind, instanceId } = parseAspectKey(key);
  const d = subject.item ?? {};
  const label = LABEL.get(kind) ?? kind;
  const out = (value: string | null): AspectFact | null => (value ? { aspect: key, label, value } : null);

  switch (kind) {
    case 'identity':
    case 'thoughts':
    case 'history':
      return null;
    case 'appearance': {
      const t = subject.description?.trim();
      return t ? out(textAt(t, f)) : null;
    }
    case 'weight': {
      const lbs = typeof d.weightLbs === 'number' ? d.weightLbs : typeof d.weightLevel === 'number' ? d.weightLevel * 2 : null;
      return lbs === null ? null : out(numericAt(lbs, f, ' lbs', WEIGHT));
    }
    case 'hardness': {
      const r = typeof d.baseResist === 'number' ? d.baseResist : typeof d.resistance === 'number' ? d.resistance : null;
      return r === null ? null : out(numericAt(r, f, '', HARDNESS));
    }
    case 'value':
      return typeof d.value === 'number' ? out(numericAt(d.value, f, ' KV', WORTH)) : null;
    case 'quality': {
      if (typeof d.quality !== 'number') return null;
      const tier = QUALITY_TIER_NAMES[Math.max(0, Math.min(9, Math.round(d.quality) - 1))];
      if (f >= 5) return out(`${fmt(d.quality)} — ${tier}`);
      if (f >= 3) return out(tier);
      return out(pick(TEN, d.quality)[f === 2 ? 'f2' : 'f1']);
    }
    case 'rarity': {
      const r = d.rarity;
      if (typeof r === 'number') {
        if (f >= 5) return out(`${fmt(r)} of 10`);
        if (f >= 3) return out(r <= 3 ? 'common' : r <= 6 ? 'uncommon' : r <= 8 ? 'rare' : 'very rare');
        return out(r <= 4 ? 'nothing unusual' : 'not something you see often');
      }
      if (typeof r === 'string' && r) {
        const name = r.replace(/_/g, ' ');
        return out(f >= 3 ? name : r === 'common' ? 'nothing unusual' : 'not something you see often');
      }
      return null;
    }
    case 'condition': {
      if (typeof d.condition !== 'number') return null;
      const name = CONDITION_LABELS[d.condition] ?? 'Unknown';
      const loose = d.condition >= 3 ? 'looks whole' : d.condition === 2 ? 'looks used' : 'looks broken';
      return out(namedAt(name, f, loose, `${d.condition} of 4`));
    }
    case 'material': {
      const subs = Array.isArray(d.subordinateMaterials) ? d.subordinateMaterials.filter((s) => typeof s === 'string' && s) : [];
      const primary = d.primaryMaterial || d.material || null;
      const cls = d.materialClass ? d.materialClass.toLowerCase() : null;
      if (f >= 4 && primary) return out([primary, ...subs].join(', '));
      if (f === 3 && primary) return out(primary);
      return out(cls ? `probably something ${cls}` : primary ? 'you cannot name it' : null);
    }
    case 'property': {
      const all = [...(d.properties ?? []), ...(d.weaponProperties ?? []), ...(d.materialModifiers ?? [])].filter((p): p is string => typeof p === 'string');
      const name = all.find((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === instanceId) ?? (instanceId ? instanceId.replace(/-/g, ' ') : null);
      if (!name) return null;
      return out(f >= 2 ? name : `seems ${name.toLowerCase()}`);
    }
    case 'damage': {
      const dm = d.damage as Record<string, number> | undefined;
      if (!dm || typeof dm !== 'object') return null;
      const parts = Object.entries(dm).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1]);
      if (!parts.length) return null;
      if (f >= 3) return out(parts.map(([t, v]) => `${t} ${numericAt(v, f, '', DMG_HOW)}`).join(' · '));
      if (f === 2) return out(parts.map(([t, v]) => `${DMG_VERB[t] ?? t} ${pick(DMG_HOW, v).f2}`).join(', '));
      return out(parts[0][1] <= 3 ? 'could hurt someone' : 'dangerous');
    }
    case 'ability': {
      const abilities = Array.isArray(d.itemAbilities) ? d.itemAbilities : [];
      const i = instanceId ? itemAbilityIds(abilities).indexOf(instanceId) : -1;
      const a = i >= 0 ? abilities[i] : null;
      if (!a) return null;
      if (f >= 5) return out([a.name, a.description, a.mechanicalEffect].filter(Boolean).map((s) => s!.trim()).join(' — '));
      if (f === 4) return out(a.description ? `${a.name} — ${clip(a.description.trim(), 160)}` : a.name);
      if (f === 3) return out(a.name);
      return out(f === 2 ? 'there is more to it than it looks' : 'something about it');
    }
    case 'attribute': {
      const a = instanceId ? subject.being?.attrs?.[instanceId] : undefined;
      if (!a || typeof a.current !== 'number' || typeof a.max !== 'number') return null;
      const name = ATTR_LABEL[instanceId!] ?? instanceId!;
      const line = (value: string): AspectFact => ({ aspect: key, label: name, value });
      if (f >= 5) return line(`${fmt(a.current)}/${fmt(a.max)}`);
      if (f >= 3) return line(`${numericAt(a.current, f, '', ATTR)} of ${numericAt(a.max, f, '', ATTR)}`);
      return line(`${pick(ATTR, a.max)[f === 2 ? 'f2' : 'f1']}, ${spentWord(a.current, a.max, f)}`);
    }
    case 'pools': {
      const p = subject.being?.pools;
      if (!p) return null;
      const parts: Array<[string, number]> = [['Body', p.body], ['Spirit', p.spirit], ['Soul', p.soul]];
      if (f >= 3) return out(parts.map(([n, v]) => `${n} ${f >= 5 ? fmt(v) : numericAt(v, f, '', ATTR)}`).join(' · '));
      const total = p.body + p.spirit + p.soul;
      return out(f === 2 ? (total >= 5 ? 'acts quickly and often' : total >= 3 ? 'acts about as often as most' : 'slow to act') : (total >= 5 ? 'quick' : 'hard to read'));
    }
    default:
      return null;
  }
}

/** Every known aspect's line, in the order given; unknown / empty ones dropped. Pure. */
export function aspectFacts(known: Array<{ aspectKind: string; fidelity: number }>, subject: AspectSubject): AspectFact[] {
  return known.map((k) => aspectFact(k.aspectKind, k.fidelity, subject)).filter((x): x is AspectFact => !!x);
}
