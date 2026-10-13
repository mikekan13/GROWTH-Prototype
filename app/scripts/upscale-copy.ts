/**
 * AI upscale on our Qwen 2.1 lane: the image goes in as <image1> and the model is asked for an exact copy at a
 * larger output size. Qwen 2.1 copies a reference whose framing matches the output (13 Oct finding), so this adds
 * real painted detail instead of interpolation. BILLABLE (one serverless job, ~1-2 min at 2x).
 *   npx tsx scripts/upscale-copy.ts --in IMG --out OUT.png [--width 1664 --height 2496] [--seed 8]
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });
config({ path: '.env' });

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : def;
}

async function main() {
  const src = path.resolve(arg('in') as string);
  const out = path.resolve(arg('out') as string);
  const width = Number(arg('width', '1664')), height = Number(arg('height', '2496'));
  const seed = Number(arg('seed', '8'));
  await fs.mkdir(path.dirname(out), { recursive: true });
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const provider = new Qwen21Provider() as unknown as {
    uploadStyleRef(p: string, i: number): Promise<string>;
    runWorkflow(prompt: string, images: string[], seed: number, size?: { width: number; height: number }, loras?: unknown[]): Promise<Buffer>;
  };
  const name = await provider.uploadStyleRef(src, 0);
  const prompt = 'An exact copy of <image1> at a higher resolution: the same scene, composition, framing, colours, lighting and painted finish, every element in the same place, with finer detail and crisper edges.';
  const t0 = Date.now();
  const png = await provider.runWorkflow(prompt, [name], seed, { width, height }, []);
  await fs.writeFile(out, png);
  console.log(`ai copy ${width}x${height} in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
