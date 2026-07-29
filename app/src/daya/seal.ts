/**
 * The canonical embodiment seal (Ruling 13) — enforced by DATA FLOW, not by
 * trusting any prompt. Two zones:
 *
 *   Phenomenal zone — anything that enters the Spirit Core's context or
 *   leaves it for delivery. Machinery zone — everything else (tagger JSON,
 *   router, adjudicator JSON, true sheet, affect numbers). Numbers and
 *   mechanics live only in the machinery zone.
 *
 * `sealLint()` runs on every string crossing INTO the phenomenal zone and
 * every Spirit output before delivery. `enforceSeal()` is the reusable
 * re-voice-once-then-template-fallback loop every converter (Soul Sim, Body
 * Interface inward, Spirit Core, Dream) uses at that boundary — every hit,
 * on every attempt, writes a `seal_hit` audit row (a zero-cost synthetic
 * DayaModelCall row, content-free rationale) so a defect is always visible
 * even when the fallback silently absorbs it.
 *
 * This module is deliberately separate from renderer-math.ts's own
 * `sealLint` (WP5) and recall.ts's `localSealLint` (WP4) — both predate this
 * file and are load-bearing for their own WPs' tests; this is the canonical
 * version new WP9+ code (the ensemble, the six role prompts) uses. Folding
 * the earlier two into this one is a follow-up, not done here to avoid
 * destabilizing WP4/WP5's passing test suites.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export type SealSeverity = 'HARD' | 'SOFT';

export interface SealHit {
  severity: SealSeverity;
  pattern: string; // human tag of which rule fired — content-free
  match: string;    // the actual matched substring (used for audit/debug only, never re-delivered)
}

// ── HARD: numeric-mechanics + unambiguous meta vocabulary (spec §0.3) ─────

// Two independent top-level alternatives (not one shared-leading-\b group):
// \b does not match between two non-word characters (e.g. a space and a
// leading "+"/"-"), so the signed-modifier alternative cannot share a
// leading \b with the others — it needs no leading boundary at all, since
// the sign character itself is specific enough (mirrors the same fix
// documented in renderer-math.ts's own SEAL_LINT_REGEX).
const HARD_NUMERIC_PATTERN =
  /\bDR\s?\d+\b|\bd(?:4|6|8|10|12|20)\b|\b\d+\s?\/\s?\d+\s?(?:pool|points)\b|[+-]\d+\s?(?:to|on)\s?\w+/i;

const HARD_META_TERMS = [
  'dice',
  'roll a',
  'stats?',
  'character sheet',
  'hit points',
  'game master',
  'GM',
  'NPC',
  'player character',
  'KRMA',
  'prompt',
  'tokens?',
  'LLM',
  'AI model',
  'out of character',
];
const HARD_META_PATTERN = new RegExp(`\\b(${HARD_META_TERMS.join('|')})\\b`, 'i');

// ── SOFT: pillar attribute names used count-like (log only, no action) ────
// "my willpower is low" is legitimate English; "willpower 14" is HARD via
// the numeric rule above (which fires first and wins — see sealLint below).

const SOFT_ATTRIBUTE_TERMS = [
  'willpower', 'wit', 'wisdom', 'clout', 'celerity', 'constitution', 'focus', 'frequency', 'flow',
];
const SOFT_ATTRIBUTE_PATTERN = new RegExp(`\\b(${SOFT_ATTRIBUTE_TERMS.join('|')})\\b`, 'i');

/** Runs both HARD checks (numeric-mechanics, meta-vocabulary) and, only when
 * neither HARD rule fires, the SOFT attribute-name check. Order matters: a
 * SOFT hit is never reported alongside a HARD one for the same text — the
 * HARD hit is what matters operationally (re-voice/fallback), so SOFT noise
 * is suppressed once a HARD hit is already present. */
export function sealLint(text: string): SealHit[] {
  const hits: SealHit[] = [];

  const numeric = HARD_NUMERIC_PATTERN.exec(text);
  if (numeric) hits.push({ severity: 'HARD', pattern: 'numeric-mechanics', match: numeric[0] });

  const meta = HARD_META_PATTERN.exec(text);
  if (meta) hits.push({ severity: 'HARD', pattern: 'meta-vocabulary', match: meta[0] });

  if (hits.length === 0) {
    const soft = SOFT_ATTRIBUTE_PATTERN.exec(text);
    if (soft) hits.push({ severity: 'SOFT', pattern: 'attribute-name', match: soft[0] });
  }

  return hits;
}

export function hasHardHit(hits: SealHit[]): boolean {
  return hits.some((h) => h.severity === 'HARD');
}

// ── Audit trail ─────────────────────────────────────────────────────────

interface LogOpts {
  entityId?: string; // DayaEntity.id
  subsystem: string; // which converter/role produced the linted text
}

/** Writes one zero-cost synthetic DayaModelCall row per call with hits — the
 * rationale is content-free (severity+pattern tags only, never the matched
 * substring or surrounding text) so the audit trail itself can never leak
 * phenomenal-zone content. Never throws (a logging failure must not break
 * the delivery it's auditing). */
async function logSealHits(hits: SealHit[], opts: LogOpts): Promise<void> {
  if (hits.length === 0) return;
  try {
    await prisma.dayaModelCall.create({
      data: {
        entityId: opts.entityId,
        subsystem: 'seal',
        tier: 'SEAL',
        model: 'seal-lint',
        tokensIn: 0,
        tokensOut: 0,
        usd: 0,
        krma: 0,
        sanitized: true,
        rationale: `source=${opts.subsystem}|${hits.map((h) => `${h.severity}:${h.pattern}`).join(',')}`,
      },
    });
  } catch (err) {
    console.error('[daya/seal] failed to write seal_hit audit row (non-fatal):', err);
  }
}

// ── Enforcement loop: re-voice once, then template fallback ───────────────

export interface EnforceSealOpts {
  entityId?: string;               // DayaEntity.id, for metering/audit
  subsystem: string;                // which converter is calling
  fallback: string;                 // deterministic template used if both attempts fail
  revoice?: () => Promise<string>;  // optional single re-voice attempt on a HARD hit
}

export interface SealEnforceResult {
  text: string;
  hits: SealHit[];   // hits observed on the text actually returned (empty when clean or fallback used)
  usedFallback: boolean;
}

/**
 * The one enforcement primitive every phenomenal-zone boundary uses:
 *  - clean (no HARD) -> returned as-is (any SOFT hit is still logged).
 *  - HARD hit, no revoice supplied, or revoice still HARD -> template
 *    fallback, always logged at every attempt.
 *  - HARD hit, revoice supplied and comes back clean -> the revoiced text.
 * Also doubles as the "inbound" check (opts.revoice omitted) for text
 * entering the phenomenal zone from a non-model source (e.g. a GM
 * intervention) where there's nothing to re-voice, only hold-or-pass.
 */
export async function enforceSeal(text: string, opts: EnforceSealOpts): Promise<SealEnforceResult> {
  const firstHits = sealLint(text);
  if (!hasHardHit(firstHits)) {
    if (firstHits.length > 0) await logSealHits(firstHits, opts);
    return { text, hits: firstHits, usedFallback: false };
  }
  await logSealHits(firstHits, opts);

  if (opts.revoice) {
    let revoiced: string | null = null;
    try {
      revoiced = await opts.revoice();
    } catch (err) {
      console.error('[daya/seal] revoice attempt threw (falling back to template):', err);
    }
    if (revoiced !== null) {
      const secondHits = sealLint(revoiced);
      if (!hasHardHit(secondHits)) {
        if (secondHits.length > 0) await logSealHits(secondHits, opts);
        return { text: revoiced, hits: secondHits, usedFallback: false };
      }
      await logSealHits(secondHits, opts);
    }
  }

  return { text: opts.fallback, hits: [], usedFallback: true };
}
