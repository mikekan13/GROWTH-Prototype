/**
 * read_actors_state + npc_act — mass-actor primitives.
 *
 * `read_actors_state` is the foundation for mass-actor resolution scenes
 * per [[jewl-full-vision-2026-06-14]]: pull the full state for many actors
 * in one round-trip so JEWL can reason about a horde, a busy marketplace,
 * or a multi-front battle without serial read_entity calls. He then picks
 * his per-actor mutations via the existing tool set (npc_speak, npc_act,
 * move_character_to_location, apply_attribute_damage, etc.).
 *
 * `npc_act` is the verb-action sibling of `npc_speak`: it posts a
 * narrative beat ("Tara raises her scythe") as a game_event-type
 * CampaignEvent attributed to the NPC. Same aiActionMode gate.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createCampaignEvent } from '@/services/campaign-event';
import { getJewlGodHead } from '@/ai/copilot/jewl-identity';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';
import type { GrowthCharacter } from '@/types/growth';

// ── read_actors_state ──

const READ_LIMIT = 50;

const readActorsSchema = z.object({
  actorCharacterIds: z.array(z.string().min(1)).min(1).max(READ_LIMIT),
});

interface ActorSnapshot {
  characterId: string;
  name: string;
  entityType: string;
  status: string;
  locationId: string | null;
  hp: { current: number; max: number } | null;
  frequency: { current: number; max: number } | null;
  conditions: string[];
  aiActionMode: boolean | null;
}

export const readActorsStateTool: JewlTool = {
  name: 'read_actors_state',
  description:
    'Bulk-read state for up to 50 characters at once. Returns a compact ' +
    'snapshot per actor: name, entity type, status, current location, HP, ' +
    'Frequency, active conditions, and whether AI mode is enabled. Use this ' +
    'when reasoning about multiple actors in a single beat (a horde, a ' +
    'market crowd, a multi-front fight) — one tool call instead of N. ' +
    'Mutations still go through the per-actor tools (npc_speak, npc_act, ' +
    'move_character_to_location, apply_attribute_damage, etc.).',
  inputSchema: readActorsSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = readActorsSchema.parse(input);

    const characters = await prisma.character.findMany({
      where: {
        id: { in: parsed.actorCharacterIds },
      },
      select: {
        id: true,
        name: true,
        entityType: true,
        status: true,
        campaignId: true,
        data: true,
      },
    });

    // Look up each actor's GodHead row in parallel (some won't have one).
    const godheads = await prisma.godHead.findMany({
      where: { characterId: { in: characters.map(c => c.id) } },
      select: { characterId: true, aiActionMode: true },
    });
    const aiModeByCharacter = new Map(godheads.map(g => [g.characterId, g.aiActionMode]));

    // Resolve located_at edges as a single relationship pull rather than
    // per-actor round trips.
    const locationEdges = await prisma.entityRelationship.findMany({
      where: {
        sourceId: { in: characters.map(c => c.id) },
        sourceType: 'CHARACTER',
        relationshipType: 'located_at',
      },
      select: { sourceId: true, targetId: true },
    });
    const locationByCharacter = new Map(
      locationEdges.map(e => [e.sourceId, e.targetId]),
    );

    const snapshots: ActorSnapshot[] = [];
    const skipped: Array<{ characterId: string; reason: string }> = [];

    for (const id of parsed.actorCharacterIds) {
      const char = characters.find(c => c.id === id);
      if (!char) {
        skipped.push({ characterId: id, reason: 'not found' });
        continue;
      }
      if (char.campaignId && char.campaignId !== ctx.campaignId) {
        skipped.push({ characterId: id, reason: 'wrong campaign' });
        continue;
      }
      snapshots.push(buildActorSnapshot(char, {
        locationId: locationByCharacter.get(id) ?? null,
        aiActionMode: aiModeByCharacter.has(id) ? aiModeByCharacter.get(id)! : null,
      }));
    }

    return {
      output: {
        count: snapshots.length,
        actors: snapshots,
        skipped,
      },
    };
  },
};

function buildActorSnapshot(
  char: {
    id: string;
    name: string;
    entityType: string;
    status: string;
    data: string | null;
  },
  extras: { locationId: string | null; aiActionMode: boolean | null },
): ActorSnapshot {
  let parsedData: GrowthCharacter | null = null;
  if (char.data) {
    try {
      parsedData = JSON.parse(char.data) as GrowthCharacter;
    } catch {
      parsedData = null;
    }
  }

  // Pull the most useful surface fields. Schema has changed over time, so
  // every access is guarded; what's missing comes back as null.
  const hp = readPool(parsedData, 'frequency')
    ? null // Frequency IS the spendable pool — surfaced as `frequency` below
    : null;

  const frequency = readPool(parsedData, 'frequency');

  const conditions: string[] = [];
  const c = parsedData?.conditions as Record<string, boolean> | undefined;
  if (c) {
    for (const [k, v] of Object.entries(c)) {
      if (v === true) conditions.push(k);
    }
  }

  return {
    characterId: char.id,
    name: char.name,
    entityType: char.entityType,
    status: char.status,
    locationId: extras.locationId,
    hp,
    frequency,
    conditions,
    aiActionMode: extras.aiActionMode,
  };
}

function readPool(
  data: GrowthCharacter | null,
  key: string,
): { current: number; max: number } | null {
  if (!data) return null;
  const root = data as unknown as Record<string, unknown>;
  const pool = root[key] as { current?: number; max?: number } | undefined;
  if (!pool || typeof pool.current !== 'number' || typeof pool.max !== 'number') {
    return null;
  }
  return { current: pool.current, max: pool.max };
}

// ── npc_act ──

const npcActSchema = z.object({
  npcCharacterId: z.string().min(1),
  /** A short third-person action beat, e.g. "Tara raises her scythe slowly". */
  action: z.string().min(1).max(2000),
});

export const npcActTool: JewlTool = {
  name: 'npc_act',
  description:
    'Narrate a non-speech NPC action — what the NPC PHYSICALLY DOES this ' +
    'beat. Use this for movement, gestures, item handling, combat poses, ' +
    'environmental interaction. Speech goes through `npc_speak`. The action ' +
    'lands in the campaign event stream as a game_event attributed to the ' +
    'NPC. Same gates as npc_speak: entityType=NPC, ACTIVE, in this ' +
    'campaign, with a linked GodHead row whose aiActionMode is true.',
  inputSchema: npcActSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = npcActSchema.parse(input);
    const npc = await prisma.character.findUnique({
      where: { id: parsed.npcCharacterId },
      select: {
        id: true,
        name: true,
        entityType: true,
        campaignId: true,
        status: true,
      },
    });
    if (!npc) throw new NotFoundError('NPC character not found');
    if (npc.entityType !== 'NPC') {
      throw new ValidationError(
        `Cannot puppet entityType=${npc.entityType}; npc_act requires entityType=NPC`,
      );
    }
    if (npc.campaignId && npc.campaignId !== ctx.campaignId) {
      throw new ValidationError('NPC does not belong to this campaign');
    }
    if (npc.status !== 'ACTIVE') {
      throw new ValidationError(`NPC is not ACTIVE (status=${npc.status})`);
    }
    const godhead = await prisma.godHead.findFirst({
      where: { characterId: npc.id },
      select: { aiActionMode: true },
    });
    if (!godhead) {
      throw new ValidationError(
        `NPC "${npc.name}" has no GodHead persona; flip AI mode on the canvas card before puppeting`,
      );
    }
    if (!godhead.aiActionMode) {
      throw new ValidationError(
        `NPC "${npc.name}" has AI mode OFF; the GM is currently driving them`,
      );
    }

    const jewl = await getJewlGodHead();
    const event = await createCampaignEvent({
      campaignId: ctx.campaignId,
      type: 'game_event',
      actor: 'ai_copilot',
      actorUserId: jewl.characterUserId,
      actorName: 'JEWL',
      characterId: npc.id,
      characterName: npc.name,
      payload: {
        kind: 'game_event',
        eventType: 'npc_action',
        description: parsed.action,
      },
    });

    return {
      output: {
        eventId: event.id,
        npcCharacterId: npc.id,
        npcName: npc.name,
        action: parsed.action,
      },
      affected: {
        characters: [{ id: npc.id, changes: ['acted'] }],
      },
    };
  },
};

registerJewlTool(readActorsStateTool);
registerJewlTool(npcActTool);
