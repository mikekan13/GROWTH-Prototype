/**
 * Run the BASE-LOCK GATE (src/ai/portraits/lock-gate.ts) on existing images.
 * LOCAL vision only (Ollama, LOCK_GATE_VISION_MODEL default qwen2.5vl:7b) — never cloud.
 *
 *   npx tsx scripts/lock-gate-check.ts <image> [<image> ...] [--timeout MS]
 *
 * --timeout raises the per-image limit (default 20 s) for a cold model load.
 */
import './_server-only-shim';
import fs from 'fs/promises';

async function main() {
  const { checkBaseLock, LOCK_GATE_TIMEOUT_MS } = await import('../src/ai/portraits/lock-gate');
  const ti = process.argv.indexOf('--timeout');
  const timeoutMs = ti > 0 ? Number(process.argv[ti + 1]) : LOCK_GATE_TIMEOUT_MS;
  const files = process.argv.slice(2).filter((a, i, all) => a !== '--timeout' && all[i - 1] !== '--timeout');
  if (files.length === 0) throw new Error('usage: lock-gate-check.ts <image> [...] [--timeout MS]');
  for (const f of files) {
    const t0 = Date.now();
    const v = await checkBaseLock(await fs.readFile(f), { timeoutMs });
    console.log(`${v.pass ? 'PASS' : 'FAIL'}  score ${v.score.toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${f}`);
    if (v.reasons.length) console.log(`      ${v.reasons.join('; ')}`);
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
