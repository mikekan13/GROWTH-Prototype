/**
 * Dry run of the scene builder on the HW7 seed against the live world (one cloud call per build).
 * From app/: npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/build-scene-dry.ts
 */
import { prisma } from '@/lib/db';
import { parseTableProse } from '@/services/table-prose';
import { sceneFacts, buildScene, buildBeingCard } from '@/services/scene-builder';

const SEED = 'Kristopher stands on the fourth floor landing which only has one apartment. He thinks it is odd and his brain begins to race for meaning where perhaps none is. He wipes his eyes from the tears he was crying in the car. And he says the prayer in his head. "Lord Jesus Christ, Son of God, have mercy on me a sinner." He knocks on the door and a genuine smile flutters across his face.';
const MONOLOGUE = 'The salt stings. The smile is still there, a ghost of warmth against the cold tile. I wipe it away, leaving the mark of it on my skin. The hum of the light is a constant, low-frequency ache. I am just a man in a hallway, waiting for a door that might not open.';
const VIOLET_MONOLOGUE = 'The knock is a small, sharp thing against the silence, and I watch the dust settle in the gaps of the floorboards. My hand finds the deadbolt without my deciding it should. It is evening, and the light is already gone.';

async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { not: '__PRIME__' } }, select: { id: true, name: true } });
  const kris = await prisma.character.findFirst({ where: { name: 'Kristopher' }, select: { id: true, name: true, campaignId: true } });
  const violet = await prisma.character.findFirst({ where: { name: { contains: 'Violet' } }, select: { id: true, name: true } });
  const campaignId = kris!.campaignId!;
  console.log('campaign', camp?.name, campaignId);
  const roster = await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } });
  const parsed = parseTableProse(SEED, roster.map((r) => ({ id: r.id, name: r.name, sex: null })) as never);
  const seed = { full: parsed.full, narration: parsed.narration, actions: parsed.actions ?? [], thoughts: parsed.thoughts ?? [], quotes: parsed.quotes };
  console.log('\nSEED PARTS:', JSON.stringify({ narration: seed.narration, acts: seed.actions.map((a) => a.text), thoughts: seed.thoughts.map((t) => t.text) }, null, 1));
  const facts = await sceneFacts(campaignId, [kris!.id]);
  console.log('\nFACTS:'); for (const l of facts.lines) console.log('  ' + l.slice(0, 220));
  const built = await buildScene(campaignId, seed, new Map([[kris!.id, MONOLOGUE]]), facts);
  console.log('\nBUILT (' + built.source + ')');
  console.log('SCENE:', built.scene);
  for (const c of built.cards) { console.log(`CARD <${c.actorLabel}>`); for (const s of c.segments) console.log(`   ${s.kind}: ${s.text}\n      ← ${s.sentence}`); }
  const vfacts = await sceneFacts(campaignId, [violet!.id]);
  const card = await buildBeingCard(campaignId, { id: violet!.id, name: violet!.name }, 'Someone knocks on the door.', VIOLET_MONOLOGUE, vfacts);
  console.log('\nVIOLET SCENE:', card?.scene);
  for (const s of card?.segments ?? []) console.log(`   ${s.kind}: ${s.text}`);
}
main().finally(() => prisma.$disconnect());
