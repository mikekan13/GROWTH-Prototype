/**
 * World Adjudicator — resolves a declared intent from an AI-controlled
 * entity (the persona harness beneath an AI-controlled character sheet)
 * against the campaign's World Ledger using Earth-baseline physical
 * reasoning. Nothing physical exists only in prose: every claim in the
 * outcome must be grounded in an existing WorldFact or a newly established
 * one (Ruling 19).
 *
 * `resolveIntent` implements the WorldResolver interface below on purpose —
 * a future physics engine can replace the LLM-backed implementation without
 * any caller changing, as long as it honors the same input/output contract.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { unskilledCheck } from '@/lib/dice';
import type { FateDie, GrowthCharacter } from '@/types/growth';
import { chat, type DayaClientOverrides } from './model-client';
import { currentFacts, establishFact, supersede, type WorldFactRecord } from './world-ledger';
import { buildAdjudicatorPrompt } from './prompts/roles/adjudicator';
import { resolveDayaEntityId } from './entity';

// ── Contract (Ruling 19 — swappable behind this shape) ─────────────────────

export interface ResolveIntentInput {
  campaignId: string;
  entityCharacterId: string;
  intent: string;
  cycle: number;
}

export interface ExperienceEvent {
  content: string;
  valence: number;  // -1..1
  salience: number; // 0..1
}

export interface RollOutcome {
  attribute: string;
  dr: number;
  total: number;
  success: boolean;
}

export interface AdjudicationResult {
  outcome: string;
  factsWritten: WorldFactRecord[];
  factsSuperseded: WorldFactRecord[];
  experienceEvent: ExperienceEvent;
  roll?: RollOutcome;
}

/** Swappable resolution contract — a future physics engine implements this
 * same shape without callers (WP3 event bus, WP8 mechanics integration, ...)
 * changing. */
export interface WorldResolver {
  resolveIntent(input: ResolveIntentInput, overrides?: DayaClientOverrides): Promise<AdjudicationResult>;
}

interface AdjudicatorResponseShape {
  outcome: string;
  factsToWrite?: Array<{ subjectKey: string; fact: string }>;
  factsToSupersede?: Array<{ id: string; fact: string }>;
  check?: { attribute: string; dr: number } | null;
  experienceEvent: { content: string; valence: number; salience: number };
}

function parseAdjudicatorResponse(text: string): AdjudicatorResponseShape {
  // Strip markdown code fences if the model wrapped the JSON in one.
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new AppError('Adjudicator returned non-JSON output', 502);
  }
  const obj = parsed as Partial<AdjudicatorResponseShape>;
  if (typeof obj.outcome !== 'string' || !obj.experienceEvent) {
    throw new AppError('Adjudicator JSON missing required fields (outcome, experienceEvent)', 502);
  }
  return {
    outcome: obj.outcome,
    factsToWrite: obj.factsToWrite ?? [],
    factsToSupersede: obj.factsToSupersede ?? [],
    check: obj.check ?? null,
    experienceEvent: {
      content: obj.experienceEvent.content ?? '',
      valence: obj.experienceEvent.valence ?? 0,
      salience: obj.experienceEvent.salience ?? 0,
    },
  };
}

/** Best-effort extraction of a fate die to roll against — v0 simple: pulls
 * the character's seed baseFateDie if present, otherwise defaults to d8.
 * Real skill-specificity DR fit (Ruling 9) is deferred to WP8/WP9. */
function resolveFateDie(character: Partial<GrowthCharacter> | null): FateDie {
  const die = character?.creation?.seed?.baseFateDie;
  return die ?? 'd8';
}

/**
 * Resolve a declared intent: loads relevant WorldFacts + character basics,
 * calls the model client (tier C, subsystem 'adjudicator'), writes/supersedes
 * facts per the model's response (plus a same-subjectKey contradiction guard
 * so factsToWrite never silently duplicates a live fact), rolls a server-side
 * check when the model calls for one, and returns the outcome + experience
 * event for a caller (WP3 event bus / WP4 memory ingest) to persist.
 */
export async function resolveIntent(
  input: ResolveIntentInput,
  overrides: DayaClientOverrides = {},
): Promise<AdjudicationResult> {
  const { campaignId, entityCharacterId, intent, cycle } = input;

  const [facts, character] = await Promise.all([
    currentFacts(campaignId),
    prisma.character.findUnique({ where: { id: entityCharacterId }, select: { id: true, name: true, data: true } }),
  ]);

  if (!character) {
    throw new AppError(`Character not found: ${entityCharacterId}`, 404);
  }

  let sheet: Partial<GrowthCharacter> | null = null;
  try {
    sheet = JSON.parse(character.data) as Partial<GrowthCharacter>;
  } catch {
    sheet = null;
  }

  const factsBlock = facts.length > 0
    ? facts.map(f => `[${f.id}] ${f.subjectKey}: ${f.fact}`).join('\n')
    : '(no established facts yet)';

  const userMessage = [
    `## Current World Facts (campaign ${campaignId})`,
    factsBlock,
    '',
    `## Entity`,
    `Name: ${character.name}`,
    '',
    `## Declared Intent`,
    intent,
  ].join('\n');

  // FIX-2 (entityId convention): resolve Character id -> DayaEntity.id here,
  // at the model-client boundary, so this call's DayaModelCall row meters
  // against the entity like every other subsystem's does.
  const entityDaId = await resolveDayaEntityId(entityCharacterId);

  const modelResult = await chat(
    {
      tier: 'C',
      subsystem: 'adjudicator',
      entityId: entityDaId,
      messages: [
        { role: 'system', content: buildAdjudicatorPrompt() },
        { role: 'user', content: userMessage },
      ],
    },
    overrides,
  );

  const parsed = parseAdjudicatorResponse(modelResult.text);

  const factsSuperseded: WorldFactRecord[] = [];
  const factsWritten: WorldFactRecord[] = [];

  // Explicit supersessions the model asked for, by id.
  for (const item of parsed.factsToSupersede ?? []) {
    const old = await prisma.worldFact.findUnique({ where: { id: item.id } });
    if (!old || old.supersededById) continue; // already gone / already superseded — skip rather than error
    const replacement = await supersede(item.id, { fact: item.fact, cycle });
    factsSuperseded.push(old);
    factsWritten.push(replacement);
  }

  // New facts — guarded: if a live fact already exists for this subjectKey
  // (and wasn't just superseded above), supersede it instead of creating a
  // duplicate live row for the same subject. Nothing physical gets two
  // contradictory live facts at once.
  for (const item of parsed.factsToWrite ?? []) {
    const existing = (await currentFacts(campaignId, item.subjectKey))
      .find(f => !factsSuperseded.some(s => s.id === f.id));
    if (existing) {
      const replacement = await supersede(existing.id, { fact: item.fact, cycle });
      factsSuperseded.push(existing);
      factsWritten.push(replacement);
    } else {
      const created = await establishFact(campaignId, item.subjectKey, item.fact, cycle);
      factsWritten.push(created);
    }
  }

  let outcome = parsed.outcome;
  let roll: RollOutcome | undefined;

  if (parsed.check) {
    const fateDie = resolveFateDie(sheet);
    const result = unskilledCheck({ fateDie, effort: 0, dr: parsed.check.dr });
    roll = {
      attribute: parsed.check.attribute,
      dr: parsed.check.dr,
      total: result.total,
      success: result.success,
    };
    // v0 simple: append a plain-language success/failure note rather than
    // round-tripping to the model for a second pass (WP9 will do this properly).
    outcome = `${outcome} ${result.success ? 'It worked.' : "It didn't come together."}`.trim();
  }

  return {
    outcome,
    factsWritten,
    factsSuperseded,
    experienceEvent: parsed.experienceEvent,
    roll,
  };
}

export const llmAdjudicator: WorldResolver = { resolveIntent };
