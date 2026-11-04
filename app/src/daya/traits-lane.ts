/**
 * THE TRAITS LANE (Michael, 2026-11-04: "For our third session testing I want to start including more GRO.WTH mechanics
 * like Nectar traits"). A being knows what it IS the way it knows what it holds: its Nectars (play-defining exploits, positive,
 * permanent), its Thorns (negative, permanent, liens) and its Blossoms (temporary) stand in the record every beat as standing
 * truths — they colour how a moment is read, they are never news and never a thought to announce. Canon:
 * GRO.WTH Repository/02_CHARACTER_CREATION/Nectars_and_Thorns_System.md (play-defining, easy to track; #needs-validation);
 * how a Nectar FIRES at the table is still [NEEDS MIKE] — nothing here fires one, it only puts them in the being's knowledge.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export interface TraitLine { kind: 'nectar' | 'thorn' | 'blossom'; name: string; pillar?: string; line: string }

/** First sentence of a description, bounded. Pure. */
export function firstSentence(text: string, max = 180): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  const s = (m ? m[1] : t).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** The lines the record carries, from a character's trait list. Pure. */
export function traitLinesFrom(traits: unknown): TraitLine[] {
  if (!Array.isArray(traits)) return [];
  const out: TraitLine[] = [];
  for (const t of traits as Array<Record<string, unknown>>) {
    const type = String(t?.type ?? '').toLowerCase();
    if (type !== 'nectar' && type !== 'thorn' && type !== 'blossom') continue;
    const name = String(t?.name ?? '').trim();
    if (!name) continue;
    const pillar = typeof t?.pillar === 'string' ? t.pillar : undefined;
    const desc = firstSentence(String(t?.description ?? ''));
    out.push({ kind: type, name, pillar, line: `${type.toUpperCase()} ${name}${pillar ? ` (${pillar})` : ''}${desc ? `: ${desc}` : ''}` });
  }
  return out;
}

/** The standing traits of a character, as record lines. Never throws. */
export async function traitLinesOf(characterId: string): Promise<string[]> {
  try {
    const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
    if (!c) return [];
    const d = JSON.parse(c.data) as { traits?: unknown };
    return traitLinesFrom(d.traits).map((t) => t.line);
  } catch { return []; }
}
