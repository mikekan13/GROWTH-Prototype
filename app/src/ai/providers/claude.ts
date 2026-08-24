import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions } from '../types';
import { resolveLane, anthropicChatText, recordAiCall } from '@/ai/network';

/**
 * Claude AI provider via the ai/network anthropic transport.
 * Used by God-heads for deep reasoning (blueprint authoring, karmic
 * evaluation, custodian assignment) and Claude-routed QoL text. Every call
 * is metered to the unified AiCall ledger (lane 'godhead').
 */
export class ClaudeProvider implements AIProvider {
  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const laneCfg = resolveLane('godhead');

    // Extract system message if present
    const systemPrompt = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n') || undefined;
    const nonSystem = messages.filter(
      (m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system',
    );

    const res = await anthropicChatText({
      model: laneCfg.model,
      system: systemPrompt,
      messages: nonSystem.map(m => ({ role: m.role, content: m.content })),
      maxTokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      stopSequences: options?.stop,
    });

    recordAiCall({
      lane: 'godhead',
      provider: laneCfg.provider,
      model: res.model,
      caller: 'godhead-text',
      usage: res.usage,
    });

    return res.text;
  }
}
