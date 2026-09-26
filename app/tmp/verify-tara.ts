import { prisma } from '../src/lib/db';

(async () => {
  const t = await prisma.character.findFirst({
    where: { name: 'Tara Almswood' },
    select: { id: true, data: true, godHead: { select: { domain: true, pillar: true, temperature: true, aiActionMode: true, systemPrompt: true } } },
  });
  if (!t) { console.log('not found'); await prisma.$disconnect(); return; }
  const d = JSON.parse(t.data);
  console.log('SEED:', d.creation?.seed?.name, '| FATE DIE:', d.creation?.seed?.baseFateDie);
  console.log('ROOT:', d.creation?.root?.name);
  console.log('TKV:', d.tkv, '| fatedAge:', d.fatedAge);
  console.log('Attributes (key): CLT', d.attributes.clout.level, '/ CON', d.attributes.constitution.level, '/ FRE', d.attributes.frequency.current + '/' + d.attributes.frequency.level, '/ WIL', d.attributes.willpower.level, '/ WIS', d.attributes.wisdom.current + '/' + d.attributes.wisdom.level);
  console.log('Skills:', d.skills.length, '— ≥d12:', d.skills.filter((s: any) => s.level >= 12).map((s: any) => s.name + ':' + s.level).join(', '));
  console.log('Nectars:', d.traits.filter((t: any) => t.type === 'nectar').length);
  console.log('Thorns:', d.traits.filter((t: any) => t.type === 'thorn').length);
  console.log('Blossoms:', d.traits.filter((t: any) => t.type === 'blossom').length);
  console.log('GRO.vines:', d.grovines.length);
  console.log('Inventory items:', d.inventory.items.length);
  console.log('---GodHead---');
  console.log('Domain:', t.godHead?.domain);
  console.log('Pillar:', t.godHead?.pillar, '| Temperature:', t.godHead?.temperature, '| aiActionMode:', t.godHead?.aiActionMode);
  console.log('SystemPrompt opens:', t.godHead?.systemPrompt?.slice(0, 80));
  await prisma.$disconnect();
})();
