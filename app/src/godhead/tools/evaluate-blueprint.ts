/**
 * evaluate_blueprint — Kai's pricing & balance tool.
 *
 * Kai loads a blueprint, scores its mechanical balance (1-10), computes a
 * KRMA price, and writes the result back onto the ForgeItem so the chain
 * can advance. This is a deterministic-with-LLM-cap pattern: the heavy
 * lifting is rules-based, but Kai may attach a free-form note when
 * scoring is non-trivial.
 *
 * Pricing rule v1 (matches the existing kv-calculator logic for Seeds/
 * Roots/Branches; Items/Spells have their own pricers):
 *   - Sum attribute level grants × 1
 *   - Sum skill level grants × 1
 *   - Add Fate Die KV from FATE_DIE_KV map (Seeds only)
 *   - Add Fated Age KV: ceil(fatedAge × 0.5) (Seeds only)
 *   - Add baseResist × 2 (Seeds only)
 *   - Add Nectar/Thorn baseline of 5 KV each (placeholder pending
 *     full mechanical authoring)
 *
 * Score rule v1: defaults to 7 unless the blueprint has obvious balance
 * issues (e.g. all attribute grants > 5, missing required fields). Kai
 * can override the score by passing `manualScore` in the input.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';
import { priceBlueprintByType } from '@/services/forge-pricing';

const inputSchema = z.object({
  forgeItemId: z.string().describe('The ForgeItem to evaluate'),
  manualScore: z.number().int().min(1).max(10).optional().describe('Override the auto-computed balance score (1-10)'),
  notes: z.string().max(2000).optional().describe('Kai\'s free-form rationale; persisted on the ForgeItem.relationshipTags field'),
});

interface RootBranchData {
  attributes?: Record<string, number>;
  skills?: Array<{ level?: number }>;
  nectars?: string[];
  thorns?: string[];
}

interface SeedData extends RootBranchData {
  baseFateDie?: string;
  fatedAge?: number;
  baseResist?: number;
}

/**
 * Balance heuristic v2 (audit S10, 2026-08-17). Canon: seed aug totals VARY
 * by seed identity — balance lives at the TKV-tier level (Low 130-220,
 * Medium 220-350, High 350-550, Premium 550+), so a lone big aug is only a
 * flag when it dwarfs the rest. Root/branch: creation soft caps (skills
 * ~10-12, r-2026-04-22-02) are the flag lines. Intent unchanged: surface
 * stuff needing human review, never a definitive call.
 */
function autoScore(type: string, data: SeedData & RootBranchData, kv: number): { score: number; reason: string } {
  const attrs = data.attributes ?? {};
  const attrValues = Object.values(attrs);
  const attrTotal = attrValues.reduce((a, b) => a + Math.max(0, b), 0);
  const maxAttr = attrValues.length ? Math.max(...attrValues) : 0;

  if (type === 'seed') {
    if (kv > 0 && kv < 130) return { score: 5, reason: `seedKV ${kv} lands below the Low tier band (130-220) — check for missing components` };
    if (kv > 550) return { score: 6, reason: `seedKV ${kv} is Premium tier (550+) — confirm the seed earns it` };
    if (attrTotal > 0 && maxAttr > attrTotal / 2) {
      return { score: 5, reason: `One attribute aug (${maxAttr}) carries over half the aug total (${attrTotal}) — concentration check` };
    }
    return { score: 7, reason: 'Within tier expectations' };
  }

  if (type === 'root' || type === 'branch') {
    const maxSkill = Math.max(0, ...(data.skills ?? []).map(s => s.level ?? 0));
    if (maxSkill > 12) return { score: 4, reason: `Skill level ${maxSkill} exceeds the creation cap (~10-12, hard 20 lifetime)` };
    if (maxAttr > 10) return { score: 5, reason: `Attribute level ${maxAttr} is very high for a single block` };
    return { score: 7, reason: 'Balanced within expected envelope' };
  }

  return { score: 7, reason: 'Balanced within expected envelope' };
}

registerTool({
  name: 'evaluate_blueprint',
  description: 'Kai\'s blueprint evaluator. Loads a ForgeItem, prices it in KRMA, scores its balance (1-10), and writes the result back. Returns { price, score, reason, status }.',
  inputSchema,
  handler: async (input) => {
    const { forgeItemId, manualScore, notes } = input as z.infer<typeof inputSchema>;
    const item = await prisma.forgeItem.findUnique({ where: { id: forgeItemId } });
    if (!item) throw new Error(`Blueprint not found: ${forgeItemId}`);

    let data: SeedData & RootBranchData;
    try {
      data = JSON.parse(item.data) as SeedData & RootBranchData;
    } catch {
      throw new Error(`Blueprint data is not valid JSON: ${forgeItemId}`);
    }

    // LOCKED formulas via the shared pricer (audit X3): seed gets the
    // frequency-budget component, thorns come out as NEGATIVE liens, roots
    // get the breakeven frequency-cost line. Items/skills/spells return
    // null — Kai grades those case-by-case (r-2026-04-22-15).
    const priced = priceBlueprintByType(item.type, data as Record<string, unknown>);
    const price = priced?.kv ?? 0;
    const auto = autoScore(item.type, data, price);
    const score = manualScore ?? auto.score;
    const reason = manualScore ? `Manual score override (${manualScore}); auto would be ${auto.score}: ${auto.reason}` : auto.reason;

    // Persist: karmicValue (BigInt), evaluatedAt, relationshipTags carries
    // the score + reason + Kai's optional notes for downstream agents to read.
    const existingTags = (() => {
      if (!item.relationshipTags) return {};
      try { return JSON.parse(item.relationshipTags) as Record<string, unknown>; } catch { return {}; }
    })();
    const newTags = {
      ...existingTags,
      evaluation: {
        evaluator: 'Kai', score, price, reason, notes: notes ?? null,
        breakdown: priced?.breakdown ?? null,
        frequencyCost: priced?.frequencyCost ?? null,
        at: new Date().toISOString(),
      },
    };

    await prisma.forgeItem.update({
      where: { id: forgeItemId },
      data: {
        karmicValue: BigInt(price),
        evaluatedAt: new Date(),
        relationshipTags: JSON.stringify(newTags),
      },
    });

    return { price, score, reason, status: item.status, decayStatus: item.decayStatus };
  },
});
