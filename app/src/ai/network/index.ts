/**
 * ai/network — the model-routing layer. One chokepoint for every AI call.
 *
 * Design: AI-NETWORK-DESIGN-INTENT-2026-08-23.md
 * Economics: AI-ECONOMICS-2026-08-23.md
 */

export * from './types';
export {
  resolveLane,
  localLane,
  judgmentModel,
  classifyModel,
  gruntModel,
  godheadModel,
  workCycleLane,
  tableLane,
  visionModel,
  textProvider,
  visionProvider,
  ollamaUrl,
  ollamaTextModel,
  type ModelProviderChoice,
} from './config';
export { route, enforceWall, prepareCloudText, WallViolationError } from './route';
export { toneFilter, toneFilterAsync, type ToneFilterContext } from './tone-filter';
export { assertNoTableContent, scrubForCloud, hasTableMarker, isTableRow, WITHHELD, type RowLike } from './table-guard';
export { routedChatText, type RoutedChatInput, type RoutedChatResult, type RoutedChatOptions, type RoutedMessage, type RoutedBlock } from './chat';
export { anthropicChatText, getAnthropicClient, type AnthropicMessagesClient } from './transports/anthropic';
export { openAiCompatChat, type OpenAiCompatContentPart } from './transports/openai-compat';
export { describeImage, resolveVisionProvider, isLocalVisionHost, type DescribeImageOptions, type DescribeImageResult, type VisionProvider } from './vision';
export { recordAiCall, estimateUsd } from './metering';
export { recordTrace } from './traces';
export { auditCloudCall, auditRefusal, cloudAuditLine, newToneTally, utf8Bytes, type CloudAudit, type ToneTally } from './audit';
