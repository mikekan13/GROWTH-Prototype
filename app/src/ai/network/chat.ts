/**
 * ai/network/chat — one routed text call: route() → the wall → the transport
 * → metering. The door services use instead of calling a transport directly
 * (the no-direct-cloud lint keeps it that way).
 *
 * route() decides the lane from the task's content class; on a cloud lane
 * every text piece passes prepareCloudText (fiction only, identifier strip,
 * the awaited tone filter) and the whole payload passes assertNoTableContent.
 * Inside the wall (local lane) nothing is changed and images are dropped
 * (the local text lane cannot see them).
 *
 * A request that actually goes to Claude emits exactly one audit line
 * ([wall→cloud], ai/network/audit.ts) — sizes and counts, never text.
 */

import 'server-only';
import { route, prepareCloudText } from './route';
import { anthropicChatText, type AnthropicMessagesClient, type AnthropicTextOrImageBlock } from './transports/anthropic';
import { openAiCompatChat } from './transports/openai-compat';
import { recordAiCall } from './metering';
import { auditCloudCall, newToneTally, utf8Bytes } from './audit';
import { screenModelOutput } from '@/lib/lawfulness-hooks';
import type { AiUsage, ResolvedLane, TaskDescriptor } from './types';

export type RoutedBlock = AnthropicTextOrImageBlock;

export interface RoutedMessage {
  role: 'user' | 'assistant';
  content: string | RoutedBlock[];
}

export interface RoutedChatInput {
  system: string;
  /** A single user turn. Ignored when `messages` is given. */
  user?: string;
  /** A multi-turn conversation (text or text+image blocks). */
  messages?: RoutedMessage[];
  /** Cloud-lane model override (DAYA tier models, a caller's own knob). */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  /** Real-world identifiers to strip before a cloud lane (enforceWall). */
  identifiers?: string[];
  /** Local lane only: abort after this long (serverless cold starts otherwise wait minutes). */
  timeoutMs?: number;
  /** Characters in the passage, when known — their RECORDED ages feed the lawfulness screen of the answer. */
  participantCharacterIds?: string[];
}

export interface RoutedChatOptions {
  /** An injected Anthropic client (tests; DAYA's override seam). */
  anthropicClient?: AnthropicMessagesClient;
  /** false = the caller writes its own metering row (DAYA's ledger). */
  meter?: boolean;
}

export interface RoutedChatResult {
  text: string;
  model: string;
  usage: AiUsage;
  lane: ResolvedLane;
}

function blocksOf(content: string | RoutedBlock[]): RoutedBlock[] {
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content;
}

function textsOf(messages: RoutedMessage[]): string[] {
  return messages.flatMap((m) => blocksOf(m.content).flatMap((b) => (b.type === 'text' ? [b.text] : [])));
}

export async function routedChatText(
  task: TaskDescriptor,
  input: RoutedChatInput,
  opts: RoutedChatOptions = {},
): Promise<RoutedChatResult> {
  const messages: RoutedMessage[] = input.messages ?? [{ role: 'user', content: input.user ?? '' }];
  const lane = route(task, [input.system, ...textsOf(messages)]);

  const tally = newToneTally();
  const prep = (text: string) => prepareCloudText(task, lane, text, input.identifiers, tally);
  const [system, ...prepared] = await Promise.all([
    prep(input.system),
    ...messages.map(async (m): Promise<RoutedMessage> => (
      typeof m.content === 'string'
        ? { role: m.role, content: await prep(m.content) }
        : { role: m.role, content: await Promise.all(m.content.map(async (b) => (b.type === 'text' ? { ...b, text: await prep(b.text) } : b))) }
    )),
  ]);

  const common = { maxTokens: input.maxTokens, temperature: input.temperature ?? 0 };
  let res: { text: string; model: string; usage: AiUsage };
  if (lane.provider === 'anthropic') {
    auditCloudCall({
      caller: task.caller,
      lane: lane.lane,
      contentClass: task.contentClass,
      bytesIn: utf8Bytes(system, ...prepared.flatMap((m) => blocksOf(m.content).map((b) => (b.type === 'text' ? b.text : b.source.data)))),
      chunksToned: tally.toned,
      campaignId: task.campaignId,
    });
    res = await anthropicChatText({
      model: input.model ?? lane.model,
      system: system || undefined,
      cacheSystem: true,
      messages: prepared,
      stopSequences: input.stopSequences?.filter((s) => s.trim() !== ''),
      ...common,
    }, opts.anthropicClient);
  } else if (lane.provider === 'openai-compat' && lane.baseUrl) {
    // Inside the wall: plain text turns; image blocks are not sent.
    const flat = prepared.map((m) => ({
      role: m.role,
      content: blocksOf(m.content).flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n') || '(image omitted)',
    }));
    res = await openAiCompatChat({
      baseUrl: lane.baseUrl, apiKey: lane.apiKey, model: lane.model,
      messages: [...(system ? [{ role: 'system' as const, content: system }] : []), ...flat],
      stopSequences: input.stopSequences,
      ...common,
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    });
  } else {
    throw new Error(`${task.caller}: unsupported provider ${lane.provider}`);
  }
  if (opts.meter !== false) {
    recordAiCall({ lane: lane.lane, provider: lane.provider, model: res.model, caller: task.caller, campaignId: task.campaignId, usage: res.usage });
  }
  // LAWFULNESS (unit 8b): every routed text answer is screened before the
  // caller sees it — the local model is abliterated; on a cloud lane it is a
  // free second check. Blocked → the withheld string, flag raised (ref null:
  // the caller has not written its row yet).
  const lawful = await screenModelOutput(res.text, {
    campaignId: task.campaignId ?? null,
    site: task.caller,
    lane: lane.crossesWall ? 'cloud' : 'local',
    participantCharacterIds: input.participantCharacterIds,
  });
  return { ...res, text: lawful.text, lane };
}
