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
  return TABLE_CHAT_TOOLS.includes(name) || !!profile.granted?.includes(name);
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
