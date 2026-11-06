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

/** A being's card -> the lines to read aloud, in order. Watcher/player events yield nothing. */
export function utterancesFor(event: TerminalEvent, roster: RosterName[]): Utterance[] {
  if (event.actor !== 'ai_copilot') return [];
  const flat: Array<NarrationRowModel | CharacterRowModel> = [];
  for (const row of buildFeedRows([event], roster)) {
    if (row.type === 'beat') for (const g of row.groups) flat.push(...g);
    else if (row.type === 'narration' || row.type === 'character') flat.push(row);
  }
  const out: Utterance[] = [];
  const push = (raw: string, characterId: string | null) => {
    const text = cleanSpoken(raw);
    if (text) out.push({ text, characterId });
  };
  for (const row of flat) {
    if (row.type === 'narration') {
      if (row.via === 'being') push(row.text, null);
    } else {
      for (const s of row.segments) {
        if (s.kind === 'speech') push(s.text, row.characterId);
        else if (s.kind === 'action') push(s.text, null);
      }
    }
  }
  return out;
}
