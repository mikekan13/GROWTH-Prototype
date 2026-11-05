/** Live tail of the table: new events, canon lines, copilot messages, session state. Usage: npx tsx ... watch-table.ts [--once] */
import { prisma } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const once = process.argv.includes('--once');
const sinceArg = process.argv.find((a) => a.startsWith('--since='));
let since = sinceArg ? new Date(sinceArg.slice(8)) : new Date(Date.now() - 60 * 60 * 1000);
const p = prisma as any;
const short = (s: unknown, n = 220) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
async function tick() {
  const now = new Date();
  const [events, canon, copilot, sessions] = await Promise.all([
    prisma.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gt: since } }, orderBy: { createdAt: 'asc' } }),
    p.canonEvent.findMany({ where: { campaignId: CAMP, createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, cycle: true, narration: true } }),
    p.copilotMessage.findMany({ where: { campaignId: CAMP, createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, role: true, content: true, actions: true } }),
    p.gameSession.findMany({ where: { campaignId: CAMP }, select: { id: true, number: true, name: true, startedAt: true, endedAt: true } }),
  ]);
  for (const e of events) { let pl: any = {}; try { pl = JSON.parse(e.payload ?? '{}'); } catch {} console.log(`${e.createdAt.toISOString().slice(11, 19)} EVENT ${e.type} ${e.actorName ?? e.actor ?? ''}${e.characterName ? ' as ' + e.characterName : ''}: ${short(pl.text ?? pl.message ?? pl.content ?? pl.summary ?? JSON.stringify(pl), 260)}`); }
  for (const c of canon) console.log(`${new Date(c.createdAt).toISOString().slice(11, 19)} CANON @${Number(c.cycle).toFixed(4)}: ${short(c.narration, 300)}`);
  for (const m of copilot) { let acts = ''; try { const a = JSON.parse(m.actions ?? '[]'); if (Array.isArray(a) && a.length) acts = ' [tools: ' + a.map((x: any) => x.name ?? x.tool ?? '?').join(',') + ']'; } catch {} console.log(`${new Date(m.createdAt).toISOString().slice(11, 19)} JEWL ${m.role}${acts}: ${short(m.content, 260)}`); }
  if (once || events.length || canon.length || copilot.length) console.log(`-- ${now.toISOString().slice(11, 19)} sessions: ${sessions.map((s: any) => `#${s.number} ${String(s.startedAt).slice(11, 19)}${s.endedAt ? '→' + String(s.endedAt).slice(11, 19) : ''}`).join(' | ') || 'none'}`);
  since = now;
}
(async () => {
  await tick();
  if (once) process.exit(0);
  setInterval(() => tick().catch((e) => console.log('tick failed', e.message)), 8000);
})();
