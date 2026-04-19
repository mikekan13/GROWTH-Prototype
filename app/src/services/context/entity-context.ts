import 'server-only';
import { prisma } from '@/lib/db';
import type {
  GrowthCharacter,
  GrowthAttribute,
  GrowthFrequency,
  GrowthSkill,
  GrowthTrait,
  GROvine,
} from '@/types/growth';

/**
 * Build a clean, token-efficient context string for any entity (Character).
 * Used by God-heads when reasoning about an entity in the campaign graph.
 *
 * Universal: works for PLAYER_CHARACTER, NPC, CREATURE, GODHEAD — all use Character model.
 */
export async function buildEntityContext(entityId: string): Promise<string> {
  const character = await prisma.character.findUnique({
    where: { id: entityId },
    include: {
      user: { select: { username: true, role: true } },
      campaign: { select: { id: true, name: true } },
      goals: {
        where: { status: 'ACTIVE' },
        orderBy: { priority: 'asc' },
      },
      godHead: true,
    },
  });

  if (!character) {
    return `[Entity ${entityId} not found]`;
  }

  let data: GrowthCharacter;
  try {
    data = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    return `[Entity ${character.name}: invalid character data]`;
  }

  // Fetch relationships for this entity
  const relationships = await prisma.entityRelationship.findMany({
    where: {
      OR: [
        { sourceId: entityId },
        { targetId: entityId },
      ],
    },
  });

  const lines: string[] = [];

  // ── Identity ──
  lines.push(`=== ${character.name} (${character.entityType}) ===`);
  lines.push(`ID: ${character.id}`);
  lines.push(`Status: ${character.status}`);
  lines.push(`Owner: ${character.user.username} (${character.user.role})`);
  if (character.campaign) {
    lines.push(`Campaign: ${character.campaign.name} [${character.campaign.id}]`);
  }
  if (character.godHead) {
    lines.push(`God-Head: ${character.godHead.name} | Domain: ${character.godHead.domain} | Pillar: ${character.godHead.pillar}`);
  }
  if (data.identity.age) lines.push(`Age: ${data.identity.age}${data.identity.fatedAge ? ` (fated: ${data.identity.fatedAge})` : ''}`);
  if (data.identity.background) lines.push(`Background: ${data.identity.background}`);

  // ── Creation / Seed ──
  if (data.creation?.seed?.name) {
    lines.push(`\n--- Seed ---`);
    lines.push(`Seed: ${data.creation.seed.name} (${data.creation.seed.baseFateDie})`);
    if (data.creation.seed.description) lines.push(`  ${data.creation.seed.description}`);
    if (data.creation.root) lines.push(`Root: ${data.creation.root.name} — ${data.creation.root.description}`);
    if (data.creation.branches?.length) {
      for (const b of data.creation.branches) {
        lines.push(`Branch ${b.order}: ${b.name} — ${b.description}`);
      }
    }
  }

  if (data.tkv !== undefined) lines.push(`TKV: ${data.tkv}`);

  // ── Attributes ──
  lines.push(`\n--- Attributes ---`);
  const fmtAttr = (name: string, a: GrowthAttribute) =>
    `${name}: ${a.current}/${a.level + a.augmentPositive - a.augmentNegative} (base ${a.level}, +${a.augmentPositive}/-${a.augmentNegative})`;
  const fmtFreq = (a: GrowthFrequency) =>
    `frequency: ${a.current}/${a.level}`;

  lines.push(`Body: ${fmtAttr('clout', data.attributes.clout)}, ${fmtAttr('celerity', data.attributes.celerity)}, ${fmtAttr('constitution', data.attributes.constitution)}`);
  lines.push(`Spirit: ${fmtAttr('flow', data.attributes.flow)}, ${fmtFreq(data.attributes.frequency)}, ${fmtAttr('focus', data.attributes.focus)}`);
  lines.push(`Soul: ${fmtAttr('willpower', data.attributes.willpower)}, ${fmtAttr('wisdom', data.attributes.wisdom)}, ${fmtAttr('wit', data.attributes.wit)}`);

  // ── Conditions ──
  const activeConditions = Object.entries(data.conditions)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  if (activeConditions.length > 0) {
    lines.push(`\n--- Conditions ---`);
    lines.push(activeConditions.join(', '));
  }

  // ── Skills ──
  if (data.skills.length > 0) {
    lines.push(`\n--- Skills (${data.skills.length}) ---`);
    for (const s of data.skills) {
      lines.push(`${s.name} [${s.level}] gov: ${s.governors.join('+')}${s.description ? ` — ${s.description}` : ''}`);
    }
  }

  // ── Traits ──
  const nectars = data.traits.filter((t: GrowthTrait) => t.type === 'nectar');
  const thorns = data.traits.filter((t: GrowthTrait) => t.type === 'thorn');
  const blossoms = data.traits.filter((t: GrowthTrait) => t.type === 'blossom');
  if (data.traits.length > 0) {
    lines.push(`\n--- Traits ---`);
    if (nectars.length) lines.push(`Nectars: ${nectars.map(t => `${t.name} (${t.category})`).join(', ')}`);
    if (thorns.length) lines.push(`Thorns: ${thorns.map(t => `${t.name} (${t.category})`).join(', ')}`);
    if (blossoms.length) lines.push(`Blossoms: ${blossoms.map(t => `${t.name} (${t.category})`).join(', ')}`);
  }

  // ── GRO.vines (from character JSON) ──
  const activeVines = data.grovines.filter((v: GROvine) => v.status === 'active');
  if (activeVines.length > 0) {
    lines.push(`\n--- Active GRO.vines ---`);
    for (const v of activeVines) {
      lines.push(`• G: ${v.goal} | R: ${v.resistance} | O: ${v.opportunity}`);
    }
  }

  // ── Goals (from Goal model — persistent, God-head tracked) ──
  if (character.goals.length > 0) {
    lines.push(`\n--- Goals (${character.goals.length} active) ---`);
    for (const g of character.goals) {
      lines.push(`[P${g.priority}] ${g.description}`);
      if (g.custodianName) lines.push(`  Custodian: ${g.custodianName} (${g.pillar})`);
      if (g.milestones) {
        try {
          const ms = JSON.parse(g.milestones) as Array<{ description: string; completed: boolean }>;
          const done = ms.filter(m => m.completed).length;
          lines.push(`  Milestones: ${done}/${ms.length} completed`);
        } catch { /* skip malformed milestones */ }
      }
    }
  }

  // ── Inventory (summary) ──
  if (data.inventory.items.length > 0) {
    lines.push(`\n--- Inventory (${data.inventory.items.length} items, weight: ${data.inventory.weight}) ---`);
    for (const item of data.inventory.items.slice(0, 10)) {
      lines.push(`${item.name}${item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''} (wt:${item.weightLevel}, cond:${item.condition})`);
    }
    if (data.inventory.items.length > 10) {
      lines.push(`... and ${data.inventory.items.length - 10} more items`);
    }
  }

  // ── Relationships ──
  if (relationships.length > 0) {
    lines.push(`\n--- Relationships (${relationships.length}) ---`);
    for (const r of relationships) {
      const isSource = r.sourceId === entityId;
      const otherType = isSource ? r.targetType : r.sourceType;
      const otherId = isSource ? r.targetId : r.sourceId;
      const dir = r.bidirectional ? '↔' : (isSource ? '→' : '←');
      lines.push(`${dir} ${r.relationshipType} [${otherType}:${otherId}] strength:${r.strength}`);
    }
  }

  // ── Backstory (brief) ──
  if (data.backstory.backstory) {
    lines.push(`\n--- Backstory ---`);
    // Truncate to ~200 chars for token efficiency
    const bs = data.backstory.backstory;
    lines.push(bs.length > 200 ? bs.slice(0, 200) + '...' : bs);
  }

  return lines.join('\n');
}

/**
 * Build context for multiple entities at once (batch, for campaign-wide operations).
 * Returns a map of entityId → context string.
 */
export async function buildMultiEntityContext(entityIds: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  // Run in parallel but cap concurrency
  const BATCH_SIZE = 5;
  for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
    const batch = entityIds.slice(i, i + BATCH_SIZE);
    const contexts = await Promise.all(batch.map(id => buildEntityContext(id)));
    batch.forEach((id, idx) => results.set(id, contexts[idx]));
  }
  return results;
}
