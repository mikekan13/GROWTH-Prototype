/**
 * The ten domains (Mike 2026-09-22/23, MEMORY-DESIGN §2–3).
 *
 * The Godheads sit at the ten sephiroth / ten domains, grouped by the three
 * pillars Mercy / Balance / Severity. The ten magic schools are the easy
 * PARALLEL for explaining them — "not their actual names". Everything
 * (canon events, memories) is classified into these domains; "keywords to an
 * extent". Death is the worked example: Death → Tara is the source of truth.
 *
 * This registry is DATA, not rules: keys are the school-parallel ids so code
 * has something stable to hold; the display names, the pillar seating, and
 * the keyword lists are [NEEDS MIKE] and are expected to be edited here.
 * Classification is deliberately multi-tag — overlap is the rule.
 */

export type Pillar3 = 'MERCY' | 'BALANCE' | 'SEVERITY';

export interface DomainDef {
  key: string;            // stable id (school-parallel)
  parallel: string;       // the magic school it parallels (explanation only)
  label: string | null;   // the domain's real name / seated Godhead — BLANK until Mike names them (09-23)
  pillar: Pillar3 | null; // seat — [NEEDS MIKE]
  keywords: string[];     // "keywords to an extent" — starter set, [NEEDS MIKE]
}

// Mike 2026-09-23: no names yet for all the Godheads — labels stay blank.
// The worked example is Death → Tara, which parallels Dissolution here.
export const DOMAINS: DomainDef[] = [
  { key: 'dissolution', parallel: 'Dissolution', label: null, pillar: null, keywords: ['death', 'die', 'died', 'dies', 'dying', 'dead', 'kill', 'killed', 'corpse', 'grave', 'decay', 'rot', 'reap', 'mortal', 'funeral', 'down', 'facing death'] },
  { key: 'restoration', parallel: 'Restoration', label: null, pillar: null, keywords: ['heal', 'healed', 'healing', 'mend', 'recover', 'rest', 'stabilize', 'bandage', 'cure', 'restore', 'wound', 'hurt', 'injur'] },
  { key: 'force', parallel: 'Force', label: null, pillar: null, keywords: ['attack', 'strike', 'struck', 'hit', 'swing', 'punch', 'fist', 'blow', 'fight', 'fought', 'violence', 'shove', 'blade', 'weapon', 'connects', 'misses'] },
  { key: 'abjuration', parallel: 'Abjuration', label: null, pillar: null, keywords: ['block', 'guard', 'shield', 'protect', 'ward', 'defend', 'negate', 'avoid', 'dodge', 'lock', 'locked', 'safe', 'safety', 'door'] },
  { key: 'divination', parallel: 'Divination', label: null, pillar: null, keywords: ['see', 'saw', 'notice', 'watch', 'look', 'sense', 'foresee', 'omen', 'sign', 'know', 'knew', 'learn', 'discover', 'read'] },
  { key: 'enchantment', parallel: 'Enchantment', label: null, pillar: null, keywords: ['persuade', 'charm', 'promise', 'trust', 'love', 'friend', 'ally', 'betray', 'lie', 'lied', 'deceive', 'threat', 'threaten', 'fear', 'afraid', 'anger', 'angry'] },
  { key: 'illusion', parallel: 'Illusion', label: null, pillar: null, keywords: ['illusion', 'disguise', 'hidden', 'hide', 'trick', 'fool', 'mask', 'pretend', 'seem', 'dream', 'dreamt', 'imagine'] },
  { key: 'alteration', parallel: 'Alteration', label: null, pillar: null, keywords: ['change', 'changed', 'transform', 'become', 'grow', 'shrink', 'shape', 'alter', 'repair', 'break', 'broke', 'broken', 'worn'] },
  { key: 'conjuration', parallel: 'Conjuration', label: null, pillar: null, keywords: ['summon', 'create', 'made', 'make', 'build', 'built', 'craft', 'forge', 'appear', 'arrive', 'arrived', 'bring', 'brought', 'gift', 'give', 'gave'] },
  { key: 'fortune', parallel: 'Fortune', label: null, pillar: null, keywords: ['luck', 'lucky', 'chance', 'gamble', 'bet', 'wager', 'fate', 'fortune', 'money', 'coin', 'debt', 'pay', 'paid', 'owe', 'rent', 'krma'] },
];

const byKey = new Map(DOMAINS.map(d => [d.key, d]));

export function domainByKey(key: string): DomainDef | undefined {
  return byKey.get(key);
}

export function pillarOfDomain(key: string | null | undefined): Pillar3 | null {
  return key ? byKey.get(key)?.pillar ?? null : null;
}

export interface DomainClassification {
  /** Highest-scoring domain, or null when nothing matched. */
  primary: string | null;
  /** All matched domains, best first (overlap is the rule). */
  all: string[];
  /** Pillar of the primary domain (null until seated). */
  pillar: Pillar3 | null;
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z']+/).filter(Boolean);
}

/**
 * Keyword classifier ("keywords to an extent"). Counts keyword hits per
 * domain over the text; a domain matches with ≥1 hit; primary = most hits,
 * ties broken by registry order. Pure and cheap — the sim can afford it on
 * every write. The model-backed classifier (tagger) can refine later.
 */
export function classifyDomains(text: string): DomainClassification {
  const toks = tokens(text);
  const joined = ' ' + toks.join(' ') + ' ';
  const scores: Array<{ key: string; hits: number }> = [];
  for (const d of DOMAINS) {
    let hits = 0;
    for (const kw of d.keywords) {
      if (kw.includes(' ')) { if (joined.includes(' ' + kw + ' ')) hits++; continue; }
      // prefix match for stems (injur → injured/injury), whole-token otherwise
      for (const t of toks) if (t === kw || (kw.length >= 5 && t.startsWith(kw))) { hits++; break; }
    }
    if (hits > 0) scores.push({ key: d.key, hits });
  }
  scores.sort((a, b) => b.hits - a.hits);
  const all = scores.map(s => s.key);
  const primary = all[0] ?? null;
  return { primary, all, pillar: pillarOfDomain(primary) };
}
