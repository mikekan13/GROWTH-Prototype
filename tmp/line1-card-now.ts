import { prisma } from '../app/src/lib/db';
import { characterCards } from '../app/src/services/table-prose';

async function main() {
  const evs = await prisma.campaignEvent.findMany({ where: { payload: { contains: '"eventType":"declaration"' } }, orderBy: { createdAt: "asc" }, select: { payload: true, createdAt: true } });
  const ev = evs[0];
  if (!ev) { console.log('no declaration'); return; }
  const p = JSON.parse(ev.payload) as { description: string; raw?: string; narration?: string | null; speech?: unknown[]; actions?: Array<{ actorLabel: string; text: string }>; thoughts?: Array<{ actorLabel: string; text: string; sentence?: string }> };
  console.log('AT', ev.createdAt.toISOString(), 'of', evs.length);
  console.log('RAW:', p.raw ?? p.description);
  console.log('NARRATION:', p.narration);
  console.log('ACTIONS:', JSON.stringify(p.actions));
  console.log('THOUGHTS:', JSON.stringify(p.thoughts));
  const cards = characterCards(p.description, { narration: p.narration ?? null, speech: (p.speech ?? []) as never, actions: (p.actions ?? []) as never, thoughts: (p.thoughts ?? []) as never });
  for (const c of cards) { console.log(`CARD <${c.label}>`); for (const s of c.segments) console.log(`   ${s.kind}: ${s.text}`); }
}
main().finally(() => prisma.$disconnect());
