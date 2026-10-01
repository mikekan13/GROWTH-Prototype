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
export { route, enforceWall, WallViolationError } from './route';
export { anthropicChatText, getAnthropicClient } from './transports/anthropic';
export { openAiCompatChat } from './transports/openai-compat';
export { recordAiCall, estimateUsd } from './metering';
export { recordTrace } from './traces';
