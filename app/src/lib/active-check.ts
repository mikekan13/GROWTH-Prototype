/**
 * ACTIVE checks on the table (Mike 2026-10-26: popups "fire only on ACTIVE checks — deliberate inspection, search,
 * listen-closely, an attempt with a real chance of failure — never on passive reach").
 *
 * `detectActiveCheck` is the deterministic FLOOR: a small verb list over ONE act sentence. It does not fire on
 * passive noticing ("notices", "hears"), reading text in hand ("reads the note"), or ordinary acts (knocking,
 * walking). JEWL's pre-read may add a `check` kind on top; this floor stands without it.
 *
 * Also here, pure: which sheet skill (if any) the act names, the provisional governor for an unskilled check, and the
 * AI's Effort heuristic. Client-safe.
 */

export type ActiveCheckKind = 'inspect' | 'search' | 'listen' | 'attempt';
export interface ActiveCheck { kind: ActiveCheckKind; perceptual: boolean; match: string }

const INSPECT_RE = /\b(inspect(?:s|ed|ing)?|examin(?:e|es|ed|ing)|scrutini[sz](?:e|es|ed|ing)|investigat(?:e|es|ed|ing)|study|studies|studying|scan(?:s|ned|ning)?|(?:looks?|peers?|peeks?|squints?) (?:closely|carefully|intently|hard))\b/i;
const SEARCH_RE = /\b(search(?:es|ed|ing)?|rummag(?:e|es|ed|ing)|ransack(?:s|ed|ing)?|combs? through|goes? through|feels? (?:around|along|for))\b/i;
const LISTEN_RE = /\b(listens? (?:closely|carefully|intently|hard|for|at)|(?:presses|pressed|press) (?:an |her |his |their )?ear|strains? (?:to hear|her ears|his ears))\b/i;
const ATTEMPT_RE = /\b(?:tries|try|trying|tried|attempts?|attempted|attempting) to\b/i;
// Reading what is in hand, and the plainly passive, are never checks.
const NOT_ACTIVE_RE = /^\s*(?:\w+\s+)?(?:reads?|notices?|hears?|sees?|spots?|glances?|smells?)\b/i;

/** One act sentence → the active check it frames, or null. */
export function detectActiveCheck(text: string): ActiveCheck | null {
  const t = text.replace(/[*_]/g, '').trim();
  if (!t) return null;
  if (NOT_ACTIVE_RE.test(t) && !ATTEMPT_RE.test(t)) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(LISTEN_RE))) return { kind: 'listen', perceptual: true, match: m[0] };
  if ((m = t.match(SEARCH_RE))) return { kind: 'search', perceptual: true, match: m[0] };
  if ((m = t.match(INSPECT_RE))) return { kind: 'inspect', perceptual: true, match: m[0] };
  if ((m = t.match(ATTEMPT_RE))) return { kind: 'attempt', perceptual: false, match: m[0] };
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The sheet skill the act names ("with her lock-picking", "using Stealth"), else null → an unskilled check. */
export function namedSkill<S extends { name: string }>(text: string, skills: S[]): S | null {
  const t = ` ${norm(text)} `;
  let best: S | null = null;
  for (const s of skills) {
    const n = norm(s.name);
    if (n.length < 3) continue;
    if (t.includes(` ${n} `) && (!best || n.length > norm(best.name).length)) best = s;
  }
  return best;
}

/**
 * PROVISIONAL governor for an UNSKILLED check (canon names no map from act to attribute — [NEEDS MIKE]):
 * perceiving -> wisdom (as the inspection path already does); a small physical/agile/enduring keyword table;
 * everything else -> willpower (the skill-check route's own default).
 */
export function governorFor(text: string, check: ActiveCheck): string {
  if (check.perceptual) return 'wisdom';
  const t = text.toLowerCase();
  if (/\b(force|lift|push|pull|break|smash|climb|haul|pry|kick|shove|carry|heave|wrench)\b/.test(t)) return 'clout';
  if (/\b(sneak|slip|dodge|leap|jump|vault|catch|balance|dart|run|sprint|duck)\b/.test(t)) return 'celerity';
  if (/\b(endure|withstand|bear|hold (?:his|her|their) breath|swallow|stomach)\b/.test(t)) return 'constitution';
  if (/\b(work out|figure|solve|pick|unlock|disarm|decipher|puzzle)\b/.test(t)) return 'wit';
  return 'willpower';
}

export interface EffortPool { name: string; current: number }

/**
 * The AI's Effort choice (deterministic; no model call): aim for a total that just beats the DR on an average
 * Fate Die, spend no more than half of any one pool (the rest is the being's to keep), never past the sheet's
 * ceiling (`ceiling` = max useful effort), and spend nothing on a check the ceiling cannot win. Wagers per
 * governor, biggest pool first.
 */
export function aiEffort(args: { sd: number; fdMax: number; dr: number; pools: EffortPool[]; ceiling: number }): Array<{ governor: string; amount: number }> {
  const avgFd = Math.ceil((args.fdMax + 1) / 2);
  const need = Math.max(0, args.dr - args.sd - avgFd);
  if (need === 0) return [];
  const best = args.sd + args.fdMax + Math.max(0, args.ceiling);
  if (best < args.dr) return []; // cannot be won: do not burn the pool
  let left = Math.min(need, Math.max(0, args.ceiling));
  const out: Array<{ governor: string; amount: number }> = [];
  for (const p of [...args.pools].sort((a, b) => b.current - a.current)) {
    if (left <= 0) break;
    const give = Math.min(left, Math.floor(p.current / 2));
    if (give > 0) { out.push({ governor: p.name, amount: give }); left -= give; }
  }
  return out;
}
