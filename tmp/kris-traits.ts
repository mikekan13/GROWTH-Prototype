import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { capabilitiesFrom } from '../app/src/daya/capabilities';
const K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: K }, select: { data: true, name: true } });
  const d = JSON.parse(c.data ?? '{}');
  console.log('=== TRAITS ===');
  for (const t of (d.traits ?? [])) console.log(JSON.stringify(t));
  console.log('=== MAGIC ===', JSON.stringify(d.magic ?? null));
  console.log('=== CONDITIONS ===', JSON.stringify(d.conditions ?? null));
  console.log('=== OTHER KEYS ===', Object.keys(d).join(', '));
  const held = await prisma.campaignItem.findMany({ where: { holderId: K, status: 'ACTIVE' }, select: { id: true, name: true, data: true } });
  console.log('=== HELD ===');
  for (const h of held) { const hd = JSON.parse(h.data ?? '{}'); console.log(`- ${h.name} | abilities=${JSON.stringify(hd.itemAbilities ?? null)} | tags=${JSON.stringify(hd.tags ?? null)} | cond=${hd.condition} | type=${hd.itemType} | layer=${hd.layer ?? ''} slot=${hd.slot ?? hd.wornOn ?? ''}`); }
  const edge = await prisma.entityRelationship.findFirst({ where: { sourceId: K, relationshipType: 'inside' }, select: { targetId: true, targetType: true } });
  let inside: any = null;
  if (edge) { const it = await prisma.campaignItem.findUnique({ where: { id: edge.targetId }, select: { name: true, data: true } }); if (it) { inside = { name: it.name, data: JSON.parse(it.data ?? '{}') }; console.log('=== INSIDE ===', it.name, JSON.stringify((inside.data as any).itemAbilities ?? null)); } }
  const caps = capabilitiesFrom({ traits: d.traits, magic: d.magic, conditions: d.conditions, held: held.map(h => ({ name: h.name, data: JSON.parse(h.data ?? '{}') })), inside });
  console.log('=== CAPABILITIES (what the chooser/voice/adjudicator get) ===');
  for (const cp of caps) console.log(`[${cp.face}${cp.aware ? '' : ' HIDDEN'}] ${cp.line}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
