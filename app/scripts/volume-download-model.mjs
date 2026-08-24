/**
 * volume-download-model — pull a HuggingFace repo onto the RunPod network
 * volume via a SELF-DELETING temp pod, with progress observable on the
 * volume itself (`models/_download-<name>.log`).
 *
 *   node scripts/volume-download-model.mjs <hf-repo> <dest-dir-name> [--dry]
 *   e.g. node scripts/volume-download-model.mjs huihui-ai/Huihui-Qwen3.8-27B-abliterated qwen38-27b-abliterated
 *
 * Costs GPU-time while running (US-NE-1 rarely has cheap cards; expect
 * H100 @$3.29/hr — a 55GB download should be <$1.50). The pod deletes
 * itself when the job ends, success OR failure. Lessons encoded from
 * 2026-08-23: python:3.11-slim crash-looped silently (0% CPU) — use the
 * runpod/pytorch image (bash/curl/git guaranteed), and tee everything to
 * the volume log so failures are diagnosable without SSH.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(path.join(here, '..', '.env.local'), 'utf8');
const KEY = envFile.match(/^RUNPOD_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error('RUNPOD_API_KEY not found in app/.env.local');

const [repo, dest] = process.argv.slice(2);
if (!repo || !dest) {
  console.error('usage: node scripts/volume-download-model.mjs <hf-repo> <dest-dir-name> [--dry]');
  process.exit(1);
}
const dry = process.argv.includes('--dry');
const VOLUME_ID = 'o5y6of5tje';

const script = [
  `LOG=/workspace/models/_download-${dest}.log`,
  'mkdir -p /workspace/models',
  'exec > >(tee -a "$LOG") 2>&1',
  'echo "=== download start $(date -u) ==="',
  'df -h /workspace',
  'pip install -q "huggingface_hub[hf_transfer]" hf_transfer',
  'export HF_HUB_ENABLE_HF_TRANSFER=1 HF_XET_DISABLE=1 HF_HUB_DISABLE_XET=1',
  `python -u -c "from huggingface_hub import snapshot_download; snapshot_download('${repo}', local_dir='/workspace/models/${dest}', max_workers=8)"`,
  `RC=$?; echo "=== exit code $RC $(date -u) ==="`,
  `[ $RC -eq 0 ] && touch /workspace/models/${dest}/.download-complete`,
  'df -h /workspace',
  // self-delete regardless of outcome — never idle at cost
  `curl -s -X DELETE -H "Authorization: Bearer ${KEY}" https://rest.runpod.io/v1/pods/$RUNPOD_POD_ID`,
].join('\n');

const body = {
  name: `growth-dl-${dest}-TEMP`,
  imageName: 'runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04',
  cloudType: 'SECURE',
  gpuCount: 1,
  gpuTypeIds: [
    'NVIDIA A100 80GB PCIe', 'NVIDIA A100-SXM4-80GB', 'NVIDIA H100 80GB HBM3',
    'NVIDIA H100 PCIe', 'NVIDIA H100 NVL', 'NVIDIA A40', 'NVIDIA L40S', 'NVIDIA L40',
    'NVIDIA H200',
  ],
  containerDiskInGb: 20,
  networkVolumeId: VOLUME_ID,
  dockerStartCmd: ['bash', '-c', script],
};

if (dry) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const r = await fetch('https://rest.runpod.io/v1/pods', {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const j = await r.json();
if (!r.ok) {
  console.error('pod create failed:', r.status, JSON.stringify(j));
  process.exit(1);
}
console.log(`pod ${j.id} created (${j.costPerHr}/hr) — downloading ${repo} -> models/${dest}`);
console.log(`progress log lands at volume:/models/_download-${dest}.log; pod self-deletes when done`);
