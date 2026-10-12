/**
 * Genesis completion stages (Mike 2026-10-12) — after the sheet, before Born:
 *
 *   AGE → POSSESSIONS → SEEDS → WORLD_FACTS → VINES
 *
 * "Things like possessions, inventory etc. are things JEWL should be authoring
 * when making a character too." Canon R3 (2026-08-19,
 * [[story-attachment-two-ledgers-2026-08-19]]): genesis turns the prose
 * grants of a backstory (wealth, equipment, the people and places in it) into
 * real possessions, NPC seeds and world facts. GRO.vines are chosen by the AI
 * (overwritable by a seated Trailblazer) — the GOAL third only.
 *
 * The walk: JEWL ends a stage the way he ends any job — update_work_session
 * status=done. On a genesis in a build-phase stage the session does NOT
 * close; it moves to the next stage still MISSING for the character
 * (daya-work-session.ts), and only after the last one is she Born. A stage is
 * missing unless stamped done on the sheet (`_genesisStages`) or its evidence
 * already exists — so completeCharacter on a born character walks only what
 * she lacks. The pure half lives in lib/genesis-stages.ts.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { rowContentClass } from '@/ai/copilot/content-class';
import {
  PLACE_RELATIONS,
  isPostSheetStage,
  missingStages,
  nextGenesisStage,
  stagesDone,
  startingAgeFromLinks,
  type AgeLink,
  type GenesisPostSheetStage,
  type GmWorldMessage,
} from '@/lib/genesis-stages';
import type { GrowthCharacter } from '@/types/growth';

export * from '@/lib/genesis-stages';

/** Gather the evidence and answer which stages are missing. */
export async function detectMissingStages(characterId: string): Promise<Set<GenesisPostSheetStage>> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  let sheet: Partial<GrowthCharacter> & { _genesisStages?: unknown } = {};
  try { sheet = JSON.parse(character?.data ?? '{}'); } catch { sheet = {}; }
  const [links, heldItems, ownsEdges, npcSeeds, placeEdges, vines] = await Promise.all([
    prisma.characterBlockLink.findMany({ where: { characterId }, select: { forgeItemId: true, ageAdded: true } }),
    prisma.campaignItem.count({ where: { holderId: characterId, status: 'ACTIVE' } }),
    prisma.entityRelationship.count({ where: { sourceId: characterId, relationshipType: 'owns' } }),
    prisma.character.count({ where: { seededFromId: characterId } }),
    prisma.entityRelationship.count({ where: { sourceId: characterId, targetType: 'LOCATION', relationshipType: { in: [...PLACE_RELATIONS] } } }),
    prisma.goal.count({ where: { characterId, status: { in: ['ACTIVE', 'DORMANT'] } } }),
  ]);
  const blocks = links.length
    ? await prisma.forgeItem.findMany({ where: { id: { in: links.map(l => l.forgeItemId) }, status: { not: 'superseded' } }, select: { id: true, type: true, data: true } })
    : [];
  const byId = new Map(blocks.map(b => [b.id, b]));
  const ageLinks: AgeLink[] = links.flatMap(l => {
    const b = byId.get(l.forgeItemId);
    if (!b) return [];
    let years: number | null = null;
    try { const d = JSON.parse(b.data) as { ageAdded?: unknown }; years = typeof d.ageAdded === 'number' ? d.ageAdded : null; } catch { /* none */ }
    return [{ type: b.type, instanceYears: l.ageAdded ?? null, archetypeYears: years }];
  });
  const age = sheet.identity?.age;
  const ageOk = typeof sheet.birthCycle === 'number' && typeof age === 'number'
    && (ageLinks.length === 0 || startingAgeFromLinks(ageLinks) === age);
  return missingStages({ stamps: stagesDone(sheet), ageOk, heldItems, ownsEdges, npcSeeds, placeEdges, vines });
}

/** Stamp a completion stage on the character's sheet. */
export async function stampStageDone(characterId: string, stage: string): Promise<void> {
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!row) return;
  const sheet = JSON.parse(row.data) as Record<string, unknown>;
  sheet._genesisStages = { ...stagesDone(sheet), [stage]: new Date().toISOString() };
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(sheet) } });
}

/**
 * A genesis session in a build-phase stage said "done": mirror the sheet when
 * leaving BUILDING (dedupe links + creation view), stamp a finished
 * completion stage, and return the next missing stage (null → Born).
 * Detection failure walks every later stage.
 */
export async function advanceGenesisStage(characterId: string, current: string): Promise<GenesisPostSheetStage | null> {
  if (current === 'BUILDING') {
    try {
      const { dedupeBlockLinks, syncCreationFromBlockLinks } = await import('./genesis-sheet-sync');
      await dedupeBlockLinks(characterId);
      await syncCreationFromBlockLinks(characterId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[genesis-stages] sheet sync failed:', err instanceof Error ? err.message : err);
    }
  } else if (isPostSheetStage(current)) {
    await stampStageDone(characterId, current).catch(() => undefined);
  }
  let missing: Set<GenesisPostSheetStage> | null = null;
  try { missing = await detectMissingStages(characterId); } catch { missing = null; }
  return nextGenesisStage(current, missing);
}

// ── The GM's typed world messages (SEEDS / WORLD_FACTS sources) ─────────

const MESSAGE_CAP = 6000;
const SOURCES_CAP = 16000;

/**
 * Everything the campaign's GM TYPED into JEWL's chat that is fiction by the
 * wall — no [system]/[ambient]/[ui]/[genesis] rows, no table/real class.
 * This is where the GM described the world (Violet's apartment spec,
 * 2026-08-02). Oldest first, capped. Pure.
 */
export function pickGmWorldMessages(
  rows: Array<{ id: string; content: string; username: string | null; contentClass: string | null; actions: string | null; createdAt: Date }>,
): GmWorldMessage[] {
  const out: GmWorldMessage[] = [];
  let used = 0;
  for (const r of rows) {
    if ((r.username ?? '').startsWith('[')) continue;
    if (rowContentClass(r) !== 'fiction') continue;
    const text = r.content.trim();
    if (!text || text.startsWith('[SYSTEM]')) continue;
    const clipped = text.length > MESSAGE_CAP ? `${text.slice(0, MESSAGE_CAP)}…` : text;
    if (used + clipped.length > SOURCES_CAP) break;
    used += clipped.length;
    out.push({ id: r.id, at: r.createdAt.toISOString().slice(0, 10), text: clipped });
  }
  return out;
}

export async function loadGmWorldMessages(campaignId: string): Promise<GmWorldMessage[]> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) return [];
  const rows = await prisma.copilotMessage.findMany({
    where: { campaignId, role: 'user', userId: campaign.gmUserId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, content: true, username: true, contentClass: true, actions: true, createdAt: true },
    take: 200,
  });
  return pickGmWorldMessages(rows);
}
