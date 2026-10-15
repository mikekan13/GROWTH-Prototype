import { ClothingFromInventoryError, EditOutOfScopeError } from '@/lib/errors';
import { CLOTHING_NOTE, editScope, isClothingOrGear, type EditTarget } from '@/lib/appearance-designer';
import type { PortraitProviderKind } from '@/ai/portraits/provider-flag';

/**
 * Server half of the designer's edit guards. On the Qwen-Image-2.1 provider:
 *  - clothing or gear → 422 CLOTHING_FROM_INVENTORY (ruling 2026-10-13);
 *  - a designer edit (the request names its `target`, face or body) outside
 *    the allowed scope — hair, scars, tattoos, body mods, body underwear —
 *    → 422 EDIT_OUT_OF_SCOPE (Mike 2026-10-15: age is the sheet's; cuts,
 *    tiredness, expression, makeup are the live portrait's).
 * The client runs the same checks first; this catches anything that skips
 * the UI. Legacy callers send no target and keep the clothing guard only.
 * FLUX.2 paths are untouched.
 */
export function assertEditAllowed(kind: PortraitProviderKind, editPrompt: string, target?: EditTarget | null): void {
  if (kind !== 'qwen21') return;
  if (isClothingOrGear(editPrompt)) throw new ClothingFromInventoryError(CLOTHING_NOTE);
  if (!target) return;
  const scope = editScope(editPrompt, target);
  if (!scope.ok) throw new EditOutOfScopeError(scope.line);
}

export function readEditTarget(v: unknown): EditTarget | null {
  return v === 'face' || v === 'body' ? v : null;
}
