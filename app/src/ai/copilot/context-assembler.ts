import 'server-only';
import { prisma } from '@/lib/db';
import type { EntityIndex, CopilotContext } from './types';
import { searchRules } from './rules-search';

// Build a lightweight index of all entity names in the campaign
export async function buildEntityIndex(campaignId: string): Promise<EntityIndex> {
  const [characters, forgeItems, locations, campaignItems, members] = await Promise.all([
    prisma.character.findMany({
      where: { campaignId },
      select: { id: true, name: true },
    }),
    prisma.forgeItem.findMany({
      where: { campaignId },
      select: { id: true, name: true, type: true },
    }),
    prisma.location.findMany({
      where: { campaignId },
      select: { id: true, name: true, type: true },
    }),
    prisma.campaignItem.findMany({
      where: { campaignId },
      select: { id: true, name: true, type: true },
    }),
    prisma.campaignMember.findMany({
      where: { campaignId },
      include: { user: { select: { username: true } } },
    }),
  ]);

  return {
    characters,
    forgeItems,
    locations,
    campaignItems,
    members: members.map(m => ({ username: m.user.username })),
  };
}

// Find entity names mentioned in the user's message
function findMentions(message: string, index: EntityIndex): {
  characterIds: string[];
  forgeItemIds: string[];
  locationIds: string[];
  campaignItemIds: string[];
} {
  const lower = message.toLowerCase();
  return {
    characterIds: index.characters.filter(c => lower.includes(c.name.toLowerCase())).map(c => c.id),
    forgeItemIds: index.forgeItems.filter(i => lower.includes(i.name.toLowerCase())).map(i => i.id),
    locationIds: index.locations.filter(l => lower.includes(l.name.toLowerCase())).map(l => l.id),
    campaignItemIds: index.campaignItems.filter(i => lower.includes(i.name.toLowerCase())).map(i => i.id),
  };
}

// Fetch full details for mentioned entities
async function fetchMentionedEntities(mentions: ReturnType<typeof findMentions>): Promise<string> {
  const parts: string[] = [];

  if (mentions.characterIds.length > 0) {
    const chars = await prisma.character.findMany({
      where: { id: { in: mentions.characterIds } },
      include: { user: { select: { username: true } } },
    });
    for (const c of chars) {
      try {
        const data = JSON.parse(c.data) as Record<string, unknown>;
        parts.push(`[Character: ${c.name}] Player: ${c.user.username}, Status: ${c.status}, Seed: ${data.seed || 'unknown'}, Level: ${data.level ?? 1}`);
        if (data.attributes && typeof data.attributes === 'object') {
          const attrs = data.attributes as Record<string, unknown>;
          const summary = Object.entries(attrs).map(([pillar, pData]) => {
            if (typeof pData === 'object' && pData !== null) {
              const freqs = Object.entries(pData as Record<string, unknown>)
                .map(([freq, fData]) => {
                  const val = (fData as Record<string, number>)?.current;
                  return val !== undefined ? `${freq}:${val}` : null;
                })
                .filter(Boolean)
                .join(', ');
              return `${pillar}(${freqs})`;
            }
            return null;
          }).filter(Boolean).join(' | ');
          parts.push(`  Attributes: ${summary}`);
        }
      } catch {
        parts.push(`[Character: ${c.name}] Status: ${c.status}`);
      }
    }
  }

  if (mentions.forgeItemIds.length > 0) {
    const items = await prisma.forgeItem.findMany({
      where: { id: { in: mentions.forgeItemIds } },
    });
    for (const item of items) {
      parts.push(`[Forge ${item.type}: ${item.name}] Status: ${item.status}, Data: ${item.data.substring(0, 200)}`);
    }
  }

  if (mentions.locationIds.length > 0) {
    const locs = await prisma.location.findMany({
      where: { id: { in: mentions.locationIds } },
    });
    for (const loc of locs) {
      parts.push(`[Location: ${loc.name}] Type: ${loc.type}, Data: ${loc.data.substring(0, 200)}`);
    }
  }

  if (mentions.campaignItemIds.length > 0) {
    const items = await prisma.campaignItem.findMany({
      where: { id: { in: mentions.campaignItemIds } },
    });
    for (const item of items) {
      parts.push(`[Item: ${item.name}] Type: ${item.type}, Status: ${item.status}`);
    }
  }

  return parts.join('\n');
}

/**
 * TABLE STATE — complete present knowledge (Mike 2026-07-11).
 *
 * JEWL is the effect-interpretation layer: content can hook ANY event
 * ("a Nectar that makes the whole party face death"), so every character's
 * effect-bearing state must be in his context on EVERY dispatch — pushed,
 * not mention-matched. This block carries, per non-draft character:
 * attributes (current/max), active conditions, every trait with its rule
 * text, and held equipment. Deep detail stays behind read_actors_state.
 */
const TABLE_STATE_MAX_CHARACTERS = 15; // soft cap; overflow is announced, never silent
const TRAIT_PROSE_CAP = 220;

export async function buildTableState(campaignId: string): Promise<string> {
  const characters = await prisma.character.findMany({
    where: { campaignId, status: { notIn: ['DRAFT'] } },
    orderBy: { updatedAt: 'desc' },
    include: { user: { select: { username: true } } },
  });
  if (characters.length === 0) return '';

  const shown = characters.slice(0, TABLE_STATE_MAX_CHARACTERS);
  const items = await prisma.campaignItem.findMany({
    where: { holderId: { in: shown.map(c => c.id) }, status: 'ACTIVE' },
    select: { holderId: true, name: true, type: true, data: true },
  });
  const itemsByHolder = new Map<string, typeof items>();
  for (const it of items) {
    if (!it.holderId) continue;
    const list = itemsByHolder.get(it.holderId) ?? [];
    list.push(it);
    itemsByHolder.set(it.holderId, list);
  }

  // Hydrate empty trait prose from the Forge catalog (campaign, then
  // global). Trait instances granted from name-only fixtures carry no rule
  // text; the blueprint is the fallback source of mechanical teeth. Traits
  // with no text ANYWHERE are announced as such — JEWL must know the rule
  // is missing rather than silently seeing nothing (he flags, not guesses).
  const traitNames = new Set<string>();
  for (const c of shown) {
    try {
      const d = JSON.parse(c.data) as { traits?: Array<{ name?: string; description?: string; mechanicalEffect?: string }> };
      for (const t of d.traits ?? []) {
        if (t.name && !t.mechanicalEffect && !t.description) traitNames.add(t.name);
      }
    } catch { /* ignore */ }
  }
  const forgeProse = new Map<string, string>();
  if (traitNames.size > 0) {
    const blueprints = await prisma.forgeItem.findMany({
      where: {
        name: { in: [...traitNames] },
        type: { in: ['nectar', 'thorn', 'blossom'] },
        OR: [{ campaignId }, { campaignId: null }],
      },
      select: { name: true, data: true, campaignId: true },
      orderBy: { campaignId: 'desc' }, // campaign-local wins over global
    });
    for (const bp of blueprints) {
      if (forgeProse.has(bp.name)) continue;
      try {
        const d = JSON.parse(bp.data) as { mechanicalEffect?: string; description?: string; rules?: string };
        const prose = d.mechanicalEffect || d.rules || d.description;
        if (prose) forgeProse.set(bp.name, prose);
      } catch { /* ignore */ }
    }
  }

  const lines: string[] = [];
  for (const c of shown) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(c.data) as Record<string, unknown>;
    } catch {
      lines.push(`■ ${c.name} [${c.status}] — unparseable sheet`);
      continue;
    }

    lines.push(`■ ${c.name} [${c.entityType} ${c.status}] player:${c.user?.username ?? '—'}`);

    const attrs = data.attributes as Record<string, { level?: number; current?: number }> | undefined;
    if (attrs) {
      const attrLine = Object.entries(attrs)
        .map(([name, a]) => `${name} ${a?.current ?? '?'}/${a?.level ?? '?'}`)
        .join(', ');
      lines.push(`  attrs: ${attrLine}`);
    }

    const conditions = data.conditions as Record<string, boolean> | undefined;
    const active = conditions ? Object.entries(conditions).filter(([, v]) => v).map(([k]) => k) : [];
    if (active.length > 0) lines.push(`  conditions: ${active.join(', ')}`);

    const traits = (data.traits ?? []) as Array<{
      name?: string; type?: string; pillar?: string; description?: string;
      mechanicalEffect?: string;
      rollModifiers?: Array<{ flat: number; skillNamePattern?: string; governorAttribute?: string }>;
    }>;
    for (const t of traits) {
      const mods = (t.rollModifiers ?? [])
        .map(m => `${m.flat >= 0 ? '+' : ''}${m.flat}${m.skillNamePattern ? ` to '${m.skillNamePattern}'` : m.governorAttribute ? ` to ${m.governorAttribute}` : ' always'}`)
        .join('; ');
      const prose = (
        t.mechanicalEffect || t.description || (t.name ? forgeProse.get(t.name) : '') || ''
      ).slice(0, TRAIT_PROSE_CAP);
      lines.push(
        `  [${t.type ?? 'trait'}${t.pillar ? `/${t.pillar}` : ''}] ${t.name}${mods ? ` {${mods}}` : ''}` +
        (prose ? ` — ${prose}` : ' — (NO RULE TEXT ON FILE — flag to the GM if it matters to a roll)'),
      );
    }

    const held = itemsByHolder.get(c.id) ?? [];
    if (held.length > 0) {
      const itemLine = held.map(it => {
        let equipped = '';
        try {
          const d = JSON.parse(it.data) as { equippedTo?: string };
          if (d.equippedTo) equipped = `@${d.equippedTo}`;
        } catch { /* ignore */ }
        return `${it.name}(${it.type}${equipped})`;
      }).join(', ');
      lines.push(`  items: ${itemLine}`);
    }
  }

  if (characters.length > shown.length) {
    lines.push(`(+${characters.length - shown.length} more characters — call read_actors_state for them; NOT included above)`);
  }
  return lines.join('\n');
}

// Detect if the message is asking about rules
function isRulesQuery(message: string): boolean {
  const ruleKeywords = [
    'rule', 'rules', 'how does', 'how do', 'mechanic', 'system',
    'attribute', 'skill check', 'dice', 'krma', 'karma',
    'depletion', 'frequency', 'harvest', 'grovine', 'seed',
    'body', 'soul', 'spirit', 'nectar', 'blossom', 'thorn',
    'combat', 'death', 'rest', 'wager', 'spend', 'deplete', 'burn',
  ];
  const lower = message.toLowerCase();
  return ruleKeywords.some(kw => lower.includes(kw));
}

// Main context assembly
export async function assembleContext(
  campaignId: string,
  userMessage: string,
): Promise<CopilotContext> {
  // 1. Campaign overview (always included — small)
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      name: true,
      genre: true,
      description: true,
      worldContext: true,
    },
  });

  const index = await buildEntityIndex(campaignId);

  const campaignSummary = [
    `Campaign: ${campaign?.name || 'Unknown'}`,
    campaign?.genre ? `Genre: ${campaign.genre}` : null,
    campaign?.description ? `Description: ${campaign.description}` : null,
    campaign?.worldContext ? `World: ${campaign.worldContext}` : null,
    `Characters: ${index.characters.map(c => c.name).join(', ') || 'none'}`,
    `Players: ${index.members.map(m => m.username).join(', ') || 'none'}`,
    index.forgeItems.length > 0 ? `Forge items: ${index.forgeItems.map(i => `${i.name} (${i.type})`).join(', ')}` : null,
    index.locations.length > 0 ? `Locations: ${index.locations.map(l => l.name).join(', ')}` : null,
    index.campaignItems.length > 0 ? `World items: ${index.campaignItems.map(i => i.name).join(', ')}` : null,
  ].filter(Boolean).join('\n');

  // 2. TABLE STATE — complete present knowledge, every dispatch.
  const tableState = await buildTableState(campaignId);

  // 3. Fetch details for mentioned entities
  const mentions = findMentions(userMessage, index);
  const retrievedData = await fetchMentionedEntities(mentions);

  // 4. Rules context (only if relevant)
  let rulesContext = '';
  if (isRulesQuery(userMessage)) {
    rulesContext = await searchRules(userMessage);
  }

  return { campaignSummary, tableState, retrievedData, rulesContext };
}
