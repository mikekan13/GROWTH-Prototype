import 'server-only';
import { prisma } from '@/lib/db';
import { getAIProvider } from '../providers';
import type { ChatMessage } from '../types';
import type { CopilotResponse } from './types';
import { assembleContext } from './context-assembler';
import { parseActions } from './action-parser';

const MAX_HISTORY = 20; // conversation messages to include
const SYSTEM_PROMPT = `You are the Campaign Co-pilot for GRO.WTH, a tabletop RPG system. You assist both Game Masters (Watchers) and players (Trailblazers) with campaign management, story development, rules questions, and creative inspiration.

Your personality:
- Knowledgeable about the campaign and game rules
- Creative and evocative, matching the campaign's tone
- Concise — you're embedded in a terminal panel, keep responses focused
- Helpful without being overbearing

Your capabilities:
- Answer questions about characters, items, locations, and the campaign world
- Help with story ideas, NPC concepts, scene design
- Explain game rules and mechanics
- Suggest creative names, descriptions, and flavor text

When you want to CREATE something in the campaign (a forge item, location, etc.), output an action block:
\`\`\`action
{"type": "create_forge_item", "description": "Create skill: Arcane Strike", "params": {"type": "skill", "name": "Arcane Strike", "data": {"description": "Channel energy...", "governors": ["Flow", "Force"]}}}
\`\`\`

Available action types:
- create_forge_item: type (skill|item|nectar|blossom|thorn), name, data
- create_location: name, type (settlement|wilderness|dungeon|building|point_of_interest|region), data
- create_campaign_item: name, type (weapon|armor|accessory|consumable|tool|artifact|misc), data

Only propose actions when the user clearly wants something created. Always describe what you're about to create before the action block.

IMPORTANT: You have access to campaign data provided in the context. Use it to give specific, relevant answers. If you don't have enough information, say so rather than making things up.`;

export async function sendCopilotMessage(
  campaignId: string,
  userId: string,
  username: string,
  userRole: string,
  message: string,
): Promise<CopilotResponse> {
  // 1. Save user message
  await prisma.copilotMessage.create({
    data: {
      campaignId,
      role: 'user',
      content: message,
      userId,
      username,
    },
  });

  // 2. Assemble context (lean — only fetches what's relevant)
  const context = await assembleContext(campaignId, message);

  // 3. Build conversation history
  const history = await prisma.copilotMessage.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY + 1, // +1 because we just saved the user message
    select: { role: true, content: true, username: true },
  });

  // Reverse to chronological order, exclude the message we just saved
  const pastMessages = history.reverse().slice(0, -1);

  // 4. Build chat messages
  const contextBlock = [
    '=== CAMPAIGN DATA ===',
    context.campaignSummary,
    context.retrievedData ? `\n=== RELEVANT DETAILS ===\n${context.retrievedData}` : '',
    context.rulesContext ? `\n=== RULES REFERENCE ===\n${context.rulesContext}` : '',
  ].filter(Boolean).join('\n');

  const roleContext = userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD'
    ? 'The user is the Watcher (GM) of this campaign. They can create and manage all campaign content.'
    : 'The user is a Trailblazer (player). They can ask questions but cannot create campaign content — only the Watcher can do that. Do NOT output action blocks for players.';

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${roleContext}\n\n${contextBlock}` },
    ...pastMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.username ? `[${m.username}]: ${m.content}` : m.content,
    })),
    { role: 'user', content: `[${username}]: ${message}` },
  ];

  // 5. Call AI
  const provider = getAIProvider();
  const rawResponse = await provider.chat(chatMessages, {
    temperature: 0.7,
    maxTokens: 1024,
  });

  // 6. Parse actions from response
  const { message: cleanMessage, actions } = parseActions(rawResponse);

  // 7. Save assistant response
  await prisma.copilotMessage.create({
    data: {
      campaignId,
      role: 'assistant',
      content: cleanMessage,
      actions: actions.length > 0 ? JSON.stringify(actions) : null,
    },
  });

  return { message: cleanMessage, actions };
}

export async function getCopilotHistory(campaignId: string, limit: number = 50) {
  const messages = await prisma.copilotMessage.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      username: true,
      actions: true,
      createdAt: true,
    },
  });

  return messages.map(m => ({
    ...m,
    actions: m.actions ? JSON.parse(m.actions) : [],
  }));
}
