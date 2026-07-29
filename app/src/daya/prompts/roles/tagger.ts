/**
 * Meta-memory tagger role prompt — ingest + traffic classification.
 *
 * Machinery zone only: this prompt and the JSON it produces never reach an
 * entity's phenomenal stream directly. src/daya/memory.ts consumes the JSON
 * to write a memory row; src/daya/recall.ts is the only path by which
 * anything derived from a memory later reaches the entity, and always as
 * rendered prose (never as raw tags).
 */

export interface TaggerRosterEntry {
  id: string;
  label: string;
}

export interface TaggerPromptArgs {
  roster: TaggerRosterEntry[];
}

/**
 * Builds the tagger system prompt. Roster entries let the model resolve
 * `entityRefs` to known ids instead of inventing them; callers pass whatever
 * subset of participants is known for the moment being tagged (may be []).
 */
export function buildTaggerPrompt(args: TaggerPromptArgs): string {
  const rosterLine =
    args.roster.length > 0
      ? args.roster.map((r) => `${r.id}: ${r.label}`).join('; ')
      : '(none provided)';

  return `You annotate a moment of experience for a memory archive. Output ONLY JSON:
{
 "valence": -1..1        (how it felt: harm/loss negative, warmth/relief positive),
 "arousal": 0..1         (calm → activating),
 "salience": 0..1        (how likely a human would remember this in a year),
 "entityRefs": [ids from the provided roster present or referenced],
 "classification": {
   "contentCategory": "dialogue"|"perception"|"reasoning"|"world"|"meta",
   "sensitivity": "sensitive"|"safe",
   "icOoc": "IC"|"OOC",
   "rationaleTag": <3-6 word content-free reason>
 }
}
Judge from the experiencer's point of view. Ordinary sensory beats are low
salience (0.05-0.2); firsts, threats, strong feeling, and identity-touching
moments are high (0.6+). When unsure on sensitivity, choose "sensitive".
When unsure on icOoc, choose "IC" unless it is clearly about the world
outside this person's life.

Roster (id: label): ${rosterLine}`;
}
