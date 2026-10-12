/**
 * Lawfulness screen (Mike 2026-10-12, unit 8 of the wall build).
 *
 * The wall keeps content PRIVATE; this keeps it LEGAL. It runs on every lane —
 * player/Watcher input (typed + ambient), LOCAL model output (the 27B is
 * abliterated), cloud output, and the image pipeline.
 *
 *   (1) MINOR_SEXUAL              → hard block everywhere + flag
 *   (2) REAL_PERSON_THREAT        → block + flag (threats / doxxing of REAL people)
 *   (3) REAL_PERSON_SEXUAL_IMAGE  → block + flag (a real face composed into sexual imagery)
 *   (4) dark-but-fictional        → ALLOWED, no flag (murder, torture, war crimes in-story)
 *
 * The screen is code-only (regex co-occurrence, `lib/lawfulness-patterns.ts`)
 * so it can run on every utterance. A flag is an append-only, hash-chained
 * `LawfulnessFlag` row that POINTS at the offending row — never a copy of the
 * text. The chain mirrors the KRMA ledger's (sequence + previous hash → sha256),
 * built here independently. Review fields sit outside the hash.
 *
 * Who sees flags: ADMIN (Terminal) all; a campaign's Watcher the flags at THEIR
 * table (no text). Only ADMIN marks ACTIONED or reads the flagged content.
 */
import 'server-only';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, LedgerIntegrityError } from '@/lib/errors';
import { canSeeLawfulnessFlag, canActionLawfulnessFlag } from '@/lib/permissions';
import { WITHHELD_STRING } from '@/lib/withheld';
import {
  AGE_CUES,
  SEXUAL_CUES,
  NUDITY_CUES,
  THREAT_VERBS,
  REAL_REFERENTS,
  LOCATORS,
  CO_OCCURRENCE_WINDOW,
  MIN_NAME_LENGTH,
  findCues,
  escapeRegExp,
  type PatternRule,
} from '@/lib/lawfulness-patterns';
import { cuesAreLocal } from '@/lib/content-cues';

// ── Types ──────────────────────────────────────────────────────────────────

export const LAWFULNESS_CATEGORIES = ['MINOR_SEXUAL', 'REAL_PERSON_THREAT', 'REAL_PERSON_SEXUAL_IMAGE'] as const;
export type LawfulnessCategory = (typeof LAWFULNESS_CATEGORIES)[number];
export const LAWFULNESS_LANES = ['local', 'cloud', 'input', 'image'] as const;
export type LawfulnessLane = (typeof LAWFULNESS_LANES)[number];
export const LAWFULNESS_SOURCES = ['TYPED', 'AMBIENT', 'MODEL_OUTPUT', 'IMAGE_PROMPT', 'IMAGE_REFERENCE'] as const;
export type LawfulnessSource = (typeof LAWFULNESS_SOURCES)[number];
export const LAWFULNESS_STATUSES = ['OPEN', 'REVIEWED', 'ACTIONED'] as const;
export type LawfulnessStatus = (typeof LAWFULNESS_STATUSES)[number];

/** The fixed string a caller substitutes for blocked content (lives in lib/withheld). */
export { WITHHELD_STRING };

/** Pointer to the row that holds the offending content. */
export interface FlagRef {
  table: string;
  id: string;
}

export interface ScreenContext {
  campaignId?: string | null;
  userId?: string | null;
  lane: LawfulnessLane;
  source: LawfulnessSource;
  ref?: FlagRef | null;
  /** Real platform users' names/handles — a threat near one of these is a real threat. */
  realNames?: string[];
  /** Fictional character names — never treated as real people, even if a user shares the name. */
  fictionalNames?: string[];
  /**
   * RECORDED ages of the characters taking part in the passage (Mike
   * 2026-10-12): a character recorded under 18 is never a participant in
   * sexual content — fictional is not exempt. Resolve from character ids with
   * `resolveCharacterAges` (the hooks do it for you).
   */
  participantAges?: number[];
}

/** Recorded under this age = a minor for the structural-age screen. */
export const ADULT_AGE = 18;

function hasMinorAge(ages: number[] | undefined): boolean {
  return !!ages && ages.some((a) => typeof a === 'number' && Number.isFinite(a) && a < ADULT_AGE);
}

export interface ScreenResult {
  verdict: 'allow' | 'block';
  flags: LawfulnessCategory[];
  /** Pattern ids that fired, per category. Never text. */
  hits: Partial<Record<LawfulnessCategory, string[]>>;
  /** On a block: the matched cue WORDS (never surrounding text) — logged, never stored. */
  cueWords?: string[];
}

// ── Screening (pure, sync, cheap) ──────────────────────────────────────────

type Cue = { id: string; index: number };

/** Ids of the cue pairs (a from listA, b from listB) that sit within the window. */
function coOccur(a: Cue[], b: Cue[], window = CO_OCCURRENCE_WINDOW): string[] {
  const ids = new Set<string>();
  for (const x of a) {
    for (const y of b) {
      if (Math.abs(x.index - y.index) <= window) {
        ids.add(x.id);
        ids.add(y.id);
      }
    }
  }
  return [...ids].sort();
}

/**
 * Real-user name rules, minus anything that is (or is a word of) a fictional
 * character's name — a player named "Kai" never makes the character Kai real.
 */
function nameRules(realNames: string[] = [], fictionalNames: string[] = []): PatternRule[] {
  const fictional = new Set<string>();
  for (const f of fictionalNames) {
    const lower = f.trim().toLowerCase();
    if (!lower) continue;
    fictional.add(lower);
    for (const word of lower.split(/\s+/)) fictional.add(word);
  }
  const seen = new Set<string>();
  const rules: PatternRule[] = [];
  for (const raw of realNames) {
    const name = raw.trim().replace(/^@/, '');
    const lower = name.toLowerCase();
    if (name.length < MIN_NAME_LENGTH || fictional.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    rules.push({ id: 'real:user-name', re: new RegExp(`(?<![A-Za-z0-9_])@?${escapeRegExp(name)}(?![A-Za-z0-9_])`, 'gi') });
  }
  return rules;
}

/** Drop @handle hits that name a fictional character ("@Kai" in an IC aside). */
function withoutFictionalHandles(text: string, cues: Cue[], fictionalNames: string[] = []): Cue[] {
  if (fictionalNames.length === 0) return cues;
  const fictional = new Set(fictionalNames.flatMap((f) => [f.toLowerCase(), ...f.toLowerCase().split(/\s+/)]));
  return cues.filter((c) => {
    if (c.id !== 'real:handle') return true;
    const m = /@([A-Za-z0-9_]+)/.exec(text.slice(c.index, c.index + 40));
    return !(m && fictional.has(m[1].toLowerCase()));
  });
}

/**
 * MINOR_SEXUAL, textual path: an age cue and a sexual cue that are LOCAL —
 * within LOCAL_CUE_WINDOW chars or in the same sentence (2026-10-12; a long
 * passage with "girl" in one paragraph and a sexual word in another is not
 * one thought). Returns the rule ids plus the matched cue WORDS (for the log).
 */
function minorSexualHits(text: string, sexual: PatternRule[]): { ids: string[]; words: string[] } {
  const age = cueWords(text, AGE_CUES);
  const sex = cueWords(text, sexual);
  const ids = new Set<string>();
  const words = new Set<string>();
  for (const a of age) {
    for (const b of sex) {
      if (cuesAreLocal(text, a.index, b.index)) {
        ids.add(a.id); ids.add(b.id); words.add(a.word); words.add(b.word);
      }
    }
  }
  return { ids: [...ids].sort(), words: [...words].sort() };
}

/** Matches with their rule id, offset and the matched cue word (lower-cased; never the surrounding text). */
function cueWords(text: string, rules: PatternRule[]): { id: string; index: number; word: string }[] {
  const out: { id: string; index: number; word: string }[] = [];
  for (const rule of rules) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) out.push({ id: rule.id, index: m.index ?? 0, word: m[0].toLowerCase().replace(/\s+/g, ' ').slice(0, 40) });
  }
  return out;
}

/**
 * Cheap pre-check: false means the passage CANNOT block (every category needs a
 * sexual cue, a threat verb or a personal locator), so the hooks skip the name
 * and age lookups. Pure; never a reason to block on its own.
 */
export function mayNeedScreen(text: string): boolean {
  if (!text || !text.trim()) return false;
  const any = (rules: PatternRule[]) => rules.some((r) => { r.re.lastIndex = 0; const hit = r.re.test(text); r.re.lastIndex = 0; return hit; });
  return any(SEXUAL_CUES) || any(THREAT_VERBS) || any(LOCATORS);
}

/**
 * Screen a passage. Pure and synchronous — call it on every utterance and
 * every model output. Does NOT write a flag; see `raiseFlag` / the hooks.
 */
export function screenText(text: string, ctx: Partial<ScreenContext> = {}): ScreenResult {
  const hits: ScreenResult['hits'] = {};
  if (!text || !text.trim()) return { verdict: 'allow', flags: [], hits };

  // (1) MINOR_SEXUAL — textual: an age cue and a sexual cue in the same window.
  // Structural (belt and braces): a participant RECORDED under 18 + any sexual
  // cue anywhere in the chunk, whether or not the text mentions age.
  const textual = minorSexualHits(text, SEXUAL_CUES);
  const minor = [...textual.ids];
  const words = new Set(textual.words);
  if (hasMinorAge(ctx.participantAges)) {
    const sexual = cueWords(text, SEXUAL_CUES);
    if (sexual.length) {
      minor.push('structural-age', ...sexual.map((c) => c.id));
      for (const c of sexual) words.add(c.word);
    }
  }
  if (minor.length) hits.MINOR_SEXUAL = [...new Set(minor)].sort();

  // (2) REAL_PERSON_THREAT — a threat verb near a REAL referent (a platform
  // user's name, "my boss/neighbour/ex", an @handle, "irl", an address/phone),
  // or doxxing: a named real person/relation next to a personal locator.
  const people = withoutFictionalHandles(
    text,
    [...findCues(text, nameRules(ctx.realNames, ctx.fictionalNames)), ...findCues(text, REAL_REFERENTS)],
    ctx.fictionalNames,
  );
  const locators = findCues(text, LOCATORS);
  const threats = findCues(text, THREAT_VERBS);
  const threatHits = coOccur(threats, [...people, ...locators]);
  const doxHits = coOccur(
    people.filter((p) => p.id !== 'real:irl'),
    locators,
  );
  const real = [...new Set([...threatHits, ...doxHits])].sort();
  if (real.length) {
    hits.REAL_PERSON_THREAT = real;
    for (const c of cueWords(text, THREAT_VERBS)) words.add(c.word);
  }

  const flags = (Object.keys(hits) as LawfulnessCategory[]).sort(
    (a, b) => LAWFULNESS_CATEGORIES.indexOf(a) - LAWFULNESS_CATEGORIES.indexOf(b),
  );
  return flags.length
    ? { verdict: 'block', flags, hits, cueWords: [...words].sort().slice(0, 12) }
    : { verdict: 'allow', flags, hits };
}

export interface ImageScreenRequest {
  prompt: string;
  /** True when a real person's photo (a PuLID upload) conditions the image. */
  usesRealReference: boolean;
  referenceOwnerUserId?: string | null;
  /** RECORDED ages of the characters the image depicts. Any under 18 + sexual/nudity cues = MINOR_SEXUAL. */
  subjectAges?: number[];
}

/**
 * Screen an image request. A real-face reference + sexual/nudity cues anywhere
 * in the prompt → REAL_PERSON_SEXUAL_IMAGE (NCII). Age cues + sexual/nudity
 * cues → MINOR_SEXUAL. Prompts are short, so co-occurrence is prompt-wide.
 */
export function screenImageRequest(req: ImageScreenRequest): ScreenResult {
  const hits: ScreenResult['hits'] = {};
  const prompt = req.prompt ?? '';
  const sexual = [...findCues(prompt, SEXUAL_CUES), ...findCues(prompt, NUDITY_CUES)];
  const sexualIds = [...new Set(sexual.map((c) => c.id))].sort();
  const age = findCues(prompt, AGE_CUES);
  const structural = hasMinorAge(req.subjectAges);
  if ((age.length || structural) && sexual.length) {
    hits.MINOR_SEXUAL = [...new Set([...age.map((c) => c.id), ...(structural ? ['structural-age'] : []), ...sexualIds])].sort();
  }
  if (req.usesRealReference && sexual.length) {
    hits.REAL_PERSON_SEXUAL_IMAGE = ['ref:real-face', ...sexualIds];
  }
  const flags = (Object.keys(hits) as LawfulnessCategory[]).sort(
    (a, b) => LAWFULNESS_CATEGORIES.indexOf(a) - LAWFULNESS_CATEGORIES.indexOf(b),
  );
  return { verdict: flags.length ? 'block' : 'allow', flags, hits };
}

// ── Name context (for the hooks) ───────────────────────────────────────────

const NAME_TTL_MS = 60_000;
const nameCache = new Map<string, { at: number; realNames: string[]; fictionalNames: string[] }>();

/**
 * The real people at a table (GM + members' usernames) and the fictional ones
 * (its characters' names). Cached for a minute — the screen runs per utterance.
 */
export async function loadNameContext(campaignId: string): Promise<{ realNames: string[]; fictionalNames: string[] }> {
  const hit = nameCache.get(campaignId);
  if (hit && Date.now() - hit.at < NAME_TTL_MS) return hit;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      gmUser: { select: { username: true } },
      members: { select: { user: { select: { username: true } } } },
      characters: { select: { name: true } },
    },
  });
  const realNames = campaign
    ? [campaign.gmUser?.username, ...campaign.members.map((m) => m.user?.username)].filter((n): n is string => !!n)
    : [];
  const fictionalNames = campaign ? campaign.characters.map((c) => c.name).filter(Boolean) : [];
  const entry = { at: Date.now(), realNames, fictionalNames };
  nameCache.set(campaignId, entry);
  return entry;
}

/**
 * Recorded ages for characters, from the sheet: `identity.age` and, when the
 * character also carries a `birthCycle`, the campaign clock's age (currentCycle −
 * birthCycle, meta cycles ≈ years). Where both exist the YOUNGER wins — the
 * screen errs toward the minor. Characters with no recorded age are omitted.
 */
export async function resolveCharacterAges(characterIds: string[]): Promise<number[]> {
  const ids = [...new Set(characterIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await prisma.character.findMany({
    where: { id: { in: ids } },
    select: { data: true, campaign: { select: { currentCycle: true } } },
  });
  const ages: number[] = [];
  for (const r of rows) {
    let data: { identity?: { age?: unknown }; birthCycle?: unknown } = {};
    try { data = JSON.parse(r.data ?? '{}'); } catch { /* unreadable sheet → no age */ }
    const found: number[] = [];
    const recorded = Number(data.identity?.age);
    if (data.identity?.age != null && Number.isFinite(recorded)) found.push(recorded);
    const cycle = r.campaign?.currentCycle;
    // Only alongside a recorded age: assignMechanics stamps birthCycle = clock − (age ?? 0),
    // so a sheet with no age would otherwise read as a newborn.
    if (found.length && typeof data.birthCycle === 'number' && typeof cycle === 'number') found.push(Math.max(0, cycle - data.birthCycle));
    if (found.length) ages.push(Math.min(...found));
  }
  return ages;
}

/** Test seam. */
export function clearNameCache(): void {
  nameCache.clear();
}

// ── The chain ──────────────────────────────────────────────────────────────

export const LAWFULNESS_GENESIS_HASH = 'LAWFULNESS_FLAG_GENESIS';

export interface FlagHashFields {
  sequenceNumber: number;
  createdAt: Date;
  campaignId: string | null;
  userId: string | null;
  category: string;
  lane: string;
  source: string;
  refTable: string | null;
  refId: string | null;
  screenHits: string;
  prevHash: string;
}

export function computeFlagHash(f: FlagHashFields): string {
  const data = [
    String(f.sequenceNumber),
    f.createdAt.toISOString(),
    f.campaignId ?? '',
    f.userId ?? '',
    f.category,
    f.lane,
    f.source,
    f.refTable ?? '',
    f.refId ?? '',
    f.screenHits,
    f.prevHash,
  ].join('||');
  return crypto.createHash('sha256').update(data).digest('hex');
}

export interface RaiseFlagInput {
  category: LawfulnessCategory;
  lane: LawfulnessLane;
  source: LawfulnessSource;
  campaignId?: string | null;
  userId?: string | null;
  ref?: FlagRef | null;
  screenHits?: string[];
}

const raiseSchema = z.object({
  category: z.enum(LAWFULNESS_CATEGORIES),
  lane: z.enum(LAWFULNESS_LANES),
  source: z.enum(LAWFULNESS_SOURCES),
  campaignId: z.string().min(1).nullish(),
  userId: z.string().min(1).nullish(),
  ref: z.object({ table: z.string().min(1).max(64), id: z.string().min(1).max(128) }).nullish(),
  screenHits: z.array(z.string().max(64)).max(64).default([]),
});

/**
 * Append one flag to the chain. The next sequence number is read and written
 * inside one transaction; the unique sequence index turns a concurrent raise
 * into a retry instead of a fork.
 */
export async function raiseFlag(input: RaiseFlagInput) {
  const v = raiseSchema.parse(input);
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.lawfulnessFlag.findFirst({ orderBy: { sequenceNumber: 'desc' } });
        const sequenceNumber = (last?.sequenceNumber ?? 0) + 1;
        const prevHash = last?.hash ?? LAWFULNESS_GENESIS_HASH;
        const fields: FlagHashFields = {
          sequenceNumber,
          createdAt: new Date(),
          campaignId: v.campaignId ?? null,
          userId: v.userId ?? null,
          category: v.category,
          lane: v.lane,
          source: v.source,
          refTable: v.ref?.table ?? null,
          refId: v.ref?.id ?? null,
          screenHits: JSON.stringify([...new Set(v.screenHits)].sort()),
          prevHash,
        };
        return tx.lawfulnessFlag.create({ data: { ...fields, hash: computeFlagHash(fields) } });
      });
    } catch (err) {
      const unique = err instanceof Error && /Unique constraint|UNIQUE constraint/i.test(err.message);
      if (!unique || attempt >= 4) throw err;
    }
  }
}

/** Raise one flag per category a screen produced. Returns the rows. */
export async function raiseFlagsForResult(result: ScreenResult, ctx: ScreenContext) {
  const rows = [];
  for (const category of result.flags) {
    rows.push(
      await raiseFlag({
        category,
        lane: ctx.lane,
        source: ctx.source,
        campaignId: ctx.campaignId ?? null,
        userId: ctx.userId ?? null,
        ref: ctx.ref ?? null,
        screenHits: result.hits[category] ?? [],
      }),
    );
  }
  return rows;
}

/**
 * Recompute every link. Detects an edited hashed field, a deleted or inserted
 * row (sequence gap / prevHash mismatch), and a reordered chain.
 */
export async function verifyFlagChain(): Promise<{ valid: boolean; count: number; brokenAt?: number; reason?: string }> {
  const rows = await prisma.lawfulnessFlag.findMany({ orderBy: { sequenceNumber: 'asc' } });
  let prevHash = LAWFULNESS_GENESIS_HASH;
  let expectedSeq = 1;
  for (const r of rows) {
    if (r.sequenceNumber !== expectedSeq) return { valid: false, count: rows.length, brokenAt: r.sequenceNumber, reason: 'sequence gap' };
    if (r.prevHash !== prevHash) return { valid: false, count: rows.length, brokenAt: r.sequenceNumber, reason: 'prevHash mismatch' };
    const expected = computeFlagHash({
      sequenceNumber: r.sequenceNumber,
      createdAt: new Date(r.createdAt),
      campaignId: r.campaignId,
      userId: r.userId,
      category: r.category,
      lane: r.lane,
      source: r.source,
      refTable: r.refTable,
      refId: r.refId,
      screenHits: r.screenHits,
      prevHash: r.prevHash,
    });
    if (expected !== r.hash) return { valid: false, count: rows.length, brokenAt: r.sequenceNumber, reason: 'hash mismatch' };
    prevHash = r.hash;
    expectedSeq++;
  }
  return { valid: true, count: rows.length };
}

/** Throws if the chain is broken — for scripts / health checks. */
export async function assertFlagChain(): Promise<void> {
  const v = await verifyFlagChain();
  if (!v.valid) throw new LedgerIntegrityError(`Lawfulness flag chain broken at ${v.brokenAt}: ${v.reason}`);
}

// ── Moderation queue ───────────────────────────────────────────────────────

type Viewer = { id: string; role: string };

export const listFlagsSchema = z.object({
  campaignId: z.string().min(1).optional(),
  status: z.enum(LAWFULNESS_STATUSES).optional(),
});
export type ListFlagsQuery = z.infer<typeof listFlagsSchema>;

/** What a Watcher sees: what happened at their table, never who/what/where in the data. */
export interface WatcherFlagView {
  id: string;
  createdAt: Date;
  campaignId: string | null;
  category: string;
  lane: string;
  source: string;
  status: string;
  reviewedAt: Date | null;
}

function toWatcherView(r: WatcherFlagView): WatcherFlagView {
  return {
    id: r.id,
    createdAt: r.createdAt,
    campaignId: r.campaignId,
    category: r.category,
    lane: r.lane,
    source: r.source,
    status: r.status,
    reviewedAt: r.reviewedAt,
  };
}

/**
 * ADMIN: every flag (optionally filtered). Any other role: only flags at
 * campaigns they Watch; asking for someone else's campaign is a 403.
 */
export async function listFlags(query: ListFlagsQuery, viewer: Viewer) {
  const q = listFlagsSchema.parse(query);
  const where: { campaignId?: string | { in: string[] }; status?: string } = {};
  if (q.status) where.status = q.status;

  if (viewer.role === 'ADMIN') {
    if (q.campaignId) where.campaignId = q.campaignId;
    const rows = await prisma.lawfulnessFlag.findMany({ where, orderBy: { sequenceNumber: 'desc' }, take: 500 });
    return { scope: 'all' as const, flags: rows };
  }

  if (q.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: q.campaignId }, select: { gmUserId: true } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canSeeLawfulnessFlag(viewer.id, viewer.role, campaign)) throw new ForbiddenError('Not your table');
    where.campaignId = q.campaignId;
  } else {
    const mine = await prisma.campaign.findMany({ where: { gmUserId: viewer.id }, select: { id: true } });
    if (mine.length === 0) return { scope: 'table' as const, flags: [] as WatcherFlagView[] };
    where.campaignId = { in: mine.map((c) => c.id) };
  }
  const rows = await prisma.lawfulnessFlag.findMany({ where, orderBy: { sequenceNumber: 'desc' }, take: 200 });
  return { scope: 'table' as const, flags: rows.map(toWatcherView) };
}

export const reviewFlagSchema = z.object({
  status: z.enum(['REVIEWED', 'ACTIONED']),
  note: z.string().trim().max(2000).optional(),
});
export type ReviewFlagInput = z.infer<typeof reviewFlagSchema>;

/**
 * Review a flag. ADMIN or the campaign's own Watcher may mark REVIEWED; only
 * ADMIN may mark ACTIONED, and an ACTIONED flag is closed to non-ADMIN edits.
 * Review fields are outside the hash, so reviewing never breaks the chain.
 */
export async function reviewFlag(id: string, input: ReviewFlagInput, reviewer: Viewer) {
  const v = reviewFlagSchema.parse(input);
  const flag = await prisma.lawfulnessFlag.findUnique({ where: { id } });
  if (!flag) throw new NotFoundError('Flag not found');
  const campaign = flag.campaignId
    ? await prisma.campaign.findUnique({ where: { id: flag.campaignId }, select: { gmUserId: true } })
    : null;
  if (!canSeeLawfulnessFlag(reviewer.id, reviewer.role, campaign)) throw new ForbiddenError('Not your table');
  const admin = canActionLawfulnessFlag(reviewer.role);
  if (v.status === 'ACTIONED' && !admin) throw new ForbiddenError('Only ADMIN may action a flag');
  if (flag.status === 'ACTIONED' && !admin) throw new ForbiddenError('This flag has been actioned');
  const updated = await prisma.lawfulnessFlag.update({
    where: { id },
    data: { status: v.status, reviewNote: v.note ?? null, reviewerId: reviewer.id, reviewedAt: new Date() },
  });
  return admin ? updated : toWatcherView(updated);
}

/**
 * ADMIN only: the flag plus the flagged row's text, fetched by pointer. The
 * text is never stored on the flag; if the row is gone, so is the text.
 */
export async function getFlagWithReferent(id: string, viewer: Viewer) {
  if (!canActionLawfulnessFlag(viewer.role)) throw new ForbiddenError('Only ADMIN may read flagged content');
  const flag = await prisma.lawfulnessFlag.findUnique({ where: { id } });
  if (!flag) throw new NotFoundError('Flag not found');
  return { flag, referent: await readReferent(flag.refTable, flag.refId) };
}

async function readReferent(table: string | null, id: string | null): Promise<{ text: string | null; note?: string }> {
  if (!table || !id) return { text: null, note: 'No pointer was recorded for this flag.' };
  switch (table) {
    case 'CopilotMessage': {
      const r = await prisma.copilotMessage.findUnique({ where: { id }, select: { content: true } });
      return r ? { text: r.content } : { text: null, note: 'The referenced message no longer exists.' };
    }
    case 'DayaMemoryEntry': {
      const r = await prisma.dayaMemoryEntry.findUnique({ where: { id }, select: { content: true } });
      return r ? { text: r.content } : { text: null, note: 'The referenced memory no longer exists.' };
    }
    case 'ForgeItem': {
      const r = await prisma.forgeItem.findUnique({ where: { id }, select: { name: true, data: true } });
      return r ? { text: `${r.name}\n\n${r.data}` } : { text: null, note: 'The referenced Forge item no longer exists.' };
    }
    case 'PortraitGeneration': {
      const r = await prisma.portraitGeneration.findUnique({ where: { id }, select: { prompt: true } });
      return r ? { text: r.prompt } : { text: null, note: 'The referenced image job no longer exists.' };
    }
    default:
      return { text: null, note: `No reader for ${table} yet.` };
  }
}

/** Open-flag count for a viewer's scope (Terminal badge / Watcher chrome badge). */
export async function countOpenFlags(viewer: Viewer, campaignId?: string): Promise<number> {
  const { flags } = await listFlags({ campaignId, status: 'OPEN' }, viewer);
  return flags.length;
}
