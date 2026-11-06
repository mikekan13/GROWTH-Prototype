import type { TerminalEvent } from '@/types/terminal';
import { buildFeedRows, type NarrationRowModel, type CharacterRowModel, type RosterName } from '@/components/terminal/table-feed/feed-rows';

export interface Utterance { text: string; characterId: string | null }

/** Strip surrounding quote marks and the ((...)) / [[...]] marks; trims. */
export function cleanSpoken(text: string): string {
  return (text ?? '')
    .replace(/\(\(|\)\)|\[\[|\]\]/g, '')
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .trim();
}

/**
 * An event -> the lines to read aloud, in order (Michael 2026-11-06: the NARRATOR voices everything that is
 * not a character's own line, so the table sounds like one story and the characters are sound bites in it).
 *  - every narration row (the Watcher's typed line, the engine's built-up prose, a being's scene line, an action)
 *    -> the narrator (characterId null)
 *  - a character row's speech -> that character's voice; its actions -> the narrator; thoughts stay silent
 *  - time passing (game_event `timeskip`) -> the narrator reads the summary
 * Session start/end, rolls, checks, system and JEWL bars are not read.
 */
export function utterancesFor(event: TerminalEvent, roster: RosterName[]): Utterance[] {
  const out: Utterance[] = [];
  const push = (raw: string, characterId: string | null) => {
    const text = cleanSpoken(raw);
    if (text) out.push({ text, characterId });
  };
  const p = event.payload;
  // The world's own device lines (a phone sounding, the words read off a screen) are not read aloud: the beings' cards carry them.
  if (p?.kind === 'game_event' && p.eventType === 'declaration' && p.via === 'device') return out;
  if (p?.kind === 'game_event' && p.eventType === 'timeskip') {
    if (typeof p.description === 'string') push(p.description, null);
    return out;
  }
  const flat: Array<NarrationRowModel | CharacterRowModel> = [];
  for (const row of buildFeedRows([event], roster)) {
    if (row.type === 'beat') for (const g of row.groups) flat.push(...g);
    else if (row.type === 'narration' || row.type === 'character') flat.push(row);
  }
  for (const row of flat) {
    if (row.type === 'narration') {
      if (!row.mechanical) push(row.text, null);
    } else {
      for (const s of row.segments) {
        if (s.kind === 'speech') push(s.text, row.characterId);
        else if (s.kind === 'action') push(s.text, null);
      }
    }
  }
  return out;
}
