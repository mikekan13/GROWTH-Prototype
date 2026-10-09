/**
 * ACTIVE INSPECTION — perception unit 11 (Mike 2026-10-09: ACTIVE INSPECTION — WHO PICKS THE SKILL;
 * INSPECTION = ORDINARY CHECKS). Memory: ruling-passive-active-perception-familiarity-2026-10-08.
 *
 *   declare  "I inspect the sword" / "…with my swordsmanship" (player chat, detectInspectIntent) or
 *            POST /api/campaigns/[id]/intents → an inspect chip on the planning board (lib/planning-board)
 *   edit     the GM names the skill / sets DR, or the player names the skill (PATCH …/intents/[intentId])
 *   commit   the GM's next move (calling a check, or table narration) takes every chip
 *   check    skill named on the sheet → standard SKILLED check (its governors); none → the system picks
 *            (skill-relevance domain match); still none → standard UNSKILLED check, blind effort from
 *            Wisdom. A player's character → the EXISTING check flow (services/skill-check: SD, colour
 *            hint, wager, FD — rolled visibly by the player); a being nobody plays → the engine rolls
 *            the same dice (no effort) and posts the roll.
 *   resolve  services/check-resolved → resolveInspection → planInspection (sim/perception/inspect)
 *            → familiarity writes, source 'inspect' (a WRONG impression is lastSource 'wrong').
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { rollDie } from '@/lib/dice';
import { getSkillDieType, parseDie } from '@/lib/dice-utils';
import { broadcastEvent } from '@/lib/campaign-stream';
import { postIntent, listIntents, getIntent, updateIntent, removeIntent, takeIntents, type InspectIntentChip } from '@/lib/planning-board';
import type { InspectPurpose } from '@/lib/pending-checks';
import { requireCampaignMember } from '@/services/campaign-access';
import { createCampaignEvent } from '@/services/campaign-event';
import { gatherTraitModifiers } from '@/services/trait-modifiers';
import { familiarityAt, recordExposure } from '@/services/familiarity';
import { subjectAspects } from '@/services/familiarity-seed';
import { currentCycleOf } from '@/services/history';
import { getRelevance, normalizeSkillName, pickBestSkill, SKILL_RELEVANCE_TUNING, type SkillRelevance } from '@/services/skill-relevance';
import { detectInspectIntent, exposureByDomain, planInspection, INSPECT_TUNING, type InspectWrite } from '@/sim/perception/inspect';
import { aspectDomains, BEING_ASPECTS, HEAD_DOMAIN_KEYS, type HeadDomainKey } from '@/sim/perception/aspects';
import type { CheckOutcome } from '@/services/check-resolved';
import type { GrowthCharacter } from '@/types/growth';

type User = { id: string; role: string; username?: string };
type SubjectKind = InspectIntentChip['subjectKind'];

// ── Declare ───────────────────────────────────────────────────────────────

export const postInspectSchema = z.object({
  characterId: z.string().min(1),
  /** The thing by id (a context-menu action), or… */
  subjectId: z.string().min(1).optional(),
  /** …by the words used ("the sword"). */
  target: z.string().min(1).max(200).optional(),
  skillName: z.string().min(1).max(120).nullable().optional(),
  text: z.string().max(500).optional(),
}).refine((v) => v.subjectId || v.target, { message: 'subjectId or target is required' });

export const editInspectSchema = z.object({
  skillName: z.string().min(1).max(120).nullable().optional(),
  dr: z.number().int().min(1).max(100).nullable().optional(),
});

async function campaignOf(campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, gmUserId: true } });
  if (!c) throw new NotFoundError('Campaign not found');
  return c;
}

/** The character's owner or the campaign's GM / ADMIN may declare and edit its intents. */
async function requireDeclarer(campaignId: string, user: User, characterId: string) {
  const campaign = await campaignOf(campaignId);
  const ch = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, userId: true, campaignId: true } });
  if (!ch || ch.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  const gm = canManageCampaign(user.id, user.role, campaign);
  if (!gm && ch.userId !== user.id) throw new ForbiddenError("Not your character's intent");
  return { campaign, character: ch, gm };
}

/** Find what the words name: an item, a being or a place of the campaign (exact name first, then a containment match). */
export async function findInspectSubject(campaignId: string, target: string): Promise<{ id: string; kind: SubjectKind; name: string } | null> {
  const want = target.trim().toLowerCase().replace(/^(?:the|this|that|a|an)\s+/, '');
  if (!want) return null;
  const [items, chars, locs] = await Promise.all([
    prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true }, take: 400 }),
    prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true, entityType: true }, take: 400 }),
    prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true }, take: 400 }),
  ]);
  const all: Array<{ id: string; kind: SubjectKind; name: string }> = [
    ...items.map((i) => ({ id: i.id, kind: 'ITEM' as const, name: i.name })),
    ...chars.map((c) => ({ id: c.id, kind: (c.entityType === 'NPC' ? 'NPC' : 'CHARACTER') as SubjectKind, name: c.name })),
    ...locs.map((l) => ({ id: l.id, kind: 'LOCATION' as const, name: l.name })),
  ];
  const low = (s: string) => s.toLowerCase();
  return all.find((s) => low(s.name) === want)
    ?? all.find((s) => low(s.name).includes(want))
    ?? all.find((s) => want.includes(low(s.name)) && s.name.length >= 3)
    ?? null;
}

async function subjectById(campaignId: string, id: string): Promise<{ id: string; kind: SubjectKind; name: string } | null> {
  const item = await prisma.campaignItem.findFirst({ where: { id, campaignId }, select: { id: true, name: true } });
  if (item) return { id: item.id, kind: 'ITEM', name: item.name };
  const ch = await prisma.character.findFirst({ where: { id, campaignId }, select: { id: true, name: true, entityType: true } });
  if (ch) return { id: ch.id, kind: ch.entityType === 'NPC' ? 'NPC' : 'CHARACTER', name: ch.name };
  const loc = await prisma.location.findFirst({ where: { id, campaignId }, select: { id: true, name: true } });
  return loc ? { id: loc.id, kind: 'LOCATION', name: loc.name } : null;
}

/** Declare an inspection: it rides the planning board until the GM's next move. */
export async function postInspectIntent(campaignId: string, user: User, input: z.input<typeof postInspectSchema>): Promise<InspectIntentChip> {
  const r = postInspectSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message).join('; '));
  const v = r.data;
  const { gm } = await requireDeclarer(campaignId, user, v.characterId);
  const subject = v.subjectId ? await subjectById(campaignId, v.subjectId) : await findInspectSubject(campaignId, v.target!);
  if (!subject) throw new NotFoundError(`Nothing called "${v.target ?? v.subjectId}" here`);
  return postIntent({
    id: crypto.randomUUID(), campaignId, kind: 'inspect', characterId: v.characterId,
    subjectId: subject.id, subjectKind: subject.kind, subjectName: subject.name,
    skillName: v.skillName ?? null, skillBy: v.skillName ? (gm ? 'gm' : 'player') : null,
    dr: null, text: v.text ?? `inspect ${subject.name}`, postedBy: user.id, createdAt: Date.now(),
  });
}

/** A player's chat line: if it declares an inspection, post it. Best-effort — never throws. */
export async function postInspectFromChat(campaignId: string, user: User, characterId: string, message: string): Promise<InspectIntentChip | null> {
  try {
    const said = detectInspectIntent(message);
    if (!said) return null;
    return await postInspectIntent(campaignId, user, { characterId, target: said.target, skillName: said.skill, text: message.slice(0, 500) });
  } catch (err) {
    if (!(err instanceof NotFoundError)) console.warn('[inspection] chat intent not posted', err);
    return null;
  }
}

/** Open chips: the GM sees every chip; anyone else only their own characters'. */
export async function listInspectIntents(campaignId: string, user: User): Promise<InspectIntentChip[]> {
  const campaign = await requireCampaignMember(campaignId, user);
  const chips = listIntents(campaignId);
  if (canManageCampaign(user.id, user.role, campaign)) return chips;
  const own = await prisma.character.findMany({ where: { campaignId, userId: user.id }, select: { id: true } });
  const mine = new Set(own.map((c) => c.id));
  return chips.filter((c) => mine.has(c.characterId));
}

/** The GM names the skill / sets DR; the owner may name (or clear) the skill. */
export async function editInspectIntent(campaignId: string, user: User, intentId: string, input: z.input<typeof editInspectSchema>): Promise<InspectIntentChip> {
  const r = editInspectSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message).join('; '));
  const chip = getIntent(intentId);
  if (!chip || chip.campaignId !== campaignId) throw new NotFoundError('Intent not found (already committed?)');
  const { gm } = await requireDeclarer(campaignId, user, chip.characterId);
  if (r.data.dr !== undefined && !gm) throw new ForbiddenError('Only the GM sets the DR');
  const patch: Parameters<typeof updateIntent>[1] = {};
  if (r.data.skillName !== undefined) { patch.skillName = r.data.skillName; patch.skillBy = r.data.skillName ? (gm ? 'gm' : 'player') : null; }
  if (r.data.dr !== undefined) patch.dr = r.data.dr;
  return updateIntent(intentId, patch)!;
}

export async function cancelInspectIntent(campaignId: string, user: User, intentId: string): Promise<void> {
  const chip = getIntent(intentId);
  if (!chip || chip.campaignId !== campaignId) throw new NotFoundError('Intent not found (already committed?)');
  await requireDeclarer(campaignId, user, chip.characterId);
  removeIntent(intentId);
}

// ── Commit (the GM's next move) ───────────────────────────────────────────

/**
 * Called from the GM's moves (POST /skill-check, POST /table). Only the campaign's GM / ADMIN commits;
 * anyone else's call does nothing. Fire-and-forget: the GM's move never waits on the inspections.
 */
export function commitPlanningBoardOnGmMove(campaignId: string, user: User): void {
  if (!listIntents(campaignId).length) return;
  void (async () => {
    const campaign = await campaignOf(campaignId);
    if (!canManageCampaign(user.id, user.role, campaign)) return;
    for (const chip of takeIntents(campaignId)) {
      try { await startInspection(campaignId, { id: user.id, username: user.username ?? 'GM' }, chip); }
      catch (err) { console.warn('[inspection] could not start', chip.id, err); }
    }
  })().catch((err) => console.warn('[inspection] commit failed', err));
}

/** The aspects one subject has (items from their data; beings also their own numbers). */
export function inspectableAspects(kind: SubjectKind, itemData: string | null): string[] {
  const base = subjectAspects(kind, itemData);
  return kind === 'CHARACTER' || kind === 'NPC' ? [...base, ...BEING_ASPECTS] : base;
}

/** Head domains a skill reaches (relevance ≥ the cut-off). Pure. */
export function skillDomainsOf(rel: SkillRelevance): HeadDomainKey[] {
  return HEAD_DOMAIN_KEYS.filter((d) => rel[d].relevance >= SKILL_RELEVANCE_TUNING.minRelevant);
}

export interface InspectionChoice { skilled: boolean; skillName: string; level: number; governors: string[]; skillDomains: HeadDomainKey[]; pickedBy: 'player' | 'gm' | 'system' | 'none' }

/**
 * Which check: the named skill if it is on the sheet (skilled); a named skill NOT on the sheet → unskilled
 * (as the check route treats it); nothing named → the system's best domain match; none → unskilled Wisdom.
 */
export async function chooseInspectionSkill(
  campaignId: string,
  sheetSkills: Array<{ name: string; level: number; governors?: string[] }>,
  chip: Pick<InspectIntentChip, 'skillName' | 'skillBy'>,
  aspectTags: HeadDomainKey[][],
  relevanceOf: (name: string) => Promise<SkillRelevance> = (name) => getRelevance(name, { campaignId }),
): Promise<InspectionChoice> {
  const unskilled: InspectionChoice = { skilled: false, skillName: '', level: 0, governors: ['wisdom'], skillDomains: [], pickedBy: 'none' };
  if (chip.skillName) {
    const s = sheetSkills.find((k) => normalizeSkillName(k.name) === normalizeSkillName(chip.skillName!));
    if (!s) return unskilled;
    return { skilled: true, skillName: s.name, level: s.level, governors: s.governors ?? [], skillDomains: skillDomainsOf(await relevanceOf(s.name)), pickedBy: chip.skillBy ?? 'player' };
  }
  const rel = new Map<string, SkillRelevance>();
  for (const s of sheetSkills) if (s.name && !rel.has(normalizeSkillName(s.name))) rel.set(normalizeSkillName(s.name), await relevanceOf(s.name));
  const union = [...new Set(aspectTags.flat())];
  const best = pickBestSkill(sheetSkills, union, (n) => rel.get(normalizeSkillName(n)));
  if (!best) return unskilled;
  const s = sheetSkills.find((k) => k.name === best.skill)!;
  return { skilled: true, skillName: s.name, level: s.level, governors: s.governors ?? [], skillDomains: skillDomainsOf(rel.get(normalizeSkillName(s.name))!), pickedBy: 'system' };
}

const parseJson = <T,>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

async function itemDataOf(kind: SubjectKind, subjectId: string): Promise<string | null> {
  if (kind !== 'ITEM') return null;
  return (await prisma.campaignItem.findUnique({ where: { id: subjectId }, select: { data: true } }))?.data ?? null;
}

/** Start the committed inspection's check. */
export async function startInspection(campaignId: string, gm: { id: string; username: string }, chip: InspectIntentChip): Promise<{ via: 'player' | 'engine'; purpose: InspectPurpose }> {
  const campaign = await campaignOf(campaignId);
  const ch = await prisma.character.findUnique({ where: { id: chip.characterId }, select: { id: true, name: true, userId: true, entityType: true, data: true } });
  if (!ch) throw new NotFoundError('Character not found');
  const sheet = parseJson<GrowthCharacter>(ch.data);
  const skills = (Array.isArray(sheet?.skills) ? sheet!.skills : []) as Array<{ name: string; level: number; governors?: string[] }>;
  const itemData = await itemDataOf(chip.subjectKind, chip.subjectId);
  const tags = inspectableAspects(chip.subjectKind, itemData).map((k) => aspectDomains(k, itemData ?? undefined));
  const choice = await chooseInspectionSkill(campaignId, skills, chip, tags);
  const purpose: InspectPurpose = {
    kind: 'inspect', intentId: chip.id, characterId: ch.id, subjectId: chip.subjectId, subjectKind: chip.subjectKind,
    skillName: choice.skillName, skillDomains: choice.skillDomains,
  };
  const dr = chip.dr ?? INSPECT_TUNING.defaultDr;
  const played = ch.entityType === 'PLAYER_CHARACTER' && !!ch.userId && ch.userId !== campaign.gmUserId;
  if (played) {
    const { initiateSkillCheck } = await import('@/services/skill-check');
    await initiateSkillCheck(campaignId, gm, {
      characterId: ch.id,
      ...(choice.skilled ? { skillName: choice.skillName } : { attributeName: 'wisdom' }),
      dr, revealDR: false,
    }, { purpose });
    return { via: 'player', purpose };
  }
  await engineInspectionRoll(campaignId, gm, { id: ch.id, name: ch.name, sheet }, choice, dr, purpose);
  return { via: 'engine', purpose };
}

/** A being nobody plays: the engine rolls the same dice (SD + FD + trait flat, no effort) and posts the roll. */
async function engineInspectionRoll(
  campaignId: string,
  gm: { id: string; username: string },
  ch: { id: string; name: string; sheet: GrowthCharacter | null },
  choice: InspectionChoice,
  dr: number,
  purpose: InspectPurpose,
): Promise<void> {
  const fateDie = ch.sheet?.creation?.seed?.baseFateDie || 'd6';
  const sd = getSkillDieType(choice.level);
  const sdResult = sd.isFlat ? sd.flatBonus : rollDie(sd.sides);
  const sdDie = sd.isFlat ? `flat:${sd.flatBonus}` : `d${sd.sides}`;
  const fdResult = rollDie(parseDie(fateDie));
  let traitFlat = 0;
  if (ch.sheet) {
    try { traitFlat = gatherTraitModifiers(ch.sheet, { skillName: choice.skilled ? choice.skillName : undefined, governorAttribute: choice.governors[0] ?? 'wisdom' }).totalFlat; } catch { traitFlat = 0; }
  }
  const total = sdResult + fdResult + traitFlat;
  const success = total >= dr;
  const margin = total - dr;
  const label = choice.skilled ? choice.skillName : 'wisdom';
  await createCampaignEvent({
    campaignId, type: 'dice_roll', actor: 'system', actorUserId: gm.id, actorName: 'System', characterId: ch.id, characterName: ch.name,
    payload: {
      kind: 'dice_roll', context: `${label} check to inspect vs DR ${dr} (engine roll)`,
      skillName: choice.skilled ? choice.skillName : undefined, skillLevel: choice.level,
      skillDie: { die: sdDie, value: sdResult, isFlat: sd.isFlat }, fateDie: { die: fateDie, value: fdResult },
      effort: 0, flatModifiers: traitFlat || undefined, total, dr, success, margin, isSkilled: choice.skilled,
    },
  });
  broadcastEvent(campaignId, {
    kind: 'check_result', checkId: `inspect-${purpose.intentId}`, characterId: ch.id, characterName: ch.name,
    skillName: choice.skilled ? choice.skillName : undefined, sdDie, sdResult, fdDie: fateDie, fdResult,
    effort: 0, traitFlat, traitSources: [], total, dr, success, margin,
  });
  await resolveInspection(campaignId, purpose, { total, success, margin, effortBy: {}, skilled: choice.skilled });
}

// ── Resolve ───────────────────────────────────────────────────────────────

/** The check is in: raise (or mislead) the inspector's familiarity with the subject's aspects. */
export async function resolveInspection(campaignId: string, purpose: InspectPurpose, outcome: CheckOutcome & { skilled: boolean }): Promise<InspectWrite[]> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId: purpose.characterId }, select: { id: true } });
  if (!entity) { console.warn('[inspection] no DAYA being for', purpose.characterId, '— nothing learned'); return []; }
  const [rows, nowCycle, itemData] = await Promise.all([
    prisma.familiarity.findMany({ where: { campaignId, perceiverId: entity.id }, select: { subjectId: true, aspectKind: true, score: true, lastCycle: true } }),
    currentCycleOf(campaignId),
    itemDataOf(purpose.subjectKind, purpose.subjectId),
  ]);
  const scored = rows.map((r) => ({ ...r, now: familiarityAt(r, nowCycle) }));
  const exposure = exposureByDomain(scored.map((r) => ({ aspectKind: r.aspectKind, score: r.now })));
  const current: Record<string, number> = {};
  for (const r of scored) if (r.subjectId === purpose.subjectId) current[r.aspectKind] = r.now;
  const aspects = inspectableAspects(purpose.subjectKind, itemData).map((key) => ({ key, domains: aspectDomains(key, itemData ?? undefined) }));
  const writes = planInspection(
    { aspects, skillDomains: purpose.skillDomains, exposure, current },
    { success: outcome.success, margin: outcome.margin, skilled: outcome.skilled, witEffort: outcome.effortBy.wit ?? 0 },
  );
  const base = { campaignId, perceiverId: entity.id, subjectId: purpose.subjectId, subjectKind: purpose.subjectKind };
  for (const w of writes) {
    const key = { perceiverId: entity.id, subjectId: purpose.subjectId, aspectKind: w.aspectKind };
    if (w.op === 'grow') {
      await recordExposure({ ...base, aspectKind: w.aspectKind, source: 'inspect', times: w.times, cycle: nowCycle });
    } else {
      // A flag lifts an unknown aspect to F1 ("it's a relic"); a wrong impression stays F0, marked 'wrong'
      // (TUNING / minimal: nothing reads the mark yet — [QUESTION] how a wrong impression shows).
      const score = w.op === 'flag' ? Math.max(current[w.aspectKind] ?? 0, w.score) : (current[w.aspectKind] ?? 0);
      const lastSource = w.op === 'flag' ? 'inspect' : 'wrong';
      await prisma.familiarity.upsert({
        where: { perceiverId_subjectId_aspectKind: key },
        create: { ...key, campaignId, subjectKind: purpose.subjectKind, score, lastSource, lastCycle: nowCycle },
        update: { score, lastSource, lastCycle: nowCycle },
      });
    }
  }
  if (writes.length) void import('@/lib/perceived-feed-push').then((m) => m.notifyMemoryWritten(entity.id)).catch(() => {});
  return writes;
}
