/**
 * Genesis SEEDS stage (2026-10-12) — the people and places of a backstory
 * become campaign objects ([[character-genesis-pipeline-2026-08-08]] stage 1:
 * "hometown → Location seed; named kin → NPC seeds"; relationship web =
 * "every named person with valence + open thread (NPC/plot seeds for the
 * Watcher)").
 *
 * NPC SEED = a Character SHELL: entityType NPC, status DRAFT (below the
 * crystallization line — no KV, no KRMA), genesisTier 'SEED', seededFromId =
 * the character whose genesis seeded it, the relation/valence/open thread on
 * the edge and in the shell's `_seed`. NO sheet, NO sketch, NO model call —
 * the Watcher deepens a seed when the story needs it (completeCharacter).
 *
 * OPEN THREADS FROM PRODS ARE NEVER FILLED
 * ([[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]]): a seed whose
 * thread is a prod the GM LEFT OPEN records the prod's question verbatim as
 * unknown; JEWL may not write an answer beside it.
 *
 * LOCATION SEED = a Location (places are not forged — they may be as
 * specific as the story needs), its sources being the GM's own typed world
 * messages (Violet's apartment spec of 2026-08-02) plus the backstory.
 * No krmaReserve is committed — the reserve is the GM's call.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createDefaultCharacter } from '@/lib/defaults';
import { createLocation } from './location';
import { DEED_RELATIONSHIP, findCampaignLocation } from './genesis-possessions';
import { findGenesisSession } from './block-attachment';
import { PLACE_RELATIONS, loadGmWorldMessages } from './genesis-stages';

export const SEED_TIER = 'SEED';
/** The edge from the character to a person her genesis seeded. */
export const SEED_PERSON_RELATIONSHIP = 'knows';

export const seedNpcSchema = z.object({
  characterId: z.string().min(1).max(64).describe('The character whose backstory names this person.'),
  name: z.string().min(1).max(100).describe('The person as the backstory names them.'),
  relation: z.string().min(1).max(60).describe('Who they are to her ("grandmother", "landlord", "first editor").'),
  valence: z.number().min(-1).max(1).describe('How she holds them, -1 (hostile/painful) … 0 … +1 (beloved).'),
  note: z.string().max(400).optional().describe('What the backstory and settled answers SAY about them — facts only, nothing invented.'),
  openThread: z.string().max(400).optional().describe('The unresolved tension between them, for the Watcher — only what the story already holds open.'),
  openThreadProdId: z.string().max(64).optional().describe('A prod the GM LEFT OPEN that this person carries — recorded verbatim as unknown. Never pass openThread with it.'),
});

export const seedLocationSchema = z.object({
  characterId: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  relation: z.enum(PLACE_RELATIONS).describe('home | hometown | workplace | frequents | origin'),
  type: z.enum(['settlement', 'building', 'region', 'point_of_interest', 'wilderness']).optional(),
  description: z.string().min(1).max(1200).describe('The short essence of the place from the sources — no invention past them.'),
  owned: z.boolean().optional().describe('She holds the deed (adds an owns edge). Renting is not owning.'),
  sourceMessageIds: z.array(z.string().max(64)).max(10).optional().describe('Ids of the GM WORLD MESSAGES this seed draws on.'),
});

export type SeedNpcInput = z.infer<typeof seedNpcSchema>;

/** The open-thread text a seed records. Pure. Left-open prods stay unknown, verbatim. */
export function seedThread(
  input: { openThread?: string; openThreadProdId?: string },
  prod: { status: string; question: string } | null,
): { text: string | null; unresolved: boolean; prodId?: string } {
  if (input.openThreadProdId) {
    if (!prod) throw new ValidationError('No such prod on this genesis.');
    if (prod.status !== 'LEFT_OPEN') throw new ValidationError('That prod is not left open — only threads the GM left open ride a seed verbatim.');
    if (input.openThread?.trim()) throw new ValidationError('The GM left that thread open — never write an answer beside it; pass openThreadProdId alone.');
    return { text: `UNKNOWN (left open by the GM): ${prod.question}`, unresolved: true, prodId: input.openThreadProdId };
  }
  const t = input.openThread?.trim();
  return { text: t || null, unresolved: !!t };
}

async function gmOf(campaignId: string): Promise<string> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!c) throw new NotFoundError('Campaign not found');
  return c.gmUserId;
}

/** Seed a named person from her backstory as an NPC shell. No model call. */
export async function seedNpc(campaignId: string, input: unknown) {
  const p = seedNpcSchema.parse(input);
  const bearer = await prisma.character.findUnique({ where: { id: p.characterId }, select: { id: true, name: true, campaignId: true } });
  if (!bearer || bearer.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  const name = p.name.trim();
  if (name.toLowerCase() === bearer.name.toLowerCase()) throw new ValidationError('That is the character herself — seed the people around her.');

  let prod: { status: string; question: string } | null = null;
  if (p.openThreadProdId) {
    prod = await prisma.genesisProd.findFirst({
      where: { id: p.openThreadProdId, campaignId, characterId: p.characterId },
      select: { status: true, question: true },
    });
  }
  const thread = seedThread(p, prod);
  const session = await findGenesisSession(campaignId, p.characterId);
  const seedMeta = {
    fromCharacterId: p.characterId,
    relation: p.relation,
    valence: p.valence,
    openThread: thread.text,
    unresolved: thread.unresolved,
    ...(thread.prodId ? { openThreadProdId: thread.prodId } : {}),
    sessionId: session?.id ?? null,
    seededAt: new Date().toISOString(),
  };

  // Reuse a person already in the campaign (another genesis may have seeded them).
  const existing = (await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } }))
    .find(c => c.name.toLowerCase() === name.toLowerCase());
  let npcId = existing?.id;
  let created = false;
  if (!npcId) {
    const sheet = createDefaultCharacter(name) as unknown as Record<string, unknown>;
    sheet.backstory = { notes: p.note?.trim() || '' };
    sheet._seed = seedMeta;
    const row = await prisma.character.create({
      data: {
        name,
        entityType: 'NPC',
        status: 'DRAFT',
        genesisTier: SEED_TIER,
        seededFromId: p.characterId,
        userId: await gmOf(campaignId),
        campaignId,
        data: JSON.stringify(sheet),
      },
      select: { id: true },
    });
    npcId = row.id;
    created = true;
  }

  const edgeData = JSON.stringify({ relation: p.relation, valence: p.valence, openThread: thread.text, unresolved: thread.unresolved, note: p.note?.trim() || undefined, seeded: true });
  await prisma.entityRelationship.upsert({
    where: { sourceId_targetId_relationshipType: { sourceId: p.characterId, targetId: npcId, relationshipType: SEED_PERSON_RELATIONSHIP } },
    create: {
      campaignId,
      sourceId: p.characterId,
      sourceType: 'CHARACTER',
      targetId: npcId,
      targetType: 'NPC',
      relationshipType: SEED_PERSON_RELATIONSHIP,
      strength: Math.max(1, Math.min(10, Math.round(5 + p.valence * 5))),
      data: edgeData,
    },
    update: { data: edgeData },
  });
  return { npcId, name, created, relation: p.relation, valence: p.valence, openThread: thread.text, unresolved: thread.unresolved };
}

/** Seed a place from her story + the GM's typed world messages. */
export async function seedLocation(campaignId: string, actor: { id: string; role: string }, input: unknown) {
  const p = seedLocationSchema.parse(input);
  const bearer = await prisma.character.findUnique({ where: { id: p.characterId }, select: { campaignId: true } });
  if (!bearer || bearer.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');

  const sources = p.sourceMessageIds ?? [];
  if (sources.length) {
    const known = new Set((await loadGmWorldMessages(campaignId)).map(m => m.id));
    const bad = sources.filter(id => !known.has(id));
    if (bad.length) throw new ValidationError(`Not GM world messages of this campaign: ${bad.join(', ')} — cite only ids listed under GM WORLD MESSAGES.`);
  }
  const seed = { fromCharacterId: p.characterId, relation: p.relation, sources, seededAt: new Date().toISOString() };

  let loc = await findCampaignLocation(campaignId, p.name);
  let created = false;
  if (!loc) {
    const row = await createLocation(campaignId, actor.id, actor.role, {
      name: p.name.trim(),
      type: p.type ?? (p.relation === 'hometown' ? 'settlement' : 'building'),
      data: { description: '', tags: [], features: [], connections: [], seed },
      description: p.description,
    });
    loc = { id: row.id, name: row.name };
    created = true;
  }

  const edge = async (relationshipType: string, data: Record<string, unknown>) =>
    prisma.entityRelationship.upsert({
      where: { sourceId_targetId_relationshipType: { sourceId: p.characterId, targetId: loc!.id, relationshipType } },
      create: { campaignId, sourceId: p.characterId, sourceType: 'CHARACTER', targetId: loc!.id, targetType: 'LOCATION', relationshipType, strength: 5, data: JSON.stringify(data) },
      update: { data: JSON.stringify(data) },
    });
  await edge(p.relation, { seeded: true, sources });
  if (p.owned) await edge(DEED_RELATIONSHIP, { note: 'deed seeded at genesis' });
  return { locationId: loc.id, name: loc.name, created, relation: p.relation, owned: !!p.owned, sources };
}
