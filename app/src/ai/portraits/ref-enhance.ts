/**
 * GFPGAN face-restoration helper for uploaded reference photos.
 *
 * Sends the local image to the pod, runs GFPGAN (clean face restoration with
 * 2x upscale, identity-preserving), and writes the enhanced version back to
 * disk as `<basename>_enhanced.png` next to the original. Idempotent.
 *
 * Used by:
 *   - The upload route (POST /api/references) — fires after each successful upload
 *   - The CLI script (scripts/enhance-character-refs.mjs) — bulk pre-enhance
 *
 * Pod prerequisites:
 *   - GFPGAN installed (pip install gfpgan basicsr facexlib + the basicsr torchvision patch)
 *   - GFPGANv1.4.pth at /workspace/models/gfpgan/
 *   - /workspace/scripts/enhance_ref.py (the wrapper)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const KEY = path.join(ROOT, '.ssh', 'runpod_growth');
const POD_INFO_SCRIPT = path.join(ROOT, 'scripts', 'pod-info-json.mjs');
const POD_EXEC_SCRIPT = path.join(ROOT, 'scripts', 'pod-exec.sh');

export interface EnhanceResult {
  /** Absolute path to the enhanced PNG, or null if enhancement skipped/failed. */
  enhanced: string | null;
  /** Error message if enhancement failed. Non-fatal — caller should fall back to original. */
  error?: string;
  /** True if a cached `_enhanced.png` was reused (no work done). */
  cached?: boolean;
}

export function enhancedPathFor(absOriginalPath: string): string {
  const dir = path.dirname(absOriginalPath);
  const base = path.basename(absOriginalPath, path.extname(absOriginalPath));
  return path.join(dir, `${base}_enhanced.png`);
}

function podInfo(): { ip: string; port: string } | null {
  try {
    const out = execSync(`node "${POD_INFO_SCRIPT}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const ip = out.match(/"publicIp"\s*:\s*"([^"]+)"/)?.[1];
    const port = out.match(/"22"\s*:\s*(\d+)/)?.[1];
    if (!ip || !port) return null;
    return { ip, port };
  } catch { return null; }
}

function scpUp(ip: string, port: string, localPath: string, remotePath: string): boolean {
  const r = spawnSync('scp', [
    '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
    '-P', port, localPath, `root@${ip}:${remotePath}`,
  ], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0;
}

function scpDown(ip: string, port: string, remotePath: string, localPath: string): boolean {
  const r = spawnSync('scp', [
    '-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
    '-P', port, `root@${ip}:${remotePath}`, localPath,
  ], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0;
}

function podExec(cmd: string): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('bash', [POD_EXEC_SCRIPT, cmd], { encoding: 'utf8', timeout: 120000 });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * Enhance a reference image via GFPGAN on the pod.
 * Returns immediately with `{ enhanced: <cachedPath>, cached: true }` if `_enhanced.png` already exists.
 * On any failure, returns `{ enhanced: null, error }` — the caller treats this as non-fatal
 * and the gen pipeline falls back to the original ref (sharp lanczos to 1024).
 */
export async function enhanceReference(absOriginalPath: string, opts?: { force?: boolean }): Promise<EnhanceResult> {
  const force = opts?.force === true;
  if (!fs.existsSync(absOriginalPath)) {
    return { enhanced: null, error: `Original not found: ${absOriginalPath}` };
  }
  const absEnhanced = enhancedPathFor(absOriginalPath);
  if (fs.existsSync(absEnhanced) && !force) {
    return { enhanced: absEnhanced, cached: true };
  }

  const pod = podInfo();
  if (!pod) return { enhanced: null, error: 'Pod not running or SSH port missing — skipping enhance' };

  const sha = crypto.createHash('sha256').update(fs.readFileSync(absOriginalPath)).digest('hex').slice(0, 12);
  const podIn = `/tmp/ref_${sha}_in${path.extname(absOriginalPath)}`;
  const podOut = `/tmp/ref_${sha}_enh.png`;

  if (!scpUp(pod.ip, pod.port, absOriginalPath, podIn)) {
    return { enhanced: null, error: 'scp upload failed' };
  }

  const r = podExec(`python3 /workspace/scripts/enhance_ref.py ${podIn} ${podOut} 2`);
  if (!r.ok) {
    podExec(`rm -f ${podIn}`);
    return { enhanced: null, error: `GFPGAN failed: ${(r.stderr || r.stdout).split('\n').slice(-2).join(' | ')}` };
  }

  if (!scpDown(pod.ip, pod.port, podOut, absEnhanced)) {
    podExec(`rm -f ${podIn} ${podOut}`);
    return { enhanced: null, error: 'scp download failed' };
  }

  podExec(`rm -f ${podIn} ${podOut}`);
  return { enhanced: absEnhanced, cached: false };
}
