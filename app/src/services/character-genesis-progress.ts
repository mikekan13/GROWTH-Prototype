/**
 * Character genesis PROGRESS — the GM's loading screen while JEWL gestates a
 * character (Mike 2026-10-11: "show something happening … info on what's
 * happening").
 *
 * Progress is DERIVED from the truth genesis already writes (no new stage
 * events):
 *   session   → DayaWorkSession (status, cycles, start/end)
 *   expansion → DayaEntity authored (identityNarrative / voiceNotes present)
 *   ledger    → DayaMemoryEntry count
 *   mechanics → ForgeItems JEWL drafted in this campaign since the session
 *               opened (pending vs approved, by kind)
 *   sheet     → JEWL's drafts all approved while the session still runs
 *   born      → session status 'done'
 *
 * PROCESS ONLY: the progress payload carries stage keys, fixed labels,
 * counts and timestamps ONLY — never a progress note, blocked-reason text,
 * block/trait name, narrative or memory content. Blocked reasons are
 * classified into fixed kinds server-side; the free text never leaves.
 * (Mike lifted the blind-play spoiler firewall 2026-10-11 — story content
 * now lives in the Log's genesis reports; the overlay stays process-only.)
 * EXCEPTION, by design (2026-10-12): PRODS — JEWL's questions to the GM in the
 * PRODDING stage quote the seed the GM wrote and carry the GM's own answers;
 * they ship to the GM (and only the GM) so genesis can be a dialogue.
 */
import 'server-only';
import { parseSeedWithheldNotes } from '@/lib/genesis-seed-notes';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { getJewlGodHead } from '@/ai/copilot/jewl-identity';
import { requireCampaignGM } from './campaign-access';

export const GENESIS_STAGES = [
  { key: 'open', label: 'Genesis session opened' },
  { key: 'prodding', label: 'Listening' },
  { key: 'expansion', label: 'Gestating the person' },
  { key: 'ledger', label: 'Sealing the memory ledger' },
  { key: 'mechanics', label: 'Translating to mechanics · catalog first' },
  { key: 'sheet', label: 'Writing the sheet' },
  { key: 'born', label: 'Born' },
] as const;

export type GenesisStageKey = (typeof GENESIS_STAGES)[number]['key'];

/** Fixed vocabulary for why genesis is waiting — never the raw reason text. */
export type GenesisWaitKind = 'approval' | 'question' | 'provider' | 'stalled' | 'prods';

/** A prod as the GM sees it (genesis is a dialogue, 2026-10-12). Prods are
 *  GM-facing questions BY DESIGN — they quote the seed the GM wrote. */
export interface GenesisProdView {
  id: string;
  round: number;
  order: number;
  anchorQuote: string;
  question: string;
  why: string;
  kind: string;
  status: string;
  answer: string | null;
  jewlFill: string | null;
  decidedAt: string | null;
}

/** The prod fields progress reads (a GenesisProd row satisfies it). */
export interface ProdFact {
  id: string;
  round: number;
  order: number;
  anchorQuote: string;
  question: string;
  why: string;
  kind: string;
  status: string;
  answer: string | null;
  jewlFill: string | null;
  decidedAt: Date | null;
}

export interface GenesisFacts {
  session: {
    id: string;
    status: string;
    cycleCount: number;
    startedAt: Date;
    endedAt: Date | null;
    lastCycleAt: Date | null;
    blockedReason: string | null;
    /** 'PRODDING' while JEWL asks before building; 'BUILDING' after Build. */
    stage?: string | null;
    /** Progress notes JSON — ONLY the fixed-format seed-withheld notes are read from it. */
    progress?: string | null;
  } | null;
  /** The session's prods, round then order. */
  prods?: ProdFact[];
  entityAuthored: boolean;
  memoryCount: number;
  /** JEWL's Forge drafts in this campaign during the session window. */
  forged: ForgedRow[];
}

/** A Forge row JEWL drafted during the session (full rows for GM steps). */
export interface ForgedRow {
  type: string;
  status: string;
  id?: string;
  name?: string;
  data?: string;
  karmicValue?: bigint | number | null;
  createdAt?: Date;
  relationshipTags?: string | null;
}

/** A step only the Watcher can take: one of JEWL's drafts awaiting the
 *  GM's consent in the Forge ([[jewl-never-approves-forge-consent-2026-08-26]]).
 *  Submitting goes through the Forge's own publish route — never here. */
export interface GenesisGmStep {
  id: string;
  type: string;
  name: string;
  kv: number | null;
  /** Who priced it: 'formula (pre-Kai)', Kai, … — provenance of the number. */
  pricedBy: string | null;
  description: string | null;
  /** Rule text: the prose summary plus one line per structured effect. */
  rules: string[];
  /** Root/branch: calendar years the block adds. */
  ageAdded: number | null;
  /** JEWL's GM-facing note — what the draft is for. */
  purpose: string | null;
  draftedAt: string | null;
}

export interface GenesisProgress {
  state: 'none' | 'running' | 'waiting' | 'done' | 'error';
  sessionId: string | null;
  stages: Array<{ key: GenesisStageKey; label: string; status: 'done' | 'current' | 'pending' }>;
  current: GenesisStageKey | null;
  /** 1-based index of the current stage and the ladder length. */
  step: number;
  total: number;
  counts: {
    cycles: number;
    memories: number;
    blocksForged: number;   // seed / root / branch drafts
    traitsForged: number;   // nectar / thorn / blossom drafts
    otherForged: number;    // skill / item drafts
    pendingApproval: number;
    approved: number;
  };
  wait: GenesisWaitKind | null;
  error: 'cancelled' | 'provider' | null;
  /** Drafts awaiting the Watcher — listed until every one is done. */
  gmSteps: GenesisGmStep[];
  /** In the prod stage: JEWL asks, the GM answers / leaves open / delegates; Build moves on. */
  prodding: boolean;
  prods: GenesisProdView[];
  /** Prods the GM left open — mysteries for play, never filled by JEWL. */
  openThreads: Array<{ id: string; anchorQuote: string; question: string }>;
  startedAt: string | null;
  endedAt: string | null;
  lastCycleAt: string | null;
  /** The tone filter withheld/toned part of the SEED from JEWL (2026-10-12) —
   *  fixed vocabulary only (categories + outcome), never text. */
  seedWarnings: Array<{ categories: string[]; outcome: 'blocked' | 'withheld' | 'softened' }>;
}

const BLOCK_TYPES = new Set(['seed', 'root', 'branch']);
const TRAIT_TYPES = new Set(['nectar', 'thorn', 'blossom']);

/** Classify the free-text blocked reason into a fixed kind. The reason
 *  string itself is JEWL's prose and may carry story — it never ships. */
export function classifyWait(reason: string | null, pendingApproval: number): GenesisWaitKind {
  const r = (reason ?? '').toLowerCase();
  if (r.startsWith('ai provider failing')) return 'provider';
  if (r.startsWith('no actionable work')) return 'stalled';
  return pendingApproval > 0 ? 'approval' : 'question';
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** One effect entry → one readable rule line (no invention: fields as written). */
function effectLine(e: Record<string, unknown>): string | null {
  const name = str(e.name);
  if (e.kind === 'triggered') {
    const parts = [str(e.trigger) && `when ${str(e.trigger)}`, str(e.appliesCondition) && `applies ${str(e.appliesCondition)}`,
      str(e.spawnsBlossom) && `spawns ${str(e.spawnsBlossom)}`].filter(Boolean);
    return [name, parts.join(', ')].filter(Boolean).join(' — ') || null;
  }
  const mods = Array.isArray(e.modifiers) ? e.modifiers as Array<Record<string, unknown>> : [];
  const modText = mods.map(m => {
    const flat = typeof m.flat === 'number' ? (m.flat >= 0 ? `+${m.flat}` : `${m.flat}`) : '';
    const target = str(m.governorAttribute) ?? str(m.skillNamePattern) ?? str(m.pillar) ?? (m.allChecks ? 'all checks' : null);
    return [flat, target, str(m.label) && `(${str(m.label)})`].filter(Boolean).join(' ');
  }).filter(Boolean).join('; ');
  const cond = str(e.condition);
  return [name, [cond && `while ${cond}`, modText].filter(Boolean).join(': ')].filter(Boolean).join(' — ') || null;
}

/** A pending JEWL draft → the Watcher's step card (pure). */
export function toGmStep(row: ForgedRow): GenesisGmStep | null {
  if (row.status !== 'draft' || !row.id || !row.name) return null;
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.data ?? '{}') as Record<string, unknown>; } catch { /* raw */ }
  let pricedBy: string | null = null;
  try {
    const tags = JSON.parse(row.relationshipTags ?? 'null') as { evaluation?: { evaluator?: unknown } } | null;
    pricedBy = str(tags?.evaluation?.evaluator);
  } catch { /* none */ }
  const rules: string[] = [];
  const summary = str(data.mechanicalEffect);
  if (summary) rules.push(summary);
  if (Array.isArray(data.effects)) {
    for (const e of data.effects) {
      const line = e && typeof e === 'object' ? effectLine(e as Record<string, unknown>) : null;
      if (line) rules.push(line);
    }
  }
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    kv: row.karmicValue != null ? Number(row.karmicValue) : (typeof data.declaredKv === 'number' ? data.declaredKv : null),
    pricedBy: pricedBy ?? (typeof data.declaredKv === 'number' ? 'declared by JEWL' : null),
    description: str(data.description),
    rules,
    ageAdded: typeof data.ageAdded === 'number' ? data.ageAdded : null,
    purpose: str(data._proposalNote),
    draftedAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

export function toProdView(p: ProdFact): GenesisProdView {
  return {
    id: p.id, round: p.round, order: p.order, anchorQuote: p.anchorQuote, question: p.question,
    why: p.why, kind: p.kind, status: p.status, answer: p.answer, jewlFill: p.jewlFill,
    decidedAt: p.decidedAt ? p.decidedAt.toISOString() : null,
  };
}

/** Pure derivation — every stage below the highest one with evidence is done. */
export function deriveGenesisProgress(facts: GenesisFacts): GenesisProgress {
  const total = GENESIS_STAGES.length;
  const blocksForged = facts.forged.filter(f => BLOCK_TYPES.has(f.type)).length;
  const traitsForged = facts.forged.filter(f => TRAIT_TYPES.has(f.type)).length;
  const otherForged = facts.forged.length - blocksForged - traitsForged;
  const pendingApproval = facts.forged.filter(f => f.status === 'draft').length;
  const approved = facts.forged.length - pendingApproval;
  const counts = {
    cycles: facts.session?.cycleCount ?? 0,
    memories: facts.memoryCount,
    blocksForged,
    traitsForged,
    otherForged,
    pendingApproval,
    approved,
  };

  const prods = (facts.prods ?? []).map(toProdView);
  const openThreads = prods.filter(p => p.status === 'LEFT_OPEN')
    .map(p => ({ id: p.id, anchorQuote: p.anchorQuote, question: p.question }));
  const listenLabel = `Listening · ${prods.length} prod${prods.length === 1 ? '' : 's'}`;

  const s = facts.session;
  if (!s) {
    return {
      state: 'none', sessionId: null, current: null, step: 0, total, counts,
      stages: GENESIS_STAGES.map(st => ({ ...st, status: 'pending' as const })),
      wait: null, error: null, gmSteps: [], prodding: false, prods, openThreads,
      startedAt: null, endedAt: null, lastCycleAt: null, seedWarnings: [],
    };
  }

  // Highest stage reached (index into GENESIS_STAGES). Only the GM's Build
  // moves a session out of PRODDING (services/genesis-prods.ts).
  const prodding = s.stage === 'PRODDING';
  let reached = prodding ? 1 : 2; // open is done; listening, or expansion under way
  if (!prodding) {
    if (facts.entityAuthored || facts.memoryCount > 0) reached = 3;
    if (facts.forged.length > 0) reached = 4;
    if (facts.forged.length > 0 && pendingApproval === 0 && s.status === 'active') reached = 5;
    if (s.status === 'done') reached = 6;
  }

  const done = s.status === 'done';
  const stages = GENESIS_STAGES.map((st, i) => ({
    ...st,
    label: st.key === 'prodding' ? listenLabel : st.label,
    status: (i < reached || (done && i === reached)) ? 'done' as const
      : i === reached ? 'current' as const
        : 'pending' as const,
  }));

  let state: GenesisProgress['state'] = 'running';
  let wait: GenesisWaitKind | null = null;
  let error: GenesisProgress['error'] = null;
  if (done) state = 'done';
  else if (s.status === 'cancelled') { state = 'error'; error = 'cancelled'; }
  else if (s.status === 'blocked') {
    wait = classifyWait(s.blockedReason, pendingApproval);
    if (prodding && wait !== 'stalled') wait = wait === 'provider' ? 'provider' : 'prods';
    if (wait === 'provider') { state = 'error'; error = 'provider'; }
    else state = 'waiting';
  }

  return {
    state,
    sessionId: s.id,
    stages,
    current: GENESIS_STAGES[reached].key,
    step: reached + 1,
    total,
    counts,
    wait,
    error,
    gmSteps: facts.forged.map(toGmStep).filter((g): g is GenesisGmStep => g !== null),
    prodding,
    prods,
    openThreads,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    lastCycleAt: s.lastCycleAt ? s.lastCycleAt.toISOString() : null,
    seedWarnings: parseSeedWithheldNotes(notesOf(s.progress)),
  };
}

function notesOf(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** Chat rows a genesis work cycle writes are stamped with this username and
 *  kept out of the visible JEWL chat (copilot-service#getCopilotHistory) —
 *  the overlay/badge carries progress, the Log carries the full report, and
 *  the chat gets one short status line per transition (Mike 2026-10-11). */
export const GENESIS_CHAT_USERNAME = '[genesis]';

/** The Log row a genesis cycle's full report is written as. */
export const GENESIS_REPORT_EVENT = 'genesis_report';

export function isGenesisGoal(goal: string): boolean {
  return goal.startsWith('Character genesis');
}

/** `Character genesis: Violet [cid] — …` → { name, characterId }. */
export function parseGenesisGoal(goal: string): { name: string; characterId: string } | null {
  const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(goal);
  return m ? { name: m[1], characterId: m[2] } : null;
}

type SessionRow = NonNullable<GenesisFacts['session']>;
const SESSION_SELECT = {
  id: true, status: true, cycleCount: true, startedAt: true,
  endedAt: true, lastCycleAt: true, blockedReason: true, stage: true, progress: true,
} as const;

async function loadGenesisFacts(
  characterId: string,
  campaignId: string,
  sessionId?: string,
): Promise<GenesisFacts> {
  const session: SessionRow | null = sessionId
    ? await prisma.dayaWorkSession.findUnique({ where: { id: sessionId }, select: SESSION_SELECT })
    : await prisma.dayaWorkSession.findFirst({
        where: { campaignId, goal: { contains: `[${characterId}]` } },
        orderBy: { startedAt: 'desc' },
        select: SESSION_SELECT,
      });

  const entity = await prisma.dayaEntity.findUnique({
    where: { characterId },
    select: { personaProfile: true, _count: { select: { memories: true } } },
  });
  let entityAuthored = false;
  if (entity) {
    try {
      const p = JSON.parse(entity.personaProfile) as Record<string, unknown>;
      entityAuthored = typeof p.identityNarrative === 'string' || typeof p.voiceNotes === 'string';
    } catch { /* unparsable profile = not authored */ }
  }

  let forged: ForgedRow[] = [];
  if (session) {
    const jewl = await getJewlGodHead();
    forged = await prisma.forgeItem.findMany({
      where: {
        campaignId,
        createdBy: jewl.characterUserId,
        createdAt: { gte: session.startedAt, ...(session.endedAt ? { lte: session.endedAt } : {}) },
      },
      select: {
        id: true, type: true, status: true, name: true, data: true,
        karmicValue: true, createdAt: true, relationshipTags: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  const prods: ProdFact[] = session
    ? await prisma.genesisProd.findMany({
        where: { sessionId: session.id },
        orderBy: [{ round: 'asc' }, { order: 'asc' }],
        select: {
          id: true, round: true, order: true, anchorQuote: true, question: true, why: true,
          kind: true, status: true, answer: true, jewlFill: true, decidedAt: true,
        },
      })
    : [];

  return { session, prods, entityAuthored, memoryCount: entity?._count.memories ?? 0, forged };
}

/** GM-only: live genesis progress for a character (latest genesis session). */
export async function getGenesisProgress(opts: {
  characterId: string;
  user: { id: string; role: string };
}): Promise<GenesisProgress> {
  const character = await prisma.character.findUnique({
    where: { id: opts.characterId },
    select: { id: true, campaignId: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!character.campaignId) {
    throw new ValidationError('Character has no campaign — genesis runs inside a campaign world.');
  }
  await requireCampaignGM(character.campaignId, opts.user);
  return deriveGenesisProgress(await loadGenesisFacts(character.id, character.campaignId));
}

/** JEWL's one-line, in-voice chat status for a genesis transition. Null =
 *  stay quiet (in-flight progress belongs to the overlay, not the chat). */
export function genesisStatusLine(name: string, p: GenesisProgress): string | null {
  const c = p.counts;
  const log = 'The full report is in my Log under Genesis.';
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (p.state === 'done') {
    return `${name} is born — ${plural(c.memories, 'memory', 'memories')}, ${plural(c.blocksForged, 'block', 'blocks')}, ${plural(c.traitsForged, 'trait', 'traits')}. Sheet and dossier await your review. ${log}`;
  }
  if (p.state === 'error' && p.error === 'provider') {
    return `I lost the model partway through ${name}'s genesis — paused, nothing lost. Tell me to resume once it's back.`;
  }
  if (p.state === 'error' && p.error === 'cancelled') {
    return `${name}'s genesis is closed before birth. Submit again from the character page to start fresh.`;
  }
  if (p.state === 'waiting') {
    if (p.wait === 'prods') {
      const open = p.prods.filter(x => x.status === 'OPEN').length;
      if (open > 0) {
        return `I've got ${plural(open, 'question', 'questions')} before I build — ${open === 1 ? "it's" : "they're"} on ${name}'s page. Answer, leave open, or tell me to decide; press Build when you're ready.`;
      }
      return `Nothing more to ask about ${name}. Press Build on ${name}'s page when you're ready.`;
    }
    if (p.wait === 'approval') {
      return `${name}'s mechanics are drafted — ${plural(c.pendingApproval, 'piece waits', 'pieces wait')} for you in the Forge. Approve and I'll write the sheet. ${log}`;
    }
    if (p.wait === 'stalled') return `${name}'s genesis has gone quiet on my side — tell me to continue when you're ready.`;
    return `I need a word from you before ${name}'s genesis can go on. My question is in the Log under Genesis.`;
  }
  return null;
}

/** Post the transition's status line to the GM's JEWL chat. Best-effort. */
export async function announceGenesisStatus(session: { id: string; campaignId: string; goal: string }): Promise<string | null> {
  const parsed = parseGenesisGoal(session.goal);
  if (!parsed) return null;
  const progress = deriveGenesisProgress(await loadGenesisFacts(parsed.characterId, session.campaignId, session.id));
  const line = genesisStatusLine(parsed.name, progress);
  if (!line) return null;
  const campaign = await prisma.campaign.findUnique({ where: { id: session.campaignId }, select: { gmUserId: true } });
  await prisma.copilotMessage.create({
    data: {
      campaignId: session.campaignId,
      role: 'assistant',
      content: line,
      userId: campaign?.gmUserId ?? null,
      actions: JSON.stringify({ source: 'GENESIS_STATUS', sessionId: session.id, state: progress.state }),
    },
  });
  return line;
}

/** Write one genesis cycle's full report to the jEWL tab's Log. */
export async function logGenesisReport(opts: {
  campaignId: string;
  goal: string;
  message: string;
  cycle?: number;
  /** Replaces "cycle N" in the row's first line (e.g. "prods · round 1"). */
  heading?: string;
  jewlUserId: string;
}): Promise<string | null> {
  const text = opts.message.trim();
  const parsed = parseGenesisGoal(opts.goal);
  if (!text || !parsed) return null;
  const { createCampaignEvent } = await import('./campaign-event');
  const event = await createCampaignEvent({
    campaignId: opts.campaignId,
    type: 'game_event',
    actor: 'ai_copilot',
    actorUserId: opts.jewlUserId,
    actorName: 'JEWL',
    characterId: parsed.characterId,
    characterName: parsed.name,
    payload: {
      kind: 'game_event',
      eventType: GENESIS_REPORT_EVENT,
      description: `${parsed.name} · ${opts.heading ?? `cycle ${opts.cycle ?? '?'}`}
${text}`,
    },
  });
  return event.id;
}
