/**
 * Thorn firing — persona harness mechanics coupling (Ruling 7).
 *
 * Thorns are the mechanical home of trauma/forgetting/liens: this module
 * detects when a stimulus matches an existing Thorn's trigger and translates
 * ONLY what the trait's own text already says (`description`,
 * `mechanicalEffect`, `rollModifiers`) into three things — never inventing a
 * new rule, only interpreting the sheet:
 *
 *   (a) an affect delta, via daya-affect's DispositionEvent pipeline
 *   (b) a WP4 ThornBlock (suppress | distort | affect-only) added to the
 *       entity's persisted active-blocks list, so recall.ts shapes around it
 *   (c) a felt line — dread, a blank, a flinch — logged to the ledger as the
 *       entity's own experience, never named "Thorn" anywhere it could reach
 *       her (Ruling 13: she feels it, she is never told what it is)
 *
 * Detection is deterministic, code-only (stemmed-keyword Jaccard against the
 * trait's own text, same primitive recall.ts and dream.ts already use for
 * clustering/relevance) — a Phase-1 engineering choice, not a model call, to
 * keep this fully testable and avoid spending a consult on every stimulus.
 *
 * Active ThornBlocks persist on DayaEntity.personaProfile (the existing
 * free-form JSON column WP9 already parses for bias/voice) under
 * `activeThornBlocks` — no schema change, same pattern WP10 used for
 * rumination-lock state in DayaMemoryEntry.classification.
 *
 * Also owns the WP4<->WP10 connector requested by the spec: recall.ts's
 * mood-repair congruence bonus should suppress itself while a rumination
 * lock (dream.ts) is active on ANY of the entity's memory clusters —
 * isRuminationLockActive() reads that same classification-JSON flag dream.ts
 * writes, without either module importing the other's internals.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type { GrowthCharacter, GrowthTrait } from '@/types/growth';
import { stemmedJaccard, seededRandom01, localSealLint, type ThornBlock } from '../recall';
import { writeMemoryEntry } from '../memory';
import { applyDispositionEvent } from '@/services/daya-affect';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Interpreting a Thorn's own text (never inventing new rules) ───────────

const SUPPRESS_PATTERN = /\b(forget|blank|black[- ]?out|erase|can'?t remember|lose(?:s)? the memory)\b/i;
const DISTORT_PATTERN = /\b(distort|warp|unreliable|blur|confus|misremember)\b/i;

export function deriveBlockMode(thorn: GrowthTrait): ThornBlock['mode'] {
  const text = `${thorn.description ?? ''} ${thorn.mechanicalEffect ?? ''}`;
  if (SUPPRESS_PATTERN.test(text)) return 'suppress';
  if (DISTORT_PATTERN.test(text)) return 'distort';
  return 'affect-only';
}

/** Strength from the trait's own authored rollModifiers magnitude when
 * present (bigger penalty = stronger block); a fixed conservative default
 * otherwise. Clamped 0.3..1 either way — never fully overriding recall on a
 * whim, never so weak it's inert. */
export function deriveBlockStrength(thorn: GrowthTrait): number {
  const flats = (thorn.rollModifiers ?? []).map((m) => Math.abs(m.flat));
  if (flats.length === 0) return 0.5;
  const maxFlat = Math.max(...flats);
  return clamp(0.3 + maxFlat / 10, 0.3, 1);
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'is', 'was', 'in', 'on', 'at', 'my', 'her', 'his', 'their']);

/** Longest non-stopword token in the trait's name — a deterministic,
 * bearer-agnostic matching keyword (ThornBlock.subjectPattern is a plain
 * substring match against memory content/entityRefs in recall.ts). */
export function deriveSubjectPattern(thorn: GrowthTrait): string {
  const words = thorn.name.toLowerCase().match(/[a-z']+/g) ?? [];
  const candidates = words.filter((w) => !STOPWORDS.has(w) && w.length > 2);
  if (candidates.length === 0) return thorn.name.toLowerCase();
  return candidates.reduce((a, b) => (b.length > a.length ? b : a));
}

export function deriveAffectDelta(mode: ThornBlock['mode'], strength: number): { valence: number; arousal: number } {
  const base = mode === 'suppress' ? 0.35 : mode === 'distort' ? 0.25 : 0.2;
  return { valence: -base * strength, arousal: base * strength };
}

const FELT_LINES: Record<ThornBlock['mode'], readonly string[]> = {
  suppress: [
    'Something in you slams shut before you can look at it.',
    'There is a door in you that will not open, and you stop reaching for the handle.',
  ],
  distort: [
    'The edges of it go soft and wrong, like looking through old glass.',
    'It shifts when you try to hold it steady, like a name on the tip of your tongue that keeps changing.',
  ],
  'affect-only': [
    "Your chest tightens and you don't know why.",
    'A cold feeling moves through you, without a name.',
    'Something in you flinches at nothing you can point to.',
  ],
};

function feltLineFor(seedKey: string, mode: ThornBlock['mode']): string {
  const templates = FELT_LINES[mode];
  const idx = Math.floor(seededRandom01(seedKey) * templates.length) % templates.length;
  const line = templates[idx];
  return localSealLint(line) ? line : "Something in you flinches at nothing you can point to.";
}

// ── Detection (code-only, deterministic) ───────────────────────────────────

const TRIGGER_JACCARD_THRESHOLD = 0.12;

export function thornMatchesStimulus(thorn: GrowthTrait, stimulusContent: string): boolean {
  const pattern = deriveSubjectPattern(thorn);
  if (pattern.length > 2 && stimulusContent.toLowerCase().includes(pattern)) return true;
  const thornText = `${thorn.name} ${thorn.description ?? ''} ${thorn.mechanicalEffect ?? ''}`;
  return stemmedJaccard(thornText, stimulusContent) >= TRIGGER_JACCARD_THRESHOLD;
}

// ── Active-block persistence (DayaEntity.personaProfile JSON) ──────────────

interface PersonaProfileThornSlice {
  activeThornBlocks?: ThornBlock[];
  [key: string]: unknown;
}

function parsePersonaProfile(raw: string): PersonaProfileThornSlice {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as PersonaProfileThornSlice) : {};
  } catch {
    return {};
  }
}

export async function loadActiveThornBlocks(entityDaId: string): Promise<ThornBlock[]> {
  const entity = await prisma.dayaEntity.findUnique({ where: { id: entityDaId }, select: { personaProfile: true } });
  if (!entity) return [];
  return parsePersonaProfile(entity.personaProfile).activeThornBlocks ?? [];
}

async function persistThornBlock(entityDaId: string, block: ThornBlock): Promise<void> {
  const entity = await prisma.dayaEntity.findUnique({ where: { id: entityDaId }, select: { personaProfile: true } });
  if (!entity) return;
  const profile = parsePersonaProfile(entity.personaProfile);
  const existing = profile.activeThornBlocks ?? [];
  const idx = existing.findIndex((b) => b.subjectPattern === block.subjectPattern && b.mode === block.mode);
  const next = idx >= 0
    ? existing.map((b, i) => (i === idx ? { ...b, strength: Math.max(b.strength, block.strength) } : b))
    : [...existing, block];
  await prisma.dayaEntity.update({
    where: { id: entityDaId },
    data: { personaProfile: JSON.stringify({ ...profile, activeThornBlocks: next }) },
  });
}

// ── WP4<->WP10 rumination-lock connector ───────────────────────────────────

function parseClassification(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** True when ANY of the entity's memory clusters currently carries dream.ts's
 * `ruminationLock: true` anchor marker — used to gate recall.ts's mood-repair
 * bias (computeMoodCongruence's `ruminationLockActive` param), so a locked
 * entity doesn't get pulled toward positive memories to self-soothe while a
 * trauma loop is actively deepening (T0 §C / WP10 spec §4). */
export async function isRuminationLockActive(entityDaId: string): Promise<boolean> {
  const rows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entityDaId }, select: { classification: true } });
  return rows.some((r) => parseClassification(r.classification).ruminationLock === true);
}

// ── Fire ────────────────────────────────────────────────────────────────

export interface ThornFireResult {
  name: string;
  block: ThornBlock;
  feltLine: string;
}

/**
 * Reads the TRUE sheet's Thorn traits, fires every one whose trigger matches
 * the stimulus: persists its ThornBlock, fires a DispositionEvent (affect
 * delta), and writes a ledger entry (the felt line, as the entity's own
 * perceived experience — never labeled a Thorn anywhere near her).
 */
export async function detectAndFireThorns(input: {
  characterId: string;
  entityDaId: string;
  cycle: number;
  stimulusContent: string;
}): Promise<{ fired: ThornFireResult[] }> {
  const character = await prisma.character.findUnique({ where: { id: input.characterId }, select: { data: true } });
  if (!character) return { fired: [] };

  let sheet: Partial<GrowthCharacter>;
  try {
    sheet = JSON.parse(character.data) as Partial<GrowthCharacter>;
  } catch {
    return { fired: [] };
  }

  const thorns = (sheet.traits ?? []).filter((t) => t.type === 'thorn');
  const fired: ThornFireResult[] = [];

  for (const thorn of thorns) {
    if (!thornMatchesStimulus(thorn, input.stimulusContent)) continue;

    const mode = deriveBlockMode(thorn);
    const strength = deriveBlockStrength(thorn);
    const subjectPattern = deriveSubjectPattern(thorn);
    const block: ThornBlock = { subjectPattern, mode, strength };
    const delta = deriveAffectDelta(mode, strength);
    const feltLine = feltLineFor(`thorn:${input.entityDaId}:${thorn.name}:${input.cycle}`, mode);

    await persistThornBlock(input.entityDaId, block);
    await applyDispositionEvent(input.characterId, {
      kind: 'thorn_fired',
      deltas: { morale: 0, stress: clamp(delta.arousal, 0, 1), grief: clamp(-delta.valence * 0.5, 0, 1) },
      beat: feltLine,
    });

    try {
      await writeMemoryEntry({
        entityId: input.entityDaId,
        narrativeCycle: input.cycle,
        source: 'perception',
        content: feltLine,
        valence: clamp(delta.valence, -1, 1),
        arousal: clamp(delta.arousal, 0, 1),
        salience: clamp(0.2 + strength * 0.2, 0, 1),
        classification: { contentCategory: 'perception', sensitivity: 'sensitive', icOoc: 'IC', rationaleTag: 'internal trigger, felt not named' },
      });
    } catch (err) {
      console.error('[daya/thorns] failed to write ledger entry for a fired thorn (non-fatal):', err);
    }

    fired.push({ name: thorn.name, block, feltLine });
  }

  return { fired };
}
