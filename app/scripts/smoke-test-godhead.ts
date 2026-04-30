/**
 * Phase 2C smoke test — invoke a god-head and verify the runtime works.
 *
 * Loads Tara, runs one invocation with a "review and report" trigger,
 * prints the result + every action log + token usage. With an empty DB
 * Tara will mostly find nothing to do, which still validates: tool
 * registration, Claude API plumbing, action logging, memory, token tracking.
 *
 * Run: npx tsx scripts/smoke-test-godhead.ts [name]
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { GodHeadAgent } from '../src/godhead/agent';

async function main() {
  const name = process.argv[2] || 'Lady Death';

  console.log(`\n═══ Phase 2C smoke test: ${name} ═══\n`);

  const agent = await GodHeadAgent.load(name);
  console.log(`✔ Loaded ${name}\n`);

  const trigger = {
    request: 'Review the campaign graph. Tell me which goals you would adopt and why. If you find nothing, report that plainly.',
  };

  console.log(`→ Invoking with trigger: ${JSON.stringify(trigger)}\n`);
  const start = Date.now();
  const result = await agent.invoke('manual.smoke_test', trigger);
  const ms = Date.now() - start;

  console.log(`\n═══ Result (${ms}ms) ═══`);
  console.log(`status:        ${result.status}`);
  console.log(`steps:         ${result.steps}`);
  console.log(`input tokens:  ${result.totalInputTokens}`);
  console.log(`output tokens: ${result.totalOutputTokens}`);
  if (result.error) console.log(`error: ${result.error}`);

  if (result.result) {
    console.log(`\n─── Final response ───`);
    console.log(result.result);
  }

  // Action log
  const actions = await prisma.godHeadActionLog.findMany({
    where: { invocationId: result.invocationId },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n─── Action log (${actions.length} calls) ───`);
  for (const a of actions) {
    const status = a.error ? `✗ ${a.error}` : '✔';
    console.log(`  ${status} ${a.toolName} (${a.durationMs ?? '?'}ms)`);
  }

  // Memory
  const memories = await prisma.godHeadMemory.findMany({
    where: { godHeadId: agent['identity'].id },
  });
  console.log(`\n─── Memory entries: ${memories.length} ───`);
  for (const m of memories) {
    console.log(`  ${m.key}: ${m.value.slice(0, 80)}${m.value.length > 80 ? '…' : ''}`);
  }

  // Cost estimate (Sonnet 4.6: $3/M in, $15/M out — adjust if model differs)
  const costEst = (result.totalInputTokens / 1_000_000) * 3 + (result.totalOutputTokens / 1_000_000) * 15;
  console.log(`\n─── Cost estimate (Sonnet pricing): $${costEst.toFixed(4)} ───\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
