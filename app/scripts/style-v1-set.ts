/**
 * V1 GROWTH STYLE — the running training set (Mike, 14 Oct 2026: "Calling this v1 growth style. Please do the honors of
 * generating 7 diverse images. Make them GRO.WTH worthy hit everything, objects, landscape, people, etc. This will be
 * the first 7 into our running training data").
 *
 * Each entry: a plain content prompt in the corpus voice (lighting written in, no style words, no lore names) +
 * the growth mood line, rendered text-to-image on the v1 recipe (style LoRA at its default strength, mid-generation
 * ink at QWEN21_LOCK_INK_AT) via Qwen21Provider.renderStyled. Deterministic seeds (corpusSeed of the id).
 *
 *   cd app && npx tsx scripts/style-v1-set.ts [--only id,id] [--out DIR]
 *
 * Output (default style-refs/training/v1/): <id>.png (final), <id>.txt ("grwthpaint, <plain caption>" — the training
 * caption, GROWTH-name-free), stages/<id>.soft.png + <id>.inked.png, manifest.json, sheet.jpg. Re-runs skip ids that
 * already have a png (delete to redo). BILLABLE: 2 jobs per image.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const PORTRAIT = { width: 832, height: 1040 } as const;
const LANDSCAPE = { width: 1248, height: 832 } as const;
const SQUARE = { width: 1024, height: 1024 } as const;

/**
 * The running set. Plain content, lighting stated, nothing that names GROWTH.
 *   reroll: bumps the seed (same prompt) — delete the png and rerun.
 *   bright: Mike (14 Oct: "they are all so gloomy") — daylight written into the prompt AND the mood's low-key /
 *           dark-ground clause dropped (the rest of the palette stays).
 */
export const V1_SET: { id: string; group: string; size: { width: number; height: number }; prompt: string; reroll?: number; bright?: boolean }[] = [
  { id: 'v1-01-person', group: 'people', size: PORTRAIT, reroll: 1,
    prompt: 'Head-and-shoulders view of a weathered woman in her fifties with cropped grey hair and a scar through one eyebrow, wearing a high-collared coat of dark oiled leather with a thin band of brushed steel at the throat, looking straight at the camera, in a narrow stone corridor lit by a single cold white strip light overhead.' },
  { id: 'v1-02-being', group: 'beings', size: PORTRAIT,
    prompt: 'Three-quarter view of a tall gaunt figure with ash-pale skin, long braided black hair and pupils that catch the light like a cat\'s, wearing a robe of layered grey wool stitched with fine copper wire, standing in a dim library of iron shelving lit by one amber lamp.' },
  { id: 'v1-03-creature', group: 'creatures', size: LANDSCAPE,
    prompt: 'A huge horned elk with moss growing along its back and antlers hung with small brass bells, standing at the edge of a black lake at dusk, its breath steaming, lit by a low violet sky and a thin line of white light on the far shore.' },
  { id: 'v1-04-item', group: 'items', size: SQUARE,
    prompt: 'A hand-sized device of blackened brass and milky glass, a compass-like dial with a slowly turning needle of blue light, resting on a folded map on a dark wooden table, lit by a warm candle on the left and a cold blue glow from the dial itself.' },
  { id: 'v1-05-landscape', group: 'scenes', size: LANDSCAPE,
    prompt: 'A valley of terraced ruins half-swallowed by pine forest, a single intact tower of white stone at its centre with a ring of pale light hovering above it, seen from a ridge at dawn with mist in the lower terraces, lit by grey-gold morning light from the left.' },
  { id: 'v1-06-interior', group: 'scenes', size: LANDSCAPE,
    prompt: 'The inside of a cramped workshop carved into rock, benches crowded with clockwork parts, glass jars of glowing green fluid and coils of copper wire, a heavy iron door standing open on the right, lit by a hanging lamp of warm orange light and the green glow of the jars.' },
  { id: 'v1-07-group', group: 'groups', size: LANDSCAPE,
    prompt: 'Full-length view of four travellers crossing a rope bridge above a gorge in driving rain, cloaks whipping, the leader carrying a lantern on a pole, the last one looking back over a shoulder, lit by the lantern\'s yellow light and a flash of lightning behind the cliffs.' },
  // --- the bright seven ---
  { id: 'v1-08-person', group: 'people', size: PORTRAIT, bright: true, reroll: 1, // Mike: "flopped completely" (seed 1544136507)
    prompt: 'Head-and-shoulders view of a young man with sun-bleached curly hair, freckles and a chipped front tooth, wearing a white linen shirt open at the collar and a thin cord necklace with a glass bead, grinning at the camera, on a white-plastered rooftop under a clear noon sky, lit by bright direct sunlight from above with the sky bouncing blue into the shadows.' },
  { id: 'v1-09-being', group: 'beings', size: PORTRAIT, bright: true, reroll: 1, // Mike: "flopped completely" (seed 1781312654)
    prompt: 'Three-quarter view of a slender figure with faintly iridescent pearl-coloured skin, close-cropped silver hair and large calm grey eyes, wearing a sleeveless tunic of pale green silk, standing among tall ferns inside a glass greenhouse flooded with soft morning sunlight from the left.' },
  { id: 'v1-10-creature', group: 'creatures', size: LANDSCAPE, bright: true,
    prompt: 'A white fox-like animal with six legs and a long plumed tail standing alert on a snowfield, its fur glittering, under a cloudless deep-blue sky with distant white mountains, lit by hard bright sunlight from the right casting a crisp blue shadow.' },
  { id: 'v1-11-item', group: 'items', size: SQUARE, bright: true,
    prompt: 'A slim silver flask engraved with fine lines that glow a soft teal, standing on a sunlit stone windowsill beside a sprig of rosemary, white curtains stirring behind it, lit by warm late-morning sunlight pouring through the open window.' },
  { id: 'v1-12-landscape', group: 'scenes', size: LANDSCAPE, bright: true,
    prompt: 'A coastal city of pale limestone terraces and slender glass towers stepping down to a turquoise harbour, white sails on the water and seabirds overhead, seen from the sea wall at midday under a clear sky, lit by bright even sunlight with the water throwing sparkle onto the walls.' },
  { id: 'v1-13-market', group: 'scenes', size: LANDSCAPE, bright: true,
    prompt: 'An open-air market in a wide stone square at noon, striped awnings in red, saffron and teal, stalls of fruit, bolts of cloth and brass lamps, people haggling and children weaving between the stalls, lit by hard high sunlight with bright bounce from the pale flagstones.' },
  { id: 'v1-14-group', group: 'groups', size: LANDSCAPE, bright: true,
    prompt: 'Full-length view of three children running through a meadow of tall yellow grass toward a landed silver craft shaped like a seed pod, one child holding a kite, their shadows long on the grass, lit by bright golden late-afternoon sunlight from behind the camera under a clear sky.' },
];

/** The growth mood with its low-key / dark-ground clause removed (bright entries). */
function brightMood(mood: string): string {
  return mood
    .replace(/,?\s*low-key lighting with one side falling into deep, somber shadow,?\s*a dark moody ground behind,?\s*and a cold teal undertone in the shadows,?/i, ',')
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/:\s*,/g, ':').replace(/\s{2,}/g, ' ');
}

function plainCaption(p: string): string {
  const s = p.trim().replace(/[.\s]+$/, '');
  return s.charAt(0).toLowerCase() + s.slice(1);
}

async function main() {
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { getCampaignMood } = await import('../src/ai/portraits/style-config');
  const { corpusSeed } = await import('../src/ai/portraits/corpus-prompts');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const { formatQwen21Loras, qwen21LorasFromEnv, qwen21LockInkAtFromEnv, GROWTH_STYLE_LORA_TRIGGER } = await import('../src/ai/portraits/qwen21-workflow');

  const argIdx = process.argv.indexOf('--only');
  const only = argIdx > 0 ? new Set(process.argv[argIdx + 1].split(',')) : null;
  const outIdx = process.argv.indexOf('--out');
  const outDir = path.resolve(outIdx > 0 ? process.argv[outIdx + 1] : path.join('..', 'style-refs', 'training', 'v1'));
  await fs.mkdir(path.join(outDir, 'stages'), { recursive: true });

  const provider = new Qwen21Provider();
  const loras = qwen21LorasFromEnv();
  const inkAt = qwen21LockInkAtFromEnv();
  const mood = getCampaignMood('growth');
  console.log(`v1 set → ${outDir}  loras=${formatQwen21Loras(loras) || 'none'}  inkAt=${inkAt}`);

  const manifest: Record<string, unknown>[] = [];
  const tiles: { image: Buffer; label: string }[] = [];
  for (const e of V1_SET) {
    if (only && !only.has(e.id)) continue;
    const png = path.join(outDir, `${e.id}.png`);
    const seed = corpusSeed(e.reroll ? `${e.id}#${e.reroll}` : e.id);
    const prompt = `${e.prompt} ${e.bright ? brightMood(mood) : mood}`;
    const caption = `${GROWTH_STYLE_LORA_TRIGGER}, ${plainCaption(e.prompt)}`;
    let image: Buffer;
    try {
      image = await fs.readFile(png);
      console.log(`  ${e.id}: exists, skipped`);
    } catch {
      const t0 = Date.now();
      const r = await provider.renderStyled(prompt, seed, e.size);
      image = r.raw;
      await fs.writeFile(png, image);
      if (r.soft) await fs.writeFile(path.join(outDir, 'stages', `${e.id}.soft.png`), r.soft);
      if (r.inked) await fs.writeFile(path.join(outDir, 'stages', `${e.id}.inked.png`), r.inked);
      console.log(`  ${e.id}: ${e.size.width}x${e.size.height} seed ${seed}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    await fs.writeFile(path.join(outDir, `${e.id}.txt`), caption);
    manifest.push({ id: e.id, group: e.group, seed, size: e.size, prompt, caption, loras: formatQwen21Loras(loras) || null, inkAt, bright: !!e.bright, reroll: e.reroll ?? 0 });
    tiles.push({ image, label: `${e.id} · seed ${seed}${e.bright ? ' · bright' : ''}` });
  }
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ style: 'growth-v1', date: new Date().toISOString(), entries: manifest }, null, 2));
  const rows: typeof tiles[] = [];
  for (let i = 0; i < tiles.length; i += 4) rows.push(tiles.slice(i, i + 4));
  await fs.writeFile(path.join(outDir, 'sheet.jpg'), await buildContactSheet(rows, { tile: 400 }));
  console.log(`sheet → ${path.join(outDir, 'sheet.jpg')}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
