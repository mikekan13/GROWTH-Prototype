import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Provider Factory
 *
 * Returns the appropriate image generation provider based on configuration.
 * Watchers toggle between local and cloud in campaign settings.
 */

import type { ImageGenerationProvider } from '../types';
import { LocalProvider } from './local';
import { CloudProvider } from './cloud';

let cachedLocal: LocalProvider | null = null;
let cachedCloud: CloudProvider | null = null;

/**
 * Get a portrait generation provider.
 *
 * @param preferCloud - If true, try cloud first (set by Watcher in campaign settings)
 * @returns The available provider, or throws if none available
 */
export async function getPortraitProvider(
  preferCloud: boolean = false,
): Promise<ImageGenerationProvider> {
  if (preferCloud) {
    const cloud = getCloudProvider();
    if (await cloud.isAvailable()) return cloud;
    // Fall back to local if cloud unavailable
  }

  // Always return local provider — it will auto-start ComfyUI if needed
  const local = getLocalProvider();
  if (await local.isAvailable()) return local;

  // ComfyUI not running yet, but local provider will auto-start it on generate
  // Return it anyway — ensureRunning() handles the startup
  if (!preferCloud) return local;

  // Last resort: try cloud
  const cloud = getCloudProvider();
  if (await cloud.isAvailable()) return cloud;

  // Return local as fallback — it will attempt auto-start and give a clear error if it fails
  return local;
}

/** Check if any provider is available without throwing */
export async function isPortraitGenerationAvailable(): Promise<boolean> {
  const local = getLocalProvider();
  if (await local.isAvailable()) return true;

  const cloud = getCloudProvider();
  if (await cloud.isAvailable()) return true;

  return false;
}

/** Get provider status for UI display */
export async function getProviderStatuses() {
  const local = getLocalProvider();
  const cloud = getCloudProvider();

  return {
    local: await local.getStatus(),
    cloud: await cloud.getStatus(),
  };
}

function getLocalProvider(): LocalProvider {
  if (!cachedLocal) cachedLocal = new LocalProvider();
  return cachedLocal;
}

function getCloudProvider(): CloudProvider {
  if (!cachedCloud) cachedCloud = new CloudProvider();
  return cachedCloud;
}
