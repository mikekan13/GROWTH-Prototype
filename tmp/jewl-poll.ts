// Live poller: one stdout line per new CopilotMessage (for a Monitor).
//   npx tsx ../tmp/jewl-poll.ts <sinceISO>
import { prisma } from '../app/src/lib/db';

let since = new Date(process.argv[2] ?? Date.now());
const cut = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

async function tick() {
  const p = prisma as any;
  const rows = await p.copilotMessage.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) {
    since = m.createdAt;
    let tools = '';
    if (m.actions) {
      try {
        const a = JSON.parse(m.actions);
        tools = (a.toolCalls ?? []).map((t: any) => t.name + (t.error ? '!!ERR' : '')).join(',');
      } catch { tools = '?'; }
    }
    console.log(`JEWL ${m.createdAt.toISOString()} ${m.role}${m.username ? '(' + m.username + ')' : ''} [${m.contentClass ?? '-'}] ${tools ? 'tools=' + tools + ' ' : ''}| ${cut(m.content, 220)}`);
  }
}

(async () => {
  for (;;) {
    try { await tick(); } catch (e: any) { console.log('POLL-ERR', cut(e.message, 200)); }
    await new Promise(r => setTimeout(r, 4000));
  }
})();
