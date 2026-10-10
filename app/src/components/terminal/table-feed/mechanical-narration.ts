/**
 * Mechanical rows → narrative lines for the Terminal feed (Mike 2026-10-08:
 * the feed is narrative only; the mechanics live in the jEWL tab's Log, and
 * the common ones still read in the feed as a line of story — "Ash goes to
 * the Galley Kitchen").
 *
 * What it reads (payload fields, all optional strings):
 *   game_event relocation | moved | located_at   toName, fromName  → "Ash goes to X"
 *   game_event arrival                           toName | locationName → "Ash arrives at X"
 *   game_event departure                         fromName | locationName → "Ash leaves X"
 *   game_event item_moved | item_given | item_taken | item_dropped
 *                                                itemName, toName, fromName
 *   changelog  inventory | equipment             → "Ash's belongings change." / "Ash changes what they carry."
 *   dice_roll  with success true/false and a "<Skill> check…" context → "Ash succeeds at Climbing."
 * The actor is `characterName` on the event, else `payload.characterName`.
 *
 * Numberless on purpose — the numbers are the Log's. Every other mechanical
 * kind returns null (UNMAPPED below) and is reachable from the feed only by
 * the log link of the line before it.
 *
 * Pure.
 */
import type { TerminalEvent } from '@/types/terminal';

/** Mechanical kinds the mapper does not narrate (yet). */
export const UNMAPPED_KINDS = [
  'changelog: attribute, skill, magic, trait, grovine, vitals, condition, identity, levels, harvest, backstory, campaign, status',
  'dice_roll without a pass/fail or without a "<Skill> check" context',
  'command (typed /commands and their results)',
  'game_event skill_* (check bookkeeping)',
  'game_event opportunity_arose / opportunity_resolved (planning)',
  'crystallization (KRMA)',
] as const;

type P = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function actor(e: TerminalEvent, p: P): string {
  return str(e.characterName) ?? str(p.characterName) ?? str(p.actorName) ?? 'Someone';
}

export function narrateMechanical(e: TerminalEvent): string | null {
  const p = (e.payload ?? {}) as unknown as P;
  const who = actor(e, p);
  if (p.kind === 'game_event') {
    const et = str(p.eventType) ?? '';
    const to = str(p.toName) ?? str(p.locationName);
    const from = str(p.fromName);
    switch (et) {
      case 'relocation': case 'moved': case 'located_at':
        if (str(p.toName)) return `${who} goes to ${str(p.toName)}.`;
        if (from) return `${who} leaves ${from}.`;
        return null;
      case 'arrival': return to ? `${who} arrives at ${to}.` : null;
      case 'departure': { const f = from ?? str(p.locationName); return f ? `${who} leaves ${f}.` : null; }
      case 'item_moved': case 'item_given': case 'item_taken': case 'item_dropped': {
        const item = str(p.itemName);
        if (!item) return null;
        if (et === 'item_dropped') return `${who} sets down ${item}${from ? ` in ${from}` : ''}.`;
        if (str(p.toName)) return `${item} goes to ${str(p.toName)}.`;
        if (from) return `${item} is taken from ${from}.`;
        return null;
      }
      default: return null;
    }
  }
  if (p.kind === 'changelog') {
    if (p.reverted === true) return null;
    if (p.category === 'inventory') return `${who}'s belongings change.`;
    if (p.category === 'equipment') return `${who} changes what they carry.`;
    return null;
  }
  if (p.kind === 'dice_roll') {
    if (typeof p.success !== 'boolean') return null;
    const m = (str(p.context) ?? '').match(/^(.+?) check\b/i);
    if (!m) return null;
    return `${who} ${p.success ? 'succeeds' : 'fails'} at ${m[1].trim()}.`;
  }
  return null;
}
