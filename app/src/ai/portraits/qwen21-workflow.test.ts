import { describe, it, expect } from 'vitest';
import template from './workflows/qwen21-edit.json';
import {
  QWEN21_BODY_SIZE,
  buildQwen21BodyPrompt,
  buildQwen21EditPrompt,
  buildQwen21LockPrompt,
  buildQwen21StylePrompt,
  buildQwen21Workflow,
  getQwen21StyleLine,
  imageTagList,
} from './qwen21-workflow';
import { getFlux2Backdrop, getFlux2StyleProse } from './style-config';

const sentences = (s: string): string[] => s.match(/[^.]+\./g) ?? [];

describe('qwen21 prompt builders', () => {
  it('names refs as <imageN>', () => {
    expect(imageTagList(1, 1)).toBe('<image1>');
    expect(imageTagList(1, 2)).toBe('<image1> and <image2>');
    expect(imageTagList(2, 4)).toBe('<image2>, <image3> and <image4>');
  });

  it('lock prompt is the short ruled prompt with no style words', () => {
    expect(buildQwen21LockPrompt(2)).toBe(
      'A head-and-shoulders portrait of the person in <image1> and <image2>. ' +
      'Straight-on front view, eye-level, neutral expression, closed mouth, bare shoulders, no clothing. ' +
      'Blank flat uniform mid-grey backdrop, nothing else.',
    );
    expect(buildQwen21LockPrompt(1)).toContain('the person in <image1>.');
    expect(buildQwen21LockPrompt(1)).not.toMatch(/paint|style|fantasy/i);
  });

  it('style line = two sentences of the FLUX.2 prose (medium + mood), subject-agnostic', () => {
    const line = getQwen21StyleLine();
    expect(sentences(line)).toHaveLength(2);
    const first = sentences(getFlux2StyleProse())[0] ?? '';
    expect(first.length).toBeGreaterThan(0);
    expect(line.startsWith(first.trim())).toBe(true);
    expect(line).toMatch(/The mood is/);
    expect(line).not.toMatch(/skin tone|hair/i);
  });

  it('style prompt: lock is <image1>, refs <image2>..<imageN>, 3 sentences + style line', () => {
    const p = buildQwen21StylePrompt(3, '');
    expect(p).toBe(
      'Repaint <image1> as a painted character illustration in the style of <image2>, <image3> and <image4>: smooth painted skin with a matte porcelain finish, clean soft shading, crisp edges, soft diffuse light, desaturated palette. ' +
      'Keep the face, head shape, skin tone, hair and framing of <image1> exactly. ' +
      'No grain, no noise, no added freckles or skin texture, no weathering. Blank flat mid-grey backdrop.',
    );
    expect(sentences(buildQwen21StylePrompt(5))).toHaveLength(6);
    expect(buildQwen21StylePrompt(9, '')).toContain('<image6>');
    expect(buildQwen21StylePrompt(9, '')).not.toContain('<image7>');
  });

  it('body prompt: A-pose, margin, underclothing, keep face, studio wall', () => {
    const p = buildQwen21BodyPrompt('a grey linen shift.');
    expect(p).toContain('relaxed A-pose');
    expect(p).toContain('feet visible');
    expect(p).toContain('Wearing a grey linen shift; keep the face and hair of <image1> exactly.');
    expect(p.endsWith(getFlux2Backdrop('studio'))).toBe(true);
    expect(buildQwen21BodyPrompt()).toContain('simple neutral underclothing');
  });

  it('edit prompt appends "Change nothing else."', () => {
    expect(buildQwen21EditPrompt('Add a scar over the left eye')).toBe('Add a scar over the left eye. Change nothing else.');
    expect(buildQwen21EditPrompt('Make her smile! ')).toBe('Make her smile! Change nothing else.');
  });
});

describe('buildQwen21Workflow', () => {
  type Node = { class_type: string; inputs: Record<string, unknown> };

  it('wires one LoadImage per ref into TEXT_ENCODE.images.image_N and samples its latent', () => {
    const wf = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png', 'b.png', 'c.png'], seed: 42 }) as Record<string, Node>;
    expect(wf._comment).toBeUndefined();
    expect(wf.LOAD_REF1.inputs.image).toBe('a.png');
    expect(wf.LOAD_REF3.inputs.image).toBe('c.png');
    expect(wf.LOAD_REF3.class_type).toBe('LoadImage');
    expect(wf.LOAD_REF4).toBeUndefined();

    const enc = wf.TEXT_ENCODE;
    expect(enc.class_type).toBe('TextEncodeQwenImage21');
    expect(enc.inputs['images.image_1']).toEqual(['LOAD_REF1', 0]);
    expect(enc.inputs['images.image_2']).toEqual(['LOAD_REF2', 0]);
    expect(enc.inputs['images.image_3']).toEqual(['LOAD_REF3', 0]);
    expect(enc.inputs['images.image_4']).toBeUndefined();
    expect(enc.inputs.clip).toEqual(['CLIP', 0]);
    expect(enc.inputs.vae).toEqual(['VAE', 0]);
    expect(enc.inputs.prompt).toBe('P');
    expect(enc.inputs.negative_prompt).toBe('');
    expect(enc.inputs.resolution).toBe(1024);

    const s = wf.SAMPLE.inputs;
    expect(s.model).toEqual(['CACHE', 0]);
    expect(s.positive).toEqual(['TEXT_ENCODE', 0]);
    expect(s.negative).toEqual(['TEXT_ENCODE', 1]);
    expect(s.latent_image).toEqual(['TEXT_ENCODE', 2]);
    expect(s).toMatchObject({ seed: 42, steps: 25, cfg: 1, sampler_name: 'euler', scheduler: 'simple' });

    expect(wf.CACHE.class_type).toBe('QwenImage21Cache');
    expect(wf.CACHE.inputs.model).toEqual(['UNET', 0]);
    expect(wf.UNET.inputs.unet_name).toBe('qwen_image_2.1_int8_convrot.safetensors');
    expect(wf.CLIP.inputs.clip_name).toBe('qwen3vl_8b_int8_convrot.safetensors');
    expect(wf.VAE.inputs.vae_name).toBe('qwen_image_2.1_vae_bf16.safetensors');
    expect(wf.DECODE.inputs.samples).toEqual(['SAMPLE', 0]);
    expect(wf.SAVE.inputs.images).toEqual(['DECODE', 0]);
    for (const node of Object.values(wf)) expect((node as Record<string, unknown>)._meta).toBeUndefined();
  });

  it('size swaps the sampler latent to an EmptyLatentImage', () => {
    const wf = buildQwen21Workflow(template, { prompt: 'P', images: ['bust.png'], seed: 1, size: QWEN21_BODY_SIZE }) as Record<string, Node>;
    expect(wf.EMPTY_LATENT).toEqual({ class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } });
    expect(wf.SAMPLE.inputs.latent_image).toEqual(['EMPTY_LATENT', 0]);
  });

  it('does not mutate the template and rejects 0 or >16 images', () => {
    const before = JSON.stringify(template);
    buildQwen21Workflow(template, { prompt: 'P', images: ['a', 'b'], seed: 1 });
    expect(JSON.stringify(template)).toBe(before);
    expect(() => buildQwen21Workflow(template, { prompt: 'P', images: [], seed: 1 })).toThrow();
    expect(() => buildQwen21Workflow(template, { prompt: 'P', images: Array(17).fill('x'), seed: 1 })).toThrow();
  });
});
