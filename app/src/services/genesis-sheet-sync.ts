/**
 * Genesis sheet sync (2026-10-12) — the character's legacy `creation` view is
 * written FROM her block links, so readers of creation.root / branches /
 * traits stop showing "Unknown" or nothing for a genesis-built character
 * (Violet was born with creation.root null and 0 traits although her
 * CharacterBlockLink rows carry a seed, a root, two branches and three thorns).
 *
 * The CharacterBlockLink rows are the truth (the story ledger of each block
 * instance, [[story-attachment-two-ledgers-2026-08-19]]); this only mirrors
 * names/descriptions/trait tags into the sheet JSON. It never applies
 * attribute or skill levels (the sheet stage's edit_character_sheet did that)
 * and never changes a block's mechanics.
 *
 * dedupeBlockLinks — one live link per archetype. A link is a duplicate when
 * it points at the same block (same forgeItemId — the unique key already
 * guards that) OR at a withdrawn/redrafted copy of the same archetype:
 * same type, same name once the redraft tag (" [w:xxxx]") is stripped. The
 * newest live link wins; links to superseded blocks lose to a live sibling.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import type { GrowthCharacter, GrowthTrait } from '@/types/growth';

/** A link row joined with its block, as sync + dedupe read it. */
export interface LinkWithBlock {
  id: string;
  forgeItemId: string;
  localName: string | null;
  story: string;
  ageAdded: number | null;
  createdAt: Date;
  block: { id: string; type: string; name: string; status: string; data: string };
}

/** "Grandparent Household [w:y0d7]" → "grandparent household". */
export function archetypeKey(type: string, name: string): string {
  return `${type}::${name.replace(/\s*\[w:[^\]]*\]\s*$/i, '').trim().toLowerCase()}`;
}

/** Which links to delete so one live link per archetype remains. Pure. */
export function pickDuplicateLinks(links: LinkWithBlock[]): string[] {
  const groups = new Map<string, LinkWithBlock[]>();
  for (const l of links) {
    const k = archetypeKey(l.block.type, l.block.name);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const drop: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      const liveA = a.block.status !== 'superseded' ? 1 : 0;
      const liveB = b.block.status !== 'superseded' ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    drop.push(...ranked.slice(1).map(l => l.id));
  }
  return drop;
}

async function loadLinks(characterId: string): Promise<LinkWithBlock[]> {
  const rows = await prisma.characterBlockLink.findMany({
    where: { characterId },
    orderBy: { createdAt: 'asc' },
  });
  if (!rows.length) return [];
  const blocks = await prisma.forgeItem.findMany({
    where: { id: { in: rows.map(r => r.forgeItemId) } },
    select: { id: true, type: true, name: true, status: true, data: true },
  });
  const byId = new Map(blocks.map(b => [b.id, b]));
  return rows.flatMap(r => {
    const block = byId.get(r.forgeItemId);
    return block ? [{
      id: r.id, forgeItemId: r.forgeItemId, localName: r.localName, story: r.story,
      ageAdded: r.ageAdded ?? null, createdAt: r.createdAt, block,
    }] : [];
  });
}

/** Delete duplicate block links for a character (keeps the newest live one per archetype). */
export async function dedupeBlockLinks(characterId: string): Promise<{ removed: string[] }> {
  const links = await loadLinks(characterId);
  const removed = pickDuplicateLinks(links);
  if (removed.length) await prisma.characterBlockLink.deleteMany({ where: { id: { in: removed } } });
  return { removed };
}

/** Live (non-superseded) links of a character, deduplicated in memory. */
export async function liveBlockLinks(characterId: string): Promise<LinkWithBlock[]> {
  const links = await loadLinks(characterId);
  const dup = new Set(pickDuplicateLinks(links));
  return links.filter(l => !dup.has(l.id) && l.block.status !== 'superseded');
}

function parse(data: string): Record<string, unknown> {
  try { return JSON.parse(data) as Record<string, unknown>; } catch { return {}; }
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const FATE_DICE = new Set(['d4', 'd6', 'd8', 'd12', 'd20']);

/**
 * The seed's own numbers win on the sheet (canvas audit of Violet,
 * 2026-10-12: sheet d6 vs Human seed d8; Frequency 1/1 vs seed 40). Pure.
 * Fate Die = the seed's baseFateDie. Frequency = the seed's starting pool,
 * as applyCreationGrants sets it (level = current = seed frequency); a pool
 * already spent below the old max keeps what is left (clamped to the new
 * max). Returns one line per correction made.
 */
export function applySeedToSheet(sheet: GrowthCharacter, seedData: Record<string, unknown>): { sheet: GrowthCharacter; corrections: string[] } {
  const next: GrowthCharacter = JSON.parse(JSON.stringify(sheet));
  const corrections: string[] = [];
  next.creation = next.creation ?? { seed: { baseFateDie: 'd6' } };
  next.creation.seed = next.creation.seed ?? { baseFateDie: 'd6' };
  const die = str(seedData.baseFateDie);
  if (FATE_DICE.has(die) && next.creation.seed.baseFateDie !== die) {
    corrections.push(`fate die ${next.creation.seed.baseFateDie ?? 'unset'} → ${die} (seed)`);
    next.creation.seed.baseFateDie = die as GrowthCharacter['creation']['seed']['baseFateDie'];
  }
  const freq = seedData.frequency;
  if (typeof freq === 'number' && freq >= 0) {
    const cur = next.attributes?.frequency ?? { level: 0, current: 0 };
    if (cur.level !== freq) {
      const wasFull = (cur.current ?? cur.level) >= cur.level;
      const current = wasFull ? freq : Math.min(cur.current ?? 0, freq);
      corrections.push(`frequency ${cur.current ?? cur.level}/${cur.level} → ${current}/${freq} (seed)`);
      next.attributes = { ...next.attributes, frequency: { ...cur, level: freq, current } };
    }
  }
  return { sheet: next, corrections };
}

/**
 * Mirror the block links into the sheet's creation view + traits. Pure.
 * Existing traits are kept; linked nectars/thorns/blossoms are added once
 * (by type + name). Root = the first linked root; branches in link order.
 */
export function applyLinksToSheet(sheet: GrowthCharacter, links: LinkWithBlock[]): GrowthCharacter {
  const next: GrowthCharacter = JSON.parse(JSON.stringify(sheet));
  next.creation = next.creation ?? { seed: { baseFateDie: 'd6' } };
  const seed = links.find(l => l.block.type === 'seed');
  if (seed) {
    const d = parse(seed.block.data);
    next.creation.seed = {
      ...next.creation.seed,
      name: seed.block.name,
      description: str(d.description) || next.creation.seed?.description,
      // The seed's die is applied (and the correction logged) by applySeedToSheet.
      baseFateDie: (next.creation.seed?.baseFateDie || str(d.baseFateDie) || 'd6') as GrowthCharacter['creation']['seed']['baseFateDie'],
    };
    next.creation.seedForgeItemId = next.creation.seedForgeItemId ?? seed.block.id;
    if (typeof d.fatedAge === 'number' && d.fatedAge > 0) {
      next.creation.fatedAge = next.creation.fatedAge ?? d.fatedAge;
      if (!next.fatedAge) next.fatedAge = d.fatedAge;
    }
  }
  const roots = links.filter(l => l.block.type === 'root');
  if (roots[0]) {
    next.creation.root = {
      name: roots[0].block.name,
      description: str(parse(roots[0].block.data).description),
      gmCreated: true,
    };
  }
  const branches = links.filter(l => l.block.type === 'branch');
  if (branches.length) {
    next.creation.branches = branches.map((b, i) => ({
      name: b.block.name,
      description: str(parse(b.block.data).description),
      gmCreated: true,
      order: i,
    }));
  }
  const traits = [...(next.traits ?? [])];
  const have = new Set(traits.map(t => `${t.type}::${t.name.toLowerCase()}`));
  for (const l of links) {
    const type = l.block.type;
    if (type !== 'nectar' && type !== 'thorn' && type !== 'blossom') continue;
    const key = `${type}::${l.block.name.toLowerCase()}`;
    if (have.has(key)) continue;
    have.add(key);
    const d = parse(l.block.data);
    const pillar = d.pillar === 'body' || d.pillar === 'soul' ? d.pillar : 'spirit';
    traits.push({
      name: l.block.name,
      type,
      pillar,
      category: 'utility',
      description: str(d.description),
      source: 'Genesis',
    } as unknown as GrowthTrait);
  }
  next.traits = traits;
  return next;
}

/** Write the character's creation view + traits from her live block links. */
export async function syncCreationFromBlockLinks(characterId: string): Promise<{ root: string | null; branches: number; traits: number; corrections: string[] }> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!character) throw new NotFoundError('Character not found');
  const links = await liveBlockLinks(characterId);
  const sheet = JSON.parse(character.data) as GrowthCharacter;
  let next = applyLinksToSheet(sheet, links);
  // The seed's Fate Die and Frequency pool win (repairs born characters too).
  const seed = links.find(l => l.block.type === 'seed');
  let corrections: string[] = [];
  if (seed) {
    const fixed = applySeedToSheet(next, parse(seed.block.data));
    next = fixed.sheet;
    corrections = fixed.corrections;
    if (corrections.length) {
      // eslint-disable-next-line no-console
      console.info(`[genesis-sheet-sync] ${characterId} corrected from seed "${seed.block.name}": ${corrections.join('; ')}`);
    }
  }
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(next) } });
  return { root: next.creation.root?.name ?? null, branches: next.creation.branches?.length ?? 0, traits: next.traits.length, corrections };
}
