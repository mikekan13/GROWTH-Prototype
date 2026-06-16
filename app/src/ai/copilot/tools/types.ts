/**
 * JEWL tool registry types.
 *
 * Each canvas-modifying action is exposed to JEWL as a named tool. Services
 * register their tools at module load; the runtime dispatches whatever
 * JEWL decides to call.
 *
 * Adding a canvas feature = `register one tool` + `wire one gesture`.
 *
 * See [[jewl-built-as-we-fix-canvas-2026-06-14]].
 */

import type { z } from 'zod';
import type { GrowthCharacter } from '@/types/growth';

/** Context handed to every tool handler. */
export interface JewlToolContext {
  campaignId: string;
  /** Who triggered the prompt that led to this tool call.
   *  - For GM gestures: the GM's user.id
   *  - For autonomous JEWL ticks: 'jewl'
   *  - For NPC actions (later): the NPC actor id */
  actorId: string;
  actorRole: string;
  /** ID of the CopilotMessage row representing the prompt that triggered this. */
  promptMessageId?: string;
}

/** Side-effect summary returned by a tool — used by the UI for refresh hints. */
export interface JewlToolAffectedObjects {
  characters?: Array<{ id: string; data: GrowthCharacter; changes: string[] }>;
  locations?: Array<{ id: string }>;
  items?: Array<{ id: string }>;
}

/** What a tool handler returns to the runtime. */
export interface JewlToolHandlerResult {
  /** Raw output JEWL will see when reasoning about next step. */
  output: unknown;
  /** Optional UI refresh hints. */
  affected?: JewlToolAffectedObjects;
}

/** A tool JEWL can call. */
export interface JewlTool {
  /** Snake_case; what Claude sees as the tool name. */
  name: string;
  /** Plain-English description for Claude to decide when to invoke. */
  description: string;
  /** Zod schema for the input. JSON Schema is derived from this. */
  inputSchema: z.ZodTypeAny;
  /** Implementation. Throw to surface error to JEWL + GM. */
  handler: (input: unknown, ctx: JewlToolContext) => Promise<JewlToolHandlerResult>;
}
