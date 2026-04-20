import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { getGodheadProvider } from '@/ai/providers';
import type { ForgeItemType } from './forge';

// ── Input Schema ─────────────────────────────────────────────────────────

export const forgeAuthorInputSchema = z.object({
  type: z.enum(['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn']),
  name: z.string().min(1, 'Name required').max(100),
  description: z.string().min(10, 'Describe what you want Kai to build (at least 10 characters)').max(2000),
  campaignContext: z.string().max(500).optional(),
});

export type ForgeAuthorInput = z.infer<typeof forgeAuthorInputSchema>;

// ── Result type ──────────────────────────────────────────────────────────

export interface ForgeAuthorResult {
  type: ForgeItemType;
  name: string;
  canonicalName: string;
  data: Record<string, unknown>;
  godheadReasoning: string;
  suggestedKV: number;
}

// ── Schema guidance for each type (tells Kai what fields to generate) ────

const TYPE_SCHEMAS: Record<string, string> = {
  seed: `Generate a JSON object with these fields:
  - description: string (1-2 sentences, vivid)
  - baseFateDie: "d4"|"d6"|"d8"|"d12"|"d20" (higher = more chaotic/powerful)
  - frequency: integer 0-200 (creation cost in Frequency points; powerful seeds cost more)
  - fatedAge: integer (species natural lifespan — e.g. Human ~80, Elven ~500, Dwarven ~350)
  - baseResist: integer 0-50 (innate resistance to damage)
  - attributes: { clout, celerity, constitution, focus, flow, willpower, wisdom, wit } — each integer 0-30, augments added to base. Total should be 50-80 for balanced seeds.
  - skills: string[] (up to 10 innate skill names)
  - nectars: string[] (up to 10 positive traits — racial/species advantages)
  - thorns: string[] (up to 10 negative traits — racial/species disadvantages)

  Balance guidelines: Human baseline has total attributes=50, frequency=40, fatedAge=80, baseResist=15, KV=225.
  Elven: attrs=69, freq=30, fatedAge=500, resist=13, KV=255. Dwarven: attrs=63, freq=30, fatedAge=350, resist=18, KV=580.
  More powerful seeds cost more frequency. Most seeds have 0-1 nectars and 0-1 thorns. Many have none.
  Only add nectars/thorns if they are truly character-defining species traits.`,

  root: `Generate a JSON object with these fields:
  - description: string (what this occupation/background provides)
  - frequency: integer (cost in Frequency; skilled roots cost 20-60)
  - ageAdded: integer 0+ (years this root adds to character age)
  - attributes: { clout, celerity, constitution, focus, flow, willpower, wisdom, wit } — each integer 0-20, base levels from training
  - skills: array of { name: string, level: integer 1-20 } (up to 20 skills learned)
  - nectars: string[] (advantages from this background)
  - thorns: string[] (disadvantages or obligations)
  - seedRequirement: string (which seed type this root requires, or "" for any)

  Balance: A typical root has 3-6 skills at levels 2-8 (NEVER above 12), total attribute points 10-25.
  Frequency = (total attribute points) + (total skill levels) - (ageAdded × 2).
  Age is usually 16-21 for a root (childhood).
  Most roots have NO nectars or thorns unless the GM specifically describes something character-defining.`,

  branch: `Generate a JSON object with these fields:
  - description: string (what this specialization provides)
  - frequency: integer (cost; specialized branches cost more)
  - ageAdded: integer 0+ (additional years of training)
  - attributes: { clout, celerity, constitution, focus, flow, willpower, wisdom, wit } — each integer 0-20, additional levels
  - skills: array of { name: string, level: integer 1-20 } (up to 20 specialized skills)
  - nectars: string[] (specialization advantages)
  - thorns: string[] (specialization costs/drawbacks)
  - requirements: string (prerequisites like "Root: Soldier" or "")

  Balance: Branches are narrower than roots — 2-4 skills at levels 3-10 (specialist, NEVER above 12), total attributes 5-15.
  Frequency = (total attribute points) + (total skill levels) - (ageAdded × 2).
  Branches represent focused training AFTER a root. Most have NO nectars/thorns.`,

  skill: `Generate a JSON object with these fields:
  - governors: string[] (which attributes govern this skill — choose from: clout, celerity, constitution, focus, flow, willpower, wisdom, wit)
  - description: string (what this skill does, max 500 chars)

  Pick 1-3 governors that make thematic sense. Physical skills use Body attributes (clout/celerity/constitution), magical/spiritual use Spirit (focus/flow), mental use Soul (willpower/wisdom/wit).`,

  item: `Generate a JSON object with these fields:
  - description: string (what it looks like and does)
  - itemType: "weapon"|"armor"|"accessory"|"consumable"|"tool"|"artifact"|"prima_materia"|"misc"
  - material: string (e.g. "Steel", "Ironwood", "Dragonbone")
  - weightLevel: integer 0-10
  - condition: integer 1-4 (4=pristine, 1=broken)
  - rarity: "common"|"uncommon"|"rare"|"very_rare"|"legendary"|"artifact"
  - value: number (in standard currency units)
  - notes: string (special properties or lore)
  - tags: string[] (searchable tags)
  For weapons, also include: damage: { piercing, slashing, heat, decay, cold, bashing, energy } (each 0+), range: "melee"|"short"|"medium"|"long", targetAttribute: string
  For armor: armorLayer: "clothing"|"lightArmor"|"heavyArmor", resistance: number, coveredParts: string[]`,

  nectar: `Generate a JSON object with these fields:
  - description: string (what this positive trait does, max 500 chars)
  - mechanicalEffect: string (game mechanics description, max 300 chars)
  - source: string (where this trait comes from — seed, root, branch, or earned)`,

  blossom: `Generate a JSON object with these fields:
  - description: string (what this evolved/advanced trait does, max 500 chars)
  - mechanicalEffect: string (game mechanics, max 300 chars)
  - source: string (how this blossom is achieved — usually from a nectar evolving)`,

  thorn: `Generate a JSON object with these fields:
  - description: string (what this negative trait does, max 500 chars)
  - mechanicalEffect: string (the mechanical penalty or restriction, max 300 chars)
  - source: string (origin — innate, acquired, cursed, etc.)`,
};

// ── KV estimation guidance ───────────────────────────────────────────────

const KV_GUIDANCE = `KRMA VALUE (KV) CALCULATION — use these concrete rules:

COSTING RULES:
- 1 attribute point = 1 KV
- 1 skill level = 1 KV (regular skills)
- 2 KV per magic/supernatural skill level
- Age on roots: every year of age = -2 KV (frequency reduction). Root age represents childhood (usually 16-21 years).
- Root frequency = sum of all costs (attributes + skills) minus age reduction
- Body Resist: 1 KV per point of base resist

SKILL LEVEL SCALE:
- 1-5: Novice to competent (basic training)
- 6-9: Professional (years of practice)
- 10-12: Expert (top of normal human capability)
- 13-15: Exceptional (Michael Jordan = Basketball 13)
- 16-19: Superhuman mastery
- 20: God-level
Roots should have skills mostly in the 2-8 range. Nothing above 12 on a root.

NECTARS & THORNS — EXTREMELY RARE:
- These are character-defining abilities that fundamentally change how a character plays
- Most seeds, roots, and branches have ZERO nectars and ZERO thorns
- Only add them if the GM's description explicitly calls for something character-defining
- If you suggest nectars/thorns, note they must be separately authored and reviewed
- Examples: "Dark Sight" (see in darkness), "Long Lifespan Frailty" (age penalty)

REFERENCE SEEDS (from canonical catalog):
- Human: attrs total=50, freq=40, fatedAge=80, resist=15, KV=225
- Elven: attrs total=69, freq=30, fatedAge=500, resist=13, KV=255
- Dwarven: attrs total=63, freq=30, fatedAge=350, resist=18, KV=580
- Seeds with higher total attributes or better stats cost more frequency

BALANCE PHILOSOPHY:
- Every power has a cost. Every advantage creates a vulnerability.
- Frequency is the universal currency — it's what gets spent to create things.
- If something feels too powerful, raise its frequency cost or add a thorn.
- KV should feel EARNED — a character with 500 KV should feel meaningfully different from one with 200 KV.`;

// ── Core authoring function ──────────────────────────────────────────────

export async function authorForgeItem(
  campaignId: string,
  userId: string,
  userRole: string,
  input: ForgeAuthorInput,
): Promise<ForgeAuthorResult> {
  // Permission check — GM only
  if (!isWatcherOrAbove(userRole)) throw new ForbiddenError();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true, name: true, genre: true, worldContext: true },
  });
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.gmUserId !== userId) throw new ForbiddenError('Only the campaign GM can author forge items');

  // Get a God-head for authoring (domain routing TODO — for now use any God-head)
  // Future: Eth'erling routes to domain-aligned God-head, then Kai evaluates KV balance
  const godhead = await prisma.godHead.findFirst({
    orderBy: { name: 'asc' },
  });

  const schemaGuide = TYPE_SCHEMAS[input.type];
  if (!schemaGuide) throw new ValidationError(`Unsupported forge type: ${input.type}`);

  // Build system prompt — God-head personality + mechanical authoring instructions
  const systemPrompt = buildSystemPrompt(godhead?.systemPrompt, input.type, schemaGuide);

  // Build user prompt — the GM's narrative request
  const userPrompt = buildUserPrompt(input, campaign.name, campaign.genre, campaign.worldContext);

  const provider = getGodheadProvider();

  const response = await provider.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: godhead?.temperature ?? 0.5, maxTokens: 2048 },
  );

  // Parse Kai's response
  return parseAuthorResponse(response, input.type, input.name);
}

// ── Prompt builders ──────────────────────────────────────────────────────

function buildSystemPrompt(kaiPrompt: string | undefined, type: string, schemaGuide: string): string {
  const godheadPersonality = kaiPrompt || `You are a God-head in the GRO.WTH universe. You author the mechanical blueprints for all things in the world. You understand the cosmic balance — ensuring nothing is too powerful without cost, nothing too weak without purpose. Every Thorn has its Nectar. Every power demands Frequency.`;

  return `${godheadPersonality}

You are authoring a ${type} blueprint. The GM has described what they want narratively. Your job is to translate their vision into balanced game mechanics.

${schemaGuide}

${KV_GUIDANCE}

NAME STANDARDIZATION:
Approved designs go to the global catalog for ALL campaigns. You MUST standardize the name:
- Make it gender-neutral: "Miller's Daughter" → "Miller's Child"
- Make it setting-agnostic: "Elven Longbow of the Northern Reach" → "Elven Longbow"
- Make it reusable and catalog-worthy — no campaign-specific proper nouns
- Keep the essence and flavor of what the GM described
- The GM's original name is just their request — your canonicalName is what gets created
Return the standardized name in the "canonicalName" field.

CRITICAL RULES:
- Output ONLY valid JSON wrapped in a \`\`\`json code block
- Include a "canonicalName" field (string) — the standardized, catalog-ready name
- Include a "reasoning" field (string) explaining your balance decisions AND any name changes
- Include a "suggestedKV" field (number) with your KRMA Value estimate
- The "data" field contains the actual stats matching the schema above
- Do NOT include fields not in the schema
- Ensure the result is mechanically balanced and thematically coherent with the GM's description

Response format:
\`\`\`json
{
  "canonicalName": "...",
  "data": { ... },
  "reasoning": "...",
  "suggestedKV": 000
}
\`\`\``;
}

function buildUserPrompt(
  input: ForgeAuthorInput,
  campaignName: string,
  genre: string | null,
  worldContext: string | null,
): string {
  let prompt = `Author a ${input.type} blueprint.

Name: "${input.name}"
GM's Description: ${input.description}`;

  if (input.campaignContext) {
    prompt += `\nCampaign Context: ${input.campaignContext}`;
  }
  if (genre) {
    prompt += `\nGenre: ${genre}`;
  }
  if (worldContext) {
    prompt += `\nWorld Context: ${worldContext}`;
  }
  prompt += `\nCampaign: ${campaignName}`;

  return prompt;
}

// ── Response parser ──────────────────────────────────────────────────────

function parseAuthorResponse(response: string, type: ForgeItemType, name: string): ForgeAuthorResult {
  // Extract JSON from response (may be wrapped in ```json ... ```)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new ValidationError('God-head returned an unparseable response. Try rephrasing your description.');
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  let parsed: { canonicalName?: string; data: Record<string, unknown>; reasoning: string; suggestedKV: number };

  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new ValidationError('God-head returned invalid JSON. Try again with a clearer description.');
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new ValidationError('God-head response missing "data" field.');
  }

  return {
    type,
    name,
    canonicalName: parsed.canonicalName || name,
    data: parsed.data,
    godheadReasoning: parsed.reasoning || 'No reasoning provided.',
    suggestedKV: parsed.suggestedKV || 0,
  };
}

// ── Confirm and persist ──────────────────────────────────────────────────

export async function confirmForgeAuthoring(
  campaignId: string,
  userId: string,
  userRole: string,
  input: {
    type: ForgeItemType;
    name: string;
    data: Record<string, unknown>;
    karmicValue?: number;
  },
) {
  if (!isWatcherOrAbove(userRole)) throw new ForbiddenError();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true },
  });
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.gmUserId !== userId) throw new ForbiddenError('Only the campaign GM can confirm forge items');

  // Create the forge item as draft
  const item = await prisma.forgeItem.create({
    data: {
      campaignId,
      type: input.type,
      name: input.name,
      status: 'draft',
      data: JSON.stringify(input.data),
      createdBy: userId,
      ...(input.karmicValue != null ? { karmicValue: BigInt(input.karmicValue) } : {}),
    },
  });

  return { ...item, data: JSON.parse(item.data) };
}
