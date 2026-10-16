/**
 * Stage briefs for the WORLD and MEMORIES genesis cycles (2026-10-16): what
 * JEWL has to see to build her life and remember it — her look, her budget,
 * what already stands, who her people are, which things already carry a
 * memory. Pure renderers + one loader each.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { PLACE_RELATIONS } from '@/lib/genesis-stages';
import { DEED_RELATIONSHIP } from './genesis-possessions';
import { lifeBudget } from './life-budget';
import type { DesignerLayer, DesignerState } from '@/lib/appearance-designer';

const MARK_KINDS = new Set(['scar', 'tattoo', 'piercing', 'birthmark', 'bodymod', 'makeup']);
const LOOK_KINDS = new Set([...MARK_KINDS, 'hair', 'build', 'underwear']);

export interface LookLine { kind: string; where: 'face' | 'body'; text: string; index: number }

/** "[genesis:item:x]" → "genesis:item:x". Pure. */
export function normalizeSourceKey(source: string): string {
  return source.trim().replace(/^\[|\]$/g, '');
}

/** The sentences of her approved look, marks first. Pure. */
export function lookLines(designer: Partial<DesignerState> | undefined): LookLine[] {
  const out: LookLine[] = [];
  const take = (layers: DesignerLayer[] | undefined, where: 'face' | 'body') => {
    (layers ?? []).forEach((l, i) => { if (LOOK_KINDS.has(l.kind)) out.push({ kind: l.kind, where, text: l.text, index: i }); });
  };
  take(designer?.layers, 'face');
  take(designer?.bodyLayers, 'body');
  return out.sort((a, b) => Number(MARK_KINDS.has(b.kind)) - Number(MARK_KINDS.has(a.kind)));
}

export interface WorldBriefInput {
  budgetLine: string;
  /** Cash + income already on the sheet ("$800 USD (checking) · $28,000 USD/yr — fiction author"). */
  wealth?: string[];
  look: LookLine[];
  items: Array<{ name: string; archetype: string | null; where: string | null; kv: number }>;
  places: Array<{ name: string; relation: string }>;
  people: Array<{ name: string; relation: string }>;
}

/** The WORLD cycle brief. Pure. */
export function renderWorldBrief(w: WorldBriefInput): string {
  const lines = ['HER WORLD SO FAR (build on it; never grant twice):', w.budgetLine];
  lines.push(w.wealth?.length ? `CASH + INCOME ON THE SHEET: ${w.wealth.join(' · ')}` : 'CASH + INCOME ON THE SHEET: none yet.');
  lines.push(w.look.length ? `HER LOOK (approved): ${w.look.map(l => `${l.kind}: ${l.text}`).join(' · ')}` : 'HER LOOK: approved at the designer (no marks).');
  lines.push(w.places.length ? `PLACES: ${w.places.map(p => `${p.name} (${p.relation})`).join(', ')}` : 'PLACES: none yet — seed her home first.');
  lines.push(w.items.length ? `THINGS (${w.items.length}): ${w.items.map(i => `${i.name}${i.archetype && i.archetype !== i.name ? ` [${i.archetype}]` : ''}${i.where ? ` @ ${i.where}` : ''} ${i.kv} KV`).join('; ')}` : 'THINGS: none yet.');
  lines.push(w.people.length ? `PEOPLE: ${w.people.map(p => `${p.name} (${p.relation})`).join(', ')}` : 'PEOPLE: none seeded yet.');
  return lines.join('\n');
}

export interface MemoriesBriefInput {
  items: Array<{ id: string; name: string; archetype: string | null; story: string | null; where: string | null; done: boolean }>;
  marks: Array<LookLine & { done: boolean }>;
  places: Array<{ id: string; name: string; relation: string; done: boolean }>;
  people: Array<{ id: string; name: string; relation: string; done: boolean }>;
}

/** The MEMORIES cycle brief: every thing built, with its memory key, and
 *  whether a memory already stands. Pure. */
export function renderMemoriesBrief(m: MemoriesBriefInput): string {
  const short = (s: string | null, n = 160) => (s ?? '').replace(/\s+/g, ' ').slice(0, n);
  const mark = (done: boolean) => (done ? '✓' : '○');
  const lines = ['WHAT WAS BUILT (one memory each; source = the key in brackets; ✓ = already remembered):'];
  lines.push(...m.items.map(i => `${mark(i.done)} [genesis:item:${i.id}] ${i.name}${i.archetype && i.archetype !== i.name ? ` (${i.archetype})` : ''}${i.where ? ` @ ${i.where}` : ''}${i.story ? ` — ${short(i.story)}` : ''}`));
  lines.push(...m.marks.map(k => `${mark(k.done)} [genesis:mark:${k.where}:${k.index}] ${k.kind}: ${k.text}`));
  lines.push(...m.places.map(p => `${mark(p.done)} [genesis:place:${p.id}] ${p.name} (${p.relation})`));
  lines.push(...m.people.map(p => `${mark(p.done)} [genesis:person:${p.id}] ${p.name} (${p.relation})`));
  const left = [...m.items, ...m.marks, ...m.places, ...m.people].filter(x => !x.done).length;
  lines.push(left ? `${left} still to remember.` : 'Everything built carries a memory — finish the stage.');
  return lines.join('\n');
}

async function loadHerWorld(characterId: string) {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { campaignId: true, data: true } });
  if (!c?.campaignId) return null;
  const campaignId = c.campaignId;
  const sheet = (() => { try { return JSON.parse(c.data) as { identity?: { designer?: Partial<DesignerState> }; wealth?: { holdings?: Array<{ amount: number; code: string; where?: string }>; income?: Array<{ amountPerYear: number; code: string; source: string }> } }; } catch { return {}; } })();
  const wealth = [
    ...(sheet.wealth?.holdings ?? []).map(h => `${h.amount} ${h.code} (${h.where ?? 'cash'})`),
    ...(sheet.wealth?.income ?? []).map(i => `${i.amountPerYear} ${i.code}/yr — ${i.source}`),
  ];
  const [deeds, placeEdges, seeds] = await Promise.all([
    prisma.entityRelationship.findMany({ where: { sourceId: characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' }, select: { targetId: true } }),
    prisma.entityRelationship.findMany({ where: { sourceId: characterId, targetType: 'LOCATION', relationshipType: { in: [...PLACE_RELATIONS] } }, select: { targetId: true, relationshipType: true } }),
    prisma.character.findMany({ where: { seededFromId: characterId }, select: { id: true, name: true } }),
  ]);
  const items = await prisma.campaignItem.findMany({
    where: { campaignId, status: 'ACTIVE', OR: [{ holderId: characterId }, { id: { in: deeds.map(d => d.targetId) } }] },
    select: { id: true, name: true, story: true, locationId: true, sourceForgeItemId: true },
  });
  const archIds = [...new Set(items.map(i => i.sourceForgeItemId).filter((x): x is string => !!x))];
  const archetypes = archIds.length ? await prisma.forgeItem.findMany({ where: { id: { in: archIds } }, select: { id: true, name: true, karmicValue: true } }) : [];
  const arch = new Map(archetypes.map(a => [a.id, a]));
  const locIds = [...new Set([...placeEdges.map(p => p.targetId), ...items.map(i => i.locationId).filter((x): x is string => !!x)])];
  const locations = locIds.length ? await prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }) : [];
  const locName = new Map(locations.map(l => [l.id, l.name]));
  const seedEdges = seeds.length
    ? await prisma.entityRelationship.findMany({ where: { sourceId: characterId, targetId: { in: seeds.map(s => s.id) } }, select: { targetId: true, data: true } })
    : [];
  const relationOf = (id: string) => {
    const e = seedEdges.find(x => x.targetId === id);
    try { return (JSON.parse(e?.data ?? '{}') as { relation?: string }).relation ?? 'named'; } catch { return 'named'; }
  };
  return {
    wealth,
    look: lookLines(sheet.identity?.designer),
    items: items.map(i => ({ id: i.id, name: i.name, archetype: i.sourceForgeItemId ? arch.get(i.sourceForgeItemId)?.name ?? null : null, kv: i.sourceForgeItemId ? Number(arch.get(i.sourceForgeItemId)?.karmicValue ?? 0) : 0, where: i.locationId ? locName.get(i.locationId) ?? null : null, story: i.story })),
    places: placeEdges.map(p => ({ id: p.targetId, name: locName.get(p.targetId) ?? p.targetId, relation: p.relationshipType })),
    people: seeds.map(s => ({ id: s.id, name: s.name, relation: relationOf(s.id) })),
  };
}

export async function buildWorldBrief(characterId: string): Promise<string | null> {
  const w = await loadHerWorld(characterId);
  if (!w) return null;
  const budget = await lifeBudget(characterId);
  return renderWorldBrief({ budgetLine: budget.line, wealth: w.wealth, look: w.look, items: w.items, places: w.places, people: w.people });
}

export async function buildMemoriesBrief(characterId: string): Promise<string | null> {
  const w = await loadHerWorld(characterId);
  if (!w) return null;
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
  const done = new Set<string>();
  if (entity) {
    // JEWL copies the key as the brief prints it — brackets included — so
    // both "genesis:item:x" and "[genesis:item:x]" count.
    const rows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id, source: { contains: 'genesis:' } }, select: { source: true } });
    rows.forEach(r => done.add(normalizeSourceKey(r.source)));
  }
  return renderMemoriesBrief({
    items: w.items.map(i => ({ id: i.id, name: i.name, archetype: i.archetype, story: i.story, where: i.where, done: done.has(`genesis:item:${i.id}`) })),
    marks: w.look.filter(l => MARK_KINDS.has(l.kind)).map(l => ({ ...l, done: done.has(`genesis:mark:${l.where}:${l.index}`) })),
    places: w.places.map(p => ({ ...p, done: done.has(`genesis:place:${p.id}`) })),
    people: w.people.map(p => ({ ...p, done: done.has(`genesis:person:${p.id}`) })),
  });
}
