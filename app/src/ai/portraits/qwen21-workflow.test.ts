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
import { GROWTH_MEDIUM, getCampaignMood, getFlux2Backdrop, getFlux2StyleProse } from './style-config';

describe('qwen21 prompt builders', () => {
  it('names refs as <imageN>', () => {
    expect(imageTagList(1, 1)).toBe('<image1>');
    expect(imageTagList(1, 2)).toBe('<image1> and <image2>');
    expect(imageTagList(2, 4)).toBe('<image2>, <image3> and <image4>');
  });

  it('lock prompt is the short ruled prompt with no style words', () => {
    const p = buildQwen21LockPrompt(2);
    expect(p.startsWith('A head-and-shoulders portrait of the person in <image1> and <image2>. ')).toBe(true);
    expect(p).toContain('Composed exactly like a passport photo'); // fixed COMPOSITION layer (ruled 2026-10-13)
    expect(p).toContain('No turn of the head, no tilt, no three-quarter view, no profile.');
    expect(p.endsWith('Blank flat uniform mid-grey backdrop, nothing else.')).toBe(true);
    expect(buildQwen21LockPrompt(1)).toContain('the person in <image1>.');
    expect(buildQwen21LockPrompt(1)).not.toMatch(/paint|style|fantasy/i);
  });

  it('style line = MEDIUM + MOOD (default growth), subject-agnostic', () => {
    const line = getQwen21StyleLine();
    expect(line).toBe(`${GROWTH_MEDIUM} ${getCampaignMood('growth')}`);
    expect(getQwen21StyleLine('horror')).toContain(getCampaignMood('horror'));
    expect(getFlux2StyleProse()).toBe(line); // legacy paragraph = medium + growth mood
    expect(line).not.toMatch(/skin tone|freckle|make-?up|blonde|brunette/i);
  });

  it('painted lock = identity/framing + MEDIUM + MOOD + backdrop', () => {
    const p = buildQwen21LockPrompt(2, true, 'horror');
    expect(p.startsWith('A painted character illustration of the person in <image1> and <image2>, head and shoulders. Match their exact facial identity from the photos.')).toBe(true);
    const iMedium = p.indexOf(GROWTH_MEDIUM);
    const iMood = p.indexOf(getCampaignMood('horror'));
    expect(iMedium).toBeGreaterThan(0);
    expect(iMood).toBeGreaterThan(iMedium);
    expect(p.endsWith('Blank flat uniform mid-grey backdrop, nothing else.')).toBe(true);
    expect(buildQwen21LockPrompt(1, true)).toContain(getCampaignMood('growth'));
    expect(buildQwen21LockPrompt(1, true, 'gothic horror')).toContain(getCampaignMood('gothic'));
    expect(buildQwen21LockPrompt(1, true, undefined, 'CUSTOM MEDIUM.')).toContain(' CUSTOM MEDIUM. ');
    expect(buildQwen21LockPrompt(1, true, undefined, 'CUSTOM MEDIUM.')).not.toContain(GROWTH_MEDIUM);
  });

  it('style prompt: lock is <image1>, refs <image2>..<imageN>, 3 sentences + style line', () => {
    const p = buildQwen21StylePrompt(3, '');
    expect(p).toBe(
      'Repaint <image1> as a painted character illustration in the style of <image2>, <image3> and <image4>: smooth painted skin with a matte porcelain finish, clean soft shading, crisp edges, soft diffuse light, desaturated palette. ' +
      'Keep the face, head shape, skin tone, hair and framing of <image1> exactly. ' +
      'No grain, no noise, no added freckles or skin texture, no weathering. Blank flat mid-grey backdrop.',
    );
    expect(buildQwen21StylePrompt(5).endsWith(getQwen21StyleLine())).toBe(true);
    expect(buildQwen21StylePrompt(9, '')).toContain('<image6>');
    expect(buildQwen21StylePrompt(9, '')).not.toContain('<image7>');
  });

  it('body prompt: A-pose, margin, underclothing, keep face, studio wall', () => {
    const p = buildQwen21BodyPrompt('a grey linen shift.');
    expect(p).toContain('relaxed A-pose');
    expect(p).toContain('feet visible');
    expect(p).toContain('Wearing a grey linen shift; keep the face and hair of <image1> exactly.');
    expect(p.endsWith(getFlux2Backdrop('studio'))).toBe(true);
    expect(p).toContain(GROWTH_MEDIUM);
    expect(p).toContain(getCampaignMood('growth'));
    expect(buildQwen21BodyPrompt(undefined, 'western')).toContain(getCampaignMood('western'));
    expect(buildQwen21BodyPrompt()).toContain('simple neutral underclothing');
  });

  it('edit prompt: instruction + one-clause medium reminder + mood + "Change nothing else."', () => {
    const growth = getCampaignMood('growth');
    expect(buildQwen21EditPrompt('Add a scar over the left eye')).toBe(
      `Add a scar over the left eye. Keep it the same semi-realistic painted illustration with a matte finish, no grain or noise. ${growth} Change nothing else.`,
    );
    expect(buildQwen21EditPrompt('Make her smile! ').startsWith('Make her smile! Keep it')).toBe(true);
    expect(buildQwen21EditPrompt('x', 'horror')).toContain(getCampaignMood('horror'));
    expect(buildQwen21EditPrompt('x')).not.toContain(GROWTH_MEDIUM); // short reminder, not the paragraph
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
