// Dry-run of the routine planner against the live world: no model calls, no writes.
import { prisma } from '@/lib/db';
import { routineWorldFor } from '@/services/routine-world';
import { nextStep, advanceCursor, endsInWordsFrom, parseEnds, triggerInCue, type RoutineWorld } from '@/daya/routines';

async function main() {
  const name = process.argv[2] ?? 'Violet';
  const cue = process.argv[3] ?? 'Kristopher knocks on the door.';
  const ch = await prisma.character.findFirst({ where: { name }, select: { id: true, name: true, campaignId: true } });
  if (!ch?.campaignId) throw new Error('no character');
  const world = await routineWorldFor(ch.campaignId, ch.id);
  if (!world) throw new Error('no world');
  console.log(`\n== ${ch.name} (${world.actor.sex}) in ${world.actor.roomName}`);
  for (const d of world.doors) console.log(`  door ${d.name}: ${d.state}${d.mine ? ' (lock under her hand)' : ''}${d.wayOut ? ' (the way out)' : ''} ${d.distanceFt ?? '?'} ft`);
  for (const p of world.people) console.log(`  person ${p.name}: ${p.roomName ?? '?'} reach=${p.reach}${p.doorBetween ? ` via ${p.doorBetween}` : ''}`);
  console.log(`  things: ${world.things.length} (held: ${world.things.filter((t) => t.holderId === ch.id).length})`);
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId: ch.id }, select: { id: true } });
  const rows = await prisma.dayaRoutine.findMany({ where: { entityId: entity!.id } });
  for (const r of rows) {
    const ends = parseEnds(JSON.parse(r.ends));
    const t = triggerInCue(JSON.parse(r.triggers), cue);
    console.log(`\n-- routine "${r.name}" [${r.status}] triggers=${r.triggers} → ${t ? `CALLED UP by "${t}"` : 'not called by this cue'}`);
    console.log('   ends: ' + endsInWordsFrom(ends, world, 0).join(' | '));
    if (!t) continue;
    // Walk the whole plan, simulating the world after each step; the cursor never goes back.
    let w: RoutineWorld = world;
    let cursor = 0;
    for (let i = 0; i < 10; i++) {
      cursor = advanceCursor(ends, w, cursor);
      const s = nextStep(ends, w, cursor);
      if (!s) { console.log(`   (done at cursor ${cursor})`); break; }
      console.log(`   step ${i + 1} [cursor ${cursor}]: ${s.act}  — ${s.because.join('; ')}`);
      const e = s.effect;
      const named = (n: string) => w.things.find((x) => x.name === n) ?? w.things.find((x) => n.toLowerCase().includes(x.name.toLowerCase()));
      if (e.op === 'move') w = { ...w, doors: w.doors.map((d) => (d.name === e.to ? { ...d, distanceFt: 1 } : d)), things: w.things.map((x) => (x.name === e.to ? { ...x, distanceFt: 1 } : x)) };
      else if (e.op === 'door') w = { ...w, doors: w.doors.map((d) => (d.name === e.door ? { ...d, state: e.state } : d)), people: w.people.map((p) => (p.doorBetween === e.door ? { ...p, reach: e.state === 'open' ? 'through-open' as const : 'beyond-door' as const } : p)) };
      else if (e.op === 'give') { const to = w.people.find((p) => p.name === e.to)?.id; w = { ...w, things: w.things.map((x) => (x.name === e.item ? { ...x, holderId: to ?? x.holderId } : x)) }; }
      else if (e.op === 'take') w = { ...w, things: w.things.map((x) => (x.name === e.item ? { ...x, holderId: w.actor.id } : x)) };
      else if (e.op === 'wait') { const thing = named(e.for); w = { ...w, things: w.things.map((x) => (thing && x.id === thing.id ? { ...x, holderId: w.actor.id } : x)) }; }
    }
  }
}
main().finally(() => prisma.$disconnect());
