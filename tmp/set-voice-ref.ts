/**
 * Point a character's data.voice at an existing speech-server ref (a recorded clip made by tts-server/make_ref.py).
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/set-voice-ref.ts <characterId> <refId> "<description>" "<transcript>"
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';

async function main() {
  const [characterId, ref, description, transcript] = process.argv.slice(2);
  if (!characterId || !ref) throw new Error('usage: set-voice-ref.ts <characterId> <refId> [description] [transcript]');
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { name: true, data: true } });
  if (!row) throw new Error('character not found');
  const data = JSON.parse(row.data ?? '{}');
  const prev = data.voice;
  data.voice = { engine: 'qwen', ref, description: description ?? 'A recorded reference clip.', transcript: transcript ?? '', recordedAt: new Date().toISOString(), ...(prev?.preset ? { preset: prev.preset } : {}), ...(prev?.fx ? { fx: prev.fx } : {}) };
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(data) } });
  console.log(`${row.name}: voice -> ref ${ref}${prev?.ref ? ` (was ${prev.ref})` : ''}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
