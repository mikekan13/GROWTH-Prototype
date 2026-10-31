/**
 * A narrated hand-over the adjudicator missed (HW12 2026-10-31: "He slowly hands her the box." — the Watcher's own
 * line, rebuilt from a speech-to-text split — came back with no effects, the pizza stayed in Kristopher's hand, and
 * Violet's routine waited at the open door for a box the Watcher had already given her).
 *
 * This is not a keyword parser for items: the adjudicator still names the give (it alone maps "the box" to the thing
 * carried). It is the structural fact that a sentence SAYS something changed hands, so an empty effects list is a miss
 * worth one more ask. Pure.
 */

const HAND_OVER = /\b(hand(?:s|ed|ing)?|give(?:s|n)?|gave|giving|pass(?:es|ed|ing)?|offer(?:s|ed|ing)?|holds? out|slid(?:e|es)|slips?|tosse?s?|throws?|threw)\b/i;
const RECEIVER = /\b(to|over to)\s+(her|him|them|[A-Z][a-z]+)\b|\b(hand(?:s|ed)?|give(?:s)?|gave|pass(?:es|ed)?|offer(?:s|ed)?|slips?|tosse?s?|throws?|threw)\s+(her|him|them|[A-Z][a-z]+)\s+(the|a|an|his|her|their|its|one|some)\b/;

/** True when the sentence states a thing passing from one person to another. */
export function statesHandOver(text: string): boolean {
  const t = text.trim();
  if (!HAND_OVER.test(t)) return false;
  return RECEIVER.test(t);
}

/** The line added to a narrated ask when the first answer named no effects for a hand-over. */
export const HAND_OVER_NUDGE =
  'The sentence states that something changed hands. Name that as an effect — {"op":"give","item":<the carried thing it means, by its listed name>,"to":<the person it goes to, by name>} — unless the thing is not carried by the actor, in which case say why in "outcome" and leave "effects": [].';
