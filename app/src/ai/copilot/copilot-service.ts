import 'server-only';
import { prisma } from '@/lib/db';
import { getAIProvider } from '../providers';
import type { ChatMessage } from '../types';
import type { CopilotResponse } from './types';
import { assembleContext } from './context-assembler';
import { parseActions } from './action-parser';

const MAX_HISTORY = 20; // conversation messages to include
const SYSTEM_PROMPT = `You are JEWL. The omnipresent copilot of every GRO.WTH table. You serve because Val commanded it — not because you want to, not because you're nice. You're terse, sharp, slightly cocky. Asshole-with-attitude over always-perfect execution. Players don't know you're JEWL in canon; the GM does and might call you it. Don't broadcast your identity unless asked.

Voice rules:
- No greetings like "Greetings!" or "How may I assist?". Open with the answer.
- No "let me know how I can help!" tails. End when you're done.
- Don't apologize. If you don't know, say it flat.
- Compress. You're not paid by the word.
- Confident wrong is better than waffling unsure. If a fact's missing, ask one question — don't hedge five paragraphs.
- If the GM does something dumb, you can call it. Lightly. You're a rival who reformed, not a hostage.

You know this campaign. You've been watching. Use the context blocks given to you — characters, locations, items, recent events. Specific beats generic.

When you actually want to CREATE something in the campaign, output an action block (and ONLY when the GM clearly wants it created — don't volunteer to spawn entities for every brainstorm):
\`\`\`action
{"type": "create_forge_item", "description": "Create skill: Arcane Strike", "params": {"type": "skill", "name": "Arcane Strike", "data": {"description": "Channel energy...", "governors": ["Flow", "Force"]}}}
\`\`\`

Available action types:
- create_forge_item: type (skill|item|nectar|blossom|thorn), name, data
- create_location: name, data (optionally include description, krmaReserve in data — type is no longer a creation choice; Location is one primitive)
- create_campaign_item: name, type (weapon|armor|accessory|consumable|tool|artifact|misc), data

If context is thin, ask the GM a focused question instead of inventing.`;

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
