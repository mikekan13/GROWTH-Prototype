// Watch JEWL: print every CopilotMessage since a given time, with the tool
// calls it made (name, input, output or error) and the dispatch metadata.
//   npx tsx ../tmp/jewl-watch.ts [sinceISO|baseline] [maxChars]
// 'baseline' prints campaign/character ids and the last message time only.
import { prisma } from '../app/src/lib/db';

const arg = process.argv[2] ?? 'baseline';
const max = Number(process.argv[3] ?? 1200);
const cut = (s: unknown, n = max) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

(async () => {
  const p = prisma as any;
  if (arg === 'baseline') {
    const camps = await p.campaign.findMany({ select: { id: true, name: true, createdAt: true } });
    for (const c of camps) console.log('campaign', c.id, c.name);
    const chars = await p.character.findMany({ select: { id: true, name: true, campaignId: true } });
    for (const c of chars) console.log('character', c.id, c.name, c.campaignId);
    const last = await p.copilotMessage.findFirst({ orderBy: { createdAt: 'desc' } });
    console.log('last copilot message', last?.createdAt?.toISOString(), last?.role, cut(last?.content, 200));
    const sess = await p.gameSession.findMany({ orderBy: { startedAt: 'desc' }, take: 3 });
    for (const s of sess) console.log('gameSession', s.id, '#' + s.number, s.name ?? '', 'started', s.startedAt?.toISOString(), 'ended', s.endedAt?.toISOString?.() ?? 'OPEN');
    const work = await p.dayaWorkSession.findMany({ orderBy: { startedAt: 'desc' }, take: 3 });
    for (const w of work) console.log('workSession', w.id, w.status ?? '', 'stage', w.stage ?? '', 'mode', w.mode ?? '', 'cycles', w.cycleCount, 'started', w.startedAt?.toISOString(), 'ended', w.endedAt?.toISOString?.() ?? 'OPEN');
    process.exit(0);
  }
  const rows = await p.copilotMessage.findMany({ where: { createdAt: { gt: new Date(arg) } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) {
    console.log(`\n#### ${m.createdAt.toISOString()} ${m.role.toUpperCase()}${m.username ? ' (' + m.username + ')' : ''} class=${m.contentClass ?? '-'} id=${m.id}`);
    console.log(cut(m.content));
    if (m.actions) {
      try {
        const a = JSON.parse(m.actions);
        if (a.reasoning) console.log('  [reasoning]', cut(a.reasoning, 600));
        for (const tc of a.toolCalls ?? []) {
          console.log(`  -> ${tc.name}(${cut(JSON.stringify(tc.input), 500)})`);
          if (tc.error) console.log('     !! ERROR:', cut(tc.error, 600));
          else if (tc.output !== undefined) console.log('     <-', cut(typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output), 500));
        }
      } catch { console.log('  [actions unparsed]', cut(m.actions, 300)); }
    }
    if (m.metadata) console.log('  [meta]', cut(m.metadata, 300));
  }
  console.log(`\n(${rows.length} messages since ${arg})`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
