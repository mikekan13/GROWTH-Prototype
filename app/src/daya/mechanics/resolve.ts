/**
 * Effort resolution + pool-spend persistence — persona harness mechanics
 * coupling. This is the entity path that replaces the Adjudicator's
 * placeholder `unskilledCheck(effort:0)` roll whenever a fitting skill (or
 * at least a governing attribute) applies: it wagers real effort (effort.ts),
 * adjusts DR for skill specificity (skill-fit.ts), rolls the real check
 * (lib/dice.ts), and persists the pool spend through the same pure ops the
 * rest of the engine uses (lib/character-actions.ts's spendAttribute).
 *
 * DUPLICATION NOTE: the formula here (skillDie + fateDie + effort +
 * traitFlat vs DR) mirrors `app/api/campaigns/[id]/skill-check/wager/route.ts`
 * exactly on purpose — that route is live player-facing code and is NOT
 * touched by this work. Extracting one shared resolver both paths call is a
 * legitimate follow-up, not done here.
 *
 * Also owns: vine progress wiring (Ruling 22 — resolves EXISTING open
 * GoalOpportunities only, never injects/forces one) and a rest/recovery path
 * so a drained pool can actually come back (WP8 spec §6/§7).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type { GrowthCharacter } from '@/types/growth';
import type { AttributeName } from '@/lib/character-actions';
import { spendAttribute, restShort, restLong } from '@/lib/character-actions';
import { markAttributeTrainable, markSkillTrainable } from '@/services/advancement';
import { gatherTraitModifiers } from '@/services/trait-modifiers';
import { applyDispositionEvent } from '@/services/daya-affect';
import { resolveOpportunity, type GoalOpportunity } from '@/services/goal';
import { skilledCheck, unskilledCheck } from '@/lib/dice';
import { ROUTER_TUNING } from '../router';
import { stemmedJaccard } from '../recall';
import { getBelievedValue } from '../renderer';
import type { DayaClientOverrides } from '../model-client';
import type { EffortContext } from '../prompts/roles/body';
import { computeEffort } from './effort';
import { judgeSkillFit, selectCandidateSkills } from './skill-fit';

const ATTRIBUTE_KEYS = ['clout', 'celerity', 'constitution', 'flow', 'frequency', 'focus', 'willpower', 'wisdom', 'wit'] as const;
type AttrKey = (typeof ATTRIBUTE_KEYS)[number];
function isAttributeKey(v: string): v is AttrKey {
  return (ATTRIBUTE_KEYS as readonly string[]).includes(v);
}

function poolMaxFor(attr: { level: number; augmentPositive?: number; augmentNegative?: number }, attrName: string): number {
  if (attrName === 'frequency') return attr.level;
  return attr.level + (attr.augmentPositive || 0) - (attr.augmentNegative || 0);
}

// ── Resolution entry point ─────────────────────────────────────────────────

export interface ResolveEffortCheckInput {
  characterId: string;
  /** Body outward's physically-specific intent text — used for skill-fit matching. */
  intent: string;
  /** The adjudicator-declared governing attribute (fallback when untrained). */
  attribute: string;
  /** Base DR from the adjudicator, BEFORE skill-specificity adjustment. */
  dr: number;
  effortContext: EffortContext;
  /** 0..1 how much this matters right now (effort.ts's care scalar). */
  care: number;
  overrides?: DayaClientOverrides;
}

export interface ResolveEffortCheckResult {
  total: number;
  success: boolean;
  margin: number;
  drBase: number;
  drFinal: number;
  drAdjust: number;
  effortSpent: number;
  extraDamage: number;
  governingAttribute: string;
  skillUsed: string | null;
  skillLevel: number;
  isSkilled: boolean;
  fit: number;
}

/**
 * Resolves ONE effort-backed check for a DAYA entity: skill-fit judge -> DR
 * adjustment -> effort wager -> roll -> persist the pool spend (always, win
 * or lose — confirmed unconditional per the wager route) -> trainable mark
 * on fail -> DispositionEvent so affect actually moves. Returns null only
 * when the character can't be loaded/parsed (defensive — caller degrades to
 * the adjudicator's own unskilledCheck path).
 */
export async function resolveEffortCheck(input: ResolveEffortCheckInput): Promise<ResolveEffortCheckResult | null> {
  const character = await prisma.character.findUnique({ where: { id: input.characterId } });
  if (!character) return null;
  let sheet: GrowthCharacter;
  try {
    sheet = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    return null;
  }

  const candidates = selectCandidateSkills(input.intent, sheet.skills ?? []);
  const fitResult = await judgeSkillFit(input.intent, candidates, input.overrides ?? {});

  const governingAttribute = isAttributeKey(fitResult.governors[0] ?? '')
    ? (fitResult.governors[0] as AttrKey)
    : isAttributeKey(input.attribute)
      ? (input.attribute as AttrKey)
      : 'willpower'; // defensive fallback — the adjudicator should always supply a valid attribute name

  const attr = sheet.attributes?.[governingAttribute];
  const poolCurrent = attr?.current ?? 0;
  const poolMax = attr ? poolMaxFor(attr, governingAttribute) : 0;

  // BELIEVED skill level (Ruling 10) — never the true sheet's. Falls back to
  // the true level only when no belief has been recorded yet (a fresh
  // entity's belief starts equal to truth until distorted by renderer.ts).
  const believedSkillLevel = fitResult.skill
    ? (await getBelievedValue(input.characterId, `skills.${fitResult.skill}.level`)) ?? fitResult.level
    : 0;

  const effort = computeEffort({
    effortContext: input.effortContext,
    care: input.care,
    believedSkillLevel,
    poolCurrent,
  });

  const drAdjust = fitResult.skill ? fitResult.drAdjust : 0;
  const drFinal = Math.max(1, input.dr - drAdjust);

  const traitMods = gatherTraitModifiers(sheet, { skillName: fitResult.skill ?? undefined, governorAttribute: governingAttribute });
  const fateDie = sheet.creation?.seed?.baseFateDie ?? 'd8';

  const rollResult = fitResult.skill
    ? skilledCheck({ skillLevel: fitResult.level, fateDie, effort: effort.effortPoints, dr: drFinal, flatModifiers: traitMods.totalFlat })
    : unskilledCheck({ fateDie, effort: effort.effortPoints, dr: drFinal, flatModifiers: traitMods.totalFlat });

  // NEEDS-MIKE (WP8 spec §9): no codified narrative-harm -> pool-damage
  // mapping exists yet. Conservative proposal implemented here: a small,
  // margin-scaled amount ONLY on a FAILED check that was already hard-or-
  // harder (dr >= ROUTER_TUNING.difficulty.hardMin) — trivial/standard
  // failures cost nothing beyond the effort already wagered. Capped at 2
  // points so a guess never masquerades as a real damage table.
  const extraDamage =
    !rollResult.success && drFinal >= ROUTER_TUNING.difficulty.hardMin
      ? Math.min(2, Math.max(0, Math.round(Math.abs(rollResult.margin) / 4)))
      : 0;

  const totalSpend = effort.effortPoints + extraDamage;

  if (totalSpend > 0 && attr) {
    const spendResult = spendAttribute(sheet, governingAttribute as AttributeName, totalSpend);
    let next = spendResult.character;
    if (!rollResult.success) {
      next = fitResult.skill ? markSkillTrainable(next, fitResult.skill) : markAttributeTrainable(next, governingAttribute);
    }
    await prisma.character.update({ where: { id: input.characterId }, data: { data: JSON.stringify(next) } });

    const currentAfter = next.attributes?.[governingAttribute]?.current ?? 0;
    // Awaited (not fire-and-forget) — the caller (and tests) rely on the
    // affect shift being visible immediately after resolveEffortCheck
    // returns; applyDispositionEvent already catches internally, so this
    // never turns a disposition hiccup into a resolution failure.
    await applyDispositionEvent(input.characterId, {
      kind: 'pool_spent',
      attribute: governingAttribute,
      amount: totalSpend,
      current: currentAfter,
      max: poolMax,
    });
  } else if (!rollResult.success) {
    // No pool to spend from (e.g. attribute missing) but still mark trainable on fail.
    const marked = fitResult.skill ? markSkillTrainable(sheet, fitResult.skill) : markAttributeTrainable(sheet, governingAttribute);
    await prisma.character.update({ where: { id: input.characterId }, data: { data: JSON.stringify(marked) } });
  }

  return {
    total: rollResult.total,
    success: rollResult.success,
    margin: rollResult.margin,
    drBase: input.dr,
    drFinal,
    drAdjust,
    effortSpent: effort.effortPoints,
    extraDamage,
    governingAttribute,
    skillUsed: fitResult.skill,
    skillLevel: fitResult.level,
    isSkilled: !!fitResult.skill,
    fit: fitResult.fit,
  };
}

// ── Vine progress (Ruling 22 — existing opportunities ONLY) ────────────────

interface AdjudicationOutcomeShape {
  outcome: string;
  experienceEvent: { content: string; valence: number; salience: number };
  roll?: { attribute: string; dr: number; total: number; success: boolean };
}

const VINE_MATCH_THRESHOLD = 0.15;

function parseOpportunitiesLocal(raw: string | null): GoalOpportunity[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as GoalOpportunity[]) : [];
  } catch {
    return [];
  }
}

/**
 * Checks whether a resolved (checked) adjudication outcome matches an
 * EXISTING open GoalOpportunity on one of the entity's active goals closely
 * enough to resolve it — SEIZED on a successful check, MISSED on a failed
 * one. Only ever resolves an opportunity a GM/Godhead already declared;
 * never creates or forces one (Ruling 22). Returns null when nothing
 * matches, including when the adjudication carried no check at all (pure
 * narrative outcomes never auto-advance a vine).
 */
export async function maybeAdvanceVine(
  characterId: string,
  adjudication: AdjudicationOutcomeShape,
): Promise<{ goalId: string; opportunityId: string; outcome: 'SEIZED' | 'MISSED' } | null> {
  if (!adjudication.roll) return null;

  const goals = await prisma.goal.findMany({
    where: { characterId, status: 'ACTIVE' },
    select: { id: true, description: true, opportunities: true },
  });
  if (goals.length === 0) return null;

  const cueText = `${adjudication.outcome} ${adjudication.experienceEvent.content}`;
  let best: { goalId: string; opportunityId: string; score: number } | null = null;

  for (const g of goals) {
    for (const opp of parseOpportunitiesLocal(g.opportunities)) {
      if (opp.status !== 'OPEN') continue;
      const score = stemmedJaccard(cueText, `${g.description} ${opp.description}`);
      if (score >= VINE_MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { goalId: g.id, opportunityId: opp.id, score };
      }
    }
  }
  if (!best) return null;

  const outcome: 'SEIZED' | 'MISSED' = adjudication.roll.success ? 'SEIZED' : 'MISSED';
  const note = `${adjudication.roll.attribute} check vs DR ${adjudication.roll.dr} -> total ${adjudication.roll.total}`;
  await resolveOpportunity(undefined, undefined, { goalId: best.goalId, opportunityId: best.opportunityId, outcome, method: 'check', note });
  return { goalId: best.goalId, opportunityId: best.opportunityId, outcome };
}

// ── Rest / recovery (WP8 spec §7) ──────────────────────────────────────────

/**
 * Applies an existing rest op (character-actions.ts) and fires the
 * matching DispositionEvent so recovery is felt, not just numeric. Returns
 * applied:false (no persistence, no event) when the rest couldn't apply
 * (e.g. Overwhelmed blocking a Short Rest) — mirrors restShort's own guard.
 */
export async function restAndRecover(characterId: string, kind: 'short' | 'long' = 'short'): Promise<{ applied: boolean; changes: string[] }> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return { applied: false, changes: [] };
  let sheet: GrowthCharacter;
  try {
    sheet = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    return { applied: false, changes: [] };
  }
  // Defensive: restShort/restLong (character-actions.ts) assume a fully-shaped
  // `conditions` object — a minimal/legacy sheet missing it would otherwise
  // throw rather than just declining to rest.
  if (!sheet.conditions) {
    sheet = {
      ...sheet,
      conditions: {
        weak: false, clumsy: false, exhausted: false, deafened: false, deathsDoor: false,
        muted: false, overwhelmed: false, confused: false, incoherent: false,
      },
    };
  }

  const result = kind === 'long' ? restLong(sheet) : restShort(sheet);
  if (!result.applied) return { applied: false, changes: result.changes };

  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(result.character) } });
  await applyDispositionEvent(characterId, { kind: 'pool_restored' });
  return { applied: true, changes: result.changes };
}
