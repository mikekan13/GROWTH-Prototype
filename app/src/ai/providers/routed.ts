import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions } from '../types';
import { routedChatText, type ContentClass, type LaneName } from '@/ai/network';

/** What a routed provider call site declares to the wall. */
export interface RoutedProviderTask {
  /** Stable caller id for metering and the wall's audit line. */
  caller: string;
  /** REQUIRED: what the text is. table/real never reach Claude. */
  contentClass: ContentClass;
  campaignId?: string;
  /** The lane the subclass commits to ('local' = the pod, 'godhead' = Claude). */
  lane: LaneName;
  /** Local lane only: abort after this long (serverless cold start ~100 s). */
  timeoutMs?: number;
}

/**
 * The AIProvider face over routedChatText, so the DECISION to reach a model
 * is route()'s (the wall, Mike 2026-10-12): every call carries a content
 * class, crosses only as fiction, through the tone filter and the table
 * guard, and is metered. ClaudeProvider and PodProvider only fix the lane.
 */
export class RoutedProvider implements AIProvider {
  constructor(protected readonly task: RoutedProviderTask) {}

  async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const turns = messages
      .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const res = await routedChatText(
      {
        caller: this.task.caller,
        lane: this.task.lane,
        contentClass: this.task.contentClass,
        campaignId: this.task.campaignId,
      },
      {
        system,
        messages: turns,
        maxTokens: options?.maxTokens ?? 2048,
        temperature: options?.temperature ?? 0.7,
        stopSequences: options?.stop,
        ...(this.task.timeoutMs ? { timeoutMs: this.task.timeoutMs } : {}),
      },
    );
    return res.text;
  }
}
