import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { GodHeadAgent } from '@/godhead/agent';
import { executeTransaction } from '@/services/krma/ledger';
import type { ForgeItemType } from './forge';

// ── Chain economics ─────────────────────────────────────────────────────
// First-pass: GM→Creator funds the chain; Creator pays Kai; Kai pays Et'herling.
// Reforge: half cost across the board. The compute is the same, but the GM
// is iterating on their own request — this discount keeps reforging viable.
const CHAIN_FUND_FIRST = BigInt(30);              // GM → Creator (initial author)
const CHAIN_FUND_REFORGE = BigInt(15);            // GM → Creator (re-attempt)
const CREATOR_TO_KAI_FIRST = BigInt(10);
const CREATOR_TO_KAI_REFORGE = BigInt(5);
const KAI_TO_ETHERLING_FIRST = BigInt(10);
const KAI_TO_ETHERLING_REFORGE = BigInt(5);

// ── Input Schema ─────────────────────────────────────────────────────────

export const forgeAuthorInputSchema = z.object({
  type: z.enum(['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn']),
  name: z.string().min(1, 'Name required').max(100),
  description: z.string().min(10, 'Describe what you want the chain to build (at least 10 characters)').max(2000),
  campaignContext: z.string().max(500).optional(),
  reforge: z.boolean().optional(),  // True when the GM is re-running after a previous discard.
});

export type ForgeAuthorInput = z.infer<typeof forgeAuthorInputSchema>;

// ── Result types ─────────────────────────────────────────────────────────
// PUBLIC contract returned to the GM. The internal authoring chain
// (Selva/Creator/Kai/Et'herling, fees, per-stage reasoning) is invisible
// to the GM by design. Audit detail lives in DB action logs only.

export interface ForgeAuthorResult {
  type: ForgeItemType;
  name: string;
  canonicalName: string;
  data: Record<string, unknown>;
  summary: string;       // One-line GM-facing summary. No chain reveal.
  suggestedKV: number;
}

// Internal-only — not exported. Server-side audit shape for chain stages.
interface ChainStageRecord {
  godhead: string;
  reasoning: string;
  invocationId: string;
  inputTokens: number;
  outputTokens: number;
}

// ── Schema guidance for each type ────────────────────────────────────────

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

SKILL LEVEL SCALE (ruling r-2026-04-22-02):
- 1-3: Flat bonus (+1/+2/+3 to Fate Die)
- 4-5: d4 skill die (basic competency)
- 6-7: d6
- 8-11: d8 (professional)
- 12-19: d12 (master)
- 20: d20 (godlike / hard cap)

NECTARS, THORNS & BLOSSOMS (rulings r-2026-04-22-05 + -06):
- Nectar = permanent positive trait. Thorn = permanent negative. Blossom = temporary.
- Total Nectars + Thorns ≤ Fate Die max value (d6 = max 6 total, d20 = max 20).
- Each N/T graded case-by-case. No formula.

SEED REFERENCE:
- Human is the ONLY verified canonical Seed: KV 225 (50 augs + 40 freq + 30 resist×2 + 10 d6 + 80 fatedAge + 15 N/T net).

BALANCE PHILOSOPHY:
- Every power has a cost. Every advantage creates a vulnerability.
- Frequency is the universal currency.
- KV should feel EARNED — a 500 KV character should feel meaningfully different from a 200 KV one.`;

// ── Selva: deterministic router (LLM Selva is post-MVP) ──────────────────

interface RouterDecision {
  godhead: string;        // Always "Selva" for now
  chosenCreator: string;  // Name of the Creator god-head
  reasoning: string;
}

function routeWithSelva(input: ForgeAuthorInput): RouterDecision {
  // Barebones: Lady Death is the default Creator. She is the only MVP god-head
  // not already locked into a downstream chain role (Kai = Balance, Et'herling
  // = KV grader). Future iterations route by type/domain across a wider council.
  return {
    godhead: 'Selva',
    chosenCreator: 'Tara Almswood',
    reasoning: `Routed ${input.type} request to Lady Death (default Creator while the council is small). Kai will balance; Et'herling will grade KV.`,
  };
}

// ── Stage instruction builders ───────────────────────────────────────────

function creatorInstructions(type: string, schemaGuide: string): string {
  return `You are the Creator god-head in the GRO.WTH blueprint authoring chain. Your job: turn the GM's narrative description into structured mechanical stats per the schema below. Do NOT grade KV — Et'herling will do that downstream. Do NOT exhaustively second-guess balance — Kai will adjust if needed.

Use your read tools when helpful: search_blueprints to check for similar existing entries, read_my_memory for past rulings, query_relationships for context. Use write_my_memory to record any new pattern.

${schemaGuide}

NAME STANDARDIZATION:
Approved designs go to the global catalog. Standardize the name:
- Gender-neutral, setting-agnostic, reusable.
- Keep the GM's described essence.
- Return the standardized name in "canonicalName".

FINAL OUTPUT FORMAT (must match exactly):
\`\`\`json
{
  "canonicalName": "...",
  "data": { ... matches schema ... },
  "reasoning": "Why you authored these stats. Note any liberties taken from the literal description."
}
\`\`\`
Only the fenced JSON. No prose around it.`;
}

function balanceInstructions(): string {
  return `You are Kai, the Balance reviewer in the blueprint authoring chain. The Creator god-head has drafted stats. Your job: check for balance issues and ALTER the draft if needed. Use your tools to compare against existing blueprints.

Possible alterations:
- Stat adjustments (raise or lower numbers)
- Add/remove nectars or thorns to even out a clearly skewed result
- Flag (but do NOT fix) major scope issues — those go back to the Creator

You SHOULD use search_blueprints to find precedents and read_my_memory for past balance rulings.

${KV_GUIDANCE}

FINAL OUTPUT FORMAT (must match exactly):
\`\`\`json
{
  "canonicalName": "(unchanged or revised)",
  "data": { ... possibly adjusted from the Creator's draft ... },
  "reasoning": "What you changed and why. If nothing changed, say so explicitly.",
  "altered": true
}
\`\`\`
Only the fenced JSON.`;
}

function kvGradeInstructions(): string {
  return `You are Et'herling, the KV grader in the blueprint authoring chain. The Creator drafted, Kai balanced. Your job: assign the final KRMA Value (KV) using the canonical costing rules. This is the number that will be stamped on the blueprint.

${KV_GUIDANCE}

Show your math in "reasoning". Sum each component (attributes, skills, frequency, resist, fated age, fate die, net N/T) and total it.

FINAL OUTPUT FORMAT (must match exactly):
\`\`\`json
{
  "suggestedKV": 0,
  "reasoning": "KV math: <component breakdown> = <total>. Notes on any judgment calls."
}
\`\`\`
Only the fenced JSON.`;
}

// ── Response parsing ─────────────────────────────────────────────────────

function extractJson<T = Record<string, unknown>>(response: string, label: string): T {
  const match = response.match(/```json\s*([\s\S]*?)```/) || response.match(/\{[\s\S]*\}/);
  if (!match) throw new ValidationError(`${label} returned an unparseable response.`);
  try {
    return JSON.parse(match[1] || match[0]);
  } catch {
    throw new ValidationError(`${label} returned invalid JSON.`);
  }
}

// ── Stage runners ────────────────────────────────────────────────────────

interface CreatorOutput {
  canonicalName: string;
  data: Record<string, unknown>;
  reasoning: string;
}
interface BalanceOutput {
  canonicalName: string;
  data: Record<string, unknown>;
  reasoning: string;
  altered: boolean;
}
interface KVGradeOutput {
  suggestedKV: number;
  reasoning: string;
}

async function runStage<T>(
  godheadName: string,
  triggerType: string,
  triggerData: Record<string, unknown>,
  parser: (final: string) => T,
): Promise<{ parsed: T; record: ChainStageRecord }> {
  const agent = await GodHeadAgent.load(godheadName);
  const result = await agent.invoke(triggerType, triggerData);

  if (result.status === 'FAILED' || !result.result) {
    throw new ValidationError(
      `${godheadName} stage failed: ${result.error || 'no response'}`,
    );
  }
  const parsed = parser(result.result);
  return {
    parsed,
    record: {
      godhead: godheadName,
      reasoning: '', // filled by caller from parsed output
      invocationId: result.invocationId,
      inputTokens: result.totalInputTokens,
      outputTokens: result.totalOutputTokens,
    },
  };
}

// ── Inter-stage KRMA helpers ─────────────────────────────────────────────

async function transferBetweenGodheads(params: {
  fromGodheadName: string;
  toGodheadName: string;
  amount: bigint;
  description: string;
  campaignId: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<void> {
  const [from, to] = await Promise.all([
    prisma.godHead.findUnique({ where: { name: params.fromGodheadName } }),
    prisma.godHead.findUnique({ where: { name: params.toGodheadName } }),
  ]);
  if (!from?.walletId) throw new ValidationError(`${params.fromGodheadName} has no wallet`);
  if (!to?.walletId) throw new ValidationError(`${params.toGodheadName} has no wallet`);

  await executeTransaction({
    fromWalletId: from.walletId,
    toWalletId: to.walletId,
    amount: params.amount,
    state: 'FLUID',
    reason: 'BLUEPRINT_CHAIN_HANDOFF',
    description: params.description,
    metadata: params.metadata,
    campaignId: params.campaignId,
    actorId: from.id,
    actorType: 'GODHEAD',
    idempotencyKey: params.idempotencyKey,
  });
}

// ── Core orchestrator ────────────────────────────────────────────────────

export async function authorForgeItem(
  campaignId: string,
  userId: string,
  userRole: string,
  input: ForgeAuthorInput,
): Promise<ForgeAuthorResult> {
  // Permission + campaign load
  if (!isWatcherOrAbove(userRole)) throw new ForbiddenError();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true, name: true, genre: true, worldContext: true },
  });
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.gmUserId !== userId) throw new ForbiddenError('Only the campaign GM can author forge items');

  const schemaGuide = TYPE_SCHEMAS[input.type];
  if (!schemaGuide) throw new ValidationError(`Unsupported forge type: ${input.type}`);

  const isReforge = input.reforge === true;
  const chainFund = isReforge ? CHAIN_FUND_REFORGE : CHAIN_FUND_FIRST;
  const creatorToKai = isReforge ? CREATOR_TO_KAI_REFORGE : CREATOR_TO_KAI_FIRST;
  const kaiToEtherling = isReforge ? KAI_TO_ETHERLING_REFORGE : KAI_TO_ETHERLING_FIRST;

  // ── Selva: route the request (deterministic for now) ─────────────────
  const router = routeWithSelva(input);

  // Resolve all chain participants up front so we fail fast if any are missing.
  const [creator, kai, etherling] = await Promise.all([
    prisma.godHead.findUnique({ where: { name: router.chosenCreator } }),
    prisma.godHead.findUnique({ where: { name: 'Kai' } }),
    prisma.godHead.findUnique({ where: { name: "Eth'erling" } }),
  ]);
  if (!creator?.walletId) throw new NotFoundError(`Creator god-head '${router.chosenCreator}' missing or has no wallet`);
  if (!kai?.walletId) throw new NotFoundError("God-head 'Kai' missing or has no wallet");
  if (!etherling?.walletId) throw new NotFoundError("God-head 'Eth'erling' missing or has no wallet");

  // Charge the campaign — funds the whole chain in one shot.
  const campaignWallet = await prisma.wallet.findFirst({
    where: { campaignId, ownerType: 'CAMPAIGN' },
    select: { id: true },
  });
  if (!campaignWallet) {
    throw new ValidationError('Campaign has no wallet — fund it before authoring');
  }
  const fundIdem = `forge.chain.fund:${campaignId}:${userId}:${input.type}:${input.name}:${Date.now()}`;
  await executeTransaction({
    fromWalletId: campaignWallet.id,
    toWalletId: creator.walletId,
    amount: chainFund,
    state: 'FLUID',
    reason: 'BLUEPRINT_AUTHOR',
    description: `${isReforge ? 'Reforge' : 'Chain'} fund — ${input.type} "${input.name}" (Creator: ${creator.name})`,
    metadata: { type: input.type, requestedName: input.name, chosenCreator: creator.name, reforge: isReforge },
    campaignId,
    actorId: userId,
    actorType: 'GM',
    idempotencyKey: fundIdem,
  });

  const campaignContext = {
    id: campaignId,
    name: campaign.name,
    genre: campaign.genre,
    worldContext: campaign.worldContext,
  };

  // ── Stage 1: Creator drafts ──────────────────────────────────────────
  const creatorStage = await runStage<CreatorOutput>(
    creator.name,
    'forge.author.creator',
    {
      instructions: creatorInstructions(input.type, schemaGuide),
      request: {
        type: input.type,
        requestedName: input.name,
        description: input.description,
        campaignContext: input.campaignContext ?? null,
      },
      campaign: campaignContext,
    },
    (text) => extractJson<CreatorOutput>(text, creator.name),
  );
  creatorStage.record.reasoning = creatorStage.parsed.reasoning;

  // Creator pays Kai for the balance check.
  await transferBetweenGodheads({
    fromGodheadName: creator.name,
    toGodheadName: 'Kai',
    amount: creatorToKai,
    description: `Balance handoff for ${input.type} "${input.name}"`,
    campaignId,
    metadata: { fundIdem, stage: 'creator->kai', reforge: isReforge },
    idempotencyKey: `${fundIdem}:creator->kai`,
  });

  // ── Stage 2: Kai balance-checks ──────────────────────────────────────
  const balanceStage = await runStage<BalanceOutput>(
    'Kai',
    'forge.author.balance',
    {
      instructions: balanceInstructions(),
      creatorOutput: creatorStage.parsed,
      type: input.type,
      schema: schemaGuide,
      campaign: campaignContext,
    },
    (text) => extractJson<BalanceOutput>(text, 'Kai'),
  );
  balanceStage.record.reasoning = balanceStage.parsed.reasoning;

  // Kai pays Et'herling for the KV grading stage.
  await transferBetweenGodheads({
    fromGodheadName: 'Kai',
    toGodheadName: "Eth'erling",
    amount: kaiToEtherling,
    description: `KV grading handoff for ${input.type} "${input.name}"`,
    campaignId,
    metadata: { fundIdem, stage: 'kai->etherling', reforge: isReforge },
    idempotencyKey: `${fundIdem}:kai->etherling`,
  });

  // ── Stage 3: Et'herling grades KV ────────────────────────────────────
  const kvStage = await runStage<KVGradeOutput>(
    "Eth'erling",
    'forge.author.kv_grade',
    {
      instructions: kvGradeInstructions(),
      finalDraft: {
        canonicalName: balanceStage.parsed.canonicalName,
        data: balanceStage.parsed.data,
      },
      type: input.type,
      campaign: campaignContext,
    },
    (text) => extractJson<KVGradeOutput>(text, "Eth'erling"),
  );
  kvStage.record.reasoning = kvStage.parsed.reasoning;

  // ── Build the GM-facing summary (no chain reveal) ────────────────────
  const renamed = balanceStage.parsed.canonicalName !== input.name;
  const summary = [
    `Forged: ${balanceStage.parsed.canonicalName} (${input.type}).`,
    `Stamped at ${kvStage.parsed.suggestedKV} KV.`,
    renamed ? `Renamed from "${input.name}" for catalog clarity.` : null,
  ].filter(Boolean).join(' ');

  // Persist a private audit trail of the chain. GM never sees this.
  // Future: surface to ADMIN-only debug view.
  void recordChainAudit(campaignId, input, {
    router,
    creator: { ...creatorStage.record, reasoning: creatorStage.parsed.reasoning },
    balance: { ...balanceStage.record, reasoning: balanceStage.parsed.reasoning, altered: balanceStage.parsed.altered },
    kvGrade: { ...kvStage.record, reasoning: kvStage.parsed.reasoning, suggestedKV: kvStage.parsed.suggestedKV },
  });

  return {
    type: input.type,
    name: input.name,
    canonicalName: balanceStage.parsed.canonicalName,
    data: balanceStage.parsed.data,
    summary,
    suggestedKV: kvStage.parsed.suggestedKV,
  };
}

// ── Private chain audit trail (server-only; not exposed to GM) ───────────

async function recordChainAudit(
  campaignId: string,
  input: ForgeAuthorInput,
  audit: Record<string, unknown>,
): Promise<void> {
  // Stored as a memory entry on Selva — she is the chain's auditor.
  // Skipped silently if Selva isn't seeded; never blocks the GM-facing path.
  try {
    const selva = await prisma.godHead.findUnique({ where: { name: 'Selva' } });
    if (!selva) return;
    await prisma.godHeadMemory.upsert({
      where: { godHeadId_key: { godHeadId: selva.id, key: `chain.audit.${campaignId}.${Date.now()}` } },
      update: { value: JSON.stringify({ input, audit }) },
      create: {
        godHeadId: selva.id,
        key: `chain.audit.${campaignId}.${Date.now()}`,
        value: JSON.stringify({ input, audit }),
      },
    });
  } catch {
    // Audit failures must never break the authoring response.
  }
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
