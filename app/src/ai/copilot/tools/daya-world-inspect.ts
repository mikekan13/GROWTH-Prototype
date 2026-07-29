/**
 * daya_world_inspect — JEWL inspection tool: the room's physical truth.
 *
 * Part of the persona-harness observation surface (Addendum C). READ-ONLY:
 * lists live WorldFact rows for a campaign (nothing physical exists only in
 * prose — Ruling 19), optionally scoped to a subjectKey prefix (e.g.
 * `kitchen.` to see everything in one room). GM/ADMIN only. Always scoped to
 * the campaign the prompt is running in (`ctx.campaignId`); an input
 * `campaignId` is accepted for interface parity but must match — cross-
 * campaign inspection is out of scope for a single JEWL session.
 */
import 'server-only';
import { z } from 'zod';
import { isWatcherOrAbove } from '@/lib/permissions';
import { ValidationError } from '@/lib/errors';
import { currentFacts } from '@/daya/world-ledger';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

const dayaWorldInspectInputSchema = z.object({
  campaignId: z.string().min(1).optional(),
  subjectKey: z.string().max(256).optional(),
});

export const dayaWorldInspectTool: JewlTool = {
  name: 'daya_world_inspect',
  description:
    'GM/ADMIN-only inspection tool. Lists live WorldFact rows for the ' +
    'current campaign\'s World Ledger — the physical ground truth every ' +
    'entity\'s perception is rendered against. Optional subjectKey is a ' +
    'PREFIX filter (e.g. "kitchen." shows every fact in that room); omit to ' +
    'see the whole live ledger. Read-only — never writes anything.',
  inputSchema: dayaWorldInspectInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaWorldInspectInputSchema.parse(input);
    if (parsed.campaignId && parsed.campaignId !== ctx.campaignId) {
      throw new ValidationError('daya_world_inspect is scoped to the current campaign only');
    }

    const facts = await currentFacts(ctx.campaignId);
    const prefix = parsed.subjectKey;
    const scoped = prefix ? facts.filter((f) => f.subjectKey.startsWith(prefix)) : facts;

    return {
      output: {
        revealed: true,
        count: scoped.length,
        facts: scoped.map((f) => ({
          id: f.id,
          subjectKey: f.subjectKey,
          fact: f.fact,
          establishedAtCycle: f.establishedAtCycle,
        })),
      },
    };
  },
};

registerJewlTool(dayaWorldInspectTool);
