/**
 * Trait Modifiers — Parse mechanicalEffect strings on Nectars/Thorns/Blossoms
 * and compute the flat roll modifier they contribute to a given skill check.
 *
 * Mechanical effect string format examples we recognize:
 *
 *   "+1 to Stealth checks"
 *   "+2 to Melee Combat checks"
 *   "-1 to all Body checks"           (pillar-wide)
 *   "+1 to Soul checks"               (pillar-wide)
 *   "+1 to all checks"                (universal)
 *   "+2 to clout checks"              (attribute-keyed)
 *   "+1 to Survival, Hunting checks"  (comma list)
 *
 * Each trait is parsed once into a list of (modifier, target) rules. We sum
 * the modifiers whose target matches the active check's skill name,
 * attribute, or pillar.
 *
 * Unmatched or ambiguous mechanicalEffect strings contribute 0 — this is
 * by design. The check route does not pretend to understand free-form text;
 * authors of Nectars/Thorns can write narrative effects and the GM still
 * adjudicates those manually. Only the canonical "+N to X checks" pattern
 * is consumed automatically.
 */

import type { GrowthTrait } from '@/types/growth';

const BODY_ATTRS = new Set(['clout', 'celerity', 'constitution']);
const SPIRIT_ATTRS = new Set(['flow', 'frequency', 'focus']);
const SOUL_ATTRS = new Set(['willpower', 'wisdom', 'wit']);

export interface TraitModifierRule {
  amount: number;
  /** Lower-cased target — skill name, attribute, pillar, or 'all'. */
  target: string;
}

export interface TraitModifierContext {
  /** The skill being rolled, lower-cased. Optional for unskilled checks. */
  skillName?: string;
  /** The effort attribute being used, lower-cased (e.g. 'clout', 'wit'). */
  effortAttribute?: string;
}

/**
 * Parse all rules out of a single mechanicalEffect string.
 *
 * Pattern: `[+\-]?\d+ to <target list> checks?`
 * The target list may be a single name, a comma-separated list, or one of
 * the special keywords: all, all body|spirit|soul, body|spirit|soul.
 */
export function parseTraitModifierRules(mechanicalEffect: string | undefined): TraitModifierRule[] {
  if (!mechanicalEffect) return [];
  const rules: TraitModifierRule[] = [];
  // Match: "+N to <thing[, thing...]> checks?"
  // Permissive: amount may be "+N", "-N", or bare "N" (defaults to +)
  const re = /([+\-]?\d+)\s+to\s+([a-zA-Z][\w\s,]*?)\s+checks?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mechanicalEffect)) !== null) {
    const rawAmount = m[1].startsWith('-') ? m[1] : m[1].replace(/^\+/, '');
    const amount = parseInt(rawAmount, 10);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const targetGroup = m[2].toLowerCase().trim();
    // Split by comma, drop the word "all" if it appears alone (handled below)
    const targets = targetGroup.split(/\s*,\s*/).map(t => t.trim()).filter(Boolean);
    for (const t of targets) {
      // Normalize "all body" → pillar:body; "all" → universal.
      const normalized =
        t === 'all' ? 'all' :
        t === 'all body' || t === 'body' ? 'pillar:body' :
        t === 'all spirit' || t === 'spirit' ? 'pillar:spirit' :
        t === 'all soul' || t === 'soul' ? 'pillar:soul' :
        t;
      rules.push({ amount, target: normalized });
    }
  }
  return rules;
}

/**
 * Compute the total trait modifier applicable to a check context.
 * Sums every matching rule across every trait passed in.
 */
export function computeTraitModifier(
  traits: ReadonlyArray<Pick<GrowthTrait, 'mechanicalEffect' | 'type'>> | undefined,
  context: TraitModifierContext,
): { total: number; applied: Array<{ amount: number; target: string; from: 'nectar' | 'blossom' | 'thorn' }> } {
  if (!Array.isArray(traits) || traits.length === 0) return { total: 0, applied: [] };
  const skill = context.skillName?.toLowerCase().trim();
  const attr = context.effortAttribute?.toLowerCase().trim();
  const pillar =
    attr && BODY_ATTRS.has(attr) ? 'body' :
    attr && SPIRIT_ATTRS.has(attr) ? 'spirit' :
    attr && SOUL_ATTRS.has(attr) ? 'soul' :
    undefined;

  let total = 0;
  const applied: Array<{ amount: number; target: string; from: 'nectar' | 'blossom' | 'thorn' }> = [];

  for (const t of traits) {
    const rules = parseTraitModifierRules(t.mechanicalEffect);
    for (const r of rules) {
      const matches =
        r.target === 'all' ||
        (skill && r.target === skill) ||
        (attr && r.target === attr) ||
        (pillar && r.target === `pillar:${pillar}`);
      if (matches) {
        total += r.amount;
        applied.push({ amount: r.amount, target: r.target, from: t.type });
      }
    }
  }

  return { total, applied };
}
