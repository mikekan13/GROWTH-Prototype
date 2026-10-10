/**
 * Perceived-line text tokens (perception unit 9). A Trailblazer's feed line is
 * their character's memory rendered by services/visible-form; it travels in the
 * feed's existing payload text with two inline tokens:
 *
 *   {gap}          what was missed — the feed draws the rulebook gap/glitch bar
 *   {@id|label}    a named thing, as the viewer calls it; the tooltip reads the
 *                  line's `perceived.entities` (known aspects only)
 *
 * Pure, client-safe.
 */
/** The gap token — the same string services/visible-form writes (GAP_TOKEN). */
export const GAP = '{gap}';

export type PerceivedPiece =
  | { kind: 'text'; text: string }
  | { kind: 'gap' }
  | { kind: 'entity'; id: string; label: string };

const TOKEN_RE = /\{gap\}|\{@([A-Za-z0-9_-]+)\|([^}|]*)\}/g;

/** A label safe inside a token and inside the feed's segment marks. */
function cleanLabel(label: string): string {
  return label.replace(/[{}|"“”:*()]/g, '').trim() || 'something';
}

export function entityToken(id: string, label: string): string {
  return `{@${id.replace(/[^A-Za-z0-9_-]/g, '')}|${cleanLabel(label)}}`;
}

/** Does this text carry perceived-line tokens? */
export function hasPerceivedTokens(text: string): boolean {
  TOKEN_RE.lastIndex = 0;
  const hit = TOKEN_RE.test(text);
  TOKEN_RE.lastIndex = 0;
  return hit;
}

/** Text → pieces (text / gap / entity). Text without tokens is one text piece. */
export function splitPerceived(text: string): PerceivedPiece[] {
  const out: PerceivedPiece[] = [];
  let cursor = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > cursor) out.push({ kind: 'text', text: text.slice(cursor, at) });
    if (m[0] === GAP) out.push({ kind: 'gap' });
    else out.push({ kind: 'entity', id: m[1], label: m[2] });
    cursor = at + m[0].length;
  }
  if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor) });
  return out;
}

/** Tokens → readable text: labels inline, gaps kept as {gap} (the raw view draws them too). */
export function plainPerceived(text: string): string {
  return splitPerceived(text).map((p) => (p.kind === 'text' ? p.text : p.kind === 'gap' ? GAP : p.label)).join('');
}
