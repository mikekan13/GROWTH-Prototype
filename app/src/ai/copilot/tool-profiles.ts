/**
 * Per-lane tool sets (2026-10-12) — ONE place that says which tools each
 * dispatch kind carries. Pure.
 *
 * Measured 2026-10-12: table chat on the local 27B (32k window) carried all
 * 51 tool specs ≈22k tokens before a word of history. Design for the small
 * model ([[feedback-design-for-the-small-model-2026-08-02]]): table chat gets
 * a LIGHT set plus `request_tool`, an escape hatch that pulls one heavier
 * tool into the NEXT round of the same dispatch.
 *
 *   TABLE_CHAT — every non-work-cycle dispatch (typed chat, voice, ambient,
 *                canvas gestures, mistake flags, ticks): TABLE_CHAT_TOOLS +
 *                request_tool + any granted tool.
 *   WORK_CYCLE — the full set minus table-only tools (as before).
 *   GENESIS    — a genesis work cycle: as before (stage allow/exclude lists).
 *
 * TICK tool set (2026-10-12): a TABLE_CHAT dispatch that is a system wake
 * (autonomous tick, forge-batch wake) or a canvas gesture carries the light
 * set PLUS TICK_EXTRA_TOOLS up front, so a forge-batch wake can read and
 * place without a request_tool round. Persona/history stay TABLE_CHAT's.
 */

export type DispatchKind = 'TABLE_CHAT' | 'WORK_CYCLE' | 'GENESIS';

/** The light table set. Every name here must exist in the registry (tested). */
export const TABLE_CHAT_TOOLS: readonly string[] = [
  'npc_speak',
  'npc_act',
  'sketch_npc',
  'remember',
  'forget',
  'read_actors_state',
  'advance_clock',
  'apply_attribute_damage',
  'apply_condition',
  'set_attribute_current',
  'move_character_to_location',
  'read_location',
  'list_canvas_characters',
  'ask_terminal',
];

/**
 * CANON REWRITE MODE (2026-10-17, temporary): offered on table chat only when
 * the mode is open to the actor (runtime checks canonRewriteActive). Kept out
 * of TABLE_CHAT_TOOLS so other campaigns never carry their specs.
 */
export const CANON_REWRITE_TOOLS: readonly string[] = ['read_canon', 'rewrite_trait', 'rewrite_memory', 'undo_canon_rewrite'];

/** Added on top of TABLE_CHAT_TOOLS for system wakes + canvas gestures. */
export const TICK_EXTRA_TOOLS: readonly string[] = [
  'place_item',
  'arrange_canvas',
  'read_forge_item',
];

/** Sources that get the TICK tool set (TABLE_CHAT kind only). */
const TICK_SOURCES: readonly string[] = ['JEWL_AUTONOMOUS_TICK', 'GM_CANVAS_ACTION'];

/** Is this TABLE_CHAT dispatch a tick (system wake / canvas gesture)? */
export function isTickSource(source: string): boolean {
  return TICK_SOURCES.includes(source);
}

/** The light tools this profile carries up front (before any grant). */
export function lightToolsFor(profile?: ToolProfile): readonly string[] {
  return profile?.tick ? [...TABLE_CHAT_TOOLS, ...TICK_EXTRA_TOOLS] : TABLE_CHAT_TOOLS;
}

export const REQUEST_TOOL = 'request_tool';

/** Heavy tools whose descriptions are held to ≤900 chars (tested). */
export const HEAVY_TOOLS: readonly string[] = [
  'create_location',
  'update_location',
  'propose_forge_blueprint',
  'daya_author_entity',
];

export interface ToolProfile {
  kind: DispatchKind;
  /** Tools request_tool granted for THIS round (TABLE_CHAT only). */
  granted?: readonly string[];
  /** TICK tool set: light set + TICK_EXTRA_TOOLS (TABLE_CHAT only). */
  tick?: boolean;
}

/** The dispatch kind of a prompt. A work cycle is GENESIS when the work loop
 *  says so (genesis cycles reply as '[genesis]'). */
export function dispatchKindOf(p: { source: string; kind?: DispatchKind; replyUsername?: string }): DispatchKind {
  if (p.kind) return p.kind;
  if (p.source !== 'JEWL_WORK_CYCLE') return 'TABLE_CHAT';
  return p.replyUsername === '[genesis]' ? 'GENESIS' : 'WORK_CYCLE';
}

/** Does the profile let this (otherwise offered) tool through? */
export function profileAllows(name: string, profile?: ToolProfile): boolean {
  if (!profile || profile.kind !== 'TABLE_CHAT') return name !== REQUEST_TOOL;
  if (name === REQUEST_TOOL) return true;
  return lightToolsFor(profile).includes(name) || !!profile.granted?.includes(name);
}

/**
 * The grants for the next round. A tool requested this round is offered next
 * round; a granted tool stays only while it is being used (a round that
 * leaves it unused drops it). Nothing carries into another dispatch.
 */
export function nextGrants(current: readonly string[], requested: readonly string[], used: readonly string[]): string[] {
  const out = new Set<string>(requested);
  for (const g of current) if (used.includes(g)) out.add(g);
  return [...out];
}

/** The request_tool spec (name/description/JSON schema), listing what may be pulled. */
export function requestToolSpec(requestable: readonly string[]): { name: string; description: string; inputSchema: Record<string, unknown> } {
  return {
    name: REQUEST_TOOL,
    description:
      'Pull ONE heavier tool into your NEXT round (this turn only). Call it, then use the tool on the next round. ' +
      'A granted tool stays while you keep using it. Requestable: ' + requestable.join(', ') + '.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Exact tool name from the requestable list.' } },
      required: ['name'],
      additionalProperties: false,
    },
  };
}
