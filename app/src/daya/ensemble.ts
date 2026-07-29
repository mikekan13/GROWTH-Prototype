/**
 * The ensemble orchestrator — the persona harness's integration keystone.
 * Wires the six model roles (Spirit Core, Soul Sim, Body Interface, Tagger,
 * Dream, Adjudicator) together per DayaTrigger kind, registered as WP3
 * handlers (replacing the v0 stubs in events.ts): stimulus,
 * adjudication_result, vine_tick, gm_intervention. dream_tick stays WP10's
 * (scheduler.ts already owns that registration; this file never touches it).
 *
 * Two structural rules enforced here, not just documented:
 *  1. Every DayaEntity.id used for metering is resolved exactly once per
 *     wake via entity.ts's resolveDayaEntityId (FIX-2) and threaded down —
 *     nothing below this file re-derives it.
 *  2. Every string that crosses into the phenomenal zone (Spirit's context,
 *     Spirit's own output) passes through seal.ts's enforceSeal — re-voice
 *     once, then a deterministic template, always logged.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentCycleOf } from '@/services/history';
import type { GrowthCharacter } from '@/types/growth';

import { resolveDayaEntityId } from './entity';
import { chat, type DayaChatMessage, type DayaClientOverrides } from './model-client';
import { registerHandler, wake, type DayaTrigger, type HandlerResult } from './events';
import { ingestStimulus, writeMemoryEntry } from './memory';
import { recall, stemmedJaccard } from './recall';
import { render, type Observer, type BiasProfile, type VoiceParams, type AffectVector } from './renderer';
import { currentFacts, type WorldFactRecord } from './world-ledger';
import { resolveIntent, type AdjudicationResult, type MechanicsRollHook } from './adjudicator';
import { enforceSeal } from './seal';
import {
  buildSpiritPrompt,
  buildDesiresBlock,
  toWantClause,
  parseSpiritOutput,
  type DesireSourceItem,
} from './prompts/roles/spirit';
import { buildSoulPrompt, buildDeltaSummary } from './prompts/roles/soul';
import {
  buildBodyOutwardPrompt,
  parseBodyOutwardResponse,
  buildBodyInwardPrompt,
  outcomeBandFor,
  type BodyOutwardResult,
} from './prompts/roles/body';
import { careScalarFrom } from './mechanics/effort';
import { resolveEffortCheck, maybeAdvanceVine, restAndRecover } from './mechanics/resolve';
import { detectAndFireThorns, loadActiveThornBlocks, isRuminationLockActive } from './mechanics/thorns';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── Entity context — resolved once per wake, threaded everywhere ─────────

interface PersonaProfileData {
  identityNarrative?: string;
  voiceNotes?: string;
  bias?: BiasProfile;
  voice?: VoiceParams;
}

function parsePersonaProfile(raw: string): PersonaProfileData {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as PersonaProfileData) : {};
  } catch {
    return {};
  }
}

function safeParseSheet(data: string | null | undefined): Partial<GrowthCharacter> | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as Partial<GrowthCharacter>;
  } catch {
    return null;
  }
}

interface EntityContext {
  characterId: string;
  entityDaId: string; // DayaEntity.id — resolved once here (FIX-2)
  campaignId: string | null;
  cycle: number;
  name: string;
  sheet: Partial<GrowthCharacter> | null;
  persona: PersonaProfileData;
  mood: AffectVector;
  soulState: { wisdomMax: number; wisdomCur: number; witMax: number; witCur: number };
}

async function loadEntityContext(characterId: string): Promise<EntityContext> {
  const entityDaId = await resolveDayaEntityId(characterId);
  const [entity, character, affectRow] = await Promise.all([
    prisma.dayaEntity.findUniqueOrThrow({ where: { id: entityDaId } }),
    prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true, data: true } }),
    prisma.dayaAffect.findUnique({ where: { entityId: entityDaId } }),
  ]);
  if (!character) throw new Error(`[daya/ensemble] Character not found: ${characterId}`);

  const campaignId = character.campaignId;
  const cycle = campaignId ? await currentCycleOf(campaignId) : 0;
  const sheet = safeParseSheet(character.data);
  const persona = parsePersonaProfile(entity.personaProfile);
  const mood: AffectVector = affectRow
    ? { morale: affectRow.morale, stress: affectRow.stress, grief: affectRow.grief }
    : { morale: 0, stress: 0, grief: 0 };

  const wisdom = sheet?.attributes?.wisdom;
  const wit = sheet?.attributes?.wit;
  const soulState = {
    wisdomMax: wisdom ? wisdom.level + wisdom.augmentPositive - wisdom.augmentNegative : 10,
    wisdomCur: wisdom ? wisdom.current : 10,
    witMax: wit ? wit.level + wit.augmentPositive - wit.augmentNegative : 10,
    witCur: wit ? wit.current : 10,
  };

  return { characterId, entityDaId, campaignId, cycle, name: character.name, sheet, persona, mood, soulState };
}

// ── Desires block source (Ruling 22: vines are the readout, not the engine) ──

async function buildDesiresBlockForCharacter(characterId: string): Promise<string> {
  const goals = await prisma.goal.findMany({
    where: { characterId, status: 'ACTIVE' },
    orderBy: { priority: 'desc' },
    take: 3,
    select: { description: true },
  });
  const items: DesireSourceItem[] = goals.map((g) => ({ description: g.description }));
  return buildDesiresBlock(items);
}

// ── Effort's `care` scalar (Ruling 10 — WP8) ───────────────────────────────
// vineSalience: the top active goal's priority (1-5) normalized to 0..1;
// arousal: current stress as an arousal proxy (DayaAffect has no separate
// arousal dimension — stress is the closest existing signal). Either alone
// can drive care; a calm-but-deeply-wanted moment and a stressful-but-low-
// stakes one both register (effort.ts's careScalarFrom blends them evenly).

const MAX_GOAL_PRIORITY = 5;

async function careScalarForCharacter(characterId: string, mood: AffectVector): Promise<number> {
  const topGoal = await prisma.goal.findFirst({
    where: { characterId, status: 'ACTIVE' },
    orderBy: { priority: 'desc' },
    select: { priority: true },
  });
  const vineSalience = topGoal ? topGoal.priority / MAX_GOAL_PRIORITY : 0;
  return careScalarFrom({ vineSalience, arousal: mood.stress });
}

// ── Soul Sim ────────────────────────────────────────────────────────────

async function runSoulSim(ctx: EntityContext, overrides: DayaClientOverrides): Promise<string> {
  const frequency = ctx.sheet?.attributes?.frequency;
  const poolFraction = frequency && frequency.level > 0 ? clamp01(frequency.current / frequency.level) : 1;
  const stateJson = JSON.stringify({ morale: ctx.mood.morale, stress: ctx.mood.stress, grief: ctx.mood.grief, poolFraction });
  const deltaSummary = buildDeltaSummary({ affect: ctx.mood, poolFraction, thornDescriptors: [] });
  const prompt = buildSoulPrompt({ stateJson, deltaSummary });

  const attempt = () =>
    chat({ tier: 'L1', subsystem: 'soul', entityId: ctx.entityDaId, messages: [{ role: 'system', content: prompt }], maxTokens: 200 }, overrides);

  let raw: string;
  try {
    raw = (await attempt()).text;
  } catch (err) {
    console.error('[daya/ensemble] soul sim call failed (falling back to template):', err);
    return 'Right now, in your body and mood: steady, holding your own.';
  }

  const sealed = await enforceSeal(raw, {
    entityId: ctx.entityDaId,
    subsystem: 'soul',
    fallback: 'Right now, in your body and mood: steady, holding your own.',
    revoice: async () => (await attempt()).text,
  });
  return sealed.text;
}

// ── Spirit Core ─────────────────────────────────────────────────────────

interface SpiritCallArgs {
  perceptionBlock: string;
  recallBlock: string;
  desiresBlock: string;
  feltStateBrief: string;
  stimulus: string;
}

async function callSpiritOnce(
  ctx: EntityContext,
  args: SpiritCallArgs,
  overrides: DayaClientOverrides,
  retryHint?: string,
): Promise<string> {
  const prompt = buildSpiritPrompt({
    name: ctx.name,
    identityNarrative: ctx.persona.identityNarrative ?? `${ctx.name}, living her own life, day to day.`,
    voiceNotes: ctx.persona.voiceNotes ?? 'Plain, direct, her own cadence.',
    feltStateBrief: args.feltStateBrief,
    perceptionBlock: args.perceptionBlock,
    recallBlock: args.recallBlock,
    desiresBlock: args.desiresBlock,
    stimulus: args.stimulus,
  });
  const messages: DayaChatMessage[] = [{ role: 'system', content: prompt }];
  if (retryHint) messages.push({ role: 'user', content: retryHint });

  const result = await chat({ tier: 'L1', subsystem: 'spirit', entityId: ctx.entityDaId, messages, maxTokens: 500 }, overrides);
  return result.text;
}

const SPIRIT_REVOICE_HINT =
  'Your previous answer used mechanical or out-of-character vocabulary. Respond again, purely as yourself, with no game or system language.';

// ── Body Interface ──────────────────────────────────────────────────────

async function runBodyOutward(
  ctx: EntityContext,
  intentPlain: string,
  facts: WorldFactRecord[],
  overrides: DayaClientOverrides,
): Promise<BodyOutwardResult> {
  const prompt = buildBodyOutwardPrompt({ intent: intentPlain, facts: facts.map((f) => ({ subjectKey: f.subjectKey, fact: f.fact })) });
  try {
    const result = await chat({ tier: 'L1', subsystem: 'body', entityId: ctx.entityDaId, messages: [{ role: 'system', content: prompt }], maxTokens: 200 }, overrides);
    const parsed = parseBodyOutwardResponse(result.text);
    if (parsed) return parsed;
  } catch (err) {
    console.error('[daya/ensemble] body outward call failed (falling back to raw intent):', err);
  }
  return { intent: intentPlain, subjectKeys: [], effortContext: 'casual' };
}

async function runBodyInward(
  ctx: EntityContext,
  outcomeBand: ReturnType<typeof outcomeBandFor>,
  experienceContent: string,
  overrides: DayaClientOverrides,
): Promise<string> {
  const prompt = buildBodyInwardPrompt({ outcomeBand, experienceContent });
  let raw: string;
  try {
    raw = (await chat({ tier: 'L1', subsystem: 'body', entityId: ctx.entityDaId, messages: [{ role: 'system', content: prompt }], maxTokens: 150 }, overrides)).text;
  } catch (err) {
    console.error('[daya/ensemble] body inward call failed (falling back to template):', err);
    return 'Something registers, plain and physical, though the details blur.';
  }
  const sealed = await enforceSeal(raw, {
    entityId: ctx.entityDaId,
    subsystem: 'body',
    fallback: 'Something registers, plain and physical, though the details blur.',
  });
  return sealed.text;
}

// ── Attention rendering (Attend: -> renderer, depth-capped recursion) ────

async function renderAttention(ctx: EntityContext, attendContent: string, overrides: DayaClientOverrides): Promise<string> {
  if (!ctx.campaignId) return 'Nothing more comes into focus.';
  const facts = await currentFacts(ctx.campaignId);
  if (facts.length === 0) return 'Nothing more comes into focus.';

  let best = facts[0];
  let bestScore = -1;
  for (const f of facts) {
    const score = stemmedJaccard(attendContent, `${f.subjectKey} ${f.fact}`);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  const observer: Observer = {
    entityId: ctx.characterId,
    attunement: 0.5,
    biasProfile: ctx.persona.bias ?? {},
    mood: ctx.mood,
    voice: ctx.persona.voice ?? {},
  };

  const rendered = await render(
    { subject: 'environment', subjectKey: best.subjectKey, trueData: best.fact, context: attendContent },
    observer,
    overrides,
  );
  return rendered.prose;
}

// ── Stimulus pipeline ───────────────────────────────────────────────────
// Tagger(ingest+classify) -> recall (gated) -> Soul Sim -> Spirit Core ->
// parse the directive line -> Say:/Do:/Attend:/Rest branch.

const ATTEND_DEPTH_CAP = 1;

async function runStimulusPipeline(
  characterId: string,
  source: string,
  content: string,
  depth: number,
  overrides: DayaClientOverrides,
): Promise<HandlerResult> {
  const ctx = await loadEntityContext(characterId);

  // 1. Tagger: ingest + classify. OOC content is processed but never
  // persisted (WP6 residency law) — and never wakes Spirit, since it isn't
  // lived experience.
  const ingest = await ingestStimulus({ entityId: ctx.entityDaId, cycle: ctx.cycle, source, content }, overrides);
  if (!ingest.persisted) {
    return {};
  }

  // 1b. Thorn firing (Ruling 7, WP8): does this stimulus match an existing
  // Thorn's trigger? Detection is code-only/deterministic (mechanics/thorns.ts)
  // — any fire persists a WP4 ThornBlock and moves affect immediately; the
  // felt line (never named "Thorn") is folded into the recall block below,
  // the same phenomenal-zone boundary recall's own prose already crosses.
  const [thornFire, activeThornBlocks, ruminationLockActive] = await Promise.all([
    detectAndFireThorns({ characterId, entityDaId: ctx.entityDaId, cycle: ctx.cycle, stimulusContent: content }),
    loadActiveThornBlocks(ctx.entityDaId),
    isRuminationLockActive(ctx.entityDaId),
  ]);

  // 2. Recall (stat-gated). Crosses into the phenomenal zone -> sealed.
  const recallResult = await recall(
    {
      entityId: ctx.entityDaId,
      cue: content,
      mood: ctx.mood,
      soulState: ctx.soulState,
      thornBlocks: activeThornBlocks,
      nowCycle: ctx.cycle,
      ruminationLockActive,
    },
    overrides,
  );
  const rawRecallBlock = [recallResult.prose ?? recallResult.failedFeel ?? 'Nothing in particular comes to mind.', ...thornFire.fired.map((f) => f.feltLine)]
    .filter(Boolean)
    .join(' ');
  const recallSealed = await enforceSeal(rawRecallBlock, {
    entityId: ctx.entityDaId,
    subsystem: 'recall',
    fallback: 'Something stirs, but nothing clear enough to name.',
  });

  // 3. Soul Sim -> felt-state brief.
  const feltStateBrief = await runSoulSim(ctx, overrides);

  // 4. Desires block (Ruling 22 guard).
  const desiresBlock = await buildDesiresBlockForCharacter(characterId);

  // 5. Spirit Core. A recursive perception stimulus (depth > 0, from an
  // Attend: chain or an adjudication sensation) IS the present-perception
  // block; a top-level stimulus keeps perception ambient/baseline.
  const perceptionBlock = depth > 0 ? content : 'Nothing beyond what is right in front of you.';

  const spiritArgs: SpiritCallArgs = {
    perceptionBlock,
    recallBlock: recallSealed.text,
    desiresBlock,
    feltStateBrief,
    stimulus: content,
  };
  const spiritRaw = await callSpiritOnce(ctx, spiritArgs, overrides);
  const spiritSealed = await enforceSeal(spiritRaw, {
    entityId: ctx.entityDaId,
    subsystem: 'spirit',
    fallback: `${ctx.name} pauses, unsure what to say, and lets the moment sit.`,
    revoice: () => callSpiritOnce(ctx, spiritArgs, overrides, SPIRIT_REVOICE_HINT),
  });

  const action = parseSpiritOutput(spiritSealed.text);

  switch (action.kind) {
    case 'speak': {
      const memory = await writeMemoryEntry({
        entityId: ctx.entityDaId,
        narrativeCycle: ctx.cycle,
        source: 'dialogue',
        content: action.content,
        valence: 0,
        arousal: 0.1,
        salience: 0.2,
        classification: { contentCategory: 'dialogue', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'own words spoken' },
      });
      return { memoryEntryId: memory.id, action: { kind: 'speak', content: action.content } };
    }

    case 'act': {
      if (!ctx.campaignId) {
        return { action: { kind: 'act', content: action.content } };
      }
      const facts = await currentFacts(ctx.campaignId);
      const outward = await runBodyOutward(ctx, action.content, facts, overrides);

      // WP8 mechanics coupling: motivated effort (Ruling 10) + skill-
      // specificity DR fit (Ruling 9) replace the adjudicator's placeholder
      // zero-effort roll whenever it calls for a check. `care` is resolved
      // once per act so the same wager logic isn't re-derived per attempt.
      const care = await careScalarForCharacter(characterId, ctx.mood);
      const mechanicsHook: MechanicsRollHook = async (hookArgs) => {
        const result = await resolveEffortCheck({
          characterId: hookArgs.characterId,
          intent: hookArgs.intent,
          attribute: hookArgs.attribute,
          dr: hookArgs.dr,
          effortContext: outward.effortContext,
          care,
          overrides,
        });
        if (!result) return null;
        return { total: result.total, success: result.success, drFinal: result.drFinal, governingAttribute: result.governingAttribute };
      };

      const adjudication = await resolveIntent(
        { campaignId: ctx.campaignId, entityCharacterId: characterId, intent: outward.intent, cycle: ctx.cycle },
        overrides,
        mechanicsHook,
      );
      await wake(
        { kind: 'adjudication_result', entityId: characterId, payload: adjudication as unknown as Record<string, unknown> },
        overrides,
      );
      return { action: { kind: 'act', content: action.content } };
    }

    case 'attend': {
      if (depth >= ATTEND_DEPTH_CAP) {
        return { action: { kind: 'attend', content: action.content } };
      }
      const rendered = await renderAttention(ctx, action.content, overrides);
      return runStimulusPipeline(characterId, 'perception', rendered, depth + 1, overrides);
    }

    case 'rest':
    default: {
      // WP8 spec §7: Spirit choosing to rest actually restores pool (a Short
      // Rest — the least disruptive recovery step); guarded the same way
      // restShort itself is (Overwhelmed / Frequency-empty -> applied:false),
      // so this never silently no-ops into a false sense of recovery.
      const restResult = await restAndRecover(characterId, 'short').catch((err) => {
        console.error('[daya/ensemble] restAndRecover failed (non-fatal):', err);
        return { applied: false, changes: [] as string[] };
      });
      await writeMemoryEntry({
        entityId: ctx.entityDaId,
        narrativeCycle: ctx.cycle,
        source: 'perception',
        content: restResult.applied ? 'A quiet stretch, and something in you eases.' : 'Nothing more right now — it passes.',
        valence: restResult.applied ? 0.1 : 0,
        arousal: 0,
        salience: 0.05,
        classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'rest, no action' },
      });
      return { action: { kind: 'rest' } };
    }
  }
}

// ── adjudication_result pipeline ───────────────────────────────────────
// Tagger -> Body inward (sensation, always computed) -> IF salience >= 0.4:
// wake Spirit with the sensation as stimulus (one wake per adjudication);
// else ledger-only (she notices without remark — the Tagger ingest above IS
// that ledger entry).

const ADJUDICATION_WAKE_SALIENCE_THRESHOLD = 0.4;

interface AdjudicationPayloadShape {
  outcome?: string;
  experienceEvent?: { content: string; valence: number; salience: number };
  roll?: { attribute: string; dr: number; total: number; success: boolean };
}

async function adjudicationResultHandler(
  trigger: Extract<DayaTrigger, { kind: 'adjudication_result' }>,
  overrides: DayaClientOverrides,
): Promise<HandlerResult> {
  const ctx = await loadEntityContext(trigger.entityId);
  const payload = trigger.payload as AdjudicationPayloadShape;
  const experienceEvent = payload.experienceEvent ?? { content: payload.outcome ?? '', valence: 0, salience: 0.1 };
  const roll = payload.roll;

  // WP8 vine progress (Ruling 22): resolves an EXISTING open opportunity on
  // an active goal when this check-driven outcome matches it — never
  // creates or forces one. No-op (returns null) for pure-narrative outcomes
  // (no roll) or when nothing matches.
  await maybeAdvanceVine(trigger.entityId, { outcome: payload.outcome ?? '', experienceEvent, roll }).catch((err) => {
    console.error('[daya/ensemble] maybeAdvanceVine failed (non-fatal):', err);
    return null;
  });

  const ingest = await ingestStimulus(
    { entityId: ctx.entityDaId, cycle: ctx.cycle, source: 'adjudication', content: experienceEvent.content },
    overrides,
  );

  const outcomeBand = roll ? outcomeBandFor(roll.success, roll.total - roll.dr) : experienceEvent.valence >= 0 ? 'cleanly' : 'not-quite';
  const sensation = await runBodyInward(ctx, outcomeBand, experienceEvent.content, overrides);

  const salience = ingest.persisted ? ingest.tags.salience : experienceEvent.salience;
  if (salience >= ADJUDICATION_WAKE_SALIENCE_THRESHOLD) {
    return runStimulusPipeline(trigger.entityId, 'perception', sensation, 0, overrides);
  }

  return { memoryEntryId: ingest.persisted ? ingest.memoryEntryId : undefined };
}

// ── gm_intervention pipeline ────────────────────────────────────────────
// sealLint-checked INBOUND: a breaching phrase (e.g. a GM typo like "roll a
// die") is held and flagged, never delivered. A clean intervention is
// delivered verbatim as heard/perceived speech-from-the-world and runs the
// full stimulus pipeline (Ruling 21: canonically real, logged as experienced).

async function gmInterventionHandler(
  trigger: Extract<DayaTrigger, { kind: 'gm_intervention' }>,
  overrides: DayaClientOverrides,
): Promise<HandlerResult> {
  const entityDaId = await resolveDayaEntityId(trigger.entityId);
  const sealCheck = await enforceSeal(trigger.content, { entityId: entityDaId, subsystem: 'gm_intervention', fallback: '__HELD__' });

  if (sealCheck.usedFallback) {
    console.warn(`[daya/ensemble] gm_intervention HELD for entity ${trigger.entityId} — sealLint HARD hit, not delivered`);
    return { action: { kind: 'held', content: trigger.content } };
  }

  return runStimulusPipeline(trigger.entityId, 'gm_intervention', trigger.content, 0, overrides);
}

// ── vine_tick pipeline ──────────────────────────────────────────────────
// Coarse Spirit-lite call: "weeks pass; what did you find yourself doing
// about {{desire}}?" Phase 1 stub-level per spec — exercised once in WP12's
// time-skip; no Body/adjudicator coarse resolution wired yet (WP8/WP12).

async function vineTickHandler(
  trigger: Extract<DayaTrigger, { kind: 'vine_tick' }>,
  overrides: DayaClientOverrides,
): Promise<HandlerResult> {
  const ctx = await loadEntityContext(trigger.entityId);
  const goals = await prisma.goal.findMany({
    where: { characterId: trigger.entityId, status: 'ACTIVE' },
    orderBy: { priority: 'desc' },
    take: 1,
    select: { description: true },
  });
  if (goals.length === 0) return {};

  const desire = toWantClause(goals[0].description);
  const prompt = `Weeks pass. What did you find yourself doing about wanting to ${desire}? Answer in 2-3 sentences, first person, as a summary of time passing — no dialogue, no system terms.`;

  let raw: string;
  try {
    raw = (await chat({ tier: 'L1', subsystem: 'spirit', entityId: ctx.entityDaId, messages: [{ role: 'system', content: prompt }], maxTokens: 200 }, overrides)).text;
  } catch (err) {
    console.error('[daya/ensemble] vine_tick call failed (falling back to template):', err);
    raw = `Time passed. ${ctx.name} kept at it, in small ways.`;
  }

  const sealed = await enforceSeal(raw, {
    entityId: ctx.entityDaId,
    subsystem: 'spirit',
    fallback: `Time passed. ${ctx.name} kept at it, in small ways.`,
  });

  const memory = await writeMemoryEntry({
    entityId: ctx.entityDaId,
    narrativeCycle: ctx.cycle,
    source: 'reasoning',
    content: sealed.text,
    valence: 0,
    arousal: 0.1,
    salience: 0.3,
    classification: { contentCategory: 'reasoning', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'vine tick summary' },
  });

  return { memoryEntryId: memory.id, action: { kind: 'vine_summary', content: sealed.text } };
}

// ── Registration — replaces the WP3 stub handlers ────────────────────────

registerHandler('stimulus', (trigger, overrides) => {
  if (trigger.kind !== 'stimulus') return Promise.resolve();
  return runStimulusPipeline(trigger.entityId, trigger.source, trigger.content, 0, overrides ?? {});
});

registerHandler('adjudication_result', (trigger, overrides) => {
  if (trigger.kind !== 'adjudication_result') return Promise.resolve();
  return adjudicationResultHandler(trigger, overrides ?? {});
});

registerHandler('gm_intervention', (trigger, overrides) => {
  if (trigger.kind !== 'gm_intervention') return Promise.resolve();
  return gmInterventionHandler(trigger, overrides ?? {});
});

registerHandler('vine_tick', (trigger, overrides) => {
  if (trigger.kind !== 'vine_tick') return Promise.resolve();
  return vineTickHandler(trigger, overrides ?? {});
});

// Exported for the WP9 acceptance script and any future direct callers
// (e.g. an API route) that want to drive a single stimulus without going
// through the full trigger-kind dispatch in events.ts.
export { runStimulusPipeline };
export type { AdjudicationResult };
