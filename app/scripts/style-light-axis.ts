/**
 * LIGHT AXIS TEST (Mike, 14 Oct 2026): "If something is darker and more gritty is it more real and if it is brighter
 * more magical does it go more painty. If so that is a bug in the lora that is actually a hidden gem."
 * Same subject, same seed, the v1 recipe (style LoRA + mid-generation ink); only the LIGHT moves across five steps,
 * gritty-dark → bright-magical. Grid: rows = subjects, columns = the axis.
 *
 *   cd app && npx tsx scripts/style-light-axis.ts [--out DIR]
 * Output: <out>/<subject>-<step>.png + sheet.jpg + manifest.json. BILLABLE: 2 jobs per image (15 images).
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const PORTRAIT = { width: 832, height: 1040 } as const;
const LANDSCAPE = { width: 1248, height: 832 } as const;

/** Subject = everything but the light. `{light}` is where the step's lighting sentence goes. */
const SUBJECTS = [
  { id: 'person', size: PORTRAIT, seed: 818013386,
    text: 'Head-and-shoulders view of a weathered woman in her fifties with cropped grey hair and a scar through one eyebrow, wearing a high-collared coat of dark oiled leather with a thin band of brushed steel at the throat, looking straight at the camera, in a narrow stone corridor, {light}.' },
  { id: 'creature', size: LANDSCAPE, seed: 662655096,
    text: 'A huge horned elk with moss growing along its back and antlers hung with small brass bells, standing at the edge of a lake, its breath steaming, {light}.' },
  { id: 'market', size: LANDSCAPE, seed: 1070472458,
    text: 'An open-air market in a wide stone square, striped awnings in red, saffron and teal, stalls of fruit, bolts of cloth and brass lamps, people haggling and children weaving between the stalls, {light}.' },
];

/** The axis. `lowKey` keeps the mood's "low-key … dark moody ground" clause; false drops it. */
const STEPS = [
  { id: '1-gritty', lowKey: true, light: 'in near darkness, grime and wet grit on every surface, lit by a single harsh cold light from one side with everything else falling into black' },
  { id: '2-dark', lowKey: true, light: 'at dusk, lit by one dim amber lamp with deep soft shadows' },
  { id: '3-neutral', lowKey: false, light: 'under a flat overcast sky, lit by even grey daylight' },
  { id: '4-bright', lowKey: false, light: 'under a clear sky, lit by bright direct sunlight with blue sky bouncing into the shadows' },
  { id: '5-magical', lowKey: false, light: 'flooded with brilliant golden light, drifting motes of light in the air and a soft glow on every edge, lit as if by a sun just out of frame' },
];

function moodFor(mood: string, lowKey: boolean): string {
  if (lowKey) return mood;
  return mood
    .replace(/,?\s*low-key lighting with one side falling into deep, somber shadow,?\s*a dark moody ground behind,?\s*and a cold teal undertone in the shadows,?/i, ',')
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/:\s*,/g, ':').replace(/\s{2,}/g, ' ');
}

async function main() {
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { getCampaignMood } = await import('../src/ai/portraits/style-config');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const { formatQwen21Loras, qwen21LorasFromEnv, qwen21LockInkAtFromEnv } = await import('../src/ai/portraits/qwen21-workflow');

  const outIdx = process.argv.indexOf('--out');
  const outDir = path.resolve(outIdx > 0 ? process.argv[outIdx + 1] : path.join('..', 'style-refs', 'lab', '2026-10-14-light-axis'));
  await fs.mkdir(outDir, { recursive: true });
  const provider = new Qwen21Provider();
  const mood = getCampaignMood('growth');
  console.log(`light axis → ${outDir}  loras=${formatQwen21Loras(qwen21LorasFromEnv()) || 'none'}  inkAt=${qwen21LockInkAtFromEnv()}`);

  const manifest: Record<string, unknown>[] = [];
  const rows: { image: Buffer; label: string }[][] = [];
  for (const s of SUBJECTS) {
    const row: { image: Buffer; label: string }[] = [];
    for (const st of STEPS) {
      const file = path.join(outDir, `${s.id}-${st.id}.png`);
      const prompt = `${s.text.replace('{light}', st.light)} ${moodFor(mood, st.lowKey)}`;
      let image: Buffer;
      try { image = await fs.readFile(file); console.log(`  ${s.id} ${st.id}: exists`); }
      catch {
        const t0 = Date.now();
        image = (await provider.renderStyled(prompt, s.seed, s.size)).raw;
        await fs.writeFile(file, image);
        console.log(`  ${s.id} ${st.id}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
      manifest.push({ subject: s.id, step: st.id, seed: s.seed, lowKey: st.lowKey, prompt });
      row.push({ image, label: `${s.id} · ${st.id}` });
    }
    rows.push(row);
  }
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(outDir, 'sheet.jpg'), await buildContactSheet(rows, { tile: 380 }));
  console.log(`sheet → ${path.join(outDir, 'sheet.jpg')}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
