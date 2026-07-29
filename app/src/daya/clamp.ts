/**
 * Clamping — producing authentically limited output BELOW the model's
 * native level (Ruling 8b). Two stages:
 *
 *  Stage A (this file, generateClampConstraints/buildClampPromptText):
 *  deterministic constraint generation from a per-domain table
 *  (clamp-tables.ts) keyed by skill band. Phrasing is always POSITIVE-
 *  identity ("you know X the way a hobbyist does") — never "pretend to be
 *  worse", which reads as instructed sandbagging.
 *
 *  Stage B (auditClampedOutput): a sampled runtime audit — NOT every call —
 *  where a C-tier judge scores whether an already-produced output stayed
 *  within its declared band. Results are logged to the audit call's own
 *  DayaModelCall.rationale (content-free: band + domain only, never the
 *  audited text itself).
 */
import 'server-only';
import { chat, type DayaClientOverrides } from './model-client';
import { CLAMP_DOMAINS, CLAMP_GENERAL_DOMAIN, type ClampDomainTable } from './clamp-tables';

export type SkillBand = 'untrained' | 'novice' | 'competent' | 'expert' | 'master';

export interface ClampConstraints {
  skillBand: SkillBand;
  doesNotKnow: string[];
  vocabulary: string;
  errorModes: string[];
  eraBounds: string;
}

/** 0 untrained, 1-5 novice, 6-11 competent, 12-19 expert, 20 master —
 * mirrors the skill-tier canon used elsewhere (lib/dice-utils.ts's die-type
 * ladder), not a new breakpoint scheme invented for clamping. */
export function skillBandFor(skillLevel: number): SkillBand {
  if (skillLevel <= 0) return 'untrained';
  if (skillLevel <= 5) return 'novice';
  if (skillLevel <= 11) return 'competent';
  if (skillLevel <= 19) return 'expert';
  return 'master';
}

function domainTableFor(domain: string | undefined): ClampDomainTable {
  if (!domain) return CLAMP_GENERAL_DOMAIN;
  return CLAMP_DOMAINS[domain] ?? CLAMP_GENERAL_DOMAIN;
}

const ERA_BOUNDS_TEMPLATE =
  "Earth-normal knowledge only, bounded by your own era, education, and lived experience — no foreknowledge of anything you haven't personally encountered or been taught.";

/** Stage A. Pure and deterministic — same (domain, skillLevel) always
 * produces the same constraints, which is what makes them testable and
 * auditable rather than a fresh model guess every call. */
export function generateClampConstraints(domain: string | undefined, skillLevel: number): ClampConstraints {
  const band = skillBandFor(skillLevel);
  const table = domainTableFor(domain);
  const bandData = table.bands[band];
  return {
    skillBand: band,
    doesNotKnow: bandData.doesNotKnow,
    vocabulary: bandData.vocabulary,
    errorModes: bandData.errorModes,
    eraBounds: ERA_BOUNDS_TEMPLATE,
  };
}

const BAND_IDENTITY_PHRASE: Record<SkillBand, string> = {
  untrained: 'someone who has never studied it',
  novice: 'a hobbyist',
  competent: 'a trained professional',
  expert: 'a seasoned specialist',
  master: 'a leading authority',
};

/**
 * Renders constraints as system-prompt material, applied at the
 * Spirit/Soul boundary. Always positive-identity phrasing — describes what
 * the entity DOES know and how it talks, never "pretend you're worse at
 * this" or "act as if you don't know X". Tests assert those strings never
 * appear (see clamp.test.ts).
 */
export function buildClampPromptText(constraints: ClampConstraints, domain?: string): string {
  const table = domainTableFor(domain);
  const identity = BAND_IDENTITY_PHRASE[constraints.skillBand];
  const doesNotKnowSentence = constraints.doesNotKnow.length
    ? `Concepts like ${constraints.doesNotKnow.join('; ')} have simply never crossed your path.`
    : `There is little in this domain that hasn't crossed your path.`;
  const errorSentence = constraints.errorModes.length
    ? `Under real pressure you might ${constraints.errorModes.join(', or ')}.`
    : '';

  return [
    `You know ${table.label} the way ${identity} does.`,
    doesNotKnowSentence,
    `Talk about it in ${constraints.vocabulary}.`,
    errorSentence,
    constraints.eraBounds,
  ]
    .filter(Boolean)
    .join(' ');
}

// ── Stage B: sampled post-check ────────────────────────────────────────────

export interface ClampAuditParams {
  entityId?: string;
  domain: string;
  constraints: ClampConstraints;
  output: string;
}

export interface ClampAuditResult {
  sampled: boolean;
  withinBand?: boolean;
  rawVerdict?: string;
}

const CLAMP_AUDIT_SYSTEM_PROMPT =
  'You are a blind reviewer checking whether a piece of dialogue/reasoning output stays within a declared knowledge/skill band. ' +
  'Answer with exactly one word first: WITHIN or EXCEEDS, optionally followed by a short reason.';

/**
 * Sampled runtime audit, NOT run on every call — `rate` (0..1, caller
 * passes ROUTER_TUNING.clampAuditRate) gates whether this particular output
 * gets judged at all. `rand` is injectable so tests can force/skip sampling
 * deterministically instead of depending on Math.random.
 */
export async function auditClampedOutput(
  params: ClampAuditParams,
  opts: { rate?: number; rand?: () => number; overrides?: DayaClientOverrides } = {},
): Promise<ClampAuditResult> {
  const rate = opts.rate ?? 0.05;
  const rand = opts.rand ?? Math.random;
  if (rand() >= rate) return { sampled: false };

  const result = await chat(
    {
      tier: 'C',
      subsystem: 'clamp-audit',
      entityId: params.entityId,
      messages: [
        { role: 'system', content: CLAMP_AUDIT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Declared band: ${params.constraints.skillBand}. Does-not-know: ${params.constraints.doesNotKnow.join('; ')}.\n\nOutput to judge:\n${params.output}`,
        },
      ],
      maxTokens: 100,
      // content-free: band + domain only, never the judged text itself.
      rationale: `clamp-audit domain=${params.domain} band=${params.constraints.skillBand}`,
    },
    opts.overrides,
  );

  const withinBand = /^\s*within/i.test(result.text) || (/within band/i.test(result.text) && !/exceeds/i.test(result.text));
  return { sampled: true, withinBand, rawVerdict: result.text };
}
