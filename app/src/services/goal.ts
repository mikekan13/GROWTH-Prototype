import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter, canViewCharacter, isWatcherOrAbove, isAdminRole } from '@/lib/permissions';
import { emit as emitGodHeadEvent } from './godhead-dispatcher';

// ── Constants ────────────────────────────────────────────────────────────

export const MAX_ACTIVE_GOALS = 5;
export const GOAL_STATUSES = ['ACTIVE', 'DORMANT', 'COMPLETED', 'FAILED', 'ABANDONED'] as const;
export const PILLARS = ['MERCY', 'BALANCE', 'SEVERITY'] as const;

// ── Zod Schemas ──────────────────────────────────────────────────────────

export const createGoalSchema = z.object({
  characterId: z.string().min(1),
  campaignId: z.string().min(1).optional(),
  description: z.string().min(3, 'Goal must be at least 3 characters').max(500),
  priority: z.number().int().min(1).max(5).default(3),
});

export const updateGoalSchema = z.object({
  description: z.string().min(3).max(500).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  resistancePlan: z.string().max(2000).optional(),
  milestones: z.string().optional(), // JSON array
});

export const milestoneSchema = z.object({
  id: z.string(),
  description: z.string().min(1).max(300),
  completed: z.boolean().default(false),
  nectarAwarded: z.boolean().optional(),
  completedAt: z.string().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;

// ── Goal CRUD ────────────────────────────────────────────────────────────

export async function createGoal(
  userId: string,
  userRole: string,
  input: CreateGoalInput,
) {
  // Verify character exists and user can edit it
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot create goals for this character');
  }

  // Enforce active goal limit
  const activeCount = await prisma.goal.count({
    where: { characterId: input.characterId, status: 'ACTIVE' },
  });
  if (activeCount >= MAX_ACTIVE_GOALS) {
    throw new ValidationError(`Maximum ${MAX_ACTIVE_GOALS} active goals per entity`);
  }

  // Use campaign from character if not provided
  const campaignId = input.campaignId ?? character.campaignId;

  const goal = await prisma.goal.create({
    data: {
      characterId: input.characterId,
      campaignId,
      description: input.description,
      priority: input.priority,
    },
  });

  // Fire-and-forget Godhead notification — Eth'erling triages the new goal
  // and decides whether to route it to Kai for pricing / custodian assignment.
  void emitGodHeadEvent('goal.created', {
    goalId: goal.id,
    characterId: goal.characterId,
    campaignId: goal.campaignId,
    description: goal.description,
    priority: goal.priority,
  }).catch(() => { /* dispatcher already logs its own failures */ });

  return goal;
}

export async function getGoal(goalId: string, userId: string, userRole: string) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      character: {
        include: { campaign: true },
      },
    },
  });
  if (!goal) throw new NotFoundError('Goal not found');
  if (!canViewCharacter(userId, userRole, goal.character)) {
    throw new ForbiddenError('Cannot view this goal');
  }
  return goal;
}

export async function listGoals(
  characterId: string,
  userId: string,
  userRole: string,
  status?: string,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canViewCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot view goals for this character');
  }

  return prisma.goal.findMany({
    where: {
      characterId,
      ...(status ? { status } : {}),
    },
    orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function listCampaignGoals(
  campaignId: string,
  userId: string,
  userRole: string,
) {
  // Verify campaign access — GM or admin can see all goals in a campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');

  // Only GM or admin can list all campaign goals
  if (campaign.gmUserId !== userId && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the GM or admin can view all campaign goals');
  }

  return prisma.goal.findMany({
    where: { campaignId },
    include: {
      character: { select: { id: true, name: true, entityType: true } },
    },
    orderBy: [{ status: 'asc' }, { priority: 'asc' }],
  });
}

export async function updateGoal(
  goalId: string,
  userId: string,
  userRole: string,
  input: UpdateGoalInput,
) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { character: { include: { campaign: true } } },
  });
  if (!goal) throw new NotFoundError('Goal not found');
  if (goal.status !== 'ACTIVE') {
    throw new ValidationError('Can only update active goals');
  }

  // Owner or GM can update
  const isOwner = goal.character.userId === userId;
  const isGM = goal.character.campaign?.gmUserId === userId;
  if (!isOwner && !isGM && !isAdminRole(userRole)) {
    throw new ForbiddenError('Cannot update this goal');
  }

  // Only GM/admin can set resistance plan
  if (input.resistancePlan !== undefined && !isGM && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the GM can set resistance plans');
  }

  // Validate milestones JSON if provided
  if (input.milestones !== undefined) {
    try {
      const ms = JSON.parse(input.milestones);
      z.array(milestoneSchema).parse(ms);
    } catch {
      throw new ValidationError('Invalid milestones format');
    }
  }

  return prisma.goal.update({
    where: { id: goalId },
    data: {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.resistancePlan !== undefined ? { resistancePlan: input.resistancePlan } : {}),
      ...(input.milestones !== undefined ? { milestones: input.milestones } : {}),
    },
  });
}

export async function abandonGoal(goalId: string, userId: string, userRole: string) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { character: { include: { campaign: true } } },
  });
  if (!goal) throw new NotFoundError('Goal not found');
  if (goal.status !== 'ACTIVE' && goal.status !== 'DORMANT') {
    throw new ValidationError('Can only abandon active or dormant goals');
  }

  // Only GM or admin can abandon — abandonment carries a KRMA cost
  const isGM = goal.character.campaign?.gmUserId === userId;
  if (!isGM && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the GM or admin can abandon goals');
  }

  // NO flat or proportional KRMA cost on abandonment (locked Mike 2026-05-19).
  // Goals are declared intentions; the investors are the Godheads (via the
  // Opportunity flow that feeds the goal). Abandonment is a Godhead REACTION
  // event — the godhead that invested Opportunities into this goal evaluates
  // contextually (investment size, thread progress, narrative weight) and may
  // apply a Thorn directly via the existing trait CRUD path. No new penalty
  // subsystem; reuses the existing Thorn mechanic.
  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { status: 'ABANDONED', completedAt: new Date() },
  });

  void emitGodHeadEvent('goal.abandoned', {
    goalId: updated.id,
    characterId: updated.characterId,
    campaignId: updated.campaignId,
    // Custodian gets first crack at reacting; if none, Eth'erling triages.
    custodianName: updated.custodianName,
  }).catch(() => { /* swallow */ });

  return updated;
}

/** GM/admin permission check shared by the lifecycle transitions (T34).
 *  Pass no userId for SYSTEM callers (godhead custodian tools). */
async function requireGoalGm(goalId: string, userId?: string, userRole?: string) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { character: { include: { campaign: true } } },
  });
  if (!goal) throw new NotFoundError('Goal not found');
  if (userId !== undefined) {
    const isGM = goal.character.campaign?.gmUserId === userId;
    if (!isGM && !isAdminRole(userRole ?? '')) {
      throw new ForbiddenError('Only the GM or admin can transition goals');
    }
  }
  return goal;
}

/**
 * Mark a goal as completed. Callable by the GM from the goal card (T34)
 * or by God-head custodian tools (system caller, no userId). Either way
 * the transition routes through the goal.completed dispatcher event —
 * never a silent state flip.
 */
export async function completeGoal(goalId: string, userId?: string, userRole?: string) {
  const goal = await requireGoalGm(goalId, userId, userRole);
  if (goal.status !== 'ACTIVE' && goal.status !== 'DORMANT') {
    throw new ValidationError('Can only complete active or dormant goals');
  }

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  void emitGodHeadEvent('goal.completed', {
    goalId: updated.id,
    characterId: updated.characterId,
    campaignId: updated.campaignId,
    custodianName: updated.custodianName,
  }).catch(() => { /* swallow */ });

  return updated;
}

/**
 * Mark a goal as failed. Callable by the GM from the goal card (T34) or by
 * God-head custodian tools (system caller, no userId). Routes through the
 * goal.failed dispatcher event — never a silent state flip.
 */
export async function failGoal(goalId: string, userId?: string, userRole?: string) {
  const goal = await requireGoalGm(goalId, userId, userRole);
  if (goal.status !== 'ACTIVE' && goal.status !== 'DORMANT') {
    throw new ValidationError('Can only fail active or dormant goals');
  }

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: { status: 'FAILED', completedAt: new Date() },
  });

  void emitGodHeadEvent('goal.failed', {
    goalId: updated.id,
    characterId: updated.characterId,
    campaignId: updated.campaignId,
    custodianName: updated.custodianName,
  }).catch(() => { /* swallow */ });

  return updated;
}

/**
 * ACTIVE → DORMANT (T34): the goal sleeps — still on the sheet, not counted
 * against the active cap, no terminal outcome. No dispatcher event (the T31
 * event list is enumerated and dormancy is not a godhead-reaction moment).
 */
export async function setGoalDormant(goalId: string, userId: string, userRole: string) {
  const goal = await requireGoalGm(goalId, userId, userRole);
  if (goal.status !== 'ACTIVE') {
    throw new ValidationError('Can only make active goals dormant');
  }
  return prisma.goal.update({
    where: { id: goalId },
    data: { status: 'DORMANT' },
  });
}

/** DORMANT → ACTIVE (T34). Re-enforces the active-goal cap. */
export async function reactivateGoal(goalId: string, userId: string, userRole: string) {
  const goal = await requireGoalGm(goalId, userId, userRole);
  if (goal.status !== 'DORMANT') {
    throw new ValidationError('Can only reactivate dormant goals');
  }
  const activeCount = await prisma.goal.count({
    where: { characterId: goal.characterId, status: 'ACTIVE' },
  });
  if (activeCount >= MAX_ACTIVE_GOALS) {
    throw new ValidationError(`Maximum ${MAX_ACTIVE_GOALS} active goals per entity`);
  }
  return prisma.goal.update({
    where: { id: goalId },
    data: { status: 'ACTIVE' },
  });
}

// ── Custodian Assignment (called from goal-custodian service) ─────────

export async function assignCustodian(
  goalId: string,
  custodianId: string,
  custodianName: string,
  pillar: string,
) {
  return prisma.goal.update({
    where: { id: goalId },
    data: { custodianId, custodianName, pillar },
  });
}

/**
 * GM changes a goal's custodian godhead (T34). Council Router / adopt_goal
 * assign automatically; this is the GM override from the goal card.
 */
export async function setCustodian(
  goalId: string,
  userId: string,
  userRole: string,
  custodianId: string,
) {
  await requireGoalGm(goalId, userId, userRole);
  const godhead = await prisma.godHead.findUnique({
    where: { id: custodianId },
    select: { id: true, name: true, pillar: true },
  });
  if (!godhead) throw new NotFoundError('Godhead not found');
  return assignCustodian(goalId, godhead.id, godhead.name, godhead.pillar);
}

// ── GM Resistance Notes ──────────────────────────────────────────────

/** GM's personal notes about resistance strategy. The actual resistance
 *  is entity-based (EntityRelationship edges of type 'resisted_by'). */
export async function setResistanceNotes(goalId: string, notes: string) {
  return prisma.goal.update({
    where: { id: goalId },
    data: { resistancePrompt: notes },
  });
}

// ── Opportunity Event ────────────────────────────────────────────────

export const opportunitySchema = z.object({
  goalId: z.string().min(1),
  description: z.string().min(3).max(1000),
  narrative: z.string().max(2000).optional(),
});
export type OpportunityInput = z.infer<typeof opportunitySchema>;

/**
 * GM (or character owner) declares that an opportunity has arisen for
 * this goal. Per GRO.WTH canon: the **O** of GROwth — a moment of leverage
 * where progress accelerates or derails. Recorded as a campaign event so
 * the Terminal surfaces it, and emitted via godhead-dispatcher so custodian
 * godheads (Eth'erling triage, Kai pricing) can react.
 *
 * Does NOT mutate Goal status. Use completeGoal/failGoal for that.
 */
export async function declareOpportunity(
  userId: string,
  userRole: string,
  input: OpportunityInput,
) {
  const validated = opportunitySchema.parse(input);
  const goal = await prisma.goal.findUnique({
    where: { id: validated.goalId },
    include: { character: { include: { campaign: { select: { id: true, gmUserId: true } } } } },
  });
  if (!goal) throw new NotFoundError('Goal not found');
  const isOwner = goal.character.userId === userId;
  const isGM = goal.character.campaign?.gmUserId === userId;
  if (!isGM && !isOwner && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the GM or the character owner may declare an opportunity');
  }

  const campaignId = goal.character.campaign?.id;
  if (campaignId) {
    const { createCampaignEvent } = await import('./campaign-event');
    await createCampaignEvent({
      campaignId,
      type: 'game_event',
      actor: isGM ? 'gm' : 'player',
      actorUserId: userId,
      actorName: isGM ? 'GM' : 'Player',
      characterId: goal.characterId,
      characterName: goal.character.name,
      payload: {
        kind: 'game_event',
        eventType: 'opportunity_arose',
        description: `Opportunity arose for goal "${goal.description}": ${validated.description}`,
      },
    }).catch(() => { /* event log is non-critical */ });
  }

  // Persist the opportunity on the goal (T33) so the card can list and
  // resolve it. JSON array column, same pattern as milestones.
  const opportunityId = crypto.randomUUID();
  const opportunities = parseOpportunities(goal.opportunities);
  opportunities.push({
    id: opportunityId,
    description: validated.description,
    narrative: validated.narrative,
    status: 'OPEN',
    declaredAt: new Date().toISOString(),
  });
  await prisma.goal.update({
    where: { id: validated.goalId },
    data: { opportunities: JSON.stringify(opportunities) },
  });

  // Use 'goal.created' as the closest existing dispatcher event until the
  // routing table is extended with 'goal.opportunity'. Payload carries the
  // op marker so handlers can distinguish.
  void emitGodHeadEvent('goal.created', {
    opportunity: true,
    goalId: validated.goalId,
    goalDescription: goal.description,
    characterId: goal.characterId,
    custodianGodHeadId: goal.custodianId,
    description: validated.description,
    narrative: validated.narrative,
  });

  return { ok: true, goalId: validated.goalId, opportunityId };
}

// ── Opportunity Resolution (T33) ─────────────────────────────────────

export interface GoalOpportunity {
  id: string;
  description: string;
  narrative?: string;
  status: 'OPEN' | 'RESOLVED';
  /** SEIZED = the moment advanced the goal; MISSED = it slipped away. */
  outcome?: 'SEIZED' | 'MISSED';
  /** How it resolved: a skill check, a KRMA spend, or pure narrative. */
  method?: 'check' | 'krma' | 'narrative';
  note?: string;
  declaredAt: string;
  resolvedAt?: string;
}

function parseOpportunities(raw: string | null): GoalOpportunity[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export const resolveOpportunitySchema = z.object({
  goalId: z.string().min(1),
  opportunityId: z.string().min(1),
  outcome: z.enum(['SEIZED', 'MISSED']),
  method: z.enum(['check', 'krma', 'narrative']),
  /** e.g. the check result ("Lockpicking vs DR 12 — success") or KRMA amount. */
  note: z.string().max(500).optional(),
});
export type ResolveOpportunityInput = z.infer<typeof resolveOpportunitySchema>;

/**
 * GM resolves an open opportunity (T33): the moment resolved via a skill
 * check (run through the normal check flow — record its result here), a
 * KRMA spend, or narrative fiat. Logged as a campaign event.
 */
export async function resolveOpportunity(
  userId: string,
  userRole: string,
  input: ResolveOpportunityInput,
) {
  const validated = resolveOpportunitySchema.parse(input);
  const goal = await requireGoalGm(validated.goalId, userId, userRole);

  const opportunities = parseOpportunities(goal.opportunities);
  const opp = opportunities.find(o => o.id === validated.opportunityId);
  if (!opp) throw new NotFoundError('Opportunity not found on this goal');
  if (opp.status === 'RESOLVED') {
    throw new ValidationError('Opportunity already resolved');
  }

  opp.status = 'RESOLVED';
  opp.outcome = validated.outcome;
  opp.method = validated.method;
  opp.note = validated.note;
  opp.resolvedAt = new Date().toISOString();

  await prisma.goal.update({
    where: { id: validated.goalId },
    data: { opportunities: JSON.stringify(opportunities) },
  });

  const campaignId = goal.character.campaign?.id;
  if (campaignId) {
    const { createCampaignEvent } = await import('./campaign-event');
    await createCampaignEvent({
      campaignId,
      type: 'game_event',
      actor: 'gm',
      actorUserId: userId,
      actorName: 'GM',
      characterId: goal.characterId,
      characterName: goal.character.name,
      payload: {
        kind: 'game_event',
        eventType: 'opportunity_resolved',
        description: `Opportunity ${validated.outcome === 'SEIZED' ? 'seized' : 'missed'} (${validated.method}) on goal "${goal.description}": ${opp.description}${validated.note ? ` — ${validated.note}` : ''}`,
      },
    }).catch(() => { /* event log is non-critical */ });
  }

  return { ok: true, opportunity: opp };
}
