/**
 * COMPOSITE (Mike, 14 Oct, session wrap): put characters from the v1 set into a v1 scene — a multi-reference edit on
 * the v1 recipe (<image1> = the scene, <image2..N> = the characters; style LoRA + mid-generation ink).
 *
 *   cd app && npx tsx scripts/style-composite.ts [--seeds 2] [--out DIR]
 * Output: <out>/composite-seed-<s>.png + sheet.jpg. 2 jobs per seed.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const T = path.resolve('..', 'style-refs', 'training', 'v1');
const SCENE = path.join(T, 'v1-06-interior.png');
const CHARACTERS = [
  { file: path.join(T, 'v1-09-being.png'), who: 'the pale hairless figure in the pale silk tunic' },
  { file: path.join(T, 'v1-02-being.png'), who: 'the tall gaunt figure in the ragged grey wool robe with long braided black hair' },
  { file: path.join(T, 'v1-01-person.png'), who: 'the grey-haired woman in the high-collared dark leather coat' },
];
const SIZE = { width: 1248, height: 832 };

async function main() {
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { getCampaignMood } = await import('../src/ai/portraits/style-config');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const sIdx = process.argv.indexOf('--seeds');
  const nSeeds = sIdx > 0 ? Number(process.argv[sIdx + 1]) : 2;
  const outIdx = process.argv.indexOf('--out');
  const outDir = path.resolve(outIdx > 0 ? process.argv[outIdx + 1] : path.join('..', 'style-refs', 'lab', '2026-10-14-composite'));
  await fs.mkdir(outDir, { recursive: true });

  const images = [await fs.readFile(SCENE), ...(await Promise.all(CHARACTERS.map(c => fs.readFile(c.file))))];
  const tags = CHARACTERS.map((c, i) => `${c.who} from <image${i + 2}>`);
  const prompt =
    `<image1> is a cramped rock-cut workshop. Place three characters inside it, standing together between the benches under the hanging lamp: ` +
    `${tags.join(', ')}. Keep each one's exact face, build, clothing and colours from their own image. ` +
    `Full-length view of all three, the room, benches, jars and iron door exactly as in <image1>, lit by the hanging lamp's warm orange light and the green glow of the jars. ` +
    getCampaignMood('growth');

  const provider = new Qwen21Provider();
  const tiles: { image: Buffer; label: string }[] = [];
  for (let k = 0; k < nSeeds; k++) {
    const seed = 4242 + k;
    const t0 = Date.now();
    const r = await provider.renderStyled(prompt, seed, SIZE, { images });
    await fs.writeFile(path.join(outDir, `composite-seed-${seed}.png`), r.raw);
    tiles.push({ image: r.raw, label: `composite · seed ${seed}` });
    console.log(`  seed ${seed}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await fs.writeFile(path.join(outDir, 'prompt.txt'), prompt);
  await fs.writeFile(path.join(outDir, 'sheet.jpg'), await buildContactSheet([tiles], { tile: 620 }));
  console.log(`sheet → ${path.join(outDir, 'sheet.jpg')}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
