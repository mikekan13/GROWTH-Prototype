import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { Qwen21Provider, isStoredPortraitPath } from './qwen21';
import type { ComfyUIQueueResponse, PortraitInput } from '../types';

type Wf = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 16, height: 24, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toBuffer();
});

/** Transport stubbed: records every queued workflow; nothing leaves the process. */
class TestQwen extends Qwen21Provider {
  queued: Wf[] = [];
  saved: string[] = [];
  protected override async uploadReferenceImage(p: string) { return `ref:${p}`; }
  protected override async uploadBuffer(_b: Buffer, name: string) { return `buf:${name}`; }
  protected override async queuePrompt(wf: object): Promise<ComfyUIQueueResponse> {
    this.queued.push(wf as Wf);
    return { prompt_id: `job${this.queued.length}`, number: 0 };
  }
  protected override async waitForCompletion(id: string) { return { filename: '0', subfolder: id, type: 'serverless' }; }
  protected override async downloadImage() { return png; }
  protected override async savePortrait(characterId: string, _d: Buffer, step?: string) {
    const p = `/portraits/${characterId}/${step}/.thumbs/g${this.saved.length}.webp`;
    this.saved.push(p);
    return { imagePath: p, thumbnailPath: p };
  }
  protected override async defaultStyleRefs() { return ['/abs/s1.png', '/abs/s2.png']; }
}

function input(over: Partial<PortraitInput> & { refs: string[] }): PortraitInput {
  return {
    characterId: 'char1',
    characterData: { identity: { name: 'V', underclothing: 'a grey shift' } } as PortraitInput['characterData'],
    personaLock: { referenceImagePath: over.refs[0], referenceImagePaths: over.refs, embeddingPath: '', lockedPrompt: '', lockedSeed: 0, pulidWeight: 0, bodyDescription: '' },
    pipelineType: 'character_portrait',
    overrides: { seed: 7, ...(over.overrides ?? {}) },
  };
}

describe('isStoredPortraitPath', () => {
  it('tells a stored lock from an uploaded photo', () => {
    expect(isStoredPortraitPath('/portraits/c/faces/x.png')).toBe(true);
    expect(isStoredPortraitPath('portraits\\c\\faces\\x.png')).toBe(true);
    expect(isStoredPortraitPath('/uploads/references/c/x.jpg')).toBe(false);
  });
});

describe('Qwen21Provider.generatePortrait (transport stubbed)', () => {
  // Patch the style-ref upload so no disk read happens.
  const patch = (p: TestQwen) => {
    (p as unknown as { uploadStyleRef: (a: string, i: number) => Promise<string> }).uploadStyleRef = async (a, i) => `style${i + 1}:${a}`;
    return p;
  };

  it('photos (no lock yet) → lockIdentity then applyStyle; never mixes photos and style refs', async () => {
    const p = patch(new TestQwen());
    const r = await p.generatePortrait(input({ refs: ['/uploads/references/c/a.jpg', '/uploads/references/c/b.jpg'] }));
    expect(r.success).toBe(true);
    expect(p.queued).toHaveLength(2);

    const [lock, style] = p.queued;
    expect(lock.TEXT_ENCODE.inputs.prompt).toMatch(/^A head-and-shoulders portrait of the person in <image1> and <image2>\./);
    expect(lock.LOAD_REF1.inputs.image).toBe('ref:/uploads/references/c/a.jpg');
    expect(lock.LOAD_REF2.inputs.image).toBe('ref:/uploads/references/c/b.jpg');
    expect(lock.LOAD_REF3).toBeUndefined();

    expect(style.TEXT_ENCODE.inputs.prompt).toMatch(/^Repaint <image1> in the exact art style of <image2> and <image3>:/);
    expect(String(style.LOAD_REF1.inputs.image)).toMatch(/^buf:qwen21-lock-7-/); // the lock output, not a photo
    expect(style.LOAD_REF2.inputs.image).toBe('style1:/abs/s1.png');
    expect(style.LOAD_REF3.inputs.image).toBe('style2:/abs/s2.png');
    expect(JSON.stringify(style)).not.toContain('/uploads/references/');

    expect(p.saved[0]).toContain('/faces/');
    expect(r.imagePath).toBe(p.saved[1]);
    expect((r.metadata as unknown as Record<string, unknown>).lockImagePath).toBe(p.saved[0]);
  });

  it('existing lock → style pass only, on the full-res PNG', async () => {
    const p = patch(new TestQwen());
    const r = await p.generatePortrait(input({ refs: ['/portraits/char1/faces/lock.png'] }));
    expect(r.success).toBe(true);
    expect(p.queued).toHaveLength(1);
    expect(p.queued[0].LOAD_REF1.inputs.image).toBe('ref:/portraits/char1/faces/lock.png');
    expect(p.queued[0].TEXT_ENCODE.inputs.prompt).toMatch(/^Repaint <image1>/);
  });

  it('full_body → one body job on an EmptyLatentImage canvas with the underclothing', async () => {
    const p = patch(new TestQwen());
    const r = await p.generatePortrait(input({ refs: ['/portraits/char1/faces/bust.png'], overrides: { composition: 'full_body' } }));
    expect(r.success).toBe(true);
    expect(p.queued).toHaveLength(1);
    const wf = p.queued[0];
    expect(wf.SAMPLE.inputs.latent_image).toEqual(['EMPTY_LATENT', 0]);
    expect(wf.TEXT_ENCODE.inputs.prompt).toContain('Wearing a grey shift');
    expect(p.saved[0]).toContain('/bodies/');
  });

  it('object-ref edits are refused, not silently ignored', async () => {
    const p = patch(new TestQwen());
    const r = await p.editImage('/portraits/c/x.png', 'add a sword', { objectRefImagePath: '/uploads/sword.png' });
    expect(r.success).toBe(false);
    expect(p.queued).toHaveLength(0);
  });
});
