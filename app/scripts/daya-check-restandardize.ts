/** Scratch: did the restandardize actually run? Last assistant message's
 * raw actions + spec presence per apartment location. */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const last = await prisma.copilotMessage.findFirst({
    where: { campaignId: CAMPAIGN, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, content: true, actions: true },
  });
  console.log('LAST ASSISTANT:', last?.createdAt.toISOString(), '|', last?.content.slice(0, 120));
  if (last?.actions) {
    try {
      const a = JSON.parse(last.actions) as { toolCalls?: Array<{ name: string; error?: string; output?: unknown }> };
      console.log('toolCalls:', a.toolCalls?.length ?? 0);
      for (const tc of a.toolCalls ?? []) {
        console.log(` - ${tc.name} ${tc.error ? 'ERROR: ' + String(tc.error).slice(0, 200) : 'output: ' + JSON.stringify(tc.output).slice(0, 120)}`);
      }
    } catch (e) {
      console.log('actions parse failed:', e, '| raw head:', last.actions.slice(0, 200));
    }
  } else {
    console.log('actions: NULL');
  }

  const locs = await prisma.location.findMany({
    where: { campaignId: CAMPAIGN },
    select: { name: true, data: true, updatedAt: true },
  });
  for (const l of locs) {
    const d = JSON.parse(l.data) as Record<string, unknown>;
    const spec = d.spec as Record<string, unknown> | undefined;
    console.log(
      `${l.name} | spec=${spec ? 'YES keys:' + Object.keys(spec).join(',') : 'NO'} | updated ${l.updatedAt.toISOString().slice(11, 19)}`,
    );
  }
  await prisma.$disconnect();
})();
