import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { buildGoalContext } from '@/services/context/goal-context';
import { getGodheadProvider } from '@/ai/providers';
import { assignCustodian } from '@/services/goal';

const CUSTODIAN_SYSTEM_PROMPT = `You are the God-head Custodian Router for GRO.WTH. When a new goal (GRO.vine) is created, you determine which God-head should "pick it up" — become its custodian and monitor its progress.

Available God-heads and their domains:

1. **Lady Death** (BALANCE) — Death, decay, karmic recycling, blueprint maintenance. She watches over goals involving endings, transformation, sacrifice, letting go, cycles of renewal, and the weight of mortality. She ensures nothing persists beyond its purpose.

2. **Kai** (BALANCE) — Value, balance, karmic evaluation, economic fairness. She watches over goals involving creation, crafting, acquisition, trade, power balance, and ambition. She measures the worth of all things and prevents karmic inflation.

3. **Eth'erling** (BALANCE) — Justice, routing, cosmic judgment, orchestration. She watches over goals involving truth-seeking, moral dilemmas, interpersonal conflict, fairness, duty, and the greater good. She ensures the cosmic order is maintained.

Rules:
- Choose the God-head whose domain BEST aligns with the goal's core theme
- A goal about "finding my father's killer" → Lady Death (endings, cycles) OR Eth'erling (justice)
- A goal about "crafting the ultimate weapon" → Kai (creation, value, ambition)
- A goal about "proving my innocence" → Eth'erling (justice, truth)
- If the goal is ambiguous, prefer Eth'erling (she's the router/judge)

Respond with ONLY a JSON object:
{"godheadName": "Lady Death" | "Kai" | "Eth'erling", "reason": "one sentence explaining why"}`;

/**
 * Determine which God-head should become custodian of a goal.
 * The God-head "picks up" the GRO.vine based on domain alignment.
 */
export async function assignGoalCustodian(goalId: string): Promise<{
  godheadName: string;
  pillar: string;
  reason: string;
}> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      character: { select: { name: true, entityType: true } },
    },
  });
  if (!goal) throw new NotFoundError('Goal not found');

  // Build goal context for the AI
  const context = await buildGoalContext(goalId, goal.campaignId || '', {
    maxHops: 1,
    maxEntities: 5,
    fullContext: false,
  });

  // Get all God-heads (god-heads never sleep)
  const godheads = await prisma.godHead.findMany();

  if (godheads.length === 0) {
    return { godheadName: '', pillar: '', reason: 'No God-heads seeded yet' };
  }

  const provider = getGodheadProvider();

  const userPrompt = `New goal created:
"${goal.description}" (Priority: ${goal.priority}/5)
Entity: ${goal.character.name} (${goal.character.entityType})

Context:
${context}

Which God-head should pick up this GRO.vine?`;

  const response = await provider.chat(
    [
      { role: 'system', content: CUSTODIAN_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 200 },
  );

  // Parse AI response
  let assignment: { godheadName: string; reason: string };
  try {
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    assignment = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback to Eth'erling (the router/judge)
    assignment = {
      godheadName: "Eth'erling",
      reason: 'Default assignment — could not determine domain alignment',
    };
  }

  // Look up the God-head record
  const godhead = godheads.find(g => g.name === assignment.godheadName);
  if (!godhead) {
    // Fall back to first available
    const fallback = godheads[0];
    await assignCustodian(goalId, fallback.id, fallback.name, fallback.pillar);
    return {
      godheadName: fallback.name,
      pillar: fallback.pillar,
      reason: `Fallback: "${assignment.godheadName}" not found. ${assignment.reason}`,
    };
  }

  // Assign custodian on the goal
  await assignCustodian(goalId, godhead.id, godhead.name, godhead.pillar);

  return {
    godheadName: godhead.name,
    pillar: godhead.pillar,
    reason: assignment.reason,
  };
}
