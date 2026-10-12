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
} from './config';
export { route, enforceWall, prepareCloudText, WallViolationError } from './route';
export { toneFilter } from './tone-filter';
export { assertNoTableContent, scrubForCloud, hasTableMarker, isTableRow, WITHHELD, type RowLike } from './table-guard';
export { routedChatText, type RoutedChatInput, type RoutedChatResult } from './chat';
export { anthropicChatText, getAnthropicClient } from './transports/anthropic';
export { openAiCompatChat } from './transports/openai-compat';
export { recordAiCall, estimateUsd } from './metering';
export { recordTrace } from './traces';
