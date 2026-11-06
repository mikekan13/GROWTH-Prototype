/**
 * Designs a unique voice for each DAYA being (or the characters named on the command line).
 * Dry run prints the derived description; --apply calls the local TTS design endpoint and saves data.voice.
 *
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/design-voices.ts [--apply] [names...]
 *   (run from app/)
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { describeVoiceFromSheet, designVoiceForCharacter } from '../app/src/services/voice-design';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const names = args.filter(a => !a.startsWith('--'));
  const rows = await prisma.character.findMany({
    where: names.length ? { name: { in: names } } : { daya: { is: { status: 'ACTIVE' } } },
    select: { id: true, name: true, data: true },
  });
  if (!rows.length) { console.log('No characters matched.'); return; }
  for (const r of rows) {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(r.data ?? '{}'); } catch { /* bad JSON */ }
    console.log(`${r.name} (${r.id}): ${describeVoiceFromSheet({ id: r.id, name: r.name, data })}`);
    if (!apply) continue;
    try {
      const { spec } = await designVoiceForCharacter(r.id);
      console.log(`  -> ref ${spec.ref} (seed ${spec.seed})`);
    } catch (e) {
      console.log(`  !! ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!apply) console.log('\n(dry run - pass --apply to design and save)');
}

main().finally(() => prisma.$disconnect());
