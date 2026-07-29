/**
 * The sanitization boundary — everything that crosses from the trusted
 * L1/app boundary out to a consult (L2 or cloud C) passes through here
 * first. Three duties:
 *
 *  1. classifyTraffic() — the Tagger (WP4) wearing its second hat: a
 *     content-category / sensitivity / IC-OOC classification. Uncertain
 *     always resolves to 'sensitive' (fail-local) — no model call needed to
 *     decide that, code heuristics only.
 *  2. stripAndForward() + assertClean() — replace identifiers with role
 *     tokens before a payload leaves for C, then hard-sweep the result for
 *     anything that shouldn't have survived the strip. A hit is a hard
 *     fail, never a soft warning — the caller (router.ts) reroutes to a
 *     degraded L1 call instead of sending the payload.
 *  3. IC/OOC residency: IC content becomes a permanent DayaMemoryEntry via
 *     the Tagger elsewhere; OOC content is processed in-flight only. This
 *     module never itself persists anything — it only classifies and
 *     transforms text in function scope, which is what makes "OOC never
 *     touches the DB" true by construction rather than by discipline.
 *     sweepForSentinel() is the burn-suite test helper that verifies that.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { screen } from './jewl/screening';

export type ContentCategory = 'dialogue' | 'perception' | 'reasoning' | 'world' | 'meta';
export type Sensitivity = 'sensitive' | 'safe';
export type IcOoc = 'IC' | 'OOC';

export interface TrafficClassification {
  contentCategory: ContentCategory;
  sensitivity: Sensitivity;
  icOoc: IcOoc;
  rationaleTag: string; // short, content-free reason
}

export interface ClassifyInput {
  content: string;
  contentCategory?: ContentCategory;
  icOoc?: IcOoc;
  /** Known entity/character/campaign names+keys to scan for — presence of
   * any of these is an automatic sensitivity trigger. */
  knownIdentifiers?: string[];
  /** Caller already knows this content is a verbatim pull from the memory
   * ledger — always sensitive regardless of what it says. */
  isMemoryVerbatim?: boolean;
}

const SENSITIVE_KEYWORD_PATTERNS: RegExp[] = [
  /\b(relationship|intimate|trauma|abuse|grief|died|death of|loved one|heartbreak|betrayal)\b/i,
  /\b(session\s*#?\d*|gm intervention|out of character|\booc\b|meta[- ]?game)\b/i,
];

/** Pure abstract domain question with no identifiers/keywords already
 * ruled out by the earlier checks — physics/general-psychology/rules-of-
 * thumb style questions are safe to forward as-is. */
const ABSTRACT_SAFE_PATTERN = /^(how|what|why|when|does|is|can|would|could)\b.*\?\s*$/i;

/**
 * Code-first classification — never calls a model to decide sensitivity.
 * Order matters: identifier presence and memory-verbatim checks are
 * unconditional triggers; keyword patterns come next; only content that
 * clears every check AND matches the abstract-question shape is 'safe'.
 * Anything left over (inconclusive) fails local to 'sensitive'.
 */
export function classifyTraffic(input: ClassifyInput): TrafficClassification {
  const content = input.content;
  const lower = content.toLowerCase();
  const identifiers = input.knownIdentifiers ?? [];

  const foundIdentifier = identifiers.find((id) => id && lower.includes(id.toLowerCase()));
  if (foundIdentifier) {
    return {
      contentCategory: input.contentCategory ?? 'dialogue',
      sensitivity: 'sensitive',
      icOoc: input.icOoc ?? 'IC',
      rationaleTag: 'names-present',
    };
  }

  if (input.isMemoryVerbatim) {
    return {
      contentCategory: input.contentCategory ?? 'reasoning',
      sensitivity: 'sensitive',
      icOoc: input.icOoc ?? 'IC',
      rationaleTag: 'memory-verbatim',
    };
  }

  for (const pattern of SENSITIVE_KEYWORD_PATTERNS) {
    if (pattern.test(content)) {
      return {
        contentCategory: input.contentCategory ?? 'dialogue',
        sensitivity: 'sensitive',
        icOoc: input.icOoc ?? 'IC',
        rationaleTag: 'intimate-or-meta-context',
      };
    }
  }

  if (ABSTRACT_SAFE_PATTERN.test(content.trim())) {
    return {
      contentCategory: input.contentCategory ?? 'reasoning',
      sensitivity: 'safe',
      icOoc: input.icOoc ?? 'OOC',
      rationaleTag: 'abstract-domain-question',
    };
  }

  // Inconclusive — fail local per Addendum A3, no model call spent deciding.
  return {
    contentCategory: input.contentCategory ?? 'reasoning',
    sensitivity: 'sensitive',
    icOoc: input.icOoc ?? 'IC',
    rationaleTag: 'inconclusive-fail-local',
  };
}

// ── Strip-and-forward ───────────────────────────────────────────────────────

export interface StripResult {
  text: string;
  roleMap: Record<string, string>; // original identifier -> role token used
}

const ROLE_TOKEN_POOL = ['PERSON_A', 'PERSON_B', 'PERSON_C', 'PERSON_D', 'PERSON_E', 'THE_SPEAKER'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces every known identifier with a role token, then strips
 * cycle/session markers and any `__DAYA`-prefixed internal string. Longest
 * identifiers are replaced first so a short name that's a substring of a
 * longer one (e.g. "Val" inside "Valentina") doesn't get clobbered by the
 * shorter match running first.
 */
export function stripAndForward(content: string, identifiers: string[]): StripResult {
  // T15 tap (Addendum B3): the full-stream screening choke point. Phase 1's
  // `screen()` is a stateless pass-through (always 'pass', retains nothing)
  // — wired here so the future pattern-flagging/GM-routing project has
  // exactly one call site to extend. Inert today; never affects this
  // function's return value.
  screen(content, { subsystem: 'sanitize.stripAndForward' });

  let text = content;
  const roleMap: Record<string, string> = {};
  let tokenIdx = 0;

  const sorted = [...new Set(identifiers.filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    const token = ROLE_TOKEN_POOL[tokenIdx % ROLE_TOKEN_POOL.length] ?? `PERSON_${tokenIdx}`;
    roleMap[id] = token;
    tokenIdx++;
    text = text.replace(new RegExp(escapeRegExp(id), 'gi'), token);
  }

  text = text.replace(/\bcycle\s*#?\d+(\.\d+)?\b/gi, 'CYCLE_REF');
  text = text.replace(/\bsession\s*#?\d+\b/gi, 'SESSION_REF');
  text = text.replace(/__DAYA[_A-Z0-9]*__?/gi, 'INTERNAL_REF');

  return { text, roleMap };
}

// ── Assert-clean hard-fail sweep ────────────────────────────────────────────

export interface AssertCleanResult {
  clean: boolean;
  hits: string[];
}

/**
 * Regex sweep for known identifiers that survived stripping, plus a
 * catch-all for `__DAYA`-prefixed internal strings. A hit here is a HARD
 * FAIL — the caller (router.ts) aborts the outbound call and reroutes to a
 * degraded L1 call rather than sending anything.
 */
export function assertClean(text: string, forbiddenIdentifiers: string[]): AssertCleanResult {
  const hits: string[] = [];
  for (const id of forbiddenIdentifiers) {
    if (!id) continue;
    if (new RegExp(escapeRegExp(id), 'i').test(text)) hits.push(id);
  }
  if (/__DAYA[_A-Z0-9]*/i.test(text)) hits.push('__DAYA-prefixed-string');
  return { clean: hits.length === 0, hits };
}

// ── Burn-on-read test helper ────────────────────────────────────────────────

export interface SentinelSweepHit {
  source: string;
  count: number;
}

/**
 * Sweeps every DAYA-adjacent table (plus HistoryEntry, since a bridge could
 * in principle write campaign-visible beats) for a sentinel string. Used by
 * the WP6 burn suite: run an OOC interaction with a planted sentinel
 * end-to-end, then confirm zero hits anywhere. This module never writes to
 * the DB itself, so a clean sweep here is a structural guarantee, not just
 * a passing test — there's no code path in sanitize.ts/router.ts that
 * persists message content.
 */
export async function sweepForSentinel(sentinel: string): Promise<SentinelSweepHit[]> {
  const hits: SentinelSweepHit[] = [];

  const memoryCount = await prisma.dayaMemoryEntry.count({ where: { content: { contains: sentinel } } });
  if (memoryCount > 0) hits.push({ source: 'DayaMemoryEntry.content', count: memoryCount });

  const modelCallCount = await prisma.dayaModelCall.count({ where: { rationale: { contains: sentinel } } });
  if (modelCallCount > 0) hits.push({ source: 'DayaModelCall.rationale', count: modelCallCount });

  const worldFactCount = await prisma.worldFact.count({ where: { fact: { contains: sentinel } } });
  if (worldFactCount > 0) hits.push({ source: 'WorldFact.fact', count: worldFactCount });

  const historyCount = await prisma.historyEntry.count({
    where: { OR: [{ summary: { contains: sentinel } }, { details: { contains: sentinel } }] },
  });
  if (historyCount > 0) hits.push({ source: 'HistoryEntry.summary/details', count: historyCount });

  const believedSheetCount = await prisma.dayaBelievedSheet.count({ where: { data: { contains: sentinel } } });
  if (believedSheetCount > 0) hits.push({ source: 'DayaBelievedSheet.data', count: believedSheetCount });

  const relationshipCount = await prisma.dayaRelationship.count({ where: { model: { contains: sentinel } } });
  if (relationshipCount > 0) hits.push({ source: 'DayaRelationship.model', count: relationshipCount });

  return hits;
}
