/**
 * THE ONE LINE A SILENCE EARNS (HW8 run 7, Mike 2026-10-27: "The nothing reached is really wrong for either view... the narration
 * cards shouldn't even appear for most of the 'nothing happened or nothing reached'").
 *
 * A being the GM's stretch did not reach gets NO scene line - its card stands alone. The single exception: the stretch held speech or
 * a sound ADDRESSED to that being (a quote that names them, or a knock at their door) and the reach judge said it did not carry:
 * then, and only then, one narrator sentence - "<Name> did not hear him." Pure.
 */
import { nameIsHers } from './name-addressed';

export interface UnheardUtterance { text: string; kind: string; speakerLabel?: string | null; speakerSex?: string | null; to?: string | null }

/** "<Name> did not hear him/her." or null when nothing addressed to the being went unheard. */
export function didNotHear(being: { id: string; name: string }, run: UnheardUtterance[], lineActorSex?: string | null): string | null {
  for (const u of run) {
    const addressed = u.kind === 'dialogue' && (u.to === being.id || nameIsHers(u.text, being.name));
    const knock = u.kind !== 'dialogue' && /\b(?:knocks?|knocking|raps?|pounds?|bangs?)\b[^.!?]{0,40}\b(?:door|wood)\b/i.test(u.text) && !nameIsHers(u.text, being.name);
    if (!addressed && !knock) continue;
    const sex = u.speakerSex ?? lineActorSex ?? null;
    const who = /^f/i.test(sex ?? '') ? 'her' : /^m/i.test(sex ?? '') ? 'him' : 'them';
    return `${being.name.split(/\s+/)[0]} did not hear ${who}.`;
  }
  return null;
}

// The model's own "nothing" lines - never on the page, whichever view reads it.
const NOTHING_RE = /\bnothing\b[^.!?]{0,60}\b(?:has|have)?\s*(?:changed|new|reached|stirs?|stirred|happened|moves?|moved)\b|\bnothing\b[^.!?]{0,40}\bhas\s+changed\b|\b(?:has|have)\s+(?:settled|fallen)\s+into\s+silence\b|\bsettled into silence\b|\bnothing\s+(?:new\s+)?(?:has\s+)?reached\b/i;
/** A scene without the sentences that say nothing changed / nothing reached the being. Pure. */
export function withoutNothingLines(scene: string, split: (s: string) => string[]): string {
  return split(scene).filter((s) => !NOTHING_RE.test(s)).join(' ');
}
