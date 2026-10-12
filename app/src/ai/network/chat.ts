/**
 * ai/network/chat — one routed text call: route() → the wall → the transport
 * → metering. The door services use instead of calling a transport directly
 * (the no-direct-cloud lint keeps it that way).
 */

import 'server-only';
import { route, prepareCloudText } from './route';
import { anthropicChatText } from './transports/anthropic';
import { openAiCompatChat } from './transports/openai-compat';
import { recordAiCall } from './metering';
import type { AiUsage, ResolvedLane, TaskDescriptor } from './types';

export interface RoutedChatInput {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Real-world identifiers to strip before a cloud lane (enforceWall). */
  identifiers?: string[];
}

export interface RoutedChatResult {
  text: string;
  model: string;
  usage: AiUsage;
  lane: ResolvedLane;
}

export async function routedChatText(task: TaskDescriptor, input: RoutedChatInput): Promise<RoutedChatResult> {
  const lane = route(task);
  const system = prepareCloudText(task, lane, input.system, input.identifiers);
  const user = prepareCloudText(task, lane, input.user, input.identifiers);
  const opts = { maxTokens: input.maxTokens, temperature: input.temperature ?? 0 };
  let res: { text: string; model: string; usage: AiUsage };
  if (lane.provider === 'anthropic') {
    res = await anthropicChatText({ model: lane.model, system, cacheSystem: true, messages: [{ role: 'user', content: user }], ...opts });
  } else if (lane.provider === 'openai-compat' && lane.baseUrl) {
    res = await openAiCompatChat({
      baseUrl: lane.baseUrl, apiKey: lane.apiKey, model: lane.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...opts,
    });
  } else {
    throw new Error(`${task.caller}: unsupported provider ${lane.provider}`);
  }
  recordAiCall({ lane: lane.lane, provider: lane.provider, model: res.model, caller: task.caller, campaignId: task.campaignId, usage: res.usage });
  return { ...res, lane };
}
