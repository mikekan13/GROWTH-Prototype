/**
 * decay_blueprint — Lady Death's blueprint-decay tool.
 *
 * Walks a blueprint through the canonical decay states:
 *   ACTIVE → FLAGGED → DISSOLVING → DISSOLVED
 *
 * Each transition is non-reversible (per design). DISSOLVED blueprints
 * can no longer be selected during character creation. Lady Death decides
 * when to advance, based on usage statistics and her own judgment.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const VALID_STATES = ['ACTIVE', 'FLAGGED', 'DISSOLVING', 'DISSOLVED'] as const;
type DecayState = typeof VALID_STATES[number];

const inputSchema = z.object({
  forgeItemId: z.string().describe('Blueprint to decay'),
  targetState: z.enum(VALID_STATES).describe('Next decay state — must be a forward step'),
  reason: z.string().max(2000).optional().describe('Lady Death\'s reason for the decay step'),
});

// Forward-only state machine. Each state can only advance to a later one.
const NEXT_STATES: Record<DecayState, DecayState[]> = {
  ACTIVE: ['FLAGGED', 'DISSOLVING', 'DISSOLVED'],
  FLAGGED: ['DISSOLVING', 'DISSOLVED'],
  DISSOLVING: ['DISSOLVED'],
  DISSOLVED: [],
};

registerTool({
  name: 'decay_blueprint',
  description: 'Lady Death: advance a blueprint along the decay chain (ACTIVE → FLAGGED → DISSOLVING → DISSOLVED). Forward-only.',
  inputSchema,
  handler: async (input) => {
    const { forgeItemId, targetState, reason } = input as z.infer<typeof inputSchema>;
    const item = await prisma.forgeItem.findUnique({ where: { id: forgeItemId } });
    if (!item) throw new Error(`Blueprint not found: ${forgeItemId}`);

    const current = item.decayStatus as DecayState;
    if (!VALID_STATES.includes(current)) {
      throw new Error(`Blueprint has invalid decay state: ${item.decayStatus}`);
    }
    if (!NEXT_STATES[current].includes(targetState)) {
      throw new Error(`Cannot advance ${current} → ${targetState} (forward-only)`);
    }

    const updates: Record<string, unknown> = { decayStatus: targetState };
    if (targetState === 'FLAGGED' && !item.flaggedAt) updates.flaggedAt = new Date();

    // Append the reason to relationshipTags.decay history so the agent log
    // shows the full chain.
    const existingTags = (() => {
      if (!item.relationshipTags) return {};
      try { return JSON.parse(item.relationshipTags) as Record<string, unknown>; } catch { return {}; }
    })();
    const decayHistory = Array.isArray(existingTags.decayHistory)
      ? (existingTags.decayHistory as Array<Record<string, unknown>>)
      : [];
    decayHistory.push({
      from: current,
      to: targetState,
      reason: reason ?? null,
      at: new Date().toISOString(),
    });
    updates.relationshipTags = JSON.stringify({ ...existingTags, decayHistory });

    await prisma.forgeItem.update({ where: { id: forgeItemId }, data: updates });

    return { forgeItemId, previousState: current, newState: targetState };
  },
});
