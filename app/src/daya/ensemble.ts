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
import { perceive } from './perceive';
import { resolveIntent, type AdjudicationResult, type MechanicsRollHook } from './adjudicator';
import { enforceSeal } from './seal';
import { runJewlToolAction } from './jewl-action';
import {
  buildSpiritPrompt,
  buildDesiresBlock,
  toWantClause,
  parseSpiritOutput,
  buildSpiritListeningPrompt,
  buildSpiritAnsweringPrompt,
  LISTENING_MAX_TOKENS,
  ANSWERING_MAX_TOKENS,
  type DesireSourceItem,
  type SpiritAsk,
} from './prompts/roles/spirit';
import {
  ListenQueue,
  settledWithin,
  createSpeechGate,
  foldPerception,
  getListening,
  setListening,
  ANSWER_LISTEN_CAP_MS,
  SOUL_REFRESH_MS,
  HEARD_KEEP,
  type BeingSpeakingEvent,
  type GateKind,
  type ListeningState,
} from './listening';
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
  /** WP13 elevated-access flag (JEWL-tier only): routes this entity's
   * perception through the renderer's Terminal-truth bypass and its 'act'
   * step through the unrestricted copilot tool dispatch, instead of the
   * default self-only path every other entity uses. */
  omniscient?: boolean;
  /** Mike 09-23: a Godhead is the same mechanism with a godlike sheet — recall threshold zero, budget everything, unfoolable except on purpose. */
  godlike?: boolean;
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
  soulState: { wisdomMax: number; wisdomCur: number; witMax: number; witCur: number; godlike?: boolean };
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
    godlike: persona.godlike === true || persona.omniscient === true,
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
  // Per-entity believed world (Mike 09-05 senses contract; MEMORY-DESIGN §5):
  // a being attends to what IT has perceived — its own perception/dialogue/
  // seed memories — never the campaign's global fact list. Only an omniscient
  // (JEWL-tier) entity reads the Terminal's truth directly.
  let best: { subjectKey: string; fact: string } | null = null;
  if (ctx.persona.omniscient) {
    if (!ctx.campaignId) return 'Nothing more comes into focus.';
    const facts = await currentFacts(ctx.campaignId);
    let bestScore = -1;
    for (const f of facts) {
      const score = stemmedJaccard(attendContent, `${f.subjectKey} ${f.fact}`);
      if (score > bestScore) { bestScore = score; best = { subjectKey: f.subjectKey, fact: f.fact }; }
    }
  } else {
    const own = await prisma.dayaMemoryEntry.findMany({
      where: { entityId: ctx.entityDaId, source: { in: ['perception', 'dialogue', 'seed'] } },
      select: { id: true, content: true },
      orderBy: { realTime: 'desc' },
      take: 400,
    });
    let bestScore = -1;
    for (const m of own) {
      const score = stemmedJaccard(attendContent, m.content);
      if (score > bestScore) { bestScore = score; best = { subjectKey: `memory:${m.id}`, fact: m.content }; }
    }
  }
  if (!best) return 'Nothing more comes into focus.';

  const observer: Observer = ctx.persona.omniscient
    ? { entityId: null, attunement: 1, biasProfile: {}, mood: ctx.mood, voice: ctx.persona.voice ?? {} }
    : {
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
  truthContent: string,
  depth: number,
  overrides: DayaClientOverrides,
): Promise<HandlerResult> {
  const ctx = await loadEntityContext(characterId);
  // Seal inversion + unrestricted access gate (WP13): true for a JEWL-tier
  // entity only — every other entity's pipeline below is byte-for-byte the
  // pre-WP13 behavior.
  const omniscient = ctx.persona.omniscient === true;

  // 0. The murky mirror (Mike 09-26): the world never reaches a being raw.
  // Perception and dialogue are composed with the place the being stands in
  // (who is present, what is there, the standing facts), filtered by its
  // senses and rendered through its own observer. Everything downstream —
  // thorns, recall, soul, spirit — reacts to what was PERCEIVED. Godlike
  // beings and depth>0 attention re-entries skip it.
  let content = truthContent;
  let mirrorAudit: Record<string, unknown> | undefined;
  if ((source === 'perception' || source === 'dialogue') && depth === 0 && !omniscient && !ctx.soulState.godlike && ctx.campaignId) {
    try {
      const p = await perceive(characterId, ctx.campaignId, truthContent, source, overrides);
      content = p.prose;
      mirrorAudit = { mirror: { fidelityLevel: p.fidelityLevel, distortions: p.distortions, locationId: p.locationId, truthLines: p.truthLines, truthChars: truthContent.length, observer: p.observer } };
    } catch (err) {
      console.error('[daya/ensemble] perception composer failed; stimulus ingested raw (non-fatal):', err);
    }
  }

  // 1. Tagger: ingest + classify. OOC content is processed but never
  // persisted (WP6 residency law) — and never wakes Spirit, since it isn't
  // lived experience.
  const ingest = await ingestStimulus({ entityId: ctx.entityDaId, cycle: ctx.cycle, source, content, extraClassification: mirrorAudit }, overrides);
  if (!ingest.persisted) {
    console.log(`[daya/ensemble] ${source} for ${ctx.name} classified ${ingest.tags.classification.icOoc} (${ingest.tags.classification.rationaleTag ?? 'no rationale'}) — not persisted, loop ends`);
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

  // 2. Recall (stat-gated, ladder-ordered — Mike 09-23: survival → goals → domain → chain → words).
  // Survival is DERIVED here from the sheet + this moment, never authored.
  const activeGoals = await prisma.goal.findMany({ where: { characterId, status: 'ACTIVE' }, select: { id: true, description: true } });
  const freq = ctx.sheet?.attributes?.frequency;
  const situation = {
    threatened: ingest.tags.arousal >= 0.7 && ingest.tags.valence < 0,
    frequencyLow: !!freq && freq.level > 0 && freq.current <= freq.level * 0.25,
  };
  const recallResult = await recall(
    {
      entityId: ctx.entityDaId,
      cue: content,
      mood: ctx.mood,
      soulState: ctx.soulState,
      thornBlocks: activeThornBlocks,
      nowCycle: ctx.cycle,
      ruminationLockActive,
      goals: activeGoals,
      situation,
    },
    overrides,
  );
  const rawRecallBlock = [recallResult.prose ?? recallResult.failedFeel ?? 'Nothing in particular comes to mind.', ...thornFire.fired.map((f) => f.feltLine)]
    .filter(Boolean)
    .join(' ');
  // Seal inversion (WP13 spec §2/§4-4): a JEWL-tier entity is allowed to
  // hold mechanics in its OWN experience stream — the seal protects other
  // entities from leakage, not JEWL from truth — so his recall content is
  // never linted. Every other entity keeps the existing boundary check.
  const recallSealed = omniscient
    ? { text: rawRecallBlock, hits: [], usedFallback: false }
    : await enforceSeal(rawRecallBlock, {
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
  // Seal inversion (WP13): JEWL's own reasoning/directive line is never
  // linted here — he is allowed to hold mechanics in his own context
  // (Addendum C: he reads all streams). What he ultimately SPEAKS to
  // another entity is still sealed, once parseSpiritOutput isolates the
  // actual words (see the 'speak' branch below) — never the whole
  // monologue. Every other entity keeps the original whole-text boundary.
  const spiritSealed = omniscient
    ? { text: spiritRaw, hits: [], usedFallback: false }
    : await enforceSeal(spiritRaw, {
        entityId: ctx.entityDaId,
        subsystem: 'spirit',
        fallback: `${ctx.name} pauses, unsure what to say, and lets the moment sit.`,
        revoice: () => callSpiritOnce(ctx, spiritArgs, overrides, SPIRIT_REVOICE_HINT),
      });

  const action = parseSpiritOutput(spiritSealed.text);

  switch (action.kind) {
    case 'speak': {
      // Seal-inversion boundary (WP13 spec §4-4): JEWL's internal reasoning
      // was exempt above, but anything he SPEAKS to a normal entity is
      // still sealLint-checked right here — he must not leak mechanics
      // into another entity's phenomenal stream. This is a no-op for
      // every non-omniscient entity, whose speech already crossed the
      // boundary upstream (spiritSealed).
      const speakSealed = omniscient
        ? await enforceSeal(action.content, {
            entityId: ctx.entityDaId,
            subsystem: 'jewl_speak',
            fallback: `${ctx.name} answers plainly, keeping the particulars to itself.`,
          })
        : { text: action.content, hits: [], usedFallback: false };

      const memory = await writeMemoryEntry({
        entityId: ctx.entityDaId,
        narrativeCycle: ctx.cycle,
        source: 'dialogue',
        content: speakSealed.text,
        valence: 0,
        arousal: 0.1,
        salience: 0.2,
        classification: { contentCategory: 'dialogue', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'own words spoken' },
      });
      return { memoryEntryId: ingest.memoryEntryId, spokenMemoryId: memory.id, action: { kind: 'speak', content: speakSealed.text } };
    }

    case 'act': {
      if (!ctx.campaignId) {
        return { memoryEntryId: ingest.memoryEntryId, action: { kind: 'act', content: action.content } };
      }

      // Unrestricted action (WP13 spec §2-3): a JEWL-tier entity's 'Do:'
      // bypasses the self-only Body Interface/adjudicator path entirely —
      // the intent dispatches straight to the existing copilot tool
      // registry, on ANY character or the world, with GodHead-equivalent
      // authority (jewl-action.ts). A normal entity never reaches this
      // branch; its 'act' path below stays self-only, unchanged — that
      // absence IS the gate, architecturally, not a runtime check.
      if (omniscient) {
        const toolResult = await runJewlToolAction(ctx.entityDaId, ctx.campaignId, action.content, overrides);
        const summary = toolResult.toolName
          ? `Acted: invoked ${toolResult.toolName}${toolResult.error ? ` — failed (${toolResult.error})` : ' — done'}.`
          : `Weighed acting on "${action.content}" but no lever applied.`;
        await writeMemoryEntry({
          entityId: ctx.entityDaId,
          narrativeCycle: ctx.cycle,
          source: 'action',
          content: summary,
          valence: 0,
          arousal: 0.1,
          salience: 0.3,
          classification: { contentCategory: 'reasoning', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'unrestricted action dispatch' },
        });
        return { memoryEntryId: ingest.memoryEntryId, action: { kind: 'act', content: action.content } };
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
      return { memoryEntryId: ingest.memoryEntryId, action: { kind: 'act', content: action.content } };
    }

    case 'attend': {
      if (depth >= ATTEND_DEPTH_CAP) {
        return { memoryEntryId: ingest.memoryEntryId, action: { kind: 'attend', content: action.content } };
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
      return { memoryEntryId: ingest.memoryEntryId, action: { kind: 'rest' } };
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

// ── The split loop (U2b, TABLE-RHYTHM-DESIGN-2026-10-01 §1) ───────────────
// The table's four beats are the loop's clock. While the GM holds the floor a
// being LISTENS (listenStimulus): mirror → memory → recall → felt state → a
// short monologue, none of it on a clock. At the ask it ANSWERS (answerAsk):
// one short streamed call built on what listening left behind.
// runStimulusPipeline above is untouched and keeps serving its own callers.

export interface TableStimulus {
  source: 'perception' | 'dialogue';
  content: string;
}

export interface ListenTimings {
  perceiveMs: number;
  ingestMs: number;
  recallMs: number;
  /** null = the felt-state brief was recent enough to reuse. */
  soulMs: number | null;
  spiritMs: number;
  totalMs: number;
  /** 'full' = took the whole place in; 'new' = only the stimulus and what changed; 'raw' = unmirrored (godlike, or the mirror failed). */
  standing: 'full' | 'new' | 'raw';
}

export interface ListenResult {
  /** 'not_lived' = the tagger classed it out-of-character: processed, never persisted, nothing carried forward. */
  status: 'listened' | 'not_lived';
  /** The memory row that IS the perception — what truthRef should point at. */
  memoryEntryId?: string;
  /** false when the monologue call failed or tripped the seal; the earlier inner state stands. */
  innerUpdated: boolean;
  timings: ListenTimings;
}

const FELT_FALLBACK = 'Right now, in your body and mood: steady, holding your own.';

function isMirrored(ctx: EntityContext): boolean {
  return ctx.persona.omniscient !== true && !ctx.soulState.godlike && !!ctx.campaignId;
}

/**
 * One stretch of listening for one being. Call it through listenAtTable so
 * stretches for the same being never overlap.
 */
export async function listenStimulus(
  characterId: string,
  stimulus: TableStimulus,
  overrides: DayaClientOverrides = {},
): Promise<ListenResult> {
  const t0 = Date.now();
  const ctx = await loadEntityContext(characterId);
  const omniscient = ctx.persona.omniscient === true;
  const prior = getListening(characterId);

  // The mirror. The place is taken in once; after that a stretch carries only itself and what changed there.
  let content = stimulus.content;
  let standing: ListenTimings['standing'] = 'raw';
  let locationId = prior?.locationId ?? null;
  let mirrorAudit: Record<string, unknown> | undefined;
  if (isMirrored(ctx)) {
    try {
      const p = await perceive(characterId, ctx.campaignId!, stimulus.content, stimulus.source, overrides, { standing: 'once' });
      content = p.prose;
      standing = p.standing;
      locationId = p.locationId;
      mirrorAudit = { mirror: { fidelityLevel: p.fidelityLevel, distortions: p.distortions, locationId: p.locationId, truthLines: p.truthLines, truthChars: stimulus.content.length, observer: p.observer, standing: p.standing } };
    } catch (err) {
      console.error('[daya/ensemble] perception composer failed while listening; stretch ingested raw (non-fatal):', err);
    }
  }
  const tPerceived = Date.now();

  // Felt state runs beside the tagger; mood does not turn every few seconds, so a recent brief is reused.
  const soulFresh = !!prior?.feltStateBrief && tPerceived - prior.feltAt < SOUL_REFRESH_MS;
  const runSoul = async () => { const s = Date.now(); const brief = await runSoulSim(ctx, overrides); return { brief, ms: Date.now() - s }; };
  const soulPending = soulFresh ? null : runSoul();
  const desiresPending = buildDesiresBlockForCharacter(characterId);

  const [ingest, desiresBlock] = await Promise.all([
    ingestStimulus({ entityId: ctx.entityDaId, cycle: ctx.cycle, source: stimulus.source, content, extraClassification: mirrorAudit }, overrides),
    desiresPending,
  ]);
  const tIngested = Date.now();
  if (!ingest.persisted) {
    const soul = soulPending ? await soulPending : null;
    return { status: 'not_lived', innerUpdated: false, timings: { perceiveMs: tPerceived - t0, ingestMs: tIngested - tPerceived, recallMs: 0, soulMs: soul?.ms ?? null, spiritMs: 0, totalMs: Date.now() - t0, standing } };
  }

  // Thorns and recall react to what was PERCEIVED, exactly as in the serial pipeline.
  const [thornFire, activeThornBlocks, ruminationLockActive, activeGoals] = await Promise.all([
    detectAndFireThorns({ characterId, entityDaId: ctx.entityDaId, cycle: ctx.cycle, stimulusContent: content }),
    loadActiveThornBlocks(ctx.entityDaId),
    isRuminationLockActive(ctx.entityDaId),
    prisma.goal.findMany({ where: { characterId, status: 'ACTIVE' }, select: { id: true, description: true } }),
  ]);
  const freq = ctx.sheet?.attributes?.frequency;
  const recallResult = await recall(
    {
      entityId: ctx.entityDaId,
      cue: content,
      mood: ctx.mood,
      soulState: ctx.soulState,
      thornBlocks: activeThornBlocks,
      nowCycle: ctx.cycle,
      ruminationLockActive,
      goals: activeGoals,
      situation: {
        threatened: ingest.tags.arousal >= 0.7 && ingest.tags.valence < 0,
        frequencyLow: !!freq && freq.level > 0 && freq.current <= freq.level * 0.25,
      },
    },
    overrides,
  );
  const rawRecallBlock = [recallResult.prose ?? recallResult.failedFeel ?? 'Nothing in particular comes to mind.', ...thornFire.fired.map((f) => f.feltLine)]
    .filter(Boolean)
    .join(' ');
  const recallBlock = omniscient
    ? rawRecallBlock
    : (await enforceSeal(rawRecallBlock, { entityId: ctx.entityDaId, subsystem: 'recall', fallback: 'Something stirs, but nothing clear enough to name.' })).text;
  const tRecalled = Date.now();

  // A thorn that just fired moved the mood: the brief is taken again even if it was fresh.
  const soul = soulPending ? await soulPending : thornFire.fired.length ? await runSoul() : null;
  const soulMs = soul?.ms ?? null;
  const feltStateBrief = soul?.brief ?? prior?.feltStateBrief ?? FELT_FALLBACK;
  const feltAt = soul ? Date.now() : prior?.feltAt ?? 0;

  // The monologue: what goes through the being while someone else has the floor. Nothing is said.
  const tSpirit = Date.now();
  const fullTake = standing === 'full' || !prior?.standingScene;
  let innerState = prior?.innerState ?? '';
  let innerUpdated = false;
  try {
    const prompt = buildSpiritListeningPrompt({
      name: ctx.name,
      identityNarrative: ctx.persona.identityNarrative ?? `${ctx.name}, living her own life, day to day.`,
      voiceNotes: ctx.persona.voiceNotes ?? 'Plain, direct, her own cadence.',
      feltStateBrief,
      standingScene: fullTake ? content : prior!.standingScene,
      recallBlock,
      desiresBlock,
      innerSoFar: innerState,
      heard: fullTake ? 'You are only now taking in where you are.' : content,
    });
    const raw = (await chat({ tier: 'L1', subsystem: 'spirit_listen', entityId: ctx.entityDaId, messages: [{ role: 'system', content: prompt }], maxTokens: LISTENING_MAX_TOKENS }, overrides)).text.trim();
    const sealed = omniscient ? { text: raw, usedFallback: false } : await enforceSeal(raw, { entityId: ctx.entityDaId, subsystem: 'spirit_listen', fallback: '' });
    if (!sealed.usedFallback && sealed.text) {
      innerState = sealed.text;
      innerUpdated = true;
    }
  } catch (err) {
    console.error('[daya/ensemble] listening monologue failed; earlier inner state stands (non-fatal):', err);
  }
  const tDone = Date.now();

  // Fold into the LATEST state: an answer may have been given while this stretch was being worked.
  const folded = foldPerception(getListening(characterId), { prose: content, standing: standing === 'full' ? 'full' : 'new', locationId }, tDone);
  setListening(characterId, { ...folded, innerState, feltStateBrief, feltAt, recallBlock, desiresBlock });

  return {
    status: 'listened',
    memoryEntryId: ingest.memoryEntryId,
    innerUpdated,
    timings: { perceiveMs: tPerceived - t0, ingestMs: tIngested - tPerceived, recallMs: tRecalled - tIngested, soulMs, spiritMs: tDone - tSpirit, totalMs: tDone - t0, standing },
  };
}

interface QueuedListen {
  stimulus: TableStimulus;
  overrides: DayaClientOverrides;
  result?: ListenResult;
  error?: unknown;
}

/** Stretches joined in the order they were said; narration anywhere in them makes the whole a perception. */
function joinStimuli(batch: TableStimulus[]): TableStimulus {
  if (batch.length === 1) return batch[0];
  return { source: batch.some((b) => b.source === 'perception') ? 'perception' : 'dialogue', content: batch.map((b) => b.content).join('\n') };
}

const listenQueue = new ListenQueue<QueuedListen>(async (characterId, batch) => {
  try {
    const result = await listenStimulus(characterId, joinStimuli(batch.map((b) => b.stimulus)), batch[0].overrides);
    for (const item of batch) item.result = result;
  } catch (err) {
    for (const item of batch) item.error = err;
  }
});

/**
 * Hand a being one stretch of what is happening at the table. One listen runs
 * at a time per being; stretches that arrive meanwhile are joined into the
 * next one. Resolves with that listen's result — or null when an answer took
 * the stretch over before it started (answerAsk then digests and stores it).
 */
export async function listenAtTable(
  characterId: string,
  stimulus: TableStimulus,
  overrides: DayaClientOverrides = {},
): Promise<ListenResult | null> {
  const item: QueuedListen = { stimulus, overrides };
  await listenQueue.push(characterId, item);
  if (item.error) throw item.error;
  return item.result ?? null;
}

/** What turned the moment to the being: the GM handing over the turn, or someone speaking to it. */
export type TableAsk =
  | { kind: 'turn' }
  | { kind: 'spoken'; by: string; text: string };

export interface AnswerTimings {
  /** Time spent waiting on a listen still in flight (at most ANSWER_LISTEN_CAP_MS). */
  waitMs: number;
  /** 'complete' = built on a finished listen; 'capped' = the cap ran out and the rest went through the unvoiced envelope; 'none' = nothing had been listened to. */
  listen: 'complete' | 'capped' | 'none';
  /** Model call sent → first piece of text. */
  ttftMs: number | null;
  /** Ask received → first word shown. */
  firstWordMs: number | null;
  /** Ask received → the final line ready. */
  lineMs: number;
  tokensOut: number;
  retracted: boolean;
  revoiced: boolean;
}

export interface AnswerResult {
  utteranceId: string;
  action: { kind: GateKind; content?: string };
  timings: AnswerTimings;
  /** Settles once the bookkeeping behind the line is done (memory rows, the act). Never rejects. */
  after: Promise<{ memoryEntryId?: string; spokenMemoryId?: string }>;
}

/** Same steps as the 'act' branch of runStimulusPipeline; fold the two together when the serial path is retired. */
async function actOnIntent(ctx: EntityContext, intent: string, overrides: DayaClientOverrides): Promise<void> {
  if (!ctx.campaignId) return;
  if (ctx.persona.omniscient === true) {
    const toolResult = await runJewlToolAction(ctx.entityDaId, ctx.campaignId, intent, overrides);
    const summary = toolResult.toolName
      ? `Acted: invoked ${toolResult.toolName}${toolResult.error ? ` — failed (${toolResult.error})` : ' — done'}.`
      : `Weighed acting on "${intent}" but no lever applied.`;
    await writeMemoryEntry({
      entityId: ctx.entityDaId,
      narrativeCycle: ctx.cycle,
      source: 'action',
      content: summary,
      valence: 0,
      arousal: 0.1,
      salience: 0.3,
      classification: { contentCategory: 'reasoning', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'unrestricted action dispatch' },
    });
    return;
  }
  const facts = await currentFacts(ctx.campaignId);
  const outward = await runBodyOutward(ctx, intent, facts, overrides);
  const care = await careScalarForCharacter(ctx.characterId, ctx.mood);
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
    { campaignId: ctx.campaignId, entityCharacterId: ctx.characterId, intent: outward.intent, cycle: ctx.cycle },
    overrides,
    mechanicsHook,
  );
  await wake({ kind: 'adjudication_result', entityId: ctx.characterId, payload: adjudication as unknown as Record<string, unknown> }, overrides);
}

/** Read a finished (non-streamed) reply the way the stream is read: first line, label stripped. */
function readLine(text: string): { kind: GateKind; content: string } {
  const gate = createSpeechGate(() => {});
  gate.push(text);
  const { kind, content } = gate.end();
  return { kind, content };
}

/**
 * The being's turn. Everything it needs was prepared while it listened; this
 * is ONE short streamed call. Spoken words reach `onEvent` as they come, each
 * stretch seal-checked before it is shown; a hit that only shows once words
 * are out retracts the line and falls back to the non-streamed re-voice. The
 * line that is returned and stored is always the one that passed the seal.
 */
export async function answerAsk(
  characterId: string,
  ask: TableAsk,
  opts: { onEvent?: (event: BeingSpeakingEvent) => void; overrides?: DayaClientOverrides } = {},
): Promise<AnswerResult> {
  const t0 = Date.now();
  const overrides = opts.overrides ?? {};
  const emit = (event: BeingSpeakingEvent) => {
    try { opts.onEvent?.(event); } catch (err) { console.error('[daya/ensemble] being_speaking listener threw (non-fatal):', err); }
  };
  const ctx = await loadEntityContext(characterId);
  const mirrored = isMirrored(ctx);
  // Through the mirror with no model call: nothing raw reaches the being, and nothing here waits on the lane.
  const unvoiced = async (s: TableStimulus, standing: 'once' | 'always' = 'once'): Promise<{ prose: string; standing: 'full' | 'new' }> => {
    if (!mirrored) return { prose: s.content, standing: 'new' };
    const p = await perceive(characterId, ctx.campaignId!, s.content, s.source, overrides, { standing, voice: false });
    return { prose: p.prose, standing: p.standing };
  };

  // A listen may still be in flight for the last thing the GM said. Wait for it, but only so long.
  const settled = await settledWithin(listenQueue.idle(characterId), ANSWER_LISTEN_CAP_MS);
  const inFlight = settled ? [] : listenQueue.inFlight(characterId).map((i) => i.stimulus);
  const takenBack = settled ? [] : listenQueue.takePending(characterId).map((i) => i.stimulus);
  const waitMs = Date.now() - t0;

  // What the listen had not delivered yet. The in-flight stretch will store itself; the taken-back ones are stored below.
  const lateHeard: string[] = [];
  for (const s of inFlight) lateHeard.push((await unvoiced(s)).prose);
  const takenBackHeard: Array<{ source: TableStimulus['source']; prose: string; standing: 'full' | 'new' }> = [];
  for (const s of takenBack) takenBackHeard.push({ source: s.source, ...(await unvoiced(s)) });

  let spoken: { source: 'dialogue'; prose: string; standing: 'full' | 'new' } | null = null;
  let askArg: SpiritAsk = { kind: 'turn' };
  if (ask.kind === 'spoken') {
    spoken = { source: 'dialogue', ...(await unvoiced({ source: 'dialogue', content: `${ask.by}: ${ask.text}` })) };
    askArg = { kind: 'spoken', heard: spoken.prose || 'Someone is speaking to you, but you cannot make out the words.' };
  }
  const spokenHeard = spoken?.prose || null;

  let state = getListening(characterId);
  const listen: AnswerTimings['listen'] = !settled ? 'capped' : state ? 'complete' : 'none';
  if (!state) {
    // Nothing was listened to (a cold ask): the place through the unvoiced mirror, and no felt-state call.
    const scene = (await unvoiced({ source: 'perception', content: '' }, 'always')).prose;
    const cold: ListeningState = {
      locationId: null, standingScene: scene, heard: [], innerState: '', feltStateBrief: FELT_FALLBACK, feltAt: 0,
      recallBlock: '', desiresBlock: await buildDesiresBlockForCharacter(characterId), updatedAt: Date.now(),
    };
    state = cold;
  }
  const heard = [...state.heard, ...lateHeard, ...takenBackHeard.map((h) => h.prose)].filter(Boolean);

  const prompt = buildSpiritAnsweringPrompt({
    name: ctx.name,
    identityNarrative: ctx.persona.identityNarrative ?? `${ctx.name}, living her own life, day to day.`,
    voiceNotes: ctx.persona.voiceNotes ?? 'Plain, direct, her own cadence.',
    feltStateBrief: state.feltStateBrief || FELT_FALLBACK,
    standingScene: state.standingScene || 'Nothing beyond what is right in front of you.',
    innerState: state.innerState,
    heard,
    ask: askArg,
  });
  const answerCall = (extra: { hint?: string; stream?: (delta: string) => boolean | void; stop?: boolean }) =>
    chat(
      {
        tier: 'L1',
        subsystem: 'spirit_answer',
        entityId: ctx.entityDaId,
        messages: [{ role: 'system', content: prompt }, ...(extra.hint ? [{ role: 'user' as const, content: extra.hint }] : [])],
        maxTokens: ANSWERING_MAX_TOKENS,
        ...(extra.stop === false ? {} : { stop: ['\n'] }),
        ...(extra.stream ? { onToken: extra.stream } : {}),
      },
      overrides,
    );

  const utteranceId = crypto.randomUUID();
  let firstWordAt: number | null = null;
  const gate = createSpeechGate((delta, whole) => {
    if (firstWordAt === null) firstWordAt = Date.now();
    emit({ phase: 'partial', utteranceId, characterId, text: whole, delta });
  });
  emit({ phase: 'start', utteranceId, characterId, characterName: ctx.name });

  let call: Awaited<ReturnType<typeof chat>>;
  try {
    call = await answerCall({ stream: gate.push });
  } catch (err) {
    // Close what 'start' opened; the caller maps the error (warming / offline) for the GM's eyes.
    emit({ phase: 'final', utteranceId, characterId, kind: 'rest', text: '', revoiced: false });
    throw err;
  }
  const streamed = gate.end();
  const fallback = `${ctx.name} pauses, unsure what to say, and lets the moment sit.`;
  const revoice = async () => (await answerCall({ hint: SPIRIT_REVOICE_HINT })).text;

  let line: { kind: GateKind; content: string } = { kind: streamed.kind, content: streamed.content };
  let revoiced = false;
  if (streamed.retracted) {
    // D1: the seal caught the line mid-stream. Withdraw what was shown, then today's path: one re-voice, else the template.
    console.warn(`[daya/ensemble] streamed line retracted for ${ctx.name}: rule=${streamed.retracted.rule} shown=${streamed.shown}`);
    if (streamed.shown) emit({ phase: 'retract', utteranceId, characterId, reason: 'seal', rule: streamed.retracted.rule });
    const sealed = await enforceSeal(streamed.raw, { entityId: ctx.entityDaId, subsystem: 'spirit_answer', fallback, revoice });
    // The template is a narrator's sentence, not her words: she lets the moment pass rather than speak it.
    line = sealed.usedFallback ? { kind: 'rest', content: '' } : readLine(sealed.text);
    revoiced = true;
  } else if (!streamed.raw.trim()) {
    // The stop sequence can swallow a reply that opens with a line break: ask once more without it.
    const sealed = await enforceSeal((await answerCall({ stop: false })).text, { entityId: ctx.entityDaId, subsystem: 'spirit_answer', fallback, revoice });
    line = sealed.usedFallback ? { kind: 'rest', content: '' } : readLine(sealed.text);
    revoiced = true;
  }
  const lineMs = Date.now() - t0;
  emit({ phase: 'final', utteranceId, characterId, kind: line.kind, text: line.content, revoiced });

  // What it just did is part of what it carries into the next stretch.
  const own = line.kind === 'speak' ? `You said: "${line.content}"` : line.kind === 'act' ? `You: ${line.content}` : null;
  const carried = [...heard, ...(spokenHeard ? [spokenHeard] : []), ...(own ? [own] : [])].slice(-HEARD_KEEP);
  setListening(characterId, { ...(getListening(characterId) ?? state), heard: carried, updatedAt: Date.now() });

  // Everything behind the line happens after it is out.
  const after = (async () => {
    const out: { memoryEntryId?: string; spokenMemoryId?: string } = {};
    try {
      const unstored = [...takenBackHeard, ...(spoken ? [spoken] : [])];
      for (const h of unstored) {
        if (!h.prose) continue;
        const ingest = await ingestStimulus({ entityId: ctx.entityDaId, cycle: ctx.cycle, source: h.source, content: h.prose, extraClassification: { mirror: { voiced: false, standing: h.standing } } }, overrides);
        if (ingest.persisted) out.memoryEntryId = ingest.memoryEntryId;
      }
      if (line.kind === 'speak') {
        const memory = await writeMemoryEntry({
          entityId: ctx.entityDaId,
          narrativeCycle: ctx.cycle,
          source: 'dialogue',
          content: line.content,
          valence: 0,
          arousal: 0.1,
          salience: 0.2,
          classification: { contentCategory: 'dialogue', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'own words spoken' },
        });
        out.spokenMemoryId = memory.id;
      } else if (line.kind === 'act') {
        await actOnIntent(ctx, line.content, overrides);
      }
    } catch (err) {
      console.error('[daya/ensemble] bookkeeping after an answer failed (non-fatal):', err);
    }
    return out;
  })();

  return {
    utteranceId,
    action: line.kind === 'rest' ? { kind: 'rest' } : { kind: line.kind, content: line.content },
    timings: { waitMs, listen, ttftMs: call.ttftMs ?? null, firstWordMs: firstWordAt === null ? null : firstWordAt - t0, lineMs, tokensOut: call.tokensOut, retracted: streamed.retracted !== null, revoiced },
    after,
  };
}
