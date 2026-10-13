/**
 * Which ComfyUI-backed portrait provider getLocalProvider() builds.
 *
 *   PORTRAIT_PROVIDER=qwen21 + RUNPOD_QWEN_ENDPOINT_ID → Qwen-Image-2.1 serverless (two-step lock → style)
 *   PORTRAIT_PROVIDER=flux2 (default) + RUNPOD_ENDPOINT_ID → FLUX.2 serverless (rollback path)
 *   neither endpoint                                      → LocalProvider (COMFYUI_URL)
 *
 * qwen21 without RUNPOD_QWEN_ENDPOINT_ID falls back to the FLUX.2 path with a
 * warning rather than failing every portrait request.
 */

export type PortraitProviderKind = 'qwen21' | 'flux2-serverless' | 'flux2-local';

type Env = Record<string, string | undefined>;

export function resolvePortraitProviderKind(env: Env = process.env): PortraitProviderKind {
  const flag = (env.PORTRAIT_PROVIDER ?? 'flux2').trim().toLowerCase();
  if (flag === 'qwen21') {
    if (env.RUNPOD_QWEN_ENDPOINT_ID?.trim()) return 'qwen21';
    console.warn('[portraits] PORTRAIT_PROVIDER=qwen21 but RUNPOD_QWEN_ENDPOINT_ID is unset — using FLUX.2');
  } else if (flag !== 'flux2' && flag !== '') {
    console.warn(`[portraits] unknown PORTRAIT_PROVIDER="${env.PORTRAIT_PROVIDER}" — using FLUX.2`);
  }
  return env.RUNPOD_ENDPOINT_ID?.trim() ? 'flux2-serverless' : 'flux2-local';
}
