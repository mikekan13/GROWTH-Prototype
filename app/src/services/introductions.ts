/**
 * INTRODUCTIONS TEACH NAMES — the wiring (Mike 2026-10-09; detection is pure in
 * sim/perception/introductions). After the reach pass has written a perceiver's
 * memory rows (perception units 6/7 paths: declareCanon, deliverToTable, the
 * runBeats LISTEN beat), read what that perceiver CAUGHT of the speech in those
 * rows (services/visible-form caughtSpeech — the feed's own fragmenting and
 * stored clarity) and raise identity familiarity to the naming level for every
 * being it heard introduced (services/familiarity recordIntroductions, which
 * also drops the cached visible forms so old lines re-label).
 *
 * "Present" for an introduction by another = the beings located at the
 * perceiver's place (located_at); a perceiver with no place → every being of
 * the campaign. Batched: one pass per perceiver per call. Never throws.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { caughtSpeech } from '@/services/visible-form';
import { recordIntroductions, type FamiliarityChangeRefs } from '@/services/familiarity';
import { introducedBeings, type IntroCandidate } from '@/sim/perception/introductions';

export interface PerceivedRows { characterId: string; memoryIds: string[] }

/** Merge per-perceiver memory ids (callers collect one entry per write). Pure. */
export function groupRows(rows: Array<{ characterId: string; memoryId: string | null | undefined }>): PerceivedRows[] {
  const by = new Map<string, string[]>();
  for (const r of rows) if (r.memoryId) by.set(r.characterId, [...(by.get(r.characterId) ?? []), r.memoryId]);
  return [...by].map(([characterId, memoryIds]) => ({ characterId, memoryIds }));
}

/** Learn names from the introductions each perceiver caught in its rows. Returns perceiver characterId → subjects raised. */
export async function learnIntroductions(campaignId: string, perceived: PerceivedRows[], cycle?: number, refs?: FamiliarityChangeRefs): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const p of perceived) {
    try {
      const got = await caughtSpeech(campaignId, p.characterId, p.memoryIds);
      if (!got?.speech.length) continue;
      const { ctx, speech } = got;
      const beings = ctx.entities.filter((e) => e.kind === 'CHARACTER' || e.kind === 'NPC');
      const present = await presentBeings(p.characterId, beings);
      const byId = new Map(beings.map((b) => [b.id, b]));
      // subject → the memory row it was caught in (the change record's memoryId; first catch wins).
      const found = new Map<string, string>();
      for (const s of speech) {
        const speaker = s.speakerId ? byId.get(s.speakerId) ?? null : null;
        for (const id of introducedBeings(s.pieces, speaker ? { id: speaker.id, name: speaker.name } : null, present, p.characterId)) if (!found.has(id)) found.set(id, s.memoryId);
      }
      if (!found.size) continue;
      const raised = await recordIntroductions({
        campaignId, perceiverId: ctx.viewerEntityId, perceiverCharacterId: p.characterId, cycle,
        subjects: [...found].map(([id, memoryId]) => ({ subjectId: id, subjectKind: byId.get(id)?.kind === 'NPC' ? 'NPC' as const : 'CHARACTER' as const, memoryId })),
        refs,
      });
      if (raised.length) out.set(p.characterId, raised);
    } catch (err) { console.warn(`[introductions] pass failed for ${p.characterId} (non-fatal)`, err); }
  }
  return out;
}

async function presentBeings(perceiverCharacterId: string, beings: Array<{ id: string; name: string }>): Promise<IntroCandidate[]> {
  const mine = await prisma.entityRelationship.findFirst({ where: { sourceId: perceiverCharacterId, relationshipType: 'located_at' }, select: { targetId: true } });
  if (!mine) return beings;
  const here = await prisma.entityRelationship.findMany({ where: { targetId: mine.targetId, relationshipType: 'located_at', sourceId: { in: beings.map((b) => b.id) } }, select: { sourceId: true } });
  const ids = new Set(here.map((r) => r.sourceId));
  return beings.filter((b) => ids.has(b.id));
}
