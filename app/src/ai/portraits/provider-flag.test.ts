import { describe, it, expect, vi } from 'vitest';
import { resolvePortraitProviderKind } from './provider-flag';

describe('resolvePortraitProviderKind', () => {
  it('defaults to FLUX.2 (serverless when RUNPOD_ENDPOINT_ID is set, else local)', () => {
    expect(resolvePortraitProviderKind({})).toBe('flux2-local');
    expect(resolvePortraitProviderKind({ RUNPOD_ENDPOINT_ID: 'qr4r1dkgw3uyhf' })).toBe('flux2-serverless');
    expect(resolvePortraitProviderKind({ PORTRAIT_PROVIDER: 'flux2', RUNPOD_ENDPOINT_ID: 'x', RUNPOD_QWEN_ENDPOINT_ID: 'q' })).toBe('flux2-serverless');
  });

  it('qwen21 needs RUNPOD_QWEN_ENDPOINT_ID', () => {
    expect(resolvePortraitProviderKind({ PORTRAIT_PROVIDER: 'qwen21', RUNPOD_QWEN_ENDPOINT_ID: 'q' })).toBe('qwen21');
    expect(resolvePortraitProviderKind({ PORTRAIT_PROVIDER: ' QWEN21 ', RUNPOD_QWEN_ENDPOINT_ID: 'q' })).toBe('qwen21');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolvePortraitProviderKind({ PORTRAIT_PROVIDER: 'qwen21', RUNPOD_ENDPOINT_ID: 'x' })).toBe('flux2-serverless');
    expect(resolvePortraitProviderKind({ PORTRAIT_PROVIDER: 'sdxl' })).toBe('flux2-local');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
