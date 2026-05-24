/**
 * Entity Quick-Gen Service — expand a freeform prompt into a wizard-shaped
 * EntityDraft via Claude. Powers Session F of the wizard plan (AI-assisted
 * NPC speed creation).
 *
 * Contract:
 *   - Caller passes: prompt (the GM's vibe), name, and (optionally) campaign
 *     context for grounding.
 *   - Service returns: { seedName | null, targetKV, attributes (9 entries),
 *     skillHints (≤6), traitHints (≤4), goalHints (≤3), notes }
 *   - The caller (wizard client) is responsible for mapping these hints
 *     into the existing draft shape. Skills/traits HINTS are name-only —
 *     they're not bound to forge items yet (GM picks the real forge item
 *     in the corresponding wizard step, optionally pre-filtered by hint).
 *
 * Safety:
 *   - Zod-validates JSON output. If Claude returns invalid JSON, we throw
 *     a ValidationError up to the caller.
 *   - We do NOT mutate the character on this call. Pure read + AI output.
 *   - Token budget capped at 2k; the prompt is small and the output is
 *     structured (JSON), so this is comfortable.
 *
 * Cost:
 *   - One Claude call per invocation. Use the cheap-tier model when
 *     possible (env override ANTHROPIC_MODEL). Falls back to provider default.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { ClaudeProvider } from '@/ai/providers/claude';
import { SEED_CATALOG } from '@/lib/seed-catalog';

export const quickGenInputSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(2000),
});

export type QuickGenInput = z.infer<typeof quickGenInputSchema>;

const ATTRIBUTE_NAMES = [
  'clout', 'celerity', 'constitution',
  'flow', 'frequency', 'focus',
  'willpower', 'wisdom', 'wit',
] as const;

const aiOutputSchema = z.object({
  seedName: z.string().nullable(),
  targetKV: z.number().int().min(50).max(10_000),
  attributes: z.object({
    clout: z.number().int().min(1).max(20),
    celerity: z.number().int().min(1).max(20),
    constitution: z.number().int().min(1).max(20),
    flow: z.number().int().min(1).max(20),
    frequency: z.number().int().min(1).max(20),
    focus: z.number().int().min(1).max(20),
    willpower: z.number().int().min(1).max(20),
    wisdom: z.number().int().min(1).max(20),
    wit: z.number().int().min(1).max(20),
  }),
  skillHints: z.array(z.object({
    name: z.string().min(1).max(60),
    level: z.number().int().min(1).max(20),
    governors: z.array(z.enum([
      'clout', 'celerity', 'constitution',
      'flow', 'focus',
      'willpower', 'wisdom', 'wit',
    ])).min(1).max(3),
    note: z.string().max(160).optional(),
  })).max(8),
  traitHints: z.array(z.object({
    name: z.string().min(1).max(60),
    type: z.enum(['nectar', 'thorn']),
    pillar: z.enum(['body', 'spirit', 'soul']).optional(),
    note: z.string().max(160).optional(),
  })).max(6),
  goalHints: z.array(z.object({
    description: z.string().min(3).max(280),
    priority: z.number().int().min(1).max(5),
  })).max(5),
  notes: z.string().max(500).optional(),
});

export type QuickGenResult = z.infer<typeof aiOutputSchema>;

function buildSystemPrompt(seedList: string): string {
  return `You are an authoring assistant for the GRO.WTH tabletop RPG. The Game Master (GM) just described an entity (could be a humanoid NPC, creature, or rival). Your job is to extract a structured starting draft.

GROWTH canon you MUST follow:
- Nine attributes: clout/celerity/constitution (Body), flow/frequency/focus (Spirit), willpower/wisdom/wit (Soul). Each starts at 1, max 20. Commoners average ~2-4; trained adventurers 4-8; veterans 6-12; elite 10-16.
- Each attribute level costs 1 KRMA toward TKV.
- Skill levels also cost 1 KRMA each (magic skills 2). Skill governors MUST be attributes from above.
- Traits are either "nectar" (permanent positive) or "thorn" (permanent negative). Each trait MUST have a pillar tag (body, spirit, or soul) — this drives death-engine routing.
- TKV target ranges: Commoner 200, Trained 500, Veteran 1000, Elite 2000, Legendary 3500.
- Seeds are species/archetype templates. Pick from the list provided. If none fit and the entity is humanoid, use "Human".

Hard rules:
- Pick attributes that match the description. A grizzled knight has high Clout + Constitution; a court wizard high Focus + Wit; a frail oracle high Wisdom + Wit + Willpower with low Body.
- Don't exceed TKV target by more than 30%.
- Skill governors must be attribute names exactly: clout, celerity, constitution, flow, focus, willpower, wisdom, wit. (frequency cannot govern skills.)
- Trait names should be evocative and short (2-3 words).
- Goal descriptions are sentences from the entity's POV; priority 1=highest.

Available seeds (pick ONE that fits, or null):
${seedList}

Output ONLY a single JSON object matching this schema (no markdown, no explanation):
{
  "seedName": string | null,
  "targetKV": number,
  "attributes": { "clout":n, "celerity":n, "constitution":n, "flow":n, "frequency":n, "focus":n, "willpower":n, "wisdom":n, "wit":n },
  "skillHints": [{ "name":"...", "level":n, "governors":["clout"], "note":"..." }],
  "traitHints": [{ "name":"...", "type":"nectar"|"thorn", "pillar":"body"|"spirit"|"soul", "note":"..." }],
  "goalHints": [{ "description":"...", "priority":1-5 }],
  "notes": "any GM-facing context you want to surface"
}`;
}

/**
 * Extract the first JSON object from a possibly-noisy Claude response.
 * Claude sometimes wraps in markdown fences or adds a preamble; we tolerate that.
 */
function extractJsonObject(text: string): unknown {
  // Strip markdown code fences if present
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  // Find first { ... } balanced block
  const start = candidate.indexOf('{');
  if (start < 0) throw new ValidationError('AI output contained no JSON object');
  // Naive bracket matching; sufficient because our schema is shallow
  let depth = 0;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new ValidationError('AI output JSON object not closed');
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (e) {
    throw new ValidationError(`AI output not parseable JSON: ${(e as Error).message}`);
  }
}

export async function generateEntityDraft(
  userId: string,
  userRole: string,
  input: QuickGenInput,
): Promise<QuickGenResult & { campaignContextUsed: string }> {
  const validated = quickGenInputSchema.parse(input);

  const campaign = await prisma.campaign.findUnique({
    where: { id: validated.campaignId },
    select: { id: true, name: true, gmUserId: true, worldContext: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can quick-generate entities');
  }

  // Build a compact list of seed names + Fate Die for the system prompt.
  // Capping at all known seeds is fine — small token cost.
  const seedList = SEED_CATALOG
    .map(s => `- ${s.name} (${s.baseFateDie}, target ${s.frequency} freq)`)
    .join('\n');

  const system = buildSystemPrompt(seedList);

  const userPrompt = [
    `Campaign: ${campaign.name}`,
    campaign.worldContext ? `World: ${campaign.worldContext}` : null,
    `Entity name: ${validated.name}`,
    '',
    'GM description:',
    validated.prompt,
  ].filter(Boolean).join('\n');

  const provider = new ClaudeProvider();
  const raw = await provider.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.4, maxTokens: 1600 },
  );

  const parsed = extractJsonObject(raw);
  const result = aiOutputSchema.parse(parsed);

  return {
    ...result,
    campaignContextUsed: campaign.worldContext ?? '',
  };
}

// Re-export attribute names for callers
export { ATTRIBUTE_NAMES };
