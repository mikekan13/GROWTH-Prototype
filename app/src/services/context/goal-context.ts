import 'server-only';
import { prisma } from '@/lib/db';
import { buildEntityContext } from './entity-context';
import type { GrowthCharacter } from '@/types/growth';

interface GoalContextOptions {
  /** Max relationship hops to follow (default 2) */
  maxHops?: number;
  /** Max connected entities to include (default 10, for token budget) */
  maxEntities?: number;
  /** Include full entity context or just summary (default summary) */
  fullContext?: boolean;
}

/**
 * Build a focused context window for a specific goal.
 *
 * Follows EntityRelationship edges from the goal's entity, returning
 * only connected entities — NOT the full campaign. This is what
 * God-heads receive when evaluating or generating opportunities for a goal.
 *
 * Graph traversal: entity → 1-hop relations → 2-hop relations (optional)
 */
export async function buildGoalContext(
  goalId: string,
  campaignId: string,
  options: GoalContextOptions = {},
): Promise<string> {
  const { maxHops = 2, maxEntities = 10, fullContext = false } = options;

  // Load the goal
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      character: {
        include: {
          user: { select: { username: true } },
          campaign: { select: { name: true } },
        },
      },
    },
  });

  if (!goal) {
    return `[Goal ${goalId} not found]`;
  }

  const lines: string[] = [];

  // ── Goal Header ──
  lines.push(`=== GOAL CONTEXT ===`);
  lines.push(`Goal: "${goal.description}"`);
  lines.push(`Status: ${goal.status} | Priority: ${goal.priority}`);
  lines.push(`Entity: ${goal.character.name} (${goal.character.entityType})`);
  if (goal.character.campaign) {
    lines.push(`Campaign: ${goal.character.campaign.name}`);
  }
  if (goal.custodianName) {
    lines.push(`Custodian: ${goal.custodianName} (${goal.pillar})`);
  }
  if (goal.resistancePlan) {
    lines.push(`\nResistance Plan:\n${goal.resistancePlan}`);
  }

  // ── Milestones ──
  if (goal.milestones) {
    try {
      const ms = JSON.parse(goal.milestones) as Array<{
        description: string;
        completed: boolean;
        completedAt?: string;
      }>;
      if (ms.length > 0) {
        lines.push(`\n--- Milestones ---`);
        for (const m of ms) {
          lines.push(`${m.completed ? '✓' : '○'} ${m.description}`);
        }
      }
    } catch { /* skip */ }
  }

  // ── Goal Owner Context ──
  lines.push(`\n--- Goal Owner ---`);
  if (fullContext) {
    lines.push(await buildEntityContext(goal.characterId));
  } else {
    lines.push(await buildEntitySummary(goal.characterId));
  }

  // ── Graph Traversal ──
  // Collect connected entity IDs by following relationship edges
  const visited = new Set<string>([goal.characterId]);
  let frontier = [goal.characterId];
  const connectedEntities: Array<{ id: string; type: string; hop: number; relationship: string }> = [];

  for (let hop = 1; hop <= maxHops && connectedEntities.length < maxEntities; hop++) {
    const nextFrontier: string[] = [];

    // Find all relationships touching frontier entities within this campaign
    const relationships = await prisma.entityRelationship.findMany({
      where: {
        OR: [
          { sourceId: { in: frontier }, campaignId: campaignId },
          { targetId: { in: frontier }, campaignId: campaignId },
          // Also include cross-campaign relationships (God-head networks)
          { sourceId: { in: frontier }, campaignId: null },
          { targetId: { in: frontier }, campaignId: null },
        ],
      },
    });

    for (const rel of relationships) {
      const isSource = frontier.includes(rel.sourceId);
      const otherId = isSource ? rel.targetId : rel.sourceId;
      const otherType = isSource ? rel.targetType : rel.sourceType;

      if (!visited.has(otherId) && connectedEntities.length < maxEntities) {
        visited.add(otherId);
        nextFrontier.push(otherId);
        connectedEntities.push({
          id: otherId,
          type: otherType,
          hop,
          relationship: rel.relationshipType,
        });
      }
    }

    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  // ── Connected Entities ──
  if (connectedEntities.length > 0) {
    lines.push(`\n--- Connected Entities (${connectedEntities.length}, ${maxHops}-hop) ---`);

    for (const entity of connectedEntities) {
      lines.push(`\n[${entity.type} — via "${entity.relationship}", hop ${entity.hop}]`);

      // CHARACTER and GODHEAD types get entity context; others get a name lookup
      if (entity.type === 'CHARACTER' || entity.type === 'NPC' || entity.type === 'CREATURE' || entity.type === 'GODHEAD') {
        if (fullContext) {
          lines.push(await buildEntityContext(entity.id));
        } else {
          lines.push(await buildEntitySummary(entity.id));
        }
      } else if (entity.type === 'LOCATION') {
        lines.push(await buildLocationSummary(entity.id));
      } else if (entity.type === 'ITEM') {
        lines.push(await buildItemSummary(entity.id));
      } else if (entity.type === 'GOAL') {
        lines.push(await buildGoalSummary(entity.id));
      } else {
        lines.push(`[${entity.type}:${entity.id}]`);
      }
    }
  }

  // ── Campaign World Context (brief) ──
  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { worldContext: true, genre: true, themes: true },
    });
    if (campaign?.worldContext) {
      lines.push(`\n--- World Context ---`);
      lines.push(`Genre: ${campaign.genre || 'unspecified'}`);
      if (campaign.themes) {
        try {
          const themes = JSON.parse(campaign.themes) as string[];
          lines.push(`Themes: ${themes.join(', ')}`);
        } catch { /* skip */ }
      }
      // Truncate world context for token efficiency
      const wc = campaign.worldContext;
      lines.push(wc.length > 300 ? wc.slice(0, 300) + '...' : wc);
    }
  }

  return lines.join('\n');
}

// ── Summary Builders (token-efficient, for connected entities) ──

async function buildEntitySummary(characterId: string): Promise<string> {
  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, entityType: true, status: true, data: true },
  });
  if (!char) return `[Character ${characterId} not found]`;

  try {
    const data = JSON.parse(char.data) as GrowthCharacter;
    const attrs = data.attributes;
    const bodyTotal = attrs.clout.current + attrs.celerity.current + attrs.constitution.current;
    const spiritTotal = attrs.flow.current + attrs.frequency.current + attrs.focus.current;
    const soulTotal = attrs.willpower.current + attrs.wisdom.current + attrs.wit.current;

    const activeGoals = data.grovines.filter(v => v.status === 'active').length;
    const skillCount = data.skills.length;

    return `${char.name} (${char.entityType}, ${char.status}) — Body:${bodyTotal} Spirit:${spiritTotal} Soul:${soulTotal} | ${skillCount} skills, ${activeGoals} active vines | Seed: ${data.creation?.seed?.name || 'unknown'}`;
  } catch {
    return `${char.name} (${char.entityType}, ${char.status})`;
  }
}

async function buildLocationSummary(locationId: string): Promise<string> {
  const loc = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true, type: true, status: true, data: true },
  });
  if (!loc) return `[Location ${locationId} not found]`;

  let description = '';
  try {
    const d = JSON.parse(loc.data) as { description?: string };
    description = d.description ? ` — ${d.description.slice(0, 100)}` : '';
  } catch { /* skip */ }

  return `${loc.name} (${loc.type}, ${loc.status})${description}`;
}

async function buildItemSummary(itemId: string): Promise<string> {
  // Check CampaignItem first, then ForgeItem
  const ci = await prisma.campaignItem.findUnique({
    where: { id: itemId },
    select: { name: true, type: true, status: true },
  });
  if (ci) return `${ci.name} (${ci.type}, ${ci.status})`;

  const fi = await prisma.forgeItem.findUnique({
    where: { id: itemId },
    select: { name: true, type: true, status: true },
  });
  if (fi) return `${fi.name} (${fi.type}, ${fi.status})`;

  return `[Item ${itemId} not found]`;
}

async function buildGoalSummary(goalId: string): Promise<string> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { description: true, status: true, priority: true, custodianName: true },
  });
  if (!goal) return `[Goal ${goalId} not found]`;

  return `[P${goal.priority}] "${goal.description}" (${goal.status})${goal.custodianName ? ` — custodian: ${goal.custodianName}` : ''}`;
}
