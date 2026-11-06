/**
 * Roll The Incubator back to the end of the phone call (before session 3, 2026-11-06 08:32Z): Michael, 03:30 local —
 * "roll back everything so Kristopher is in his car waiting for rain" (his opening line, which he will type again).
 *
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/rollback-session3.ts            (from app/)
 *
 * 1. snapshot the current world to tmp/gm/snapshot-<now>-pre-rollback.json (safety)
 * 2. remember every character's designed voice (data.voice) — the replay snapshot predates them
 * 3. restore-world.ts with the post-session-2 snapshot (snapshot-1793919527030.json), from = session 3 start
 * 4. write the voices back
 */
import '../app/scripts/_server-only-shim';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const SNAP = 'C:/Projects/GRO.WTH/tmp/gm/snapshot-1793919527030.json';
const FROM = process.argv[2] ?? '2026-11-06T08:30:00.000Z';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

async function main() {
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, name: true, data: true } });
  const edges = await p.entityRelationship.findMany({ where: { campaignId: C, relationshipType: { in: ['located_at', 'inside'] }, sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true, holderId: true, locationId: true, status: true, data: true, history: true } });
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } });
  const factIds = await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true, supersededById: true } });
  const pre = `C:/Projects/GRO.WTH/tmp/gm/snapshot-${Date.now()}-pre-rollback.json`;
  writeFileSync(pre, JSON.stringify({ chars: chars.map((c) => ({ id: c.id, data: c.data })), edges, items, cycle: camp.currentCycle, factIds }));
  console.log('pre-rollback snapshot', pre);

  const voices = new Map<string, unknown>();
  for (const c of chars) {
    try { const d = JSON.parse(c.data ?? '{}'); if (d && d.voice) voices.set(c.id, d.voice); } catch { /* bad json */ }
  }
  console.log('voices remembered', [...voices.keys()].map((id) => chars.find((c) => c.id === id)?.name).join(', ') || 'none');

  const evBefore = await prisma.campaignEvent.count({ where: { campaignId: C, createdAt: { gte: new Date(FROM) } } });
  execSync(`node --env-file=.env --env-file=.env.local --import tsx ../tmp/restore-world.ts "${SNAP}" ${FROM}`, { stdio: 'inherit', cwd: 'C:/Projects/GRO.WTH/app' });
  const evAfter = await prisma.campaignEvent.count({ where: { campaignId: C, createdAt: { gte: new Date(FROM) } } });
  const openSessions = await prisma.gameSession.count({ where: { campaignId: C, endedAt: null } });
  const sessions = await prisma.gameSession.count({ where: { campaignId: C } });

  for (const [id, voice] of voices) {
    const row = await prisma.character.findUnique({ where: { id }, select: { data: true } });
    if (!row) continue;
    const d = JSON.parse(row.data ?? '{}');
    d.voice = voice;
    await prisma.character.update({ where: { id }, data: { data: JSON.stringify(d) } });
  }
  const cycle = (await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } })).currentCycle;
  console.log(`events since ${FROM}: ${evBefore} -> ${evAfter}; sessions ${sessions} (open ${openSessions}); cycle ${cycle}; voices restored ${voices.size}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
