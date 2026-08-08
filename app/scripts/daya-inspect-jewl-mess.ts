/** Scratch: inspect JEWL's recent tool activity in The Incubator — what
 * tools he called for "make Violet's room", what errored, what forge
 * proposals got created. */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const msgs = await prisma.copilotMessage.findMany({
    where: { campaignId: CAMPAIGN },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, role: true, username: true, content: true, actions: true, createdAt: true },
  });
  for (const m of msgs.reverse()) {
    const ts = m.createdAt.toISOString().slice(5, 19);
    console.log(`\n[${ts}] ${m.role}${m.username ? '/' + m.username : ''}: ${m.content.slice(0, 220).replace(/\n/g, ' | ')}`);
    if (m.role === 'assistant' && m.actions) {
      try {
        const a = JSON.parse(m.actions);
        for (const tc of a.toolCalls ?? []) {
          console.log(`   TOOL ${tc.name} input=${JSON.stringify(tc.input).slice(0, 180)}`);
          if (tc.error) console.log(`   ERROR: ${String(tc.error).slice(0, 300)}`);
          else console.log(`   output: ${JSON.stringify(tc.output).slice(0, 200)}`);
        }
      } catch { /* ignore */ }
    }
  }
  console.log('\n=== forge proposals (recent) ===');
  const names = ['forgeProposal', 'forgeBlueprint', 'blueprintProposal'];
  for (const n of names) {
    // @ts-expect-error dynamic model probe
    const model = prisma[n];
    if (model?.findMany) {
      const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
      for (const r of rows) console.log(n, JSON.stringify(r).slice(0, 300));
    }
  }
  await prisma.$disconnect();
})();
