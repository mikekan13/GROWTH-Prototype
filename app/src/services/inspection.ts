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
 *            → familiarity writes, source 'inspect'. A WRONG impression (bad fumble) is lastSource 'wrong'
 *            and stores the WRONG VALUE perceived (sim/perception/wrong-impression; small model, deterministic
 *            fallback) — shown as fact to that inspector until a correct perception fixes it.
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
import { perceptionFeedOn } from '@/lib/perception-feed';
import { requireCampaignMember } from '@/services/campaign-access';
import { createCampaignEvent } from '@/services/campaign-event';
import { gatherTraitModifiers } from '@/services/trait-modifiers';
import { familiarityAt, priorOf, recordExposure, witOfPerceiver, writeFamiliarity, WRONG_SOURCE } from '@/services/familiarity';
import { wrongImpressionFor, type WrongImpressionModel } from '@/sim/perception/wrong-impression';
import type { AspectSubject } from '@/sim/perception/aspect-values';
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
  /** New words for the chip ("inspect the shield with my smithing"): realigns its subject (and names the skill if the words do). */
  text: z.string().trim().min(1).max(500).optional(),
});

/** One chip as the viewer may read it (GET /intents). */
export interface IntentChipView extends InspectIntentChip {
  /** The inspecting character's name (the viewer's own character, or any for the GM). */
  characterName: string;
  /** The subject as this viewer knows it: the truth for the GM; flag on → the inspector's visible-form label. */
  subjectLabel: string;
  /** The inspecting character's sheet skills — the chip's skill choices. */
  skills: string[];
  /** The viewer is the GM (sets DR; edits any chip). */
  gm: boolean;
}

/**
 * Tell the readers of these characters' chips that the board moved: each character's owner, the campaign's
 * GM, and whoever acted. No text — the client re-reads GET /intents (which filters per viewer). Best-effort.
 */
function notifyBoardChanged(campaignId: string, characterIds: string[], actorIds: string[] = []): void {
  void (async () => {
    const [campaign, chars] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } }),
      characterIds.length ? prisma.character.findMany({ where: { id: { in: characterIds } }, select: { userId: true } }) : Promise.resolve([]),
    ]);
    const users = new Set([campaign?.gmUserId, ...chars.map((c) => c.userId), ...actorIds].filter((u): u is string => !!u));
    for (const u of users) broadcastEvent(campaignId, { kind: 'board_changed' }, u);
  })().catch((err) => console.warn('[inspection] board_changed not sent', err));
}

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
  const chip = postIntent({
    id: crypto.randomUUID(), campaignId, kind: 'inspect', characterId: v.characterId,
    subjectId: subject.id, subjectKind: subject.kind, subjectName: subject.name,
    skillName: v.skillName ?? null, skillBy: v.skillName ? (gm ? 'gm' : 'player') : null,
    dr: null, text: v.text ?? `inspect ${subject.name}`, postedBy: user.id, createdAt: Date.now(),
  });
  notifyBoardChanged(campaignId, [chip.characterId], [user.id]);
  return chip;
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

function sheetSkillNames(data: string | null | undefined): string[] {
  try {
    const sheet = data ? JSON.parse(data) as { skills?: unknown } : null;
    const list = Array.isArray(sheet?.skills) ? sheet.skills as Array<{ name?: unknown } | string> : [];
    return [...new Set(list.map((s) => (typeof s === 'string' ? s : typeof s?.name === 'string' ? s.name : '')).filter(Boolean))];
  } catch { return []; }
}

/**
 * Open chips as this viewer may read them: the GM sees every chip (truth); anyone else only their own
 * characters'. With PERCEPTION_FEED on, a non-GM reads the subject as the INSPECTOR knows it (visible-form
 * labelFor by its identity level) — never the truth name it has not learned.
 */
export async function listInspectIntents(campaignId: string, user: User): Promise<IntentChipView[]> {
  const campaign = await requireCampaignMember(campaignId, user);
  const gm = canManageCampaign(user.id, user.role, campaign);
  let chips = listIntents(campaignId);
  if (!chips.length) return [];
  const ids = [...new Set(chips.map((c) => c.characterId))];
  const chars = await prisma.character.findMany({ where: { campaignId, id: { in: ids } }, select: { id: true, name: true, userId: true, data: true } });
  const byId = new Map(chars.map((c) => [c.id, c]));
  if (!gm) chips = chips.filter((c) => byId.get(c.characterId)?.userId === user.id);
  const perceived = !gm && perceptionFeedOn();
  const vf = perceived ? await import('@/services/visible-form') : null;
  const ctxs = new Map<string, Awaited<ReturnType<NonNullable<typeof vf>['loadViewerContext']>>>();
  const out: IntentChipView[] = [];
  for (const chip of chips) {
    const ch = byId.get(chip.characterId);
    let subjectLabel = chip.subjectName;
    let text = chip.text;
    if (vf) {
      if (!ctxs.has(chip.characterId)) ctxs.set(chip.characterId, await vf.loadViewerContext(campaignId, chip.characterId, { rewrite: null }));
      const ctx = ctxs.get(chip.characterId);
      const e = ctx?.entities.find((x) => x.id === chip.subjectId) ?? { id: chip.subjectId, kind: chip.subjectKind, name: chip.subjectName };
      subjectLabel = vf.labelFor(e, ctx?.familiarity[e.id]?.identity ?? 0, chip.characterId);
      // Words someone else wrote (or the default wording) carry the truth name: show the viewer's own label instead.
      if (chip.postedBy !== user.id || chip.text === `inspect ${chip.subjectName}`) text = `inspect ${subjectLabel}`;
    }
    out.push({
      ...chip, text, subjectName: perceived ? subjectLabel : chip.subjectName,
      characterName: ch?.name ?? '', subjectLabel, skills: sheetSkillNames(ch?.data), gm,
    });
  }
  return out;
}

/** The GM names the skill / sets DR; the owner may name (or clear) the skill or rewrite the words (realigning the subject). */
export async function editInspectIntent(campaignId: string, user: User, intentId: string, input: z.input<typeof editInspectSchema>): Promise<InspectIntentChip> {
  const r = editInspectSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message).join('; '));
  const chip = getIntent(intentId);
  if (!chip || chip.campaignId !== campaignId) throw new NotFoundError('Intent not found (already committed?)');
  const { gm } = await requireDeclarer(campaignId, user, chip.characterId);
  if (r.data.dr !== undefined && !gm) throw new ForbiddenError('Only the GM sets the DR');
  const patch: Parameters<typeof updateIntent>[1] = {};
  if (r.data.text !== undefined) {
    // The same reading as a chat line ("inspect X [with my Y]"); bare words name the subject themselves.
    const said = detectInspectIntent(r.data.text);
    const target = said?.target ?? r.data.text;
    const subject = await findInspectSubject(campaignId, target);
    if (!subject) throw new NotFoundError(`Nothing called "${target}" here`);
    Object.assign(patch, { text: r.data.text, subjectId: subject.id, subjectKind: subject.kind, subjectName: subject.name });
    if (said?.skill && r.data.skillName === undefined) { patch.skillName = said.skill; patch.skillBy = gm ? 'gm' : 'player'; }
  }
  if (r.data.skillName !== undefined) { patch.skillName = r.data.skillName; patch.skillBy = r.data.skillName ? (gm ? 'gm' : 'player') : null; }
  if (r.data.dr !== undefined) patch.dr = r.data.dr;
  const next = updateIntent(intentId, patch);
  if (!next) throw new NotFoundError('Intent not found (already committed?)');
  notifyBoardChanged(campaignId, [chip.characterId], [user.id]);
  return next;
}

export async function cancelInspectIntent(campaignId: string, user: User, intentId: string): Promise<void> {
  const chip = getIntent(intentId);
  if (!chip || chip.campaignId !== campaignId) throw new NotFoundError('Intent not found (already committed?)');
  await requireDeclarer(campaignId, user, chip.characterId);
  removeIntent(intentId);
  notifyBoardChanged(campaignId, [chip.characterId], [user.id]);
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
    const taken = takeIntents(campaignId);
    notifyBoardChanged(campaignId, [...new Set(taken.map((c) => c.characterId))], [user.id]);
    for (const chip of taken) {
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
  await resolveInspection(campaignId, purpose, { total, success, margin, effortBy: {}, skilled: choice.skilled, checkId: `inspect-${purpose.intentId}` });
}

// ── Resolve ───────────────────────────────────────────────────────────────

/** What the inspector looked at, for its wrong impression: an item's data + look, a being's look + attributes. */
async function impressionSubjectOf(kind: SubjectKind, subjectId: string, itemData: string | null): Promise<{ subject: AspectSubject; name: string }> {
  try {
    if (kind === 'ITEM') {
      const row = await prisma.campaignItem.findUnique({ where: { id: subjectId }, select: { name: true } });
      const item = parseJson<NonNullable<AspectSubject['item']>>(itemData);
      return { subject: { item, description: (item as { description?: string } | null)?.description ?? null }, name: row?.name ?? 'the thing' };
    }
    if (kind === 'CHARACTER' || kind === 'NPC') {
      const ch = await prisma.character.findUnique({ where: { id: subjectId }, select: { data: true } });
      const sheet = parseJson<GrowthCharacter>(ch?.data);
      const { characterDescription } = await import('@/services/visible-form');
      const attrs: Record<string, { current: number; max: number }> = {};
      for (const [k, a] of Object.entries((sheet?.attributes ?? {}) as unknown as Record<string, { level?: number; current?: number; augmentPositive?: number; augmentNegative?: number }>)) {
        if (a && typeof a.level === 'number') attrs[k] = { current: typeof a.current === 'number' ? a.current : a.level, max: a.level + (a.augmentPositive ?? 0) - (a.augmentNegative ?? 0) };
      }
      return { subject: { description: characterDescription(sheet as Parameters<typeof characterDescription>[0]), being: { attrs } }, name: 'the figure' };
    }
    if (kind === 'LOCATION') {
      const loc = await prisma.location.findUnique({ where: { id: subjectId }, select: { name: true, data: true } });
      return { subject: { description: parseJson<{ description?: string }>(loc?.data)?.description ?? null }, name: loc?.name ?? 'the place' };
    }
  } catch (err) { console.warn('[inspection] could not read the subject for its wrong impression', err); }
  return { subject: {}, name: 'the thing' };
}

/** The world-sim's small model on the classify lane — only when the world-sim is on (PERCEPTION_REACH). */
async function defaultImpressionModel(campaignId: string): Promise<WrongImpressionModel | null> {
  const { perceptionReachOn, reachModelFor } = await import('@/services/perception-reach');
  return perceptionReachOn() ? reachModelFor(campaignId, 'wrong-impression') : null;
}

/** The check is in: raise (or mislead) the inspector's familiarity with the subject's aspects. */
export async function resolveInspection(campaignId: string, purpose: InspectPurpose, outcome: CheckOutcome & { skilled: boolean; checkId?: string }, opts: { model?: WrongImpressionModel | null } = {}): Promise<InspectWrite[]> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId: purpose.characterId }, select: { id: true } });
  if (!entity) { console.warn('[inspection] no DAYA being for', purpose.characterId, '— nothing learned'); return []; }
  const [rows, nowCycle, itemData, witMax] = await Promise.all([
    prisma.familiarity.findMany({ where: { campaignId, perceiverId: entity.id }, select: { subjectId: true, aspectKind: true, score: true, lastCycle: true } }),
    currentCycleOf(campaignId),
    itemDataOf(purpose.subjectKind, purpose.subjectId),
    witOfPerceiver(entity.id),
  ]);
  const scored = rows.map((r) => ({ ...r, now: familiarityAt(r, nowCycle, witMax) }));
  const exposure = exposureByDomain(scored.map((r) => ({ aspectKind: r.aspectKind, score: r.now })));
  const current: Record<string, number> = {};
  for (const r of scored) if (r.subjectId === purpose.subjectId) current[r.aspectKind] = r.now;
  const aspects = inspectableAspects(purpose.subjectKind, itemData).map((key) => ({ key, domains: aspectDomains(key, itemData ?? undefined) }));
  const writes = planInspection(
    { aspects, skillDomains: purpose.skillDomains, exposure, current },
    { success: outcome.success, margin: outcome.margin, skilled: outcome.skilled, witEffort: outcome.effortBy.wit ?? 0 },
  );
  const base = { campaignId, perceiverId: entity.id, subjectId: purpose.subjectId, subjectKind: purpose.subjectKind };
  const refs = outcome.checkId ? { checkId: outcome.checkId } : undefined;
  for (const w of writes) {
    const key = { perceiverId: entity.id, subjectId: purpose.subjectId, aspectKind: w.aspectKind };
    if (w.op === 'grow') {
      await recordExposure({ ...base, aspectKind: w.aspectKind, source: 'inspect', times: w.times, cycle: nowCycle, refs });
    } else {
      // A flag lifts an unknown aspect to F1 ("it's a relic"). A wrong impression keeps its score, is marked
      // 'wrong', and stores the WRONG VALUE perceived (Mike 2026-10-09: "shows as gold for that entity until
      // it is 'fixed'") — the model first when the world-sim is on, else the deterministic fallback.
      const score = w.op === 'flag' ? Math.max(current[w.aspectKind] ?? 0, w.score) : (current[w.aspectKind] ?? 0);
      const source = w.op === 'flag' ? 'inspect' : WRONG_SOURCE;
      let impression: string | undefined;
      if (w.op === 'wrong') {
        const subj = await impressionSubjectOf(purpose.subjectKind, purpose.subjectId, itemData);
        const model = opts.model !== undefined ? opts.model : await defaultImpressionModel(campaignId);
        impression = (await wrongImpressionFor(w.aspectKind, subj.subject, { seed: `${entity.id}:${purpose.subjectId}:${outcome.checkId ?? nowCycle}`, subjectName: subj.name, model })).value ?? undefined;
      }
      await prisma.$transaction(async (tx) => {
        const prior = await priorOf(tx, key);
        await writeFamiliarity(tx, [{ ...key, campaignId, subjectKind: purpose.subjectKind, score, source, cycle: nowCycle, prior, keepSubjectKind: true, refs, ...(impression !== undefined ? { impression } : {}) }]);
      });
    }
  }
  // The inspector's own feed line ("probably both" — Mike 2026-10-09): a memory row, rendered at its knowledge.
  await writeInspectionLine(campaignId, entity.id, purpose, writes, nowCycle, outcome);
  void import('@/lib/perceived-feed-push').then((m) => m.notifyMemoryWritten(entity.id)).catch(() => {});
  return writes;
}

/**
 * INSPECTION WRITES A FEED LINE: one memory row for the inspector (classification kind 'inspection', no
 * canon ref — the feed renders it at the viewer's CURRENT knowledge, services/perceived-feed
 * inspectionForm). Its stored `content` is that line as rendered now ("You study the old sword: Weight:
 * about as heavy as a war hammer; …"), the being's own memory of what it learned. Never throws.
 */
async function writeInspectionLine(campaignId: string, entityId: string, purpose: InspectPurpose, writes: InspectWrite[], nowCycle: number, outcome: CheckOutcome & { checkId?: string }): Promise<string | null> {
  try {
    const { writeMemoryEntry } = await import('@/daya/memory');
    const { INSPECTION_MEMORY_KIND, renderInspectionForms } = await import('@/services/perceived-feed');
    const cls = { kind: INSPECTION_MEMORY_KIND, subjectId: purpose.subjectId, subjectKind: purpose.subjectKind, aspects: [...new Set(writes.map((w) => w.aspectKind))], checkId: outcome.checkId ?? null, success: outcome.success };
    const m = await writeMemoryEntry({
      entityId, narrativeCycle: nowCycle, source: 'perception', content: 'You study it.',
      valence: 0, arousal: 0.3, salience: 0.5, entityRefs: [purpose.subjectId],
      classification: cls, truthRef: null, chain: { entities: [purpose.subjectId] }, noticed: true,
    });
    const { forms } = await renderInspectionForms(campaignId, purpose.characterId, [{ id: m.id, classification: JSON.stringify(cls) }]);
    const row = forms.get(m.id)?.rows[0];
    const text = row && row.type === 'narration' ? row.pieces.map((x) => (x.kind === 'gap' ? '' : x.text)).join('') : null;
    if (text) await prisma.dayaMemoryEntry.update({ where: { id: m.id }, data: { content: text } });
    return m.id;
  } catch (err) {
    console.warn('[inspection] feed line not written (non-fatal)', err);
    return null;
  }
}
