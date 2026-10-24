/**
 * The Watcher reads a silence (HW3 2026-10-24): prints the `being_thought`
 * records — what each being heard, what went through it, its impulse — for a
 * session, newest last. Not a feed; the audit record behind "did Violet
 * choose not to pay him?".
 *
 *   npx tsx scripts/being-thoughts.ts [campaignId] [--session <id>|--last] [--being Violet]
 *
 * Defaults: the newest campaign with any record, its newest session.
 */
import './_server-only-shim'; // MUST be first — neutralizes 'server-only' at import time
import { prisma } from '../src/lib/db';

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const campaignArg = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
  const beingFilter = flag('--being')?.toLowerCase();

  const latest = await prisma.campaignEvent.findFirst({ where: { type: 'being_thought', ...(campaignArg ? { campaignId: campaignArg } : {}) }, orderBy: { createdAt: 'desc' }, select: { campaignId: true, sessionId: true } });
  if (!latest) { console.log('No being_thought records yet.'); return; }
  const campaignId = campaignArg ?? latest.campaignId;
  const sessionId = flag('--session') ?? latest.sessionId;

  const rows = await prisma.campaignEvent.findMany({
    where: { campaignId, type: 'being_thought', ...(sessionId ? { sessionId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`campaign ${campaignId} · session ${sessionId ?? '(none)'} · ${rows.length} records\n`);
  for (const r of rows) {
    if (beingFilter && !(r.characterName ?? '').toLowerCase().includes(beingFilter)) continue;
    const p = JSON.parse(r.payload) as { heard: string; thought: string; impulse: string; cycle?: number };
    const t = r.createdAt.toISOString().slice(11, 19);
    console.log(`── ${t} · ${r.characterName} · impulse: ${p.impulse.toUpperCase()}${p.cycle !== undefined ? ` · cycle ${p.cycle.toFixed(6)}` : ''}`);
    console.log(`   heard:   ${p.heard.replace(/\s+/g, ' ').slice(0, 220)}`);
    console.log(`   thought: ${(p.thought || '(nothing kept)').replace(/\s+/g, ' ').slice(0, 600)}\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
