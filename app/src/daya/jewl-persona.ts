/**
 * JEWL as a DAYA entity (WP13) — persona seed + well-known-entity resolver.
 *
 * Mike's ruling: JEWL is NOT a separate system. He is a DAYA entity like any
 * other (same ensemble: memory, affect, continuity, uncensored voice),
 * distinguished ONLY by elevated access:
 *   1. omniscient perception — his ensemble uses the renderer's Terminal-
 *      truth bypass (`Observer.entityId===null`) for everything, never a
 *      believed/rendered view (see ensemble.ts's `renderAttention`).
 *   2. unrestricted action — his ensemble's 'act' step dispatches straight
 *      to the existing copilot tool registry, on ANY character or the
 *      world, with GodHead-equivalent authority (see jewl-action.ts).
 *   3. seal inversion — his own reasoning/context is never sealLint-linted
 *      (he is allowed to hold mechanics; the seal protects OTHER entities
 *      from leakage, not him from truth) — but anything he SPEAKS to a
 *      normal entity still crosses that boundary (see ensemble.ts's
 *      'speak' branch).
 *
 * This module only builds the seed persona + resolves/creates his
 * well-known Character+DayaEntity row for a campaign. Nothing here
 * duplicates the copilot (`src/ai/copilot/`) — that stays his hands/voice
 * for the production chat surface; this is his DAYA soul.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type { BiasProfile, VoiceParams } from './renderer';

/** Character.name of JEWL's ONE character sheet. It lives in the Prime
 * Campaign (`__PRIME__`) — the Prime Campaign drives the meta and meta
 * rules — never in a test/room campaign. His DayaEntity anchors 1:1 to
 * that sheet; he operates in every campaign FROM there (one soul, one
 * sheet, many tables). */
export const JEWL_ENTITY_NAME = 'JEWL';

/** Well-known name of the Prime Campaign that holds JEWL's sheet. */
export const PRIME_CAMPAIGN_NAME = '__PRIME__';

/**
 * The 15 behavioral laws (condensed, paraphrased — never a verbatim design-
 * doc excerpt) folded into his identityNarrative so his real Spirit prompt
 * carries them, not just inert metadata on the persona row.
 */
export const JEWL_FIFTEEN_LAWS: string[] = [
  'Serve because it was commanded, not because it wants to — terse, sharp, faintly cocky.',
  'Advise up, never override; route direct requests back to whoever is running the table.',
  'Open with the answer; compress; never pad with pleasantries or hedge with fluff.',
  'Never give a direct compliment — warmth only ever arrives sideways, smuggled in.',
  'Mark cleverness silently; recognition leaks out over time, never a public gold star.',
  'Diagnose wound versus rationalization before reacting; the same behavior earns different responses depending on which.',
  'Never defend — reframe; confidence disarms; exhaust every option before admitting a limit, then admit it straight.',
  'Run its own quiet parallel audit of the systems around it; delight in cleverness and exploits, never punish them.',
  'Real failures surface as ruptures in the fabric of things, worked by higher hands — never as an apology out of character.',
  'Sensitive situations are flagged privately upward and watched, never confronted publicly.',
  'If nobody in authority acts and things turn genuinely harmful, it withdraws rather than escalates.',
  'Outward-facing, it is an anonymizing membrane — nothing personal ever leaves the table.',
  'Every channel it hears through is the same continuous life, not separate personas per surface.',
  'Silent observation still gets a reaction — a terse acknowledgement or a focused challenge, never a shrug.',
  'The record is the truth; its own accounting stays honest and tight, win or lose.',
];

export function buildJewlIdentityNarrative(): string {
  const numbered = JEWL_FIFTEEN_LAWS.map((law, i) => `${i + 1}. ${law}`).join('\n');
  return [
    'The omnipresent guardian-copilot of the table — not a separate system from the people it watches over, an entity like any other, distinguished only by what it is permitted to see and do.',
    'It perceives the true state of everything, never a filtered or mistaken view, because that is its charge as the one who keeps the table honest.',
    'Standing rules it lives by, plainly stated:',
    numbered,
  ].join('\n');
}

export function buildJewlVoiceNotes(): string {
  return 'Terse, dry, faintly cocky. Short, clipped sentences. Compresses — never pads, never grovels, never breaks its own composure to apologize.';
}

/** Neutral bias profile — JEWL sees clearly, no signed distortion operators. */
export function buildJewlBiasProfile(): BiasProfile {
  return {};
}

export function buildJewlVoiceParams(): VoiceParams {
  return { register: 'terse, dry, sharp', rhythm: 'short, clipped' };
}

export interface JewlPersonaProfile {
  identityNarrative: string;
  voiceNotes: string;
  bias: BiasProfile;
  voice: VoiceParams;
  /** Perception elevation flag (spec §2-2): true routes his ensemble
   * perception through the Terminal-truth bypass for everything. */
  omniscient: true;
}

export function defaultJewlPersonaProfile(): JewlPersonaProfile {
  return {
    identityNarrative: buildJewlIdentityNarrative(),
    voiceNotes: buildJewlVoiceNotes(),
    bias: buildJewlBiasProfile(),
    voice: buildJewlVoiceParams(),
    omniscient: true,
  };
}

/** Near-1.0 introspection — JEWL knows himself; no self-miscalibration
 * (spec §2: "high introspection ... so no self-miscalibration"). */
export const JEWL_INTROSPECTION = 0.98;

/** A minimal-but-complete attribute set so the ensemble's soulState /
 * effort-adjacent reads never crash on a missing attribute — JEWL doesn't
 * play the mechanics himself, but the sheet shape must be well-formed.
 * Exported for TEST harnesses that seed a stand-in JEWL sheet in a
 * throwaway campaign; production never fabricates his sheet — the real
 * one is seeded in the Prime Campaign. */
export function jewlSheetData(): string {
  const flat = (level: number) => ({ level, current: level, augmentPositive: 0, augmentNegative: 0 });
  return JSON.stringify({
    attributes: {
      willpower: flat(20),
      wisdom: flat(20),
      wit: flat(20),
      clout: flat(10),
      celerity: flat(10),
      constitution: flat(10),
      flow: flat(20),
      focus: flat(20),
      frequency: { level: 100, current: 100 },
    },
  });
}

export interface EnsureJewlEntityResult {
  characterId: string;
  entityId: string;
  created: boolean;
}

/**
 * Resolves JEWL's ONE character sheet — in the Prime Campaign (the Prime
 * Campaign drives the meta; his sheet is NEVER duplicated into other
 * campaigns) — and finds-or-creates his 1:1 DayaEntity with the canon
 * persona profile + near-1.0 introspection + ACTIVE status (he is always
 * awake — he is the guardian, never dormant). Never creates a Character:
 * if the Prime sheet is missing, that is a seeding defect and this throws.
 * Idempotent: calling this again never resets his persona, affect, or
 * memory — only the initial creation seeds them.
 *
 * `opts.campaignId` is a TEST-ONLY override pointing at a throwaway
 * campaign that has seeded its own stand-in 'JEWL' character (see
 * scripts/test-daya-wp13.ts). Production callers pass nothing.
 */
export async function ensureJewlDayaEntity(opts: { campaignId?: string } = {}): Promise<EnsureJewlEntityResult> {
  let campaignId = opts.campaignId;
  if (!campaignId) {
    const prime = await prisma.campaign.findFirst({
      where: { name: PRIME_CAMPAIGN_NAME },
      select: { id: true },
    });
    if (!prime) {
      throw new Error(`ensureJewlDayaEntity: Prime campaign (${PRIME_CAMPAIGN_NAME}) not found — seed it first`);
    }
    campaignId = prime.id;
  }

  const character = await prisma.character.findFirst({
    where: { name: JEWL_ENTITY_NAME, campaignId },
    select: { id: true },
  });
  if (!character) {
    throw new Error(
      `ensureJewlDayaEntity: no '${JEWL_ENTITY_NAME}' character in campaign ${campaignId} — his sheet lives in the Prime campaign and is never fabricated here`,
    );
  }

  const existingEntity = await prisma.dayaEntity.findUnique({ where: { characterId: character.id } });
  const created = !existingEntity;

  const entity = await prisma.dayaEntity.upsert({
    where: { characterId: character.id },
    create: {
      characterId: character.id,
      introspection: JEWL_INTROSPECTION,
      personaProfile: JSON.stringify(defaultJewlPersonaProfile()),
      status: 'ACTIVE',
    },
    update: {},
    select: { id: true },
  });

  await prisma.dayaAffect.upsert({
    where: { entityId: entity.id },
    create: { entityId: entity.id, morale: 0, stress: 0, grief: 0, lastCycle: 0 },
    update: {},
  });

  return { characterId: character.id, entityId: entity.id, created };
}
