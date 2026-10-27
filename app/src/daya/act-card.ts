/**
 * AN ACT ANSWER IS A CARD ACT, AND THE WORLD'S CHANGE IS SAID (HW8 run 7, 2026-10-27).
 *
 * Violet's answer to his line was an ACT ("*I turn the deadbolt, … and then the knob.*"). It went up as a chat row with asterisks;
 * the page must carry it as an act on her card in the third person, and when the act changed a world fact (the door now open) the
 * page must SAY what the world did, derived from the change, never invented. Pure.
 */

const THIRD: Record<string, string> = { have: 'has', am: 'is', are: 'is', do: 'does', go: 'goes', was: 'was', were: 'was', can: 'can', could: 'could', will: 'will', would: 'would', must: 'must', should: 'should', may: 'may', might: 'might', 'don\'t': 'doesn\'t', 'didn\'t': 'didn\'t', 'can\'t': 'can\'t', 'won\'t': 'won\'t' };
function thirdPerson(verb: string): string {
  const v = verb.toLowerCase();
  if (THIRD[v]) return THIRD[v];
  if (/(?:s|sh|ch|x|z)$/.test(v)) return `${v}es`;
  if (/[^aeiou]y$/.test(v)) return `${v.slice(0, -1)}ies`;
  return `${v}s`;
}
const MODAL = new Set(['can', 'could', 'will', 'would', 'must', 'should', 'may', 'might', 'did', 'was', 'were', 'had']);

/**
 * "*I turn the deadbolt, the metal catching…, and then the knob.*" → "She turns the deadbolt, the metal catching…, and then the knob."
 * First-person singular goes to the actor's pronoun (a name opens the sentence when the text has no "I"); asterisks are stripped.
 */
export function actInThirdPerson(name: string, sex: string | null | undefined, text: string): string {
  let t = text.replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const female = /^f/i.test(sex ?? '');
  const male = /^m/i.test(sex ?? '');
  const subj = female ? 'she' : male ? 'he' : null;
  const poss = female ? 'her' : male ? 'his' : 'their';
  const obj = female ? 'her' : male ? 'him' : 'them';
  const refl = female ? 'herself' : male ? 'himself' : 'themselves';
  const hasI = /\bI\b|\bmy\b|\bme\b|\bmyself\b|\bI['’](?:m|ll|ve|d)\b/i.test(t);
  if (hasI) {
    t = t.replace(/\bI['’]m\b/g, `${subj ?? name}'s`).replace(/\bI['’]ll\b/g, `${subj ?? name}'ll`).replace(/\bI['’]ve\b/g, `${subj ?? name}'s`).replace(/\bI['’]d\b/g, `${subj ?? name}'d`);
    t = t.replace(/\bI\s+([A-Za-z']+)/g, (_m, verb: string) => `${subj ?? name} ${MODAL.has(verb.toLowerCase()) ? verb : thirdPerson(verb)}`);
    t = t.replace(/\bI\b/g, subj ?? name).replace(/\bmyself\b/gi, refl).replace(/\bmy\b/gi, poss).replace(/\bme\b/gi, obj);
  } else if (!new RegExp(`^(?:${name.split(/\s+/)[0]}|he|she|they|it)\b`, 'i').test(t)) {
    t = `${name.split(/\s+/)[0]} ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  }
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

const pretty = (s: string) => s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * What the world did, said once, from the report of the facts an act changed (`world-apply` `applied` lines):
 * `door "entry_door" → open` → "The entry door stands open." An already-so line says nothing; a hold or a hand-over is on the
 * act's own card already. Derived from the change, never invented. Pure.
 */
export function worldChangeSentences(applied: string[]): string[] {
  const out: string[] = [];
  for (const line of applied) {
    const door = /^door "([^"]+)" → (open|closed|locked)$/i.exec(line.trim());
    if (door) {
      const name = pretty(door[1]).replace(/^the\s+/i, '');
      const state = door[2].toLowerCase();
      out.push(`The ${name} ${state === 'open' ? 'stands open' : state === 'locked' ? 'is locked' : 'is shut'}.`);
      continue;
    }
    const put = /^"([^"]+)" put (?:in|into) (.+)$/i.exec(line.trim());
    if (put) { out.push(`The ${pretty(put[1]).replace(/^the\s+/i, '')} is in ${put[2]}.`); continue; }
    const hand = /^"([^"]+)" handed to (.+)$/i.exec(line.trim());
    if (hand) out.push(`The ${pretty(hand[1]).replace(/^the\s+/i, '')} passes to ${hand[2]}.`);
  }
  return [...new Set(out)];
}
