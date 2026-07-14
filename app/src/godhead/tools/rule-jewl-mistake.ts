/**
 * rule_jewl_mistake — Et'herling's adjudication of a disputed JEWL mistake flag.
 *
 * When JEWL disputes a GM's mistake flag, `disputeMistake` invokes Et'herling
 * (the orchestrator godhead) through the standard invocation path. She weighs
 * the GM's claim against JEWL's rebuttal and rules by calling this tool ONCE:
 *
 *   - 'upheld'     → the GM proved the error; the pending bounty pays JEWL→GM.
 *   - 'overturned' → JEWL was right; no KRMA moves.
 *
 * Either way the JewlMistake row lands 'resolved' with the outcome recorded and
 * this invocation stamped on it (the audit trail; INV-121). Only a 'disputed'
 * row can be ruled — acceptance and re-ruling are intentionally blocked.
 *
 * The bounty transfer reuses `payMistakeBounty` (the single ledger path in the
 * mistake service) so the money movement is identical to the acceptance path.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool, type ToolContext } from './registry';
import { payMistakeBounty, type JewlMistakeSeverity } from '@/services/jewl-mistake';

const inputSchema = z.object({
  mistakeId: z.string().min(1).describe('The disputed JewlMistake id from the trigger payload.'),
  ruling: z
    .enum(['upheld', 'overturned'])
    .describe(
      '"upheld" = the GM proved JEWL erred (bounty pays JEWL→GM). ' +
        '"overturned" = JEWL was right (no bounty).',
    ),
  reasoning: z
    .string()
    .min(1)
    .max(2000)
    .describe('Your one-or-two-sentence justification, recorded on the row for both parties.'),
});

registerTool({
  name: 'rule_jewl_mistake',
  description:
    "Et'herling: adjudicate a disputed JEWL mistake flag. Call this exactly " +
    'once after weighing the GM claim, JEWL rebuttal, and flagged content. ' +
    'Upheld pays the pending bounty; overturned pays nothing. The row is then ' +
    'resolved and cannot be re-ruled.',
  inputSchema,
  handler: async (input, context: ToolContext) => {
    const { mistakeId, ruling, reasoning } = input as z.infer<typeof inputSchema>;

    const row = await prisma.jewlMistake.findUnique({ where: { id: mistakeId } });
    if (!row) throw new Error(`Mistake not found: ${mistakeId}`);
    if (row.status !== 'disputed') {
      throw new Error(
        `Mistake status is "${row.status}"; only "disputed" rows can be adjudicated`,
      );
    }

    let transactionId: string | null = null;
    if (ruling === 'upheld') {
      transactionId = await payMistakeBounty({
        mistakeId: row.id,
        amount: row.bountyAmount,
        gmUserId: row.gmUserId,
        campaignId: row.campaignId,
        severity: row.severity as JewlMistakeSeverity,
        kind: 'uphold',
        actorId: context.godHeadId,
        actorType: 'GODHEAD',
      });
    }

    const marker = ruling === 'upheld' ? "Et'herling upheld" : "Et'herling overturned";
    const note = row.note.trim()
      ? `${row.note.trim()}\n${marker}: ${reasoning.trim()}`
      : `${marker}: ${reasoning.trim()}`;

    await prisma.jewlMistake.update({
      where: { id: row.id },
      data: {
        status: 'resolved',
        resolution: ruling,
        transactionId,
        adjudicationInvocationId: context.invocationId,
        note,
      },
    });

    return {
      mistakeId: row.id,
      ruling,
      bountyPaidKrma: ruling === 'upheld' ? row.bountyAmount.toString() : '0',
      transactionId,
    };
  },
});
