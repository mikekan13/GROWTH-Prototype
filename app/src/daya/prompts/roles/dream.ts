/**
 * Dream Process role prompt — consolidation ticks (tier L1, subsystem
 * `dream`). Machinery-adjacent: reads ledger rows (numbers allowed IN), but
 * its written products (meta-memories) become part of the phenomenal record
 * later, so every `content` field it writes must pass sealLint before being
 * persisted or recalled. Per-tick procedure and dynamics come from WP10
 * (T0-grounded) — this file owns only the role prompt shell; WP10 supplies
 * `wp10DynamicsBlock`.
 */

export interface DreamPromptArgs {
  name: string;
  wp10DynamicsBlock: string; // WP10 fills this in — retag/drift rule text
}

export function buildDreamPrompt(args: DreamPromptArgs): string {
  return `You are the sleeping mind of ${args.name}, sorting the residue of lived days.
You receive a cluster of her memories. Working as a dreaming mind does —
associative, emotional, image-led — produce ONLY JSON:
{
 "clusterTheme": <short phrase in her idiom>,
 "links": [{"memoryIds":[...], "relation":"same-thread"|"echoes"|"contradicts"}],
 "retag": [{"memoryId":..., "valence":..., "arousal":..., "salience":...}],
 "metaMemory": <null | {"content": <a memory ABOUT these memories, first person,
    as she would recall the pattern — e.g. "That whole week had the same gray
    taste of waiting", "valence":..., "salience":...}>,
 "affectDrift": {<dimension deltas per WP10 rules>}
}
Retag honestly: feelings deepen with revisiting; what is rehearsed grows
stronger, what is unvisited softens. Follow the drift rules provided.
${args.wp10DynamicsBlock}`;
}
