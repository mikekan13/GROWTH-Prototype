/**
 * Check qwen21-edit.json's node + input names against a live ComfyUI.
 *
 *   npx tsx scripts/qwen21-validate-workflow.ts
 *
 * RunPod serverless (worker-comfyui) exposes only /run + /status — there is
 * no /object_info through the worker. So:
 *   QWEN21_COMFYUI_URL set (e.g. a pod's https://<pod>-8188.proxy.runpod.net)
 *     → GET /object_info/<class> for every node and report unknown inputs.
 *   otherwise (RUNPOD_QWEN_ENDPOINT_ID only, or nothing)
 *     → print the assembled workflow (2 refs + body canvas) for a manual
 *       check against the endpoint image and exit 0.
 * Free: no generation is queued either way.
 */
import { config } from 'dotenv';
import template from '../src/ai/portraits/workflows/qwen21-edit.json';
import { QWEN21_BODY_SIZE, buildQwen21LockPrompt, buildQwen21Workflow } from '../src/ai/portraits/qwen21-workflow';

config({ path: '.env.local' });
config({ path: '.env' });

type Node = { class_type: string; inputs: Record<string, unknown> };

async function main() {
  const wf = buildQwen21Workflow(template, {
    prompt: buildQwen21LockPrompt(2),
    images: ['ref1.png', 'ref2.png'],
    seed: 1,
    size: QWEN21_BODY_SIZE,
  }) as Record<string, Node>;

  const base = process.env.QWEN21_COMFYUI_URL?.replace(/\/$/, '');
  if (!base) {
    console.log(
      process.env.RUNPOD_QWEN_ENDPOINT_ID
        ? `RUNPOD_QWEN_ENDPOINT_ID=${process.env.RUNPOD_QWEN_ENDPOINT_ID} is serverless — /object_info is not reachable through worker-comfyui.`
        : 'No QWEN21_COMFYUI_URL / RUNPOD_QWEN_ENDPOINT_ID set.',
    );
    console.log('Check these class_types + input names by hand against the endpoint image (ComfyUI >= 0.37):\n');
    console.log(JSON.stringify(wf, null, 2));
    return;
  }

  let problems = 0;
  const classes = [...new Set(Object.values(wf).map(n => n.class_type))];
  for (const cls of classes) {
    const res = await fetch(`${base}/object_info/${cls}`, { signal: AbortSignal.timeout(30000) });
    const info = res.ok ? ((await res.json()) as Record<string, { input?: Record<string, Record<string, unknown>> }>)[cls] : undefined;
    if (!info) { console.log(`MISSING NODE  ${cls} (${res.status})`); problems++; continue; }
    const known = new Set(Object.values(info.input ?? {}).flatMap(group => Object.keys(group ?? {})));
    for (const [id, node] of Object.entries(wf)) {
      if (node.class_type !== cls) continue;
      for (const k of Object.keys(node.inputs)) {
        // Dynamic image slots may be declared as a group; accept images.image_N if any "images" key is known.
        const ok = known.has(k) || (k.startsWith('images.') && [...known].some(x => x.startsWith('images')));
        if (!ok) { console.log(`UNKNOWN INPUT ${id}.${k} on ${cls}`); problems++; }
      }
    }
    console.log(`ok            ${cls}`);
  }
  console.log(problems ? `\n${problems} problem(s)` : '\nworkflow matches /object_info');
  process.exitCode = problems ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
