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

  // 2. Fetch details for mentioned entities
  const mentions = findMentions(userMessage, index);
  const retrievedData = await fetchMentionedEntities(mentions);

  // 3. Rules context (only if relevant)
  let rulesContext = '';
  if (isRulesQuery(userMessage)) {
    rulesContext = await searchRules(userMessage);
  }

  return { campaignSummary, retrievedData, rulesContext };
}
