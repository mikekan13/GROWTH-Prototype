/**
 * One-shot: stamp canvasX/canvasY=0 on the already-created Vincent so the
 * page's canvas-eligibility filter starts including him. New characters
 * created via the create-NPC gesture do this automatically — this fixes
 * the test character that pre-dates the service fix.
 */
import { prisma } from '../src/lib/db';

async function main() {
  const v = await prisma.character.findFirst({
    where: { name: 'Vincent', campaign: { name: '__PRIME__' } },
    select: { id: true, data: true },
  });
  if (!v) {
    console.log('No Vincent found in __PRIME__. No-op.');
    return;
  }
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(v.data) as Record<string, unknown>; } catch { /* empty */ }
  parsed.canvasX = 0;
  parsed.canvasY = 0;
  await prisma.character.update({
    where: { id: v.id },
    data: { data: JSON.stringify(parsed) },
  });
  console.log(`Stamped canvas position on Vincent (${v.id})`);
}

main().catch(console.error).finally(() => process.exit(0));
