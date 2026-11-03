/**
 * Persona harness perceptual layer — renderer.ts.
 *
 * `render()` is how an AI-controlled entity perceives ANYTHING (its own
 * stats, a possession, the environment, another entity, a relationship):
 * the caller hands over the engine's exact truth plus an observer
 * (attunement, bias profile, mood, voice), and gets back first-person
 * perception prose plus an audit trail of the distortions applied.
 *
 * Two-stage pipeline, deliberately split:
 *   1. Deterministic math (renderer-math.ts) decides WHAT the observer can
 *      know, and with what error — fidelity ladder, bias operators, mood
 *      tilt, seeded noise. Fully DB-free and unit-testable.
 *   2. One L1 model call decides HOW IT SOUNDS — voicing the math's content
 *      envelope in the entity's own diction. The model may never assert
 *      anything outside that envelope; a post-check rejects and re-voices
 *      once, then falls back to the deterministic template — perception
 *      must never fail loudly (fail-local, since this is the entity's own
 *      inner sense and therefore sensitive by definition).
 *
 * `entityId` throughout is the Character id — the same handle
 * services/daya-affect.ts and daya/events.ts use — not the DayaEntity row
 * id. `observer.entityId === null` is the Terminal view-switcher bypass:
 * raw truth, no transformation, no model call.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import {
  computeDescriptiveContent,
  computeFidelityLevel,
  computeNumericContent,
  computeSceneContent,
  isNumericStat,
  isSceneTruth,
  rngFor,
  sealLint,
  type AffectVector,
  type BiasProfile,
  type RenderSubject,
  type VoiceParams,
} from './renderer-math';
import { chat, proseTier, type DayaClientOverrides } from './model-client';
import { resolveDayaEntityId } from './entity';

// ── Public contract (WP5 §1) ────────────────────────────────────────────

export interface Observer {
  entityId: string | null; // null = Terminal (bypass)
  attunement: number;      // 0..1 — self-view: introspection; other-view: familiarity
  biasProfile: BiasProfile;
  mood: AffectVector;
  voice: VoiceParams;
}

export interface RenderRequest {
  subject: RenderSubject;
  subjectKey: string;   // e.g. 'pool.willpower', WorldFact.subjectKey, characterId
  trueData: unknown;    // engine-owned exact value(s)
  context?: string;     // situational framing
}

export interface RenderedView {
  prose: string;
  fidelityLevel: number;
  distortions: string[]; // audit tags, JEWL-visible only — never in prose
}

export { type BiasProfile, type VoiceParams, type AffectVector, type RenderSubject } from './renderer-math';

// ── Terminal bypass ──────────────────────────────────────────────────────

function formatRawTruth(trueData: unknown): string {
  if (typeof trueData === 'string') return trueData;
  try {
    return JSON.stringify(trueData);
  } catch {
    return String(trueData);
  }
}

// ── Revision epoch lookup (DayaBelievedSheet.data._epochs) ─────────────
// Character id -> DayaEntity.id resolution now lives in entity.ts
// (resolveDayaEntityId) — the canonical, once-per-wake resolution point
// (WP9 FIX-2). This module used to upsert locally; it now defers there.

interface BelievedSheetData {
  _epochs?: Record<string, number>;
  [key: string]: unknown;
}

function parseBelievedData(raw: string | null | undefined): BelievedSheetData {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as BelievedSheetData) : {};
  } catch {
    return {};
  }
}

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof cursor[seg] !== 'object' || cursor[seg] === null) cursor[seg] = {};
    cursor = cursor[seg] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

async function currentRevisionEpoch(entityDaId: string, subjectKey: string): Promise<number> {
  const sheet = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: entityDaId } });
  const data = parseBelievedData(sheet?.data);
  return data._epochs?.[subjectKey] ?? 0;
}

// ── Voicing (the single L1 call) ────────────────────────────────────────

interface VoicingParams {
  req: RenderRequest;
  observer: Observer;
  entityDaId: string; // DayaEntity.id (metering FK) — NOT observer.entityId (Character id)
  level: number;
  envelopeProse: string; // deterministic content the model is anchored to
  overrides?: DayaClientOverrides;
}

function buildVoicingSystemPrompt(voice: VoiceParams, level: number, subject: RenderSubject): string {
  const register = voice.register ? `Vocabulary register: ${voice.register}.` : '';
  const rhythm = voice.rhythm ? `Sentence rhythm: ${voice.rhythm}.` : '';
  const images = voice.images?.length ? `Characteristic images this voice reaches for: ${voice.images.join(', ')}.` : '';
  return [
    'You voice a single moment of first-person (or close-second) perception for an AI-controlled character — how something FEELS from inside, never a game report.',
    'You are given an honest CONTENT ENVELOPE: the exact facts and degree of uncertainty this character is allowed to perceive right now. Voice ONLY what is in the envelope, in this character\'s own words — never invent facts outside it, never add numbers or specifics the envelope does not contain.',
    `Perceived subject type: ${subject}. Fidelity: level ${level} out of 5 (0 = no reliable signal, 5 = exact).`,
    register, rhythm, subject === 'scene' ? '' : images,
    subject === 'scene'
      ? [
        'The envelope is the scene around this character right now: what was just narrated, then the place, who is present, what is there. Voice it as one moment of noticing.',
        'What just happened comes FIRST and is never dropped, softened or turned into something else: a phone ringing stays a phone ringing, a voice saying words stays that voice saying those words. Then only as much of the place as the moment touches.',
        'Keep every name and every spoken line exactly as the envelope gives them, with the speaker the envelope gives them; never turn another person\'s words into this character\'s own. Drop nothing the envelope marks as said.',
        // SESSION 2 (2026-11-02): every perception came back as mood-weather ("a held breath", "a wet wool blanket", "the
        // streetlamps hum their flat orange lie") and the beings' thoughts were built from it. Senses are plain; the voice is in what is noticed.
        'Plain senses, in plain words: what is seen, heard, felt, smelled, as it is. No metaphors and no similes, no weather of mood (silence as weight, a room holding its breath, light as a lie, the dark pressing in). The character shows in WHAT they notice and the words they would use, not in imagery. A thing not in the envelope is not there.',
        // Session 2 replay (2026-11-02): "Violet's phone continues to ring as Kristopher prepares himself to leave a voicemail" gave her "Kristopher is gathering his breath on the other end".
        'What a person who is NOT here with this character is doing elsewhere cannot be sensed: leave it out entirely, unless the envelope says it reaches them (a voice on an answered line). A ringing phone does not tell who is calling.',
      ].join(' ')
      : '',
    `Write at most ${subject === 'scene' ? 4 : 3} sentences. First-person or close-second only. Never use game-mechanical vocabulary: no "roll", "DR", "pool", "KRMA", "modifier", "tier", die-type names (d4/d6/d8/d10/d12/d20), or a signed number attached to an attribute name (e.g. "+3 Willpower"). This is lived experience, not a rules readout.`,
  ].filter(Boolean).join('\n');
}

/** Rough envelope-diff: for F0-F2 the content carries no magnitude at all,
 * so any digit in the voiced text is an invented specific. For F3+ the
 * envelope already states the felt numeric content, so digits are allowed. */
function violatesEnvelope(text: string, level: number, subject?: RenderSubject): boolean {
  if (subject === 'scene') return false; // the scene envelope carries its own specifics; digits in it are legitimate
  if (level <= 2 && /\d/.test(text)) return true;
  return false;
}

async function voiceRendering(params: VoicingParams): Promise<{ prose: string; usedFallback: boolean }> {
  const { req, observer, entityDaId, level, envelopeProse, overrides } = params;
  const systemPrompt = buildVoicingSystemPrompt(observer.voice, level, req.subject);
  const userPrompt = [
    `What is being perceived: ${req.subject} (${req.subjectKey}).`,
    req.context ? `Situation: ${req.context}` : '',
    `Content envelope (the honest truth this character may perceive, at this fidelity): ${envelopeProse}`,
    'Voice this as the character\'s own felt perception, in at most 3 sentences.',
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const attempt = async (retryHint?: string) => {
    const finalMessages = retryHint
      ? [...messages, { role: 'user' as const, content: retryHint }]
      : messages;
    return chat(
      {
        tier: proseTier(), // PROSE ON THE CLOUD (Michael 2026-11-03) — see model-client proseTier
        subsystem: 'renderer',
        contentClass: 'fiction',
        entityId: entityDaId,
        messages: finalMessages,
        maxTokens: req.subject === 'scene' ? 450 : 200,
        sanitized: true,
      },
      overrides,
    );
  };

  try {
    const first = await attempt();
    const lint = sealLint(first.text);
    if (lint.ok && !violatesEnvelope(first.text, level, req.subject) && first.text.trim().length > 0) {
      return { prose: first.text.trim(), usedFallback: false };
    }

    // One re-voice with a stricter reminder.
    const second = await attempt(
      'Your previous answer used mechanical vocabulary or stated specifics outside the content envelope. Try again, strictly within the envelope, with no mechanical vocabulary.',
    );
    const lint2 = sealLint(second.text);
    if (lint2.ok && !violatesEnvelope(second.text, level, req.subject) && second.text.trim().length > 0) {
      return { prose: second.text.trim(), usedFallback: false };
    }

    return { prose: envelopeProse, usedFallback: true };
  } catch {
    // L1 unavailable/erroring — fail-local, never fail loudly.
    return { prose: envelopeProse, usedFallback: true };
  }
}

// ── Content computation (shared by render() and applyRevision()) ────────

interface ComputedContent {
  fraction: number;
  numericEstimate: number;
  prose: string;
  distortions: string[];
}

function computeContent(
  req: RenderRequest,
  bias: BiasProfile,
  mood: AffectVector,
  level: number,
  rng: () => number,
): ComputedContent {
  if (req.subject === 'scene' && isSceneTruth(req.trueData)) {
    return computeSceneContent(
      { subject: req.subject, subjectKey: req.subjectKey, trueData: req.trueData, context: req.context },
      bias, mood, level, rng,
    );
  }
  if (isNumericStat(req.trueData)) {
    return computeNumericContent(
      { subject: req.subject, subjectKey: req.subjectKey, trueData: req.trueData, context: req.context },
      bias, mood, level, rng,
    );
  }
  return computeDescriptiveContent(
    { subject: req.subject, subjectKey: req.subjectKey, trueData: req.trueData, context: req.context },
    bias, mood, level, rng,
  );
}

// ── render() — the public entry point ────────────────────────────────────

export async function render(
  req: RenderRequest,
  observer: Observer,
  overrides: DayaClientOverrides = {},
): Promise<RenderedView> {
  if (observer.entityId === null) {
    // Terminal view-switcher bypass — exact data, no prose transformation.
    return { prose: formatRawTruth(req.trueData), fidelityLevel: 5, distortions: [] };
  }

  const level = computeFidelityLevel(req.subject, observer.attunement);
  const entityDaId = await resolveDayaEntityId(observer.entityId);
  const epoch = await currentRevisionEpoch(entityDaId, req.subjectKey);
  const rng = rngFor(observer.entityId, req.subjectKey, epoch);

  const content = computeContent(req, observer.biasProfile, observer.mood, level, rng);
  const voiced = await voiceRendering({ req, observer, entityDaId, level, envelopeProse: content.prose, overrides });

  return { prose: voiced.prose, fidelityLevel: level, distortions: content.distortions };
}

// ── Believed Sheet revision loop (WP5 §6) ────────────────────────────────

export interface RevisionResult {
  subjectKey: string;
  believedValue: number;
  epoch: number;
  distortions: string[];
}

/**
 * Fires on a revision event (significant exertion, rest completion, dream
 * tick reflection, direct feedback experience): computes this entity's
 * fidelity+bias distorted numeric estimate for the given true stat, and
 * converges the stored believed value toward it — the convergence RATE is
 * the observer's attunement, so a highly introspective entity's believed
 * value tracks reality closely across repeated revisions, while a
 * low-introspection or heavily biased entity's believed value drifts and
 * lingers off-true (Phase-1 exit test 5). No L1 call here — only the
 * distorted numeric estimate is written, never prose (spec: "not prose").
 * Believed values move ONLY through revision events; between events the
 * entity reasons from its stale believed sheet.
 */
export async function applyRevision(
  characterId: string,
  subjectKey: string,
  trueStat: { current: number; max: number },
  observer: Pick<Observer, 'attunement' | 'biasProfile' | 'mood'>,
  subject: RenderSubject = 'self-stat',
): Promise<RevisionResult> {
  const entityDaId = await resolveDayaEntityId(characterId);
  const sheet = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: entityDaId } });
  const data = parseBelievedData(sheet?.data);

  const priorEpoch = data._epochs?.[subjectKey] ?? 0;
  const nextEpoch = priorEpoch + 1;
  const rng = rngFor(characterId, subjectKey, nextEpoch);

  const level = computeFidelityLevel(subject, observer.attunement);
  const content = computeNumericContent(
    { subject, subjectKey, trueData: trueStat },
    observer.biasProfile,
    observer.mood,
    level,
    rng,
  );
  const distortions = [...content.distortions];

  const priorBelieved = getAtPath(data, subjectKey);
  const freshEstimate = content.numericEstimate;
  const attunement = Math.min(1, Math.max(0, observer.attunement));

  // Convergence update: attunement acts as the learning rate toward the
  // fresh distorted read. With no prior belief, the fresh read IS the
  // belief. High attunement pulls a stale/divergent belief sharply toward
  // the fresh read (converges); low attunement barely moves it (drifts).
  const newBelieved =
    typeof priorBelieved === 'number'
      ? priorBelieved + attunement * (freshEstimate - priorBelieved)
      : freshEstimate;

  setAtPath(data, subjectKey, newBelieved);
  data._epochs = { ...(data._epochs ?? {}), [subjectKey]: nextEpoch };

  await prisma.dayaBelievedSheet.upsert({
    where: { entityId: entityDaId },
    create: { entityId: entityDaId, data: JSON.stringify(data) },
    update: { data: JSON.stringify(data), lastRevisedAt: new Date() },
  });

  return { subjectKey, believedValue: newBelieved, epoch: nextEpoch, distortions };
}

/** Reads the currently-believed value at a subjectKey path, if any
 * revision has ever written one. Used by tests and the JEWL true-vs-believed
 * diff surface (WP11). */
export async function getBelievedValue(characterId: string, subjectKey: string): Promise<number | undefined> {
  const entityDaId = await resolveDayaEntityId(characterId);
  const sheet = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: entityDaId } });
  const data = parseBelievedData(sheet?.data);
  const value = getAtPath(data, subjectKey);
  return typeof value === 'number' ? value : undefined;
}
