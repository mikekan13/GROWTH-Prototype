import 'server-only';
import { prisma } from '@/lib/db';
import { firstSentence } from './traits-lane';

/** Ruling 13 (2026-11-05): traits from everything. What a being CAN DO and what ACTS ON it. */
export interface Capability {
  face: 'can' | 'is' | 'actsOn';
  source: 'nectar' | 'thorn' | 'blossom' | 'item' | 'inside' | 'spell' | 'condition';
  name: string;
  via?: string;
  line: string;
  aware: boolean;
}

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : {});
const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const tail = (d: string): string => { const s = firstSentence(d); return s ? `: ${s}` : ''; };

function abilitiesOf(data: unknown): Array<{ name: string; description: string }> {
  const a = rec(data).itemAbilities;
  if (!Array.isArray(a)) return [];
  return a.map((x) => ({ name: str(rec(x).name), description: str(rec(x).description) })).filter((x) => x.name);
}

export function capabilitiesFrom(input: {
  traits?: unknown; magic?: unknown; conditions?: unknown;
  held: Array<{ name: string; data: unknown }>;
  inside?: { name: string; data: unknown } | null;
}): Capability[] {
  const out: Capability[] = [];
  const seen = new Set<string>();
  const add = (c: Capability) => {
    const k = `${c.source}:${c.name}:${c.via ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  if (Array.isArray(input.traits)) {
    for (const t of input.traits) {
      const r = rec(t);
      const type = str(r.type).toLowerCase();
      const name = str(r.name);
      if (!name || (type !== 'nectar' && type !== 'thorn' && type !== 'blossom')) continue;
      const pillar = str(r.pillar);
      const hidden = r.hidden === true;
      add({
        face: hidden ? 'actsOn' : 'is', source: type, name, aware: !hidden,
        line: `${type.toUpperCase()} ${name}${pillar ? ` (${pillar})` : ''}${tail(str(r.description))}`,
      });
    }
  }

  for (const it of input.held ?? []) {
    const via = str(it?.name);
    for (const a of abilitiesOf(it?.data)) {
      add({ face: 'can', source: 'item', name: a.name, via, aware: true, line: `CAN ${a.name}${via ? ` (with the ${via})` : ''}${tail(a.description)}` });
    }
  }

  if (input.inside) {
    const via = str(input.inside.name);
    for (const a of abilitiesOf(input.inside.data)) {
      add({ face: 'can', source: 'inside', name: a.name, via, aware: true, line: `CAN ${a.name}${via ? ` (in the ${via})` : ''}${tail(a.description)}` });
    }
  }

  const magic = rec(input.magic);
  for (const school of ['mercy', 'severity', 'balance']) {
    const spells = rec(magic[school]).knownSpells;
    if (!Array.isArray(spells)) continue;
    for (const s of spells) {
      const name = typeof s === 'string' ? s.trim() : str(rec(s).name);
      if (!name) continue;
      const desc = typeof s === 'string' ? '' : str(rec(s).description);
      add({ face: 'can', source: 'spell', name, aware: true, line: `CAN cast ${name}${tail(desc)}` });
    }
  }

  for (const [name, v] of Object.entries(rec(input.conditions))) {
    if (v !== true) continue;
    add({ face: 'actsOn', source: 'condition', name, aware: true, line: `CONDITION ${name}: acts on them now` });
  }
  return out;
}

function parse(s: string | null | undefined): unknown {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

/** Everything that makes up a being's effective traits. Never throws. */
export async function capabilitiesOf(characterId: string): Promise<Capability[]> {
  try {
    const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
    if (!c) return [];
    const d = rec(parse(c.data));
    const heldRows = await prisma.campaignItem.findMany({ where: { holderId: characterId, status: 'ACTIVE' }, select: { name: true, data: true }, take: 100 });
    let inside: { name: string; data: unknown } | null = null;
    const edge = await prisma.entityRelationship.findFirst({ where: { sourceId: characterId, relationshipType: 'inside', targetType: 'CAMPAIGN_ITEM' }, select: { targetId: true } });
    if (edge) {
      const item = await prisma.campaignItem.findUnique({ where: { id: edge.targetId }, select: { name: true, data: true } });
      if (item) inside = { name: item.name, data: parse(item.data) };
    }
    return capabilitiesFrom({
      traits: d.traits, magic: d.magic, conditions: d.conditions,
      held: (heldRows ?? []).map((r) => ({ name: r.name, data: parse(r.data) })),
      inside,
    });
  } catch {
    return [];
  }
}

export function capabilityLines(caps: Capability[], face: Capability['face'] | 'aware' | 'unaware'): string[] {
  return caps
    .filter((c) => (face === 'aware' ? c.aware : face === 'unaware' ? !c.aware : c.face === face))
    .map((c) => c.line);
}
