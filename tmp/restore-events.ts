/** Restore events from a scrub-phantom-*.json by createdAt prefix. node ... ../tmp/restore-events.ts <saved.json> <createdAtPrefix> [...more prefixes] */
import '../app/scripts/_server-only-shim';
import { readFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const GM = { userId: 'cmrep1oh300002g48ue1bn5rg', username: 'Mikekan13' };
const VIOLET = { id: 'cms60ndtn0000kw48ioq10i68', name: 'Violet' };
async function main() {
  const [file, ...prefixes] = process.argv.slice(2);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { events: Array<{ id: string; type: string; actor: string; payload: string; createdAt: string }> };
  const session = await prisma.gameSession.findFirst({ where: { campaignId: C, endedAt: null }, select: { id: true } });
  let n = 0;
  for (const e of saved.events) {
    if (!prefixes.some((p) => e.createdAt.startsWith(p))) continue;
    const isBeing = e.actor !== 'gm';
    await prisma.campaignEvent.create({ data: {
      id: e.id, campaignId: C, sessionId: session?.id ?? null, type: e.type, actor: e.actor,
      actorUserId: GM.userId, actorName: e.type === 'chat' ? VIOLET.name : GM.username,
      characterId: isBeing ? VIOLET.id : null, characterName: isBeing ? VIOLET.name : null,
      payload: e.payload, createdAt: new Date(e.createdAt),
    } });
    n++; console.log('restored', e.createdAt.slice(11, 19), e.type, e.actor);
  }
  console.log(`restored ${n}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
