/**
 * WP12 — persona-harness authoring plumbing ("test canvas").
 *
 * This is the FLOW that lets a GM/ADMIN take an existing Character (created
 * through the normal character-creation surface — services/character.ts —
 * with no new sheet mechanics) and turn it into a living DAYA entity: wrap
 * it, author the soul-level params the standard sheet doesn't have
 * (introspection, persona voice/bias, identity narrative), seed her initial
 * vines (existing goal service) and seed memories (DayaMemoryEntry rows),
 * and flip the enable gate. WP12 provides no personality of its own — every
 * value here comes from whoever calls these functions (a GM form or a JEWL
 * tool, per Addendum C).
 *
 * All mutation entry points here are GM/ADMIN-gated (isWatcherOrAbove) —
 * DAYA authoring is a Watcher-console-and-above action, never a player one.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { currentCycleOf } from '@/services/history';
import { createGoal, declareOpportunity, setGoalDormant } from '@/services/goal';
import type { GrowthCharacter } from '@/types/growth';

import { resolveDayaEntityId } from './entity';
import { applyRevision, type BiasProfile, type VoiceParams } from './renderer';
import { writeMemoryEntry } from './memory';
import { sealLint, hasHardHit } from './seal';

function requireGmOrAdmin(actorRole: string): void {
  if (!isWatcherOrAbove(actorRole)) {
    throw new ForbiddenError('GM/ADMIN only — persona-harness authoring is Watcher-console-and-above');
  }
}

async function loadCharacterOrThrow(characterId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  return character;
}

function safeParseSheet(raw: string | null | undefined): Partial<GrowthCharacter> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<GrowthCharacter>) : null;
  } catch {
    return null;
  }
}

export interface PersonaProfileData {
  voice?: VoiceParams;
  bias?: BiasProfile;
  identityNarrative?: string;
  voiceNotes?: string;
}

function parsePersonaProfile(raw: string): PersonaProfileData {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as PersonaProfileData) : {};
  } catch {
    return {};
  }
}

// ── 1. Wrap: create/enable the 1:1 DayaEntity substrate ─────────────────

export interface WrapResult {
  entityId: string;
  characterId: string;
  status: string;
  alreadyWrapped: boolean;
  believedRevised: boolean;
}

/**
 * Given an existing Character, create-if-missing its 1:1 DayaEntity +
 * DayaAffect baseline, and — on first wrap only — run the WP5 renderer's
 * believed-sheet revision ONCE so her believed mirror starts diverging from
 * the true sheet realistically (spec §2). Idempotent: calling this again on
 * an already-wrapped character is a no-op past the initial creation (no
 * re-revision, no state reset) and simply reports current state.
 */
export async function wrapCharacterAsDaya(characterId: string, actorRole: string): Promise<WrapResult> {
  requireGmOrAdmin(actorRole);
  const character = await loadCharacterOrThrow(characterId);

  const existing = await prisma.dayaEntity.findUnique({ where: { characterId } });
  const isNew = !existing;

  const entityId = await resolveDayaEntityId(characterId);
  const cycle = character.campaignId ? await currentCycleOf(character.campaignId) : 0;

  await prisma.dayaAffect.upsert({
    where: { entityId },
    create: { entityId, morale: 0, stress: 0, grief: 0, lastCycle: cycle },
    update: {},
  });

  let believedRevised = false;
  if (isNew) {
    const sheet = safeParseSheet(character.data);
    const willpower = sheet?.attributes?.willpower;
    if (willpower) {
      const entityRow = await prisma.dayaEntity.findUniqueOrThrow({ where: { id: entityId } });
      const persona = parsePersonaProfile(entityRow.personaProfile);
      const trueStat = {
        current: willpower.current,
        max: willpower.level + willpower.augmentPositive - willpower.augmentNegative,
      };
      await applyRevision(
        characterId,
        'pool.willpower',
        trueStat,
        { attunement: entityRow.introspection, biasProfile: persona.bias ?? {}, mood: { morale: 0, stress: 0, grief: 0 } },
        'self-stat',
      );
      believedRevised = true;
    }
  }

  const entity = await prisma.dayaEntity.findUniqueOrThrow({ where: { id: entityId } });
  return { entityId, characterId, status: entity.status, alreadyWrapped: !isNew, believedRevised };
}

// ── 2. Author: the soul-level params not on the standard sheet ──────────

export interface AuthoringUpdateInput {
  introspection?: number; // 0..1
  voice?: VoiceParams;
  bias?: BiasProfile;
  identityNarrative?: string;
  voiceNotes?: string;
}

export interface AuthoringUpdateResult {
  entityId: string;
  introspection: number;
  persona: PersonaProfileData;
}

/**
 * Updates the soul-level authoring params — introspection, persona voice/
 * bias operators, identity narrative. All fields optional and independently
 * settable; live-editable after wake (spec §8 — Mike's first roleplay
 * session WILL produce change requests, so nothing here is a one-shot).
 * Requires the character to already be wrapped (call wrapCharacterAsDaya
 * first).
 */
export async function updateDayaAuthoring(
  characterId: string,
  actorRole: string,
  input: AuthoringUpdateInput,
): Promise<AuthoringUpdateResult> {
  requireGmOrAdmin(actorRole);
  if (input.introspection !== undefined && (input.introspection < 0 || input.introspection > 1)) {
    throw new ValidationError('introspection must be between 0 and 1');
  }

  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity) throw new NotFoundError('Character is not wrapped as a DAYA entity yet — wrap it first');

  const persona = parsePersonaProfile(entity.personaProfile);
  const nextPersona: PersonaProfileData = {
    ...persona,
    ...(input.voice !== undefined ? { voice: input.voice } : {}),
    ...(input.bias !== undefined ? { bias: input.bias } : {}),
    ...(input.identityNarrative !== undefined ? { identityNarrative: input.identityNarrative } : {}),
    ...(input.voiceNotes !== undefined ? { voiceNotes: input.voiceNotes } : {}),
  };

  const updated = await prisma.dayaEntity.update({
    where: { characterId },
    data: {
      ...(input.introspection !== undefined ? { introspection: input.introspection } : {}),
      personaProfile: JSON.stringify(nextPersona),
    },
  });

  return { entityId: updated.id, introspection: updated.introspection, persona: nextPersona };
}

// ── 3. Seed initial vines (existing goal service — life, not quests) ────

export interface SeedVineInput {
  description: string;
  priority?: number;
  dormant?: boolean;
  opportunity?: { description: string; narrative?: string };
}

export interface SeedVineResult {
  goalId: string;
  description: string;
  dormant: boolean;
  opportunityId?: string;
}

/**
 * Seeds 1-3 initial goals ("vines") for a newly-authored entity via the
 * EXISTING goal service (services/goal.ts) — no new goal mechanics. Phrased
 * as life, not quests, per spec §2. `actorUserId` is passed straight through
 * to createGoal/declareOpportunity's ownership checks; an ADMIN caller
 * passes their own session id and canEditCharacter's isAdminRole branch
 * covers it regardless of character ownership.
 */
export async function seedInitialVines(
  characterId: string,
  actorUserId: string,
  actorRole: string,
  vines: SeedVineInput[],
): Promise<SeedVineResult[]> {
  requireGmOrAdmin(actorRole);
  if (vines.length === 0) throw new ValidationError('At least one vine is required');
  if (vines.length > 3) throw new ValidationError('At most 3 initial vines (spec §2)');

  await loadCharacterOrThrow(characterId);

  const results: SeedVineResult[] = [];
  for (const v of vines) {
    const goal = await createGoal(actorUserId, actorRole, {
      characterId,
      description: v.description,
      priority: v.priority ?? 3,
    });

    let dormant = false;
    if (v.dormant) {
      await setGoalDormant(goal.id, actorUserId, actorRole);
      dormant = true;
    }

    let opportunityId: string | undefined;
    if (v.opportunity) {
      const opp = await declareOpportunity(actorUserId, actorRole, {
        goalId: goal.id,
        description: v.opportunity.description,
        narrative: v.opportunity.narrative,
      });
      opportunityId = opp.opportunityId;
    }

    results.push({ goalId: goal.id, description: v.description, dormant, opportunityId });
  }
  return results;
}

// ── 4. Seed memories (DayaMemoryEntry rows, sealLint-checked) ───────────

export interface SeedMemoryInput {
  content: string;
  valence?: number;
  arousal?: number;
  salience?: number;
  cycle?: number;
  source?: string;
}

/**
 * Writes N seeded DayaMemoryEntry rows directly (memory.ts's writeMemoryEntry
 * — no tagger call, this content is GM-authored, not tagged stimulus).
 * All-or-nothing: every memory's content is sealLint-checked for mechanical
 * vocabulary BEFORE any row is written, so a rejected seed never leaves a
 * partial batch behind (spec §2: "all seed content sealLint-checked").
 * Requires the character to already be wrapped.
 */
export async function seedEntityMemories(
  characterId: string,
  actorRole: string,
  memories: SeedMemoryInput[],
): Promise<{ memoryEntryId: string }[]> {
  requireGmOrAdmin(actorRole);
  if (memories.length === 0) throw new ValidationError('At least one memory is required');

  const character = await loadCharacterOrThrow(characterId);
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity) throw new NotFoundError('Character is not wrapped as a DAYA entity yet — wrap it first');

  const cycleFallback = character.campaignId ? await currentCycleOf(character.campaignId) : 0;

  memories.forEach((m, i) => {
    const hits = sealLint(m.content);
    if (hasHardHit(hits)) {
      const hit = hits.find((h) => h.severity === 'HARD');
      throw new ValidationError(
        `Seed memory #${i + 1} contains mechanical vocabulary (embodiment seal, pattern "${hit?.pattern}") — rewrite it in lived terms`,
      );
    }
  });

  const results: { memoryEntryId: string }[] = [];
  for (const m of memories) {
    const row = await writeMemoryEntry({
      entityId: entity.id,
      narrativeCycle: m.cycle ?? cycleFallback,
      source: m.source ?? 'seed',
      content: m.content,
      valence: m.valence ?? 0,
      arousal: m.arousal ?? 0,
      salience: m.salience ?? 0.3,
      classification: { contentCategory: 'perception', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'authored seed memory' },
    });
    results.push({ memoryEntryId: row.id });
  }
  return results;
}

// ── 5. Enable / wake gate ────────────────────────────────────────────────

export type DayaEntityStatus = 'DORMANT' | 'ACTIVE' | 'ARCHIVED';

/**
 * DayaEntity.status DORMANT<->ACTIVE gate (spec §4) — the wake loop only
 * runs for ACTIVE entities. "She does not wake until Mike says so", now
 * flipped by Mike in-app.
 */
export async function setDayaStatus(
  characterId: string,
  actorRole: string,
  status: Extract<DayaEntityStatus, 'ACTIVE' | 'DORMANT'>,
): Promise<{ status: string }> {
  requireGmOrAdmin(actorRole);
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity) throw new NotFoundError('Character is not wrapped as a DAYA entity yet — wrap it first');
  const updated = await prisma.dayaEntity.update({ where: { characterId }, data: { status } });
  return { status: updated.status };
}

// ── 6. Read state (GM view) ──────────────────────────────────────────────

export interface DayaAuthoringState {
  wrapped: boolean;
  entityId?: string;
  status?: string;
  introspection?: number;
  persona?: PersonaProfileData;
  affect?: { morale: number; stress: number; grief: number };
  believed?: Record<string, unknown> | null;
  goals: Array<{ id: string; description: string; status: string; priority: number }>;
  recentMemories: Array<{ id: string; content: string; source: string; narrativeCycle: number; realTime: Date }>;
}

export async function getDayaAuthoringState(characterId: string): Promise<DayaAuthoringState> {
  await loadCharacterOrThrow(characterId);

  const goals = await prisma.goal.findMany({
    where: { characterId },
    select: { id: true, description: true, status: true, priority: true },
    orderBy: { createdAt: 'desc' },
  });

  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity) {
    return { wrapped: false, goals, recentMemories: [] };
  }

  const [affect, believedSheet, memories] = await Promise.all([
    prisma.dayaAffect.findUnique({ where: { entityId: entity.id } }),
    prisma.dayaBelievedSheet.findUnique({ where: { entityId: entity.id } }),
    prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id }, orderBy: { realTime: 'desc' }, take: 20 }),
  ]);

  let believed: Record<string, unknown> | null = null;
  if (believedSheet?.data) {
    try {
      believed = JSON.parse(believedSheet.data) as Record<string, unknown>;
    } catch {
      believed = null;
    }
  }

  return {
    wrapped: true,
    entityId: entity.id,
    status: entity.status,
    introspection: entity.introspection,
    persona: parsePersonaProfile(entity.personaProfile),
    affect: affect ? { morale: affect.morale, stress: affect.stress, grief: affect.grief } : undefined,
    believed,
    goals,
    recentMemories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      source: m.source,
      narrativeCycle: m.narrativeCycle,
      realTime: m.realTime,
    })),
  };
}
