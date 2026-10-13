import { ClothingFromInventoryError } from '@/lib/errors';
import { CLOTHING_NOTE, isClothingOrGear } from '@/lib/appearance-designer';
import type { PortraitProviderKind } from '@/ai/portraits/provider-flag';

/**
 * Server half of the designer's clothing/gear guard (ruling 2026-10-13):
 * on the Qwen-Image-2.1 provider an edit that asks for clothing or gear is
 * refused — those come from inventory. The client runs the same regex first;
 * this catches anything that skips the UI. FLUX.2 paths are untouched.
 */
export function assertEditAllowed(kind: PortraitProviderKind, editPrompt: string): void {
  if (kind !== 'qwen21') return;
  if (isClothingOrGear(editPrompt)) throw new ClothingFromInventoryError(CLOTHING_NOTE);
}
