/**
 * Terminal recall (MEMORY-DESIGN §0/§2/§7 step 6) — the audience with the
 * gods, JEWL as front man.
 *
 * North star (Mike): the Terminal answers any question about anything
 * anywhere in GROWTH with perfect detail and NO hallucination. The Terminal
 * is a being whose memory is the canon ledger; its recall has a threshold of
 * zero. So an answer here is a LOOKUP + TRAVERSAL over canon and vines, and a
 * model only phrases what the record returns:
 *   classify the question → scope to the campaign → find the canon events
 *   it touches (domains, parties, goals, words) → the custodians' vine
 *   readings → phrase with a citation on every sentence → drop any sentence
 *   that cites nothing the record holds.
 *
 * Scope: the Watcher sees everything within their campaign and nothing
 * beyond (Mike 09-23). No cross-campaign reads exist here at all.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { classifyDomains } from '@/daya/domains';
import { goalsTouched } from '@/daya/chain';
import { stemmedJaccard } from '@/daya/recall';
import { chat, DayaTierUnavailableError, DayaWarmingTimeoutError } from '@/daya/model-client';

export interface TerminalFact {
  id: string;
  cycle: number;
  kind: string;
  narration: string;
  actorId: string | null;
  targetId: string | null;
  domains: string[];
  score: number;
  why: string[];
}

export interface TerminalAnswer {
  question: string;
  domains: string[];
  parties: Array<{ id: string; name: string }>;
  goalIds: string[];
  facts: TerminalFact[];
  vines: Array<{ goalId: string; side: string; custodianPillar: string | null; reading: string; canonEventId: string }>;
  /** Phrased answer; every sentence carries [c:<canonId>] citations, or the answer says the record holds nothing. */
  answer: string;
  citations: string[];
  /** Sentences the phrasing model produced that cited nothing in the record — dropped, never shown. */
  unsupportedDropped: number;
  phrasedBy: 'model' | 'record';
}

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Pure: score one canon event against the question's signals. */
export function scoreFact(
  f: { narration: string; actorId: string | null; targetId: string | null; domains: string[]; goalIds: string[] },
  q: { text: string; domains: string[]; partyIds: string[]; goalIds: string[] },
): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  const partyHit = [f.actorId, f.targetId].filter((x): x is string => !!x && q.partyIds.includes(x)).length;
  if (partyHit) { score += 0.35 * partyHit; why.push(`party×${partyHit}`); }
  const goalHit = f.goalIds.filter(g => q.goalIds.includes(g)).length;
  if (goalHit) { score += 0.3; why.push('goal'); }
  if (q.domains.length && f.domains.length) {
    if (f.domains[0] === q.domains[0]) { score += 0.25; why.push('domain'); }
    else if (f.domains.some(d => q.domains.includes(d))) { score += 0.12; why.push('domain~'); }
  }
  const words = stemmedJaccard(q.text, f.narration);
  if (words > 0) { score += 0.4 * words; why.push(`words ${words.toFixed(2)}`); }
  return { score, why };
}

const CITE = /\[c:([A-Za-z0-9_-]+)\]/g;

/** Pure: keep only sentences whose every citation resolves; strip citations from the visible text is NOT done — they are the proof. */
export function enforceCitations(text: string, known: Set<string>): { kept: string; dropped: number; citations: string[] } {
  // Models often put the citation AFTER the full stop ("…door. [c:x]") — pull
  // trailing citations back inside the sentence they belong to before splitting.
  const normalized = text
    .replace(/([.!?])\s*((?:\[c:[A-Za-z0-9_-]+\]\s*)+)/g, (_m, punct: string, cites: string) => ` ${cites.trim()}${punct} `)
    .replace(/\s+([.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const sentences = normalized.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const kept: string[] = [];
  const citations = new Set<string>();
  let dropped = 0;
  for (const s of sentences) {
    const ids = [...s.matchAll(CITE)].map(m => m[1]);
    if (ids.length === 0 || ids.some(id => !known.has(id))) { dropped++; continue; }
    ids.forEach(id => citations.add(id));
    kept.push(s);
  }
  return { kept: kept.join(' '), dropped, citations: [...citations] };
}

async function assertWatcher(campaignId: string, actor: { userId: string; role: string }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true, name: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('The Terminal answers the Watcher');
  return campaign;
}

/** Retrieval only — the record's answer, no model. Deterministic; the harness scores this. */
export async function retrieveForQuestion(campaignId: string, question: string, limit = 20) {
  const characters = await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } });
  const qLower = question.toLowerCase();
  const parties = characters.filter(c => c.name && qLower.includes(c.name.toLowerCase()));
  const partyIds = parties.map(p => p.id);
  const goals = await prisma.goal.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, description: true, characterId: true } });
  const goalIds = goalsTouched(question, goals);
  const domains = classifyDomains(question).all;

  const rows = await prisma.canonEvent.findMany({ where: { campaignId }, orderBy: [{ cycle: 'desc' }, { createdAt: 'desc' }], take: 2000 });
  const scored: TerminalFact[] = rows.map(r => {
    const fDomains = parseJson<string[]>(r.domains, []);
    const fGoals = parseJson<string[]>(r.goalIds, []);
    const { score, why } = scoreFact({ narration: r.narration, actorId: r.actorId, targetId: r.targetId, domains: fDomains, goalIds: fGoals }, { text: question, domains, partyIds, goalIds });
    return { id: r.id, cycle: r.cycle, kind: r.kind, narration: r.narration, actorId: r.actorId, targetId: r.targetId, domains: fDomains, score, why };
  }).filter(f => f.score > 0).sort((a, b) => b.score - a.score || b.cycle - a.cycle).slice(0, limit);

  // Vines worth reading: goals the question touches, plus the goals of anyone the question names.
  const vineGoalIds = [...new Set([...goalIds, ...goals.filter(g => partyIds.includes(g.characterId)).map(g => g.id)])];
  const vines = vineGoalIds.length
    ? await prisma.vineEntry.findMany({ where: { campaignId, goalId: { in: vineGoalIds } }, orderBy: [{ cycle: 'desc' }], take: 10, select: { goalId: true, side: true, custodianPillar: true, reading: true, canonEventId: true } })
    : [];
  return { domains, parties, goalIds, facts: scored, vines };
}

export async function askTerminal(campaignId: string, actor: { userId: string; role: string }, question: string): Promise<TerminalAnswer> {
  const campaign = await assertWatcher(campaignId, actor);
  const r = await retrieveForQuestion(campaignId, question);
  const known = new Set(r.facts.map(f => f.id));
  const nameOf = new Map((await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } })).map(c => [c.id, c.name]));
  const recordLines = r.facts.slice(0, 8).map(f => `${f.narration} [c:${f.id}]`);

  if (r.facts.length === 0) {
    return { question, domains: r.domains, parties: r.parties, goalIds: r.goalIds, facts: [], vines: r.vines, answer: 'The record holds nothing on that.', citations: [], unsupportedDropped: 0, phrasedBy: 'record' };
  }

  // Phrase with a model when one is available; the record is the fallback and the judge.
  let answer = recordLines.join(' ');
  let phrasedBy: TerminalAnswer['phrasedBy'] = 'record';
  let dropped = 0;
  let citations = r.facts.slice(0, 8).map(f => f.id);
  try {
    const factList = r.facts.map(f => `[c:${f.id}] (cycle ${f.cycle.toFixed(3)}, ${f.kind}${f.actorId ? `, actor ${nameOf.get(f.actorId) ?? f.actorId}` : ''}${f.targetId ? `, target ${nameOf.get(f.targetId) ?? f.targetId}` : ''}) ${f.narration}`).join('\n');
    const vineList = r.vines.map(v => `[c:${v.canonEventId}] (${v.side}${v.custodianPillar ? `, ${v.custodianPillar}` : ''}) ${v.reading}`).join('\n');
    const res = await chat({
      tier: 'C', subsystem: 'terminal-recall',
      messages: [
        { role: 'system', content: `You are the Terminal of the campaign "${campaign.name}", answering its Watcher. You have PERFECT recollection and NO imagination: answer ONLY from the record below. Every sentence you write must end with the citation(s) of the record lines it rests on, in the exact form [c:ID]. If the record does not answer the question, write exactly: The record holds nothing on that. Never add a fact that has no citation. Be brief and concrete.` },
        { role: 'user', content: `Question: ${question}\n\nRECORD:\n${factList}${vineList ? `\n\nCUSTODIANS' READINGS:\n${vineList}` : ''}` },
      ],
      maxTokens: 400, temperature: 0,
    });
    const enforced = enforceCitations(res.text.trim(), known);
    if (enforced.kept.length > 0) {
      answer = enforced.kept;
      citations = enforced.citations;
      dropped = enforced.dropped;
      phrasedBy = 'model';
    } else if (/holds nothing/i.test(res.text)) {
      answer = 'The record holds nothing on that.';
      citations = [];
      phrasedBy = 'model';
    }
  } catch (err) {
    if (!(err instanceof DayaTierUnavailableError) && !(err instanceof DayaWarmingTimeoutError)) console.warn('[terminal-recall] phrasing failed; record answer used', err);
  }

  return { question, domains: r.domains, parties: r.parties, goalIds: r.goalIds, facts: r.facts, vines: r.vines, answer, citations, unsupportedDropped: dropped, phrasedBy };
}

// ── Perfect-recollection harness (step 7) ──────────────────────────────────

export interface RecollectionReport {
  sampled: number;
  /** The source event appeared in the top-k retrieved facts. */
  recallAtK: number;
  k: number;
  /** The phrased answer cited the source event (model runs only). */
  citeRate: number | null;
  misses: Array<{ eventId: string; question: string }>;
}

function questionFor(ev: { kind: string; narration: string; actorId: string | null; targetId: string | null }, nameOf: Map<string, string>): string {
  const a = ev.actorId ? nameOf.get(ev.actorId) ?? 'someone' : null;
  const t = ev.targetId ? nameOf.get(ev.targetId) ?? 'someone' : null;
  switch (ev.kind) {
    case 'damage': return `How was ${t ?? 'the target'} hurt${a ? ` by ${a}` : ''}?`;
    case 'downed': return `How did ${t ?? 'they'} go down?`;
    case 'check': return `What did ${a ?? 'someone'} do${t ? ` to ${t}` : ''}?`;
    case 'dialogue': return `What did ${a ?? 'someone'} say?`;
    case 'declaration': return `What happened: ${ev.narration.split(/[.!?]/)[0].slice(0, 60)}?`;
    default: return `What happened when ${ev.narration.split(/[.!?]/)[0].slice(0, 60)}?`;
  }
}

/** Sample canon events, ask the Terminal about each, score whether the record comes back. ADMIN/Watcher. */
export async function recollectionCheck(campaignId: string, actor: { userId: string; role: string }, opts: { n?: number; k?: number; phrase?: boolean } = {}): Promise<RecollectionReport> {
  await assertWatcher(campaignId, actor);
  const n = Math.min(opts.n ?? 10, 50), k = opts.k ?? 5;
  const rows = await prisma.canonEvent.findMany({ where: { campaignId, kind: { notIn: ['encounter_round'] } }, orderBy: { createdAt: 'desc' }, take: 200 });
  const sample = rows.sort(() => Math.random() - 0.5).slice(0, n);
  const nameOf = new Map((await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } })).map(c => [c.id, c.name]));
  let hits = 0, cites = 0, phrased = 0;
  const misses: RecollectionReport['misses'] = [];
  for (const ev of sample) {
    const q = questionFor(ev, nameOf);
    const r = await retrieveForQuestion(campaignId, q, k);
    if (r.facts.some(f => f.id === ev.id)) hits++; else misses.push({ eventId: ev.id, question: q });
    if (opts.phrase) {
      const a = await askTerminal(campaignId, actor, q);
      if (a.phrasedBy === 'model') { phrased++; if (a.citations.includes(ev.id)) cites++; }
    }
  }
  return { sampled: sample.length, recallAtK: sample.length ? hits / sample.length : 0, k, citeRate: phrased ? cites / phrased : null, misses };
}
