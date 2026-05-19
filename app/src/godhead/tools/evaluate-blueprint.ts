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
import { FATE_DIE_KV } from '@/lib/kv-calculator';

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

function priceBlueprint(type: string, data: SeedData & RootBranchData): number {
  let kv = 0;
  const attrs = data.attributes ?? {};
  for (const v of Object.values(attrs)) kv += Math.max(0, v);
  for (const s of data.skills ?? []) kv += Math.max(0, s.level ?? 0);
  kv += (data.nectars?.length ?? 0) * 5;
  kv += (data.thorns?.length ?? 0) * 5;
  if (type === 'seed') {
    if (data.baseFateDie && FATE_DIE_KV[data.baseFateDie]) kv += FATE_DIE_KV[data.baseFateDie];
    if (typeof data.fatedAge === 'number' && data.fatedAge > 0) kv += Math.ceil(data.fatedAge * 0.5);
    if (typeof data.baseResist === 'number' && data.baseResist > 0) kv += data.baseResist * 2;
  }
  return kv;
}

function autoScore(type: string, data: SeedData & RootBranchData): { score: number; reason: string } {
  // Simple heuristic — penalize obviously overpowered grants. The
  // intent is to flag stuff that needs human review, not to make a
  // definitive call.
  const attrs = data.attributes ?? {};
  const attrValues = Object.values(attrs);
  const maxAttr = attrValues.length ? Math.max(...attrValues) : 0;
  const avgAttr = attrValues.length ? attrValues.reduce((a, b) => a + b, 0) / attrValues.length : 0;
  if (maxAttr >= 6) return { score: 4, reason: `Single attribute grant ${maxAttr} is high (>5)` };
  if (avgAttr > 3) return { score: 5, reason: `Average attribute grant ${avgAttr.toFixed(1)} is high (>3)` };
  if (type === 'seed' && (data.fatedAge ?? 0) >= 200) return { score: 6, reason: 'Fated Age ≥ 200y — long-lived seed' };
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

    const price = priceBlueprint(item.type, data);
    const auto = autoScore(item.type, data);
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
      evaluation: { evaluator: 'Kai', score, price, reason, notes: notes ?? null, at: new Date().toISOString() },
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
