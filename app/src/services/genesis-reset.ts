/**
 * Reset the completion stages (Mike 2026-10-16: "that was the old outdated
 * genesis… get the new way completely done and then rerun Violet").
 *
 * Strips what the OLD post-sheet genesis produced so the new walk
 * (APPEARANCE → WORLD → MEMORIES → VINES → PORTRAIT) can build her life
 * again from her blocks. KEEPS: the sheet, her block links, her approved
 * face and body, her ledger memories (the backstory ones), the Forge
 * archetypes. REMOVES: the items she holds or holds the deed to and every
 * item her genesis painted for her (orphans from earlier runs included),
 * her deeds and place edges, the Locations her genesis seeded for her when
 * nobody else is linked to them, the world facts keyed under her name, her
 * AI-authored goals, her wealth ledger, and the stage stamps. NPC seed
 * shells are RETIRED (not deleted — too many relations hang off a
 * Character) and unlinked from her so they stop counting as evidence.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requireCampaignGM } from './campaign-access';
import { PLACE_RELATIONS } from '@/lib/genesis-stages';
import { DEED_RELATIONSHIP } from './genesis-possessions';

export interface ResetReport {
  items: number;
  deeds: number;
  placeEdges: number;
  locations: number;
  worldFacts: number;
  goals: number;
  npcSeedsRetired: number;
}

function parse(data: string): Record<string, unknown> {
  try { return JSON.parse(data) as Record<string, unknown>; } catch { return {}; }
}

/** "Violet Marsh" → "violet" — the subjectKey prefix her world facts use. Pure. */
export function factPrefix(name: string): string {
  return name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Was this item painted for her by a genesis run? Pure. */
export function paintedFor(history: string, name: string): boolean {
  try {
    const rows = JSON.parse(history) as Array<{ kind?: string; text?: string }>;
    return rows.some(r => r.kind === 'origin' && (r.text ?? '').includes(`painted for ${name}`));
  } catch { return false; }
}

export async function resetCompletionStages(characterId: string, actor: { id: string; role: string }): Promise<ResetReport> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true, data: true } });
  if (!c?.campaignId) throw new NotFoundError('Character not found in a campaign');
  const campaignId = c.campaignId;
  await requireCampaignGM(campaignId, actor);
  const report: ResetReport = { items: 0, deeds: 0, placeEdges: 0, locations: 0, worldFacts: 0, goals: 0, npcSeedsRetired: 0 };

  // ── Items: held, deeded, or painted for her by any genesis run ──
  const deeds = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' },
    select: { id: true, targetId: true },
  });
  const candidates = await prisma.campaignItem.findMany({
    where: { campaignId, OR: [{ holderId: characterId }, { id: { in: deeds.map(d => d.targetId) } }, { history: { contains: `painted for ${c.name}` } }] },
    select: { id: true, history: true, holderId: true },
  });
  const itemIds = candidates
    .filter(i => i.holderId === characterId || deeds.some(d => d.targetId === i.id) || paintedFor(i.history, c.name))
    .map(i => i.id);
  if (itemIds.length) {
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: { in: itemIds } }, { targetId: { in: itemIds } }] } });
    const del = await prisma.campaignItem.deleteMany({ where: { id: { in: itemIds } } });
    report.items = del.count;
  }
  report.deeds = deeds.length;

  // ── Places: her edges; the Locations only when nobody else is linked ──
  const placeEdges = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, targetType: 'LOCATION', relationshipType: { in: [...PLACE_RELATIONS] } },
    select: { id: true, targetId: true },
  });
  await prisma.entityRelationship.deleteMany({ where: { id: { in: placeEdges.map(e => e.id) } } });
  report.placeEdges = placeEdges.length;
  for (const locId of new Set(placeEdges.map(e => e.targetId))) {
    const others = await prisma.entityRelationship.count({
      where: { targetId: locId, targetType: 'LOCATION', sourceType: 'CHARACTER', sourceId: { not: characterId } },
    });
    if (others > 0) continue;
    // Rooms: child Locations located_at this one, when nothing else holds them.
    const children = await prisma.entityRelationship.findMany({
      where: { targetId: locId, relationshipType: 'located_at', sourceType: 'LOCATION' },
      select: { sourceId: true },
    });
    const toDelete = [locId, ...children.map(ch => ch.sourceId)];
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: { in: toDelete } }, { targetId: { in: toDelete } }] } });
    const del = await prisma.location.deleteMany({ where: { id: { in: toDelete }, campaignId } });
    report.locations += del.count;
  }

  // ── World facts keyed under her name ──
  const facts = await prisma.worldFact.deleteMany({ where: { campaignId, subjectKey: { startsWith: `${factPrefix(c.name)}` } } });
  report.worldFacts = facts.count;

  // ── AI-authored goals ──
  const goals = await prisma.goal.deleteMany({ where: { characterId, authoredBy: 'ai' } });
  report.goals = goals.count;

  // ── NPC seed shells: retire + unlink ──
  const seeds = await prisma.character.findMany({ where: { seededFromId: characterId }, select: { id: true, name: true } });
  for (const s of seeds) {
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: s.id }, { targetId: s.id }] } });
    await prisma.character.update({ where: { id: s.id }, data: { status: 'RETIRED', seededFromId: null, name: `${s.name} (old genesis)` } });
    report.npcSeedsRetired++;
  }

  // ── Sheet: stamps + wealth ──
  const sheet = parse(c.data);
  delete sheet._genesisStages;
  delete sheet.wealth;
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(sheet) } });

  return report;
}
