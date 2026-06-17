/**
 * JEWL prompt types — the universal input shape.
 *
 * Every action the GM (or anyone) takes routes through JEWL as a prompt.
 * The runtime is source-agnostic — canvas gesture, text chat, voice, image,
 * autonomous tick all become the same `JewlPrompt` downstream.
 *
 * Adding a new input modality (audio capture, etc.) is `+ one source value`
 * + a thin adapter; no runtime changes needed.
 *
 * See [[jewl-full-vision-2026-06-14]], [[jewl-built-as-we-fix-canvas-2026-06-14]].
 */

import type { GrowthCharacter } from '@/types/growth';

/** Where the prompt came from. */
export type JewlPromptSource =
  | 'GM_TEXT'              // GM typed into JewlChip
  | 'GM_CANVAS_ACTION'     // GM clicked / dragged / dropped on the canvas
  | 'GM_MISTAKE_FLAG'      // GM flagged a JEWL message as a mistake (bounty paid)
  | 'GM_VOICE'             // GM spoke (STT) — not wired yet
  | 'PLAYER_VOICE'         // Player spoke (STT) — not wired yet
  | 'TABLE_AMBIENT'        // ambient audio capture — not wired yet
  | 'JEWL_AUTONOMOUS_TICK' // self-triggered tick — not wired yet
  | 'AI_AGENT';            // another AI prompted JEWL — not wired yet

/** Structured "this is what the GM physically did on the canvas." */
export interface CanvasActionPayload {
  /** Short kebab-style verb: 'damage', 'edit-location', 'advance-time', etc. */
  kind: string;
  /** Subject of the action. */
  targetType: 'character' | 'location' | 'item' | 'campaign' | 'session';
  targetId: string;
  /** What the GM perceived they were doing — natural-language summary. */
  intent: string;
  /** Optional tool hint — "GM probably wants tool X with these args." JEWL
   *  may pick a different tool, amend, refuse, or ask for justification. */
  proposedTool?: {
    name: string;
    input: Record<string, unknown>;
  };
}

/** Optional attached media on a prompt. */
export interface JewlMedia {
  kind: 'image' | 'audio';
  /** Data URL: `data:image/jpeg;base64,...` or `data:audio/wav;base64,...`. */
  dataUrl: string;
}

/** The universal prompt JEWL receives. */
export interface JewlPrompt {
  source: JewlPromptSource;
  campaignId: string;
  /** Actor id — user.id for human sources; 'jewl' for autonomous; agent id for AI. */
  actorId: string;
  actorName: string;
  actorRole: string;
  /** Free text — what the actor said / what the gesture description is. */
  text: string;
  /** Populated when source = GM_CANVAS_ACTION. */
  canvasAction?: CanvasActionPayload;
  /** Optional attached media (multimodal). */
  media?: JewlMedia[];
}

/** Outcome of executing one tool call. */
export interface JewlToolCallResult {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  /** Side-effect summary the UI can use to refresh affected objects. */
  affected?: {
    characters?: Array<{ id: string; data?: GrowthCharacter; changes: string[] }>;
    locations?: Array<{ id: string }>;
    items?: Array<{ id: string }>;
  };
}

/** What JEWL returned. Always written to the log. */
export interface JewlResponse {
  /** JEWL's narration / chat reply. May be empty if pure tool execution. */
  message: string;
  /** Tool calls JEWL chose to make + their results. */
  toolCalls: JewlToolCallResult[];
  /** Surfaced reasoning — recorded in the log for audit. */
  reasoning?: string;
  /** Tokens used, model, etc. */
  metadata?: Record<string, unknown>;
}
