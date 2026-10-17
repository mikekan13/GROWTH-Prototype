/**
 * CANON REWRITE MODE (Mike 2026-10-17) — temporary, first campaign only.
 * "I need a special permission … so that as I play it will actually use my
 * roleplay to fix traits and memories. Essentially a mega canon changing
 * allowing. Only me when I play as GM."
 *
 * Gate: campaign.aiSettings.canonRewrite === true AND the actor is ADMIN
 * (strict — GODHEAD ticks never pass) AND the campaign's GM.
 * Every rewrite applies at once and is archived as a ChangeLog row
 * (category 'canon_rewrite', snapshotBefore = what to restore); undo puts the
 * before back. revertible=false keeps the generic Character.data revert away
 * from these rows — only undoCanonRewrite restores them.
 *
 * Trait scope (Mike's choice "both, you choose"): 'instance' rewrites this
 * character's copy (CharacterBlockLink.localName / story); 'blueprint'
 * rewrites the Forge item itself (every bearer).
 * See [[ruling-canon-rewrite-mode-first-campaign-2026-10-17]].
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { validateForgeData } from './forge-schemas';

export const CANON_REWRITE_CATEGORY = 'canon_rewrite';

/** The flag, from campaign.aiSettings. Pure. */
export function canonRewriteFlag(aiSettings: string | null | undefined): boolean {
  try { return (JSON.parse(aiSettings || '{}') as { canonRewrite?: unknown }).canonRewrite === true; } catch { return false; }
}

/** Is canon rewrite open to this actor in this campaign? Never throws. */
export async function canonRewriteActive(campaignId: string, actorId: string, actorRole: string): Promise<boolean> {
  if (actorRole !== 'ADMIN') return false;
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true, aiSettings: true } });
  return !!c && c.gmUserId === actorId && canonRewriteFlag(c.aiSettings);
}

async function requireCanonRewrite(campaignId: string, actorId: string, actorRole: string) {
  if (!(await canonRewriteActive(campaignId, actorId, actorRole))) {
    throw new ForbiddenError('Canon rewrite mode is off, or you are not the ADMIN running this campaign as GM.');
  }
}

/** Switch the mode on or off for a campaign (ADMIN + campaign GM). */
export async function setCanonRewriteMode(campaignId: string, actorId: string, actorRole: string, on: boolean) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true, aiSettings: true } });
  if (!c) throw new NotFoundError('Campaign');
  if (actorRole !== 'ADMIN' || c.gmUserId !== actorId) throw new ForbiddenError('Only the ADMIN running this campaign as GM can switch canon rewrite mode.');
  let s: Record<string, unknown> = {};
  try { s = JSON.parse(c.aiSettings || '{}'); } catch { s = {}; }
  await prisma.campaign.update({ where: { id: campaignId }, data: { aiSettings: JSON.stringify({ ...s, canonRewrite: on }) } });
  return { canonRewrite: on };
}

type Before =
  | { kind: 'trait_instance'; linkId: string; localName: string | null; story: string; history: string }
  | { kind: 'trait_blueprint'; forgeItemId: string; name: string; data: string }
  | { kind: 'memory_rewrite'; memoryId: string; content: string; classification: string }
  | { kind: 'memory_retire'; row: Record<string, unknown> }
  | { kind: 'memory_add'; memoryId: string };

async function archive(campaignId: string, characterId: string, actorId: string, description: string, before: Before, after: unknown) {
  const ch = await prisma.character.findUnique({ where: { id: characterId }, select: { name: true } });
  const row = await prisma.changeLog.create({
    data: {
      campaignId, characterId, characterName: ch?.name ?? '', actor: 'gm', actorUserId: actorId,
      category: CANON_REWRITE_CATEGORY, description, source: 'canon_rewrite_mode',
      changes: JSON.stringify(after ?? {}), revertible: false, snapshotBefore: JSON.stringify(before),
    },
  });
  return row.id;
}

// ── Traits ─────────────────────────────────────────────────────────────

export const rewriteTraitSchema = z.object({
  characterId: z.string().min(1),
  /** The trait: its link id, Forge item id, or name / local name on this character. */
  trait: z.string().min(1),
  scope: z.enum(['instance', 'blueprint']).describe("'instance' = this character's copy only (default); 'blueprint' = the Forge trait itself, every bearer — only when the fix is about the trait, not this person"),
  /** instance: the name this character's copy goes by. */
  localName: z.string().max(80).optional(),
  /** instance: this character's version of the trait, in story (≤600 chars). */
  story: z.string().max(600).optional(),
  /** blueprint: new name / description / mechanical effect. */
  name: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  mechanicalEffect: z.string().max(2000).optional(),
  /** What in the play made this right (one line, shown in the chat note). */
  reason: z.string().min(1).max(300),
});

export async function rewriteTrait(campaignId: string, actorId: string, actorRole: string, input: unknown) {
  await requireCanonRewrite(campaignId, actorId, actorRole);
  const p = rewriteTraitSchema.parse(input);
  const links = await prisma.characterBlockLink.findMany({ where: { characterId: p.characterId, campaignId } });
  const items = await prisma.forgeItem.findMany({ where: { id: { in: links.map(l => l.forgeItemId) } } });
  const ref = p.trait.trim().toLowerCase();
  const link = links.find(l => l.id === p.trait || l.forgeItemId === p.trait)
    ?? links.find(l => (l.localName ?? '').toLowerCase() === ref)
    ?? links.find(l => items.find(i => i.id === l.forgeItemId)?.name.toLowerCase() === ref);
  if (!link) throw new NotFoundError(`Trait "${p.trait}" on this character`);
  const item = items.find(i => i.id === link.forgeItemId)!;

  if (p.scope === 'instance') {
    if (p.localName === undefined && p.story === undefined) throw new ValidationError('An instance rewrite needs localName and/or story.');
    const before: Before = { kind: 'trait_instance', linkId: link.id, localName: link.localName, story: link.story, history: link.history };
    let history: unknown[] = [];
    try { history = JSON.parse(link.history || '[]'); } catch { history = []; }
    history.push({ kind: 'canon_rewrite', at: new Date().toISOString(), text: `${link.localName ?? item.name}: ${link.story}`.slice(0, 600) });
    const updated = await prisma.characterBlockLink.update({
      where: { id: link.id },
      data: { ...(p.localName !== undefined ? { localName: p.localName } : {}), ...(p.story !== undefined ? { story: p.story } : {}), history: JSON.stringify(history) },
    });
    const id = await archive(campaignId, p.characterId, actorId, `Rewrote ${item.type} "${updated.localName ?? item.name}" (this character only) — ${p.reason}`, before, { localName: updated.localName, story: updated.story });
    return { rewriteId: id, scope: 'instance' as const, trait: updated.localName ?? item.name, type: item.type };
  }

  if (!item.campaignId) throw new ForbiddenError('A global trait cannot be rewritten from a campaign.');
  if (p.name === undefined && p.description === undefined && p.mechanicalEffect === undefined) throw new ValidationError('A blueprint rewrite needs name, description and/or mechanicalEffect.');
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(item.data); } catch { data = {}; }
  const nextData = { ...data, ...(p.description !== undefined ? { description: p.description } : {}), ...(p.mechanicalEffect !== undefined ? { mechanicalEffect: p.mechanicalEffect } : {}) };
  const validated = validateForgeData(item.type, nextData);
  const before: Before = { kind: 'trait_blueprint', forgeItemId: item.id, name: item.name, data: item.data };
  const updated = await prisma.forgeItem.update({
    where: { id: item.id },
    data: { ...(p.name ? { name: p.name } : {}), data: JSON.stringify({ ...data, ...validated }) },
  });
  const bearers = await prisma.characterBlockLink.count({ where: { forgeItemId: item.id } });
  const id = await archive(campaignId, p.characterId, actorId, `Rewrote the ${item.type} blueprint "${updated.name}" (all ${bearers} bearer${bearers === 1 ? '' : 's'}) — ${p.reason}`, before, { name: updated.name, description: p.description, mechanicalEffect: p.mechanicalEffect });
  return { rewriteId: id, scope: 'blueprint' as const, trait: updated.name, type: item.type, bearers };
}

// ── Memories ───────────────────────────────────────────────────────────

export const rewriteMemorySchema = z.object({
  characterId: z.string().min(1),
  op: z.enum(['rewrite', 'retire', 'add']).describe("'rewrite' a memory's text, 'retire' one that is not true (archived, undoable), or 'add' one the play revealed"),
  memoryId: z.string().optional().describe('rewrite / retire: the memory id (from read_canon)'),
  content: z.string().max(4000).optional().describe('rewrite / add: the memory, first person, as she lived it'),
  atAge: z.number().min(0).max(200).optional().describe('add: her age when she lived it (omit = now)'),
  reason: z.string().min(1).max(300),
});

async function entityFor(characterId: string) {
  const e = await prisma.dayaEntity.findFirst({ where: { characterId } });
  if (!e) throw new NotFoundError('This character has no DAYA memory');
  return e;
}

export async function rewriteMemory(campaignId: string, actorId: string, actorRole: string, input: unknown) {
  await requireCanonRewrite(campaignId, actorId, actorRole);
  const p = rewriteMemorySchema.parse(input);
  const entity = await entityFor(p.characterId);

  if (p.op === 'add') {
    if (!p.content) throw new ValidationError('An added memory needs content.');
    const ch = await prisma.character.findUnique({ where: { id: p.characterId }, select: { data: true, campaignId: true } });
    const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
    let birth: number | null = null;
    try { const b = (JSON.parse(ch?.data ?? '{}') as { birthCycle?: unknown }).birthCycle; birth = typeof b === 'number' ? b : null; } catch { birth = null; }
    const row = await prisma.dayaMemoryEntry.create({
      data: {
        entityId: entity.id, source: 'gm_intervention', content: p.content, salience: 0.6,
        // her age then → the clock (as daya/authoring seedMemoryCycle; not imported — it pulls the tool registry in a cycle)
        narrativeCycle: typeof p.atAge === 'number' && typeof birth === 'number' ? Math.round((birth + p.atAge) * 1000) / 1000 : (camp?.currentCycle ?? 0),
        classification: JSON.stringify({ canonRewrite: true, reason: p.reason }),
      },
    });
    const id = await archive(campaignId, p.characterId, actorId, `Added a memory — ${p.reason}`, { kind: 'memory_add', memoryId: row.id }, { content: p.content, atAge: p.atAge ?? null });
    return { rewriteId: id, op: 'add' as const, memoryId: row.id };
  }

  if (!p.memoryId) throw new ValidationError(`A ${p.op} needs memoryId.`);
  const m = await prisma.dayaMemoryEntry.findUnique({ where: { id: p.memoryId } });
  if (!m || m.entityId !== entity.id) throw new NotFoundError('That memory on this character');

  if (p.op === 'retire') {
    const { ...row } = m as unknown as Record<string, unknown>;
    await prisma.dayaMemoryEntry.delete({ where: { id: m.id } });
    const id = await archive(campaignId, p.characterId, actorId, `Retired a memory ("${m.content.slice(0, 80)}…") — ${p.reason}`, { kind: 'memory_retire', row }, { retired: m.id });
    return { rewriteId: id, op: 'retire' as const, memoryId: m.id };
  }

  if (!p.content) throw new ValidationError('A rewrite needs content.');
  let cls: Record<string, unknown> = {};
  try { cls = JSON.parse(m.classification); } catch { cls = {}; }
  const revisions = Array.isArray(cls.revisions) ? cls.revisions as unknown[] : [];
  revisions.push({ at: new Date().toISOString(), previous: m.content, canonRewrite: true, reason: p.reason });
  await prisma.dayaMemoryEntry.update({ where: { id: m.id }, data: { content: p.content, classification: JSON.stringify({ ...cls, revisions }) } });
  const id = await archive(campaignId, p.characterId, actorId, `Rewrote a memory — ${p.reason}`, { kind: 'memory_rewrite', memoryId: m.id, content: m.content, classification: m.classification }, { content: p.content });
  return { rewriteId: id, op: 'rewrite' as const, memoryId: m.id };
}

// ── Undo + read ────────────────────────────────────────────────────────

export const undoCanonRewriteSchema = z.object({
  rewriteId: z.string().optional().describe('The rewrite to undo; omit = the most recent one in this campaign'),
});

export async function undoCanonRewrite(campaignId: string, actorId: string, actorRole: string, input: unknown) {
  await requireCanonRewrite(campaignId, actorId, actorRole);
  const p = undoCanonRewriteSchema.parse(input ?? {});
  const row = p.rewriteId
    ? await prisma.changeLog.findUnique({ where: { id: p.rewriteId } })
    : await prisma.changeLog.findFirst({ where: { campaignId, category: CANON_REWRITE_CATEGORY, revertedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!row || row.campaignId !== campaignId || row.category !== CANON_REWRITE_CATEGORY) throw new NotFoundError('Canon rewrite');
  if (row.revertedAt) throw new ValidationError('That rewrite was already undone.');
  const b = JSON.parse(row.snapshotBefore ?? '{}') as Before;
  switch (b.kind) {
    case 'trait_instance':
      await prisma.characterBlockLink.update({ where: { id: b.linkId }, data: { localName: b.localName, story: b.story, history: b.history } });
      break;
    case 'trait_blueprint':
      await prisma.forgeItem.update({ where: { id: b.forgeItemId }, data: { name: b.name, data: b.data } });
      break;
    case 'memory_rewrite':
      await prisma.dayaMemoryEntry.update({ where: { id: b.memoryId }, data: { content: b.content, classification: b.classification } });
      break;
    case 'memory_retire': {
      const r = b.row as Record<string, unknown>;
      await prisma.dayaMemoryEntry.create({ data: { ...r, realTime: new Date(String(r.realTime)) } as never });
      break;
    }
    case 'memory_add':
      await prisma.dayaMemoryEntry.deleteMany({ where: { id: b.memoryId } });
      break;
    default:
      throw new ValidationError('Unknown rewrite kind');
  }
  await prisma.changeLog.update({ where: { id: row.id }, data: { revertedAt: new Date(), revertedBy: actorId } });
  return { undone: row.id, description: row.description };
}

export const readCanonSchema = z.object({
  characterId: z.string().min(1),
  /** Words to find memories by (omit = the most salient 15). */
  query: z.string().max(200).optional(),
});

/** What a rewrite can target: her traits (instance + blueprint text) and memories with ids. */
export async function readCanon(campaignId: string, actorId: string, actorRole: string, input: unknown) {
  await requireCanonRewrite(campaignId, actorId, actorRole);
  const p = readCanonSchema.parse(input);
  const links = await prisma.characterBlockLink.findMany({ where: { characterId: p.characterId, campaignId } });
  const items = await prisma.forgeItem.findMany({ where: { id: { in: links.map(l => l.forgeItemId) } } });
  const traits = links.map(l => {
    const i = items.find(x => x.id === l.forgeItemId);
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(i?.data ?? '{}'); } catch { d = {}; }
    return { linkId: l.id, type: i?.type, name: i?.name, localName: l.localName, story: l.story, description: d.description, mechanicalEffect: d.mechanicalEffect };
  }).filter(t => t.type && ['nectar', 'thorn', 'blossom'].includes(t.type));
  const entity = await prisma.dayaEntity.findFirst({ where: { characterId: p.characterId } });
  let memories: Array<{ id: string; cycle: number; content: string }> = [];
  if (entity) {
    const words = (p.query ?? '').toLowerCase().match(/[a-z']{3,}/g) ?? [];
    const rows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id }, orderBy: { salience: 'desc' }, take: words.length ? 400 : 15 });
    const hits = words.length ? rows.filter(r => words.some(w => r.content.toLowerCase().includes(w))).slice(0, 15) : rows;
    memories = hits.map(r => ({ id: r.id, cycle: r.narrativeCycle, content: r.content.slice(0, 400) }));
  }
  return { traits, memories };
}

/** The mode note for JEWL's context (only when the mode is open to this actor). Pure. */
export const CANON_REWRITE_NOTE = [
  '=== CANON REWRITE MODE (on — the ADMIN is your GM; temporary, first campaign) ===',
  "The GM's roleplay is canon. When what he plays contradicts, sharpens or adds to a character's trait (nectar, thorn, blossom) or memory, fix it at once:",
  "read_canon to find it → rewrite_trait / rewrite_memory. Trait scope: 'instance' (this character's copy) by default; 'blueprint' only when the fix is about the trait itself.",
  'After each rewrite say ONE line: what changed, the scope, and "say undo to reverse". "undo" from the GM → undo_canon_rewrite.',
  'Never rewrite on a guess: only what the GM played or said.',
].join('\n');
