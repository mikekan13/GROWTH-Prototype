import 'server-only';
import { prisma } from '@/lib/db';
import type { CampaignAISettings, AIFeature, AIProviderChoice } from './types';
import { DEFAULT_AI_SETTINGS, CLOUD_ONLY_FEATURES } from './types';

/**
 * Get AI settings for a campaign, with defaults.
 */
export async function getCampaignAISettings(campaignId: string): Promise<CampaignAISettings> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { aiSettings: true },
  });

  if (!campaign?.aiSettings) return DEFAULT_AI_SETTINGS;

  try {
    const parsed = JSON.parse(campaign.aiSettings) as Partial<CampaignAISettings>;
    return { ...DEFAULT_AI_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

/**
 * Resolve which provider to use for a specific AI feature in a campaign.
 * Cloud-only features always return 'cloud' regardless of settings.
 */
export function resolveProvider(
  settings: CampaignAISettings,
  feature: AIFeature,
): AIProviderChoice {
  if (CLOUD_ONLY_FEATURES.includes(feature)) return 'cloud';
  return settings.overrides?.[feature] ?? settings.defaultProvider;
}

/**
 * Update AI settings for a campaign (GM only).
 */
export async function updateCampaignAISettings(
  campaignId: string,
  settings: Partial<CampaignAISettings>,
): Promise<void> {
  const current = await getCampaignAISettings(campaignId);
  const updated = { ...current, ...settings };

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiSettings: JSON.stringify(updated) },
  });
}
