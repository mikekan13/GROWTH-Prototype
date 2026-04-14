import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Cloud Provider (Stub)
 *
 * Future implementation for cloud-based image generation.
 * Will support BFL API, Replicate, or hosted ComfyUI.
 * Tracks token usage per account for subscription tiers.
 */

import type {
  ImageGenerationProvider,
  PortraitInput,
  PortraitResult,
  IdentityData,
  ProviderStatus,
} from '../types';

export class CloudProvider implements ImageGenerationProvider {
  name = 'cloud';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      available: false,
      gpuLoaded: false,
      queueLength: 0,
      error: 'Cloud provider not yet implemented',
    };
  }

  async generatePortrait(_input: PortraitInput): Promise<PortraitResult> {
    return {
      success: false,
      metadata: {
        prompt: '',
        negativePrompt: '',
        seed: 0,
        model: 'cloud',
        steps: 0,
        cfg: 0,
        width: 0,
        height: 0,
        generationTimeMs: 0,
      },
      error: 'Cloud provider not yet implemented. Use local generation.',
    };
  }

  async extractIdentity(_imageData: Buffer): Promise<IdentityData> {
    throw new Error('Cloud provider not yet implemented');
  }

  // Future: subscription tier tracking
  // Basic tier: 50 generations/month
  // Premium tier: 500 generations/month
  // KRMA-based overage charges
  //
  // private async trackUsage(userId: string, type: PipelineType): Promise<void> {
  //   // increment usage counter, check limits, charge KRMA for overage
  // }
}
