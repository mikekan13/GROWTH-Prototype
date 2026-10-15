import { describe, it, expect } from 'vitest';
import { assertEditAllowed, readEditTarget } from './portrait-edit-guard';
import { ClothingFromInventoryError, EditOutOfScopeError } from '@/lib/errors';
import { errorResponse } from '@/lib/api';

describe('portrait edit clothing guard (server)', () => {
  it('qwen21: clothing/gear → ClothingFromInventoryError (422)', () => {
    expect(() => assertEditAllowed('qwen21', 'Give her a red coat. Change nothing else.')).toThrow(ClothingFromInventoryError);
    try { assertEditAllowed('qwen21', 'add a sword'); } catch (e) {
      expect((e as ClothingFromInventoryError).status).toBe(422);
      expect((e as ClothingFromInventoryError).code).toBe('CLOTHING_FROM_INVENTORY');
    }
  });

  it('qwen21: body edits pass', () => {
    expect(() => assertEditAllowed('qwen21', 'Add a scar to her face. Change nothing else.')).not.toThrow();
  });

  it('qwen21 + designer target: out-of-scope edits → EditOutOfScopeError (422); legacy callers (no target) untouched', () => {
    expect(() => assertEditAllowed('qwen21', 'Older by ten years. Change nothing else.', 'face')).toThrow(EditOutOfScopeError);
    expect(() => assertEditAllowed('qwen21', 'Change her underwear: a dark wrap.', 'face')).toThrow(EditOutOfScopeError);
    expect(() => assertEditAllowed('qwen21', 'Change her underwear: a dark wrap.', 'body')).not.toThrow();
    expect(() => assertEditAllowed('qwen21', 'Change her build to heavy-set.', 'body')).not.toThrow();
    expect(() => assertEditAllowed('qwen21', 'Change her build to heavy-set.', 'face')).toThrow(EditOutOfScopeError);
    expect(() => assertEditAllowed('qwen21', 'Older by ten years.')).not.toThrow();
    expect(readEditTarget('body')).toBe('body');
    expect(readEditTarget('x')).toBeNull();
  });

  it('FLUX paths are untouched', () => {
    expect(() => assertEditAllowed('flux2-serverless', 'a red coat')).not.toThrow();
    expect(() => assertEditAllowed('flux2-local', 'a red coat')).not.toThrow();
  });

  it('errorResponse → 422 { error: CLOTHING_FROM_INVENTORY, message }', async () => {
    const res = errorResponse(new ClothingFromInventoryError('Clothing and gear come from inventory.'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'CLOTHING_FROM_INVENTORY', message: 'Clothing and gear come from inventory.' });
  });
});
