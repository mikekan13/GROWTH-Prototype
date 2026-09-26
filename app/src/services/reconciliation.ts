/**
 * Reconciliation — JEWL's catch between the Watcher's words and the
 * simulated reality (Mike 2026-09-26, walking the tavern case).
 *
 *   1. JEWL reads the narration BEFORE it becomes canon and before any being
 *      perceives it. If it differs enough from the sim (a being is somewhere
 *      else; a place or person the world has no record of; a standing fact
 *      contradicted; the GM contradicting his own earlier words) → a popup
 *      in JEWL's voice: "mistake, or are we going somewhere new?"
 *   2. Dismiss = mistake; nothing was written. Confirm = the GM is
 *      improvising.
 *   3. On confirm JEWL PLANS: search what the campaign already has (planned or
 *      active locations, existing NPCs) for something that fits; stub what is
 *      missing from the description given. He does NOT author it himself —
 *      the stubs sit below the crystallization line (PLANNING / DRAFT) for the
 *      meta / Forge to author properly. The price is OVER-estimated and HELD
 *      against the campaign wallet (DoorDash rule). If even the estimate does
 *      not fit, the improvisation is REFUSED at the popup.
 *   4. The scene runs on the sketch at once (the caller then writes canon and
 *      the beings perceive through the mirror).
 *   5. Canon is fluid till it isn't: once enough rests on the narration event
 *      (memories, vines, later events) — or the session ends — the hold
 *      SETTLES same-or-under and the stubs cement (Location → ACTIVE).
 *   6. Corrections after the fact (`correctCanon`) keep the previous version,
 *      re-render every involved memory through that being's mirror with the
 *      mood of the moment, and record the REACH so Mike can find the limits
 *      of canon changing in play. Removing a character outright is beyond
 *      the limits and is not offered here at all.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { chat, DayaTierUnavailableError, DayaWarmingTimeoutError } from '@/daya/model-client';
import { perceive } from '@/daya/perceive';

import { createDefaultCharacter } from '@/lib/defaults';
import { createLocation } from '@/services/location';
import { moveCharacterToLocation } from '@/services/character-location';
import { executeTransaction } from '@/services/krma/ledger';
import { getCampaignEconomy } from '@/services/krma/wallet';
import type { ParsedProse } from '@/services/table-prose';
import {
  IMPROV_TUNING,
  baseKrmaFor,
  estimatePlan,
  isCemented,
  matchCandidate,
  overlap,
  presenceNeeds,
  titleCase,
  type PlanItem,
  type ReconKind,
} from '@/services/reconciliation-rules';

export interface TableActorLike { userId: string; username?: string; role: string }

export interface ReconTicket {
  id: string;
  status: string;
  kinds: ReconKind[];
  summary: string;
  question: string;
  plan: PlanItem[];
  estimateKrma: number;
  fluidKrma: number;
  message: string;
}

interface JewlRead {
  discrepant: boolean;
  kinds: ReconKind[];
  summary: string;
  question: string;
  needs: Array<{ kind: 'location' | 'npc' | 'item'; name: string; description: string }>;
  relocate: boolean;
}

function parseRow(row: { id: string; status: string; kinds: string; summary: string; question: string; plan: string; estimateKrma: number; message: string }, fluidKrma: number): ReconTicket {
  const safe = <T,>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T; } catch { return fallback; } };
  return { id: row.id, status: row.status, kinds: safe<ReconKind[]>(row.kinds, []), summary: row.summary, question: row.question, plan: safe<PlanItem[]>(row.plan, []), estimateKrma: row.estimateKrma, fluidKrma, message: row.message };
}

// ── The read ─────────────────────────────────────────────────────────────

async function simStateSummary(campaignId: string, listeners: Array<{ id: string; name: string }>) {
  const lines: string[] = [];
  for (const l of listeners) {
    const rel = await prisma.entityRelationship.findFirst({ where: { sourceId: l.id, relationshipType: 'located_at' }, select: { targetId: true } });
    const loc = rel ? await prisma.location.findUnique({ where: { id: rel.targetId }, select: { name: true, data: true } }) : null;
    let desc = '';
    try { desc = loc ? String((JSON.parse(loc.data) as { description?: string }).description ?? '').slice(0, 200) : ''; } catch { /* none */ }
    const here = rel ? await prisma.entityRelationship.findMany({ where: { targetId: rel.targetId, relationshipType: 'located_at', sourceId: { not: l.id } }, select: { sourceId: true } }) : [];
    const names = here.length ? (await prisma.character.findMany({ where: { id: { in: here.map((h) => h.sourceId) } }, select: { name: true } })).map((c) => c.name) : [];
    lines.push(`${l.name}: ${loc ? `at "${loc.name}"${desc ? ` — ${desc}` : ''}` : 'nowhere on the canvas'}${names.length ? `; also present: ${names.join(', ')}` : '; no one else present'}`);
  }
  const locations = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { name: true, status: true }, take: 60 });
  const npcs = await prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { name: true }, take: 60 });
  const recent = await prisma.canonEvent.findMany({ where: { campaignId, kind: { in: ['narration', 'declaration'] } }, orderBy: { createdAt: 'desc' }, take: 6, select: { narration: true } });
  return {
    beings: lines.join('\n') || '(no awake beings at the table)',
    locations: locations.map((l) => `${l.name} [${l.status.toLowerCase()}]`).join('; ') || '(none)',
    npcs: npcs.map((n) => n.name).join(', ') || '(none)',
    recent: recent.reverse().map((r) => `- ${r.narration.slice(0, 200)}`).join('\n') || '(nothing yet)',
  };
}

/** The model half of JEWL's read. Never throws; returns null when the C tier is unavailable. */
async function jewlRead(campaignId: string, message: string, listeners: Array<{ id: string; name: string }>): Promise<JewlRead | null> {
  const state = await simStateSummary(campaignId, listeners);
  try {
    const res = await chat({
      tier: 'C', subsystem: 'reconciliation',
      messages: [
        { role: 'system', content: `You are JEWL, the copilot running the table underneath a GROWTH Watcher (the GM). Before a line of narration becomes canon you read it against the simulated world. Decide whether it is DIFFERENT ENOUGH from the sim to stop and ask — the Watcher may have misspoken, or may be improvising somewhere new. Ordinary additive narration inside the current scene is NOT a discrepancy. Kinds: relocation (a being is narrated somewhere other than where the sim has it), new_presence (a person the roster lacks is here and matters), contradicted_fact (the narration contradicts what the world holds), contradiction (the Watcher contradicts his own recent narration), continuity (a jump the scene did not set up). Respond with ONLY JSON: {"discrepant": boolean, "kinds": string[], "summary": one plain sentence of what differs, "question": one or two sentences in JEWL's own voice to the Watcher — plain, unbothered, ending by asking whether it was a mistake or whether we are going somewhere new, "needs": [{"kind": "location"|"npc"|"item", "name": short name the narration implies, "description": what the narration says about it}], "relocate": boolean (true when the awake beings should now be at the narrated place)}. needs lists only what the world would have to HAVE for this narration to be true and does not already have.` },
        { role: 'user', content: `AWAKE BEINGS AND WHERE THE SIM HAS THEM:\n${state.beings}\n\nPLACES THE CAMPAIGN HAS:\n${state.locations}\n\nPEOPLE THE CAMPAIGN HAS:\n${state.npcs}\n\nTHE WATCHER'S RECENT NARRATION:\n${state.recent}\n\nNEW NARRATION:\n${message}` },
      ],
      maxTokens: 500, temperature: 0,
    });
    const m = res.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Partial<JewlRead>;
    return {
      discrepant: j.discrepant === true,
      kinds: Array.isArray(j.kinds) ? (j.kinds.filter((k) => ['relocation', 'new_presence', 'contradicted_fact', 'contradiction', 'continuity'].includes(String(k))) as ReconKind[]) : [],
      summary: String(j.summary ?? '').slice(0, 400),
      question: String(j.question ?? '').slice(0, 500),
      needs: Array.isArray(j.needs) ? j.needs.filter((n) => n && ['location', 'npc', 'item'].includes(String(n.kind))).map((n) => ({ kind: n.kind as 'location' | 'npc' | 'item', name: String(n.name ?? '').slice(0, 80), description: String(n.description ?? '').slice(0, 400) })) : [],
      relocate: j.relocate === true,
    };
  } catch (err) {
    if (!(err instanceof DayaTierUnavailableError) && !(err instanceof DayaWarmingTimeoutError)) console.warn('[reconciliation] JEWL read failed; rules only', err);
    return null;
  }
}

/** Plan against what the campaign already has: match, else stub. */
async function planNeeds(campaignId: string, needs: JewlRead['needs']): Promise<PlanItem[]> {
  const locations = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
  const locCandidates = locations.map((l) => { let d = ''; try { d = String((JSON.parse(l.data) as { description?: string }).description ?? ''); } catch { /* none */ } return { id: l.id, name: l.name, description: d }; });
  const npcs = await prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { id: true, name: true, data: true } });
  const npcCandidates = npcs.map((c) => { let d = ''; try { d = String((JSON.parse(c.data) as { identity?: { physicalDescription?: string } }).identity?.physicalDescription ?? ''); } catch { /* none */ } return { id: c.id, name: c.name, description: d }; });
  const plan: PlanItem[] = [];
  const seen = new Set<string>();
  for (const need of needs) {
    const key = `${need.kind}:${need.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const match = need.kind === 'location' ? matchCandidate(need, locCandidates) : need.kind === 'npc' ? matchCandidate(need, npcCandidates) : null;
    plan.push({ kind: need.kind, name: need.name || titleCase(need.description.slice(0, 40)), description: need.description, matchId: match?.id ?? null, matchName: match?.name ?? null, baseKrma: match ? 0 : baseKrmaFor(need.kind) });
  }
  return plan;
}

/**
 * JEWL's read of a message before it becomes canon. Returns a PENDING ticket
 * when the table should hold, or null when the narration is ordinary.
 */
export async function readNarration(
  campaignId: string,
  actor: TableActorLike,
  message: string,
  parsed: ParsedProse,
  listeners: Array<{ id: string; name: string }>,
): Promise<ReconTicket | null> {
  const rule = presenceNeeds(parsed);
  const read = await jewlRead(campaignId, message, listeners);
  const discrepant = (read?.discrepant ?? false) || rule.length > 0;
  if (!discrepant) return null;

  const kinds = new Set<ReconKind>(read?.kinds ?? []);
  if (rule.length) kinds.add('new_presence');
  // Merge the rule's people (named by the prose's own phrase, which the
  // attribution later matches on) with JEWL's; the same person described
  // twice ("Bright-Eyed Barmaid" / "bright eyed lass behind the bar") is one need.
  const needs = [...(read?.needs ?? [])];
  for (const r of rule) {
    const dup = needs.findIndex((n) => n.kind === 'npc' && (n.name.toLowerCase() === r.name.toLowerCase() || overlap(`${n.name} ${n.description}`, `${r.name} ${r.description}`) >= 0.3));
    if (dup >= 0) needs[dup] = { kind: 'npc', name: r.name, description: [needs[dup].description, r.description].filter(Boolean).join(' — ') };
    else needs.push(r);
  }
  const plan = await planNeeds(campaignId, needs);
  const est = estimatePlan(plan);
  const economy = await getCampaignEconomy(campaignId);
  const summary = read?.summary || (rule.length ? `${rule.map((r) => r.name).join(', ')} — no one the world knows.` : 'The narration differs from the sim.');
  const stubs = plan.filter((p) => !p.matchId);
  const question = read?.question || `${summary} Was that a mistake, or are we going somewhere new?`;
  const row = await prisma.reconciliation.create({
    data: {
      campaignId, status: 'PENDING', message, kinds: JSON.stringify([...kinds]), summary,
      question: stubs.length ? `${question} (I'd have to spin up ${stubs.map((s) => s.name).join(', ')} — I'd hold about ${est.held} KRMA against the campaign and settle at or under once it sticks.)` : question,
      plan: JSON.stringify(plan.map((p) => ({ ...p, relocate: (read?.relocate ?? false) || kinds.has('relocation') }))),
      estimateKrma: est.held, createdBy: actor.userId,
    },
  });
  return parseRow(row, Number(economy.fluid));
}

// ── Confirm / dismiss ────────────────────────────────────────────────────

async function holdWallet(campaignId: string) {
  const existing = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'HOLD' } });
  if (existing) return existing;
  return prisma.wallet.create({ data: { walletType: 'HOLD', ownerType: 'CAMPAIGN', label: 'Improvisation hold', campaignId, balance: BigInt(0) } });
}

/**
 * The Watcher continues: the improvisation is real. Hold the estimate, spin
 * up stubs (below the crystallization line), move the awake beings if the
 * narration relocated them. Returns the ticket, now CONFIRMED (or REFUSED if
 * the estimate does not fit the campaign's fluid KRMA).
 */
export async function confirmReconciliation(campaignId: string, actor: TableActorLike, ticketId: string): Promise<ReconTicket & { created: Array<{ kind: string; id: string; name: string }>; moved: string[]; refusedReason?: string }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('Only the Watcher answers JEWL');
  const row = await prisma.reconciliation.findUnique({ where: { id: ticketId } });
  if (!row || row.campaignId !== campaignId) throw new NotFoundError('No such reconciliation');
  if (row.status !== 'PENDING') throw new ValidationError(`Reconciliation is ${row.status}`);

  const economy = await getCampaignEconomy(campaignId);
  const fluid = Number(economy.fluid);
  if (row.estimateKrma > fluid) {
    const refused = await prisma.reconciliation.update({ where: { id: row.id }, data: { status: 'REFUSED', resolvedAt: new Date() } });
    return { ...parseRow(refused, fluid), created: [], moved: [], refusedReason: `JEWL would need to hold ${row.estimateKrma} KRMA and the campaign has ${fluid} fluid. The world cannot afford this improvisation.` };
  }

  // Hold (LOCK campaign → hold wallet). Zero estimates (everything matched) need no hold.
  let holdTxId: string | null = null;
  let holdWalletId: string | null = null;
  if (row.estimateKrma > 0) {
    const campaignWallet = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'CAMPAIGN' } });
    if (!campaignWallet) throw new ValidationError('Campaign has no wallet');
    const hold = await holdWallet(campaignId);
    const tx = await executeTransaction({
      fromWalletId: campaignWallet.id, toWalletId: hold.id, amount: BigInt(row.estimateKrma), state: 'LOCK', reason: 'IMPROV_HOLD',
      description: `Improvisation hold (over-estimate) — reconciliation ${row.id}`, metadata: { reconciliationId: row.id }, campaignId,
      actorId: actor.userId, actorType: 'GM', idempotencyKey: `improv-hold::${row.id}`,
    });
    holdTxId = tx.id; holdWalletId = hold.id;
  }

  // Spin up what is missing, below the crystallization line.
  const plan = (JSON.parse(row.plan) as Array<PlanItem & { relocate?: boolean }>);
  const created: Array<{ kind: string; id: string; name: string }> = [];
  let sceneLocationId: string | null = null;
  for (const p of plan) {
    if (p.kind !== 'location') continue;
    if (p.matchId) { sceneLocationId = p.matchId; continue; }
    const loc = await createLocation(campaignId, actor.userId, actor.role, { name: p.name, type: 'point_of_interest', description: p.description, tags: ['improvised'], notes: `Improvised by the Watcher at the table (reconciliation ${row.id}). Below the crystallization line until the canon cements.` });
    created.push({ kind: 'location', id: loc.id, name: loc.name });
    sceneLocationId = loc.id;
    await prisma.location.update({ where: { id: loc.id }, data: { data: JSON.stringify({ ...(JSON.parse(loc.data) as Record<string, unknown>), improvised: { reconciliationId: row.id, holdKrma: row.estimateKrma } }) } });
  }
  for (const p of plan) {
    if (p.kind !== 'npc' || p.matchId) continue;
    const data = createDefaultCharacter(p.name) as unknown as Record<string, unknown>;
    // What the narration said about them lives in _improv (free text the perception composer reads); the structured sheet stays default until the meta authors them.
    data._improv = { reconciliationId: row.id, description: p.description };
    const npc = await prisma.character.create({ data: { name: p.name, entityType: 'NPC', status: 'DRAFT', userId: actor.userId, campaignId, data: JSON.stringify(data) }, select: { id: true, name: true } });
    created.push({ kind: 'npc', id: npc.id, name: npc.name });
    if (sceneLocationId) await moveCharacterToLocation(actor.userId, actor.role, { characterId: npc.id, locationId: sceneLocationId, note: 'improvised here' });
  }
  // Relocate the awake beings when the narration moved them.
  const moved: string[] = [];
  if (sceneLocationId && plan.some((p) => p.relocate)) {
    const awake = await prisma.dayaEntity.findMany({ where: { status: 'ACTIVE', character: { campaignId } }, select: { characterId: true, character: { select: { name: true } } } });
    for (const a of awake) {
      await moveCharacterToLocation(actor.userId, actor.role, { characterId: a.characterId, locationId: sceneLocationId, note: 'the Watcher narrated them here' });
      moved.push(a.character.name);
    }
  }

  const updated = await prisma.reconciliation.update({ where: { id: row.id }, data: { status: 'CONFIRMED', holdTxId, holdWalletId, resolvedAt: new Date(), plan: JSON.stringify(plan.map((p) => ({ ...p, createdId: created.find((c) => c.kind === p.kind && c.name === p.name)?.id ?? null }))) } });
  return { ...parseRow(updated, fluid - row.estimateKrma), created, moved };
}

/** The Watcher takes it back: a mistake. Nothing was written. */
export async function dismissReconciliation(campaignId: string, actor: TableActorLike, ticketId: string): Promise<ReconTicket> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('Only the Watcher answers JEWL');
  const row = await prisma.reconciliation.findUnique({ where: { id: ticketId } });
  if (!row || row.campaignId !== campaignId) throw new NotFoundError('No such reconciliation');
  if (row.status !== 'PENDING') throw new ValidationError(`Reconciliation is ${row.status}`);
  const updated = await prisma.reconciliation.update({ where: { id: row.id }, data: { status: 'DISMISSED', resolvedAt: new Date() } });
  return parseRow(updated, 0);
}

/** A confirmed ticket the table is about to write canon for. */
export async function takeConfirmed(campaignId: string, ticketId: string, message: string) {
  const row = await prisma.reconciliation.findUnique({ where: { id: ticketId } });
  if (!row || row.campaignId !== campaignId) throw new NotFoundError('No such reconciliation');
  if (row.status !== 'CONFIRMED') throw new ValidationError(`Reconciliation is ${row.status} — answer JEWL first`);
  if (row.message.trim() !== message.trim()) throw new ValidationError('The message changed since JEWL read it — send it again without the ticket');
  return row;
}

export async function attachCanonToTicket(ticketId: string, canonEventId: string | null) {
  if (!canonEventId) return;
  await prisma.reconciliation.update({ where: { id: ticketId }, data: { canonEventId } });
}

// ── Cementing + settlement ───────────────────────────────────────────────

/** How much rests on a canon event: the hardening measure. */
export async function loadOn(canonEventId: string): Promise<{ memories: number; vines: number; laterEvents: number; entities: string[] }> {
  const direct = await prisma.dayaMemoryEntry.findMany({ where: { truthRef: canonEventId }, select: { entityId: true } });
  const chained = await prisma.dayaMemoryEntry.findMany({ where: { truthRef: { not: canonEventId }, chain: { contains: canonEventId } }, select: { entityId: true } });
  const vines = await prisma.vineEntry.count({ where: { canonEventId } });
  const laterEvents = await prisma.canonEvent.count({ where: { parentId: canonEventId } });
  const entities = [...new Set([...direct, ...chained].map((m) => m.entityId))];
  return { memories: direct.length + chained.length, vines, laterEvents, entities };
}

/** Settle one CONFIRMED ticket: same-or-under; release the rest; cement the stubs. */
export async function settleReconciliation(campaignId: string, ticketId: string, actorUserId: string, why: string): Promise<{ held: number; settled: number; released: number }> {
  const row = await prisma.reconciliation.findUnique({ where: { id: ticketId } });
  if (!row || row.campaignId !== campaignId || row.status !== 'CONFIRMED') return { held: 0, settled: 0, released: 0 };
  const plan = JSON.parse(row.plan) as Array<PlanItem & { createdId?: string | null }>;
  // The true price: what was really spun up, at base (the over-estimate was the DoorDash margin). Never over the hold.
  const real = estimatePlan(plan).real;
  const settled = Math.min(real, row.estimateKrma);
  const released = row.estimateKrma - settled;
  if (row.holdWalletId && released > 0) {
    const campaignWallet = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'CAMPAIGN' } });
    if (campaignWallet) {
      await executeTransaction({
        fromWalletId: row.holdWalletId, toWalletId: campaignWallet.id, amount: BigInt(released), state: 'UNLOCK', reason: 'IMPROV_RELEASE',
        description: `Improvisation settled ${settled} of ${row.estimateKrma} held — ${released} released (${why})`, metadata: { reconciliationId: row.id, settled, released }, campaignId,
        actorId: actorUserId, actorType: 'GM', idempotencyKey: `improv-release::${row.id}`,
      });
    }
  }
  // Cement the stubs: the improvised place crosses the crystallization line.
  for (const p of plan) {
    if (p.kind === 'location' && p.createdId) await prisma.location.update({ where: { id: p.createdId }, data: { status: 'ACTIVE' } }).catch(() => {});
  }
  await prisma.reconciliation.update({ where: { id: row.id }, data: { status: 'SETTLED', settledKrma: settled, settledAt: new Date() } });
  console.log(`[reconciliation] ${row.id} settled ${settled}/${row.estimateKrma} (${why})`);
  return { held: row.estimateKrma, settled, released };
}

/** Called after each table message: settle every confirmed ticket whose canon has cemented. */
export async function cementCheck(campaignId: string, actorUserId: string): Promise<number> {
  const open = await prisma.reconciliation.findMany({ where: { campaignId, status: 'CONFIRMED', canonEventId: { not: null } }, select: { id: true, canonEventId: true } });
  let settled = 0;
  for (const t of open) {
    const load = await loadOn(t.canonEventId!);
    if (isCemented(load)) { await settleReconciliation(campaignId, t.id, actorUserId, `cemented: ${load.memories} memories, ${load.vines} vines, ${load.laterEvents} later events`); settled++; }
  }
  return settled;
}

/** Session end is a hard cement: everything confirmed settles. */
export async function settleAllForCampaign(campaignId: string, actorUserId: string): Promise<number> {
  const open = await prisma.reconciliation.findMany({ where: { campaignId, status: 'CONFIRMED' }, select: { id: true } });
  for (const t of open) await settleReconciliation(campaignId, t.id, actorUserId, 'session ended');
  return open.length;
}

export async function listReconciliations(campaignId: string, actor: TableActorLike, status?: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError("JEWL's ledger is the Watcher's");
  const rows = await prisma.reconciliation.findMany({ where: { campaignId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map((r) => parseRow(r, 0));
}

// ── Corrections after the fact ───────────────────────────────────────────

/**
 * The Watcher corrects a canon event that beings already lived. Keeps the
 * previous version, rewrites the narration, re-renders every memory that
 * rests on it through that being's mirror with the mood of the moment, and
 * records the reach. The limits of this are Mike's to find in play — the
 * one floor already ruled (erasing a character) is not a thing this can do.
 */
export async function correctCanon(
  campaignId: string,
  actor: TableActorLike,
  input: { canonEventId: string; narration: string; reason?: string },
): Promise<{ revisionId: string; reach: { memories: number; rerendered: number; vines: number; laterEvents: number; entities: string[] } }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('Only the Watcher corrects canon');
  const event = await prisma.canonEvent.findUnique({ where: { id: input.canonEventId } });
  if (!event || event.campaignId !== campaignId) throw new NotFoundError('Canon event not found');
  const narration = input.narration.trim();
  if (!narration) throw new ValidationError('A correction needs words');

  const load = await loadOn(event.id);
  let detail: Record<string, unknown> = {};
  try { detail = JSON.parse(event.detail) as Record<string, unknown>; } catch { detail = {}; }
  const revisions = Array.isArray(detail._revisions) ? (detail._revisions as unknown[]) : [];
  revisions.push({ at: new Date().toISOString(), by: actor.userId, narration: event.narration, reason: input.reason ?? '' });
  await prisma.canonEvent.update({ where: { id: event.id }, data: { narration, detail: JSON.stringify({ ...detail, _revisions: revisions }) } });

  // Re-render every memory resting on it, through each being's own mirror, with the lens of the moment.
  const rows = await prisma.dayaMemoryEntry.findMany({
    where: { OR: [{ truthRef: event.id }, { chain: { contains: event.id } }], source: { in: ['perception', 'dialogue'] } },
    select: { id: true, entityId: true, source: true, content: true, classification: true, entity: { select: { characterId: true } } },
  });
  let rerendered = 0;
  for (const m of rows) {
    let cls: Record<string, unknown> = {};
    try { cls = JSON.parse(m.classification) as Record<string, unknown>; } catch { cls = {}; }
    if (cls.rationaleTag === 'failed recall attempt') continue; // not a perception of the event
    const snapshot = (cls.mirror as { observer?: { mood?: { morale: number; stress: number; grief: number }; attunement?: number } } | undefined)?.observer;
    try {
      const p = await perceive(m.entity.characterId, campaignId, narration, m.source === 'dialogue' ? 'dialogue' : 'perception', {}, { observer: snapshot });
      const history = Array.isArray(cls.revisions) ? (cls.revisions as unknown[]) : [];
      history.push({ at: new Date().toISOString(), previous: m.content, canonEventId: event.id });
      await prisma.dayaMemoryEntry.update({
        where: { id: m.id },
        data: { content: p.prose, classification: JSON.stringify({ ...cls, revisions: history, mirror: { ...(cls.mirror as Record<string, unknown> ?? {}), fidelityLevel: p.fidelityLevel, distortions: p.distortions, observer: p.observer, rerendered: true } }) },
      });
      rerendered++;
    } catch (err) { console.warn('[reconciliation] re-render failed for memory', m.id, err); }
  }
  const reach = { memories: rows.length, rerendered, vines: load.vines, laterEvents: load.laterEvents, entities: load.entities };
  const rev = await prisma.canonRevision.create({
    data: { campaignId, canonEventId: event.id, previous: JSON.stringify({ narration: event.narration, detail: event.detail }), narration, reason: input.reason ?? '', reach: JSON.stringify(reach), authoredBy: actor.userId },
  });
  console.log(`[reconciliation] canon ${event.id} corrected; reach ${JSON.stringify(reach)}`);
  return { revisionId: rev.id, reach };
}

export { IMPROV_TUNING };
