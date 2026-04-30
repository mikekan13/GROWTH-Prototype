import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { getGodheadProvider } from '@/ai/providers';
import { executeTransaction } from '@/services/krma/ledger';
import type { ForgeItemType } from './forge';

// Flat fee charged to the campaign for one authoring request.
// Paid from the campaign wallet to Kai's wallet on every call (success or
// fail — Kai still spent the cycles). Future tiers can scale by KV or type.
const AUTHORING_FEE = BigInt(10);

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

  Human (ONLY verified reference Seed — ruling 2026-04-22):
    attrs_augs total=50, frequency=40, fatedAge=80, baseResist=15, fateDie=d6,
    Nectar="Ambitious", Thorn="Bounded Potential", KV=225.
  Other pre-existing seeds (Elven/Dwarven/Cambion/etc.) are UNVERIFIED — treat them as design proposals, not canonical reference.
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

  Balance: A typical root has 3-6 skills at levels 2-8, total attribute points 10-25.
  Root age can be 0-25 (hard cap at 25 per ruling r-2026-04-22-11; past 25 is Branches territory). Most roots are 15-22.
  Character-creation skill soft cap: ~10 per skill, up to 12 with extreme tuning (ruling r-2026-04-22-02).
  New Root-costing model (rulings r-2026-04-22-10 + -11):
    Root KV = (sum attribute levels) + (sum skill levels) + net nectar/thorn KV.
    Break-even at age Y = 100 + (Y - 18) × 5.
    Frequency field = max(0, Root KV - break-even). 0 = free; positive = player pays; conceptual refund if KV is below break-even.
    Anchor: Plain 18-year-old Human Root = 100 KV (with Seed 225 => TKV 325).
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

  Balance: Branches are narrower than roots — 2-4 skills at levels 3-10, total attributes 5-15.
  Branch costing uses the same break-even model as Roots (rulings r-2026-04-22-10 + -11):
    Branch KV = (sum attribute levels added) + (sum skill levels added) + net nectar/thorn KV.
    Break-even for a Branch with ageAdded Y = Y × 5 (each year a Branch adds contributes 5 KV of baseline).
    Frequency field = max(0, Branch KV - break-even). 0 = free; positive = player pays Frequency.
    Note: Branches are not yet fully specified in the rulebook — the above is a working model pending final ruling.
  Character-creation skill soft cap: ~10 per skill, up to 12 with extreme tuning.
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
  - condition: integer 0-4 (ruling r-2026-04-22-12: 4=Indestructible super-rare, 3=Undamaged/normal max, 2=Worn, 1=Broken, 0=Destroyed/nonexistent). Default new items to 3.
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

const KV_GUIDANCE = `KRMA VALUE (KV) CALCULATION — canonical rules as of 2026-04-22.
See rulebook/rulebook.md §3 (attributes), §6 (character creation), §9 (items) for full detail.

COSTING RULES (per-unit):
- 1 attribute augment point = 1 KV (Seed grants augs)
- 1 attribute level = 1 KV (Root/Branch grants levels)
- 1 skill level = 1 KV (mundane skills)
- 2 KV per magic/supernatural skill level
- 1 KV per point of Frequency
- 2 KV per point of Base Resist
- 1 KV per year of Fated Age (provisional — long-lived Seeds like Elf/Dragon may use a curve later)
- Fate Die KV: d4=5, d6=10, d8=20, d12=40, d20=80
- Nectar/Thorn: graded individually by mechanical and narrative impact (no formula). Net can be positive or negative.

ROOT COSTING (age-scaled break-even, rulings r-2026-04-22-10 + -11):
- Root KV = attribute_levels + skill_levels + net_nectar_thorn_KV (no direct age term)
- Break-even KV at age Y = 100 + (Y - 18) × 5
- Frequency cost = max(0, Root KV - break-even). Below break-even = player gets Freq refund.
- Max Root age = 25 (hard cap — past that belongs to Branches).
- Anchor: Plain 18-year-old Human Root = 100 KV. With Seed (225) = TKV 325 reference.
- Max affordable Root KV = Seed Frequency + break-even(age). Human at age 18 ceiling = 140 KV.

YEAR OF LIFE AS WEIGHT:
- Average year produces about 5 KRMA of content KV. This is descriptive, not prescriptive.
- Intense years (training montage, major life events) can produce 20-30+ KV.
- Coasting years produce 1-2 KV. Per-year ratios outside ~3-15 should be flagged.

SKILL LEVEL SCALE (ruling r-2026-04-22-02):
- 1-3: Flat bonus (+1/+2/+3 to Fate Die)
- 4-5: d4 skill die (basic competency)
- 6-7: d6
- 8-11: d8 (professional)
- 12-19: d12 (master)
- 20: d20 (godlike / hard cap)
- Character-creation soft cap: ~10 per skill. Up to 12 only with extreme tuning (old character + stacked Root/Branches on same skill). 20 is lifetime only.

NECTARS, THORNS & BLOSSOMS (rulings r-2026-04-22-05 + -06):
- Nectar = permanent positive trait. Thorn = permanent negative. Blossom = temporary (Godhead-granted during play, doesn't count against N+T limit).
- Total Nectars + Thorns ≤ Fate Die max value (d6 = max 6 total, d20 = max 20).
- Acquisition: mostly from GRO.vines (complete → Nectar; fail → Thorn). Also Harvests, character creation (Seed/Root/Branch bake-ins), GM-assigned events, Terminal injections, death events.
- "Fears and anxieties" trigger is RETIRED — Fears system is cut.
- Each N/T graded case-by-case. No formula.
- Most Roots/Branches have ZERO nectars/thorns. Only add if character-defining.

SEED REFERENCE:
- Human is the ONLY verified canonical Seed: attrs_augs=50, freq=40, fatedAge=80, baseResist=15, fateDie=d6, N="Ambitious", T="Bounded Potential", KV=225.
  Breakdown: 50 + 40 + 30(resist ×2) + 10(d6) + 80(fatedAge) + 15(N/T net) = 225.
- Other pre-existing seeds (Elven, Dwarven, Cambion, etc.) are UNVERIFIED design proposals, not canon.

RETIRED SYSTEMS (don't use):
- Tech Level (entirely retired 2026-04-22 — not a character stat, not a material property, not a campaign descriptor). Skill-gating replaces it where relevant.
- Per-character Wealth/Health Levels (retired earlier; only narrative descriptors remain).
- Old age formula "-2 KV per year frequency reduction" — SUPERSEDED by the break-even model above.

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

  // Future: Eth'erling routes to domain-aligned God-head. For barebones, Kai
  // both authors and evaluates. Fail loud if Kai isn't seeded.
  const godhead = await prisma.godHead.findUnique({
    where: { name: 'Kai' },
  });
  if (!godhead) throw new NotFoundError("God-head 'Kai' (run scripts/seed-godheads.ts)");
  if (!godhead.walletId) throw new ValidationError("Kai has no wallet — cannot accept authoring fee");

  // Charge the campaign wallet — the GM's KRMA pool funds authoring.
  const campaignWallet = await prisma.wallet.findFirst({
    where: { campaignId, ownerType: 'CAMPAIGN' },
    select: { id: true },
  });
  if (!campaignWallet) {
    throw new ValidationError('Campaign has no wallet — fund it before authoring');
  }
  await executeTransaction({
    fromWalletId: campaignWallet.id,
    toWalletId: godhead.walletId,
    amount: AUTHORING_FEE,
    state: 'FLUID',
    reason: 'BLUEPRINT_AUTHOR',
    description: `Authoring fee for ${input.type}: "${input.name}"`,
    metadata: { type: input.type, requestedName: input.name },
    campaignId,
    actorId: userId,
    actorType: 'GM',
    idempotencyKey: `forge.author:${campaignId}:${userId}:${input.type}:${input.name}:${Date.now()}`,
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
