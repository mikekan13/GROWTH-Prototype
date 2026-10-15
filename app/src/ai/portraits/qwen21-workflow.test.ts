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
  parseQwen21Loras,
  formatQwen21Loras,
  qwen21LoraLabel,
  applyQwen21LoraTriggers,
  qwen21LorasFromEnv,
  hasGrowthStyleLora,
  GROWTH_STYLE_LORA,
  clampLoraStart,
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
    expect(p).toContain('no tilt, no lean, no three-quarter view.');
    expect(p).toContain('Nothing is worn: bare skin from the collarbones up');
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
    expect(p).toContain('Blank flat uniform mid-grey backdrop, nothing else.');
    expect(p.endsWith('Unclothed with bare shoulders, facing the camera squarely, head level, cropped just below the collarbones.')).toBe(true); // LOCK_CLOSER
    expect(p).toContain('cropped just below the collarbones so no chest or torso is in view'); // Mike 14 Oct: bottom edge stated
    // Full medium present → no separate realism line; medium stripped (LoRA) → the realism line rides after identity.
    expect(p).not.toContain('almost passes for a photograph of a real person. Composed');
    const stripped = buildQwen21LockPrompt(2, true, undefined, '');
    expect(stripped.startsWith('A painted character illustration of the person in <image1> and <image2>, head and shoulders. Match their exact facial identity from the photos. Lifelike and photographic in its detail')).toBe(true);
    expect(stripped).not.toMatch(/no grain, no noise/);
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

describe('community LoRA blend', () => {
  type Node = { class_type: string; inputs: Record<string, unknown> };
  const SPEC = 'cine1p_c1-st4000.safetensors:0.7:cine1p,Inklingv2-qwen21_c1-st6000.safetensors:0.25:Inklingv2';
  const LORAS = parseQwen21Loras(SPEC);

  it('parses good specs (and round-trips them)', () => {
    expect(LORAS).toEqual([
      { file: 'cine1p_c1-st4000.safetensors', strength: 0.7, trigger: 'cine1p' },
      { file: 'Inklingv2-qwen21_c1-st6000.safetensors', strength: 0.25, trigger: 'Inklingv2' },
    ]);
    expect(formatQwen21Loras(LORAS)).toBe(SPEC);
    expect(qwen21LoraLabel(LORAS)).toBe('cine1p 0.7 + Inklingv2 0.25');
    expect(parseQwen21Loras(' a.safetensors : 1 ')).toEqual([{ file: 'a.safetensors', strength: 1 }]);
    expect(parseQwen21Loras('a.safetensors:0,b.safetensors:2')).toHaveLength(2);
    expect(parseQwen21Loras('')).toEqual([]);
  });

  it('QWEN21_LORAS unset → the GROWTH style LoRA at 0.7 (Mike, 14 Oct); "none"/"" → []; a spec → that blend', () => {
    const saved = process.env.QWEN21_LORAS;
    try {
      delete process.env.QWEN21_LORAS;
      expect(qwen21LorasFromEnv()).toEqual([GROWTH_STYLE_LORA]);
      expect(GROWTH_STYLE_LORA).toEqual({ file: 'grwthpaint_v1.safetensors', strength: 0.7, trigger: 'grwthpaint' });
      process.env.QWEN21_LORAS = 'none';
      expect(qwen21LorasFromEnv()).toEqual([]);
      process.env.QWEN21_LORAS = '';
      expect(qwen21LorasFromEnv()).toEqual([]);
      process.env.QWEN21_LORAS = 'a.safetensors:1';
      expect(qwen21LorasFromEnv()).toEqual([{ file: 'a.safetensors', strength: 1 }]);
    } finally {
      if (saved === undefined) delete process.env.QWEN21_LORAS; else process.env.QWEN21_LORAS = saved;
    }
    expect(hasGrowthStyleLora([GROWTH_STYLE_LORA])).toBe(true);
    expect(hasGrowthStyleLora([{ file: 'grwthpaint_v1.safetensors', strength: 0.3 }])).toBe(true);
    expect(hasGrowthStyleLora([{ file: 'a.safetensors', strength: 1, trigger: 'cine1p' }])).toBe(false);
    expect(hasGrowthStyleLora([])).toBe(false);
    expect(hasGrowthStyleLora(undefined)).toBe(false);
    expect(parseQwen21Loras(undefined)).toEqual([]);
    expect(qwen21LoraLabel([{ file: 'x.safetensors', strength: 1 }])).toBe('x 1');
  });

  it('rejects bad specs', () => {
    for (const bad of [
      'a.safetensors', // no strength
      'a.ckpt:1', // wrong extension
      'loras/a.safetensors:1', // path separator
      'loras\\a.safetensors:1', // path separator (windows)
      'a.safetensors:2.5', // > 2
      'a.safetensors:-0.1', // < 0
      'a.safetensors:abc', // not a number
      'a.safetensors:1:t:extra', // too many parts
      'a.safetensors:1:', // empty trigger
    ]) expect(() => parseQwen21Loras(bad), bad).toThrow();
  });

  it('no LoRAs = byte-identical workflow', () => {
    const base = { prompt: 'P', images: ['a.png'], seed: 3 };
    const plain = JSON.stringify(buildQwen21Workflow(template, base));
    expect(JSON.stringify(buildQwen21Workflow(template, { ...base, loras: [] }))).toBe(plain);
    expect(JSON.stringify(buildQwen21Workflow(template, { ...base, loras: undefined }))).toBe(plain);
  });

  it('chains UNET → LORA_1 → LORA_2 → CACHE and rewires every UNET consumer', () => {
    const wf = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, loras: LORAS }) as Record<string, Node>;
    expect(wf.LORA_1).toEqual({
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: 'cine1p_c1-st4000.safetensors', strength_model: 0.7, model: ['UNET', 0] },
    });
    expect(wf.LORA_2).toEqual({
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: 'Inklingv2-qwen21_c1-st6000.safetensors', strength_model: 0.25, model: ['LORA_1', 0] },
    });
    expect(wf.LORA_3).toBeUndefined();
    expect(wf.CACHE.inputs.model).toEqual(['LORA_2', 0]);
    expect(wf.SAMPLE.inputs.model).toEqual(['CACHE', 0]);
    const unetConsumers = Object.entries(wf)
      .filter(([, n]) => Object.values(n.inputs ?? {}).some(v => Array.isArray(v) && v[0] === 'UNET'))
      .map(([k]) => k);
    expect(unetConsumers).toEqual(['LORA_1']);

    // A template with a second UNET consumer gets rewired too.
    const t2 = JSON.parse(JSON.stringify(template));
    t2.EXTRA = { class_type: 'X', inputs: { model: ['UNET', 0] } };
    const wf2 = buildQwen21Workflow(t2, { prompt: 'P', images: ['a.png'], seed: 3, loras: LORAS.slice(0, 1) }) as Record<string, Node>;
    expect(wf2.EXTRA.inputs.model).toEqual(['LORA_1', 0]);
    expect(wf2.CACHE.inputs.model).toEqual(['LORA_1', 0]);
  });

  it('frameRef: the last image is the framing guide; identity tags stop before it', () => {
    const p = buildQwen21LockPrompt(3, true, undefined, '', { frameRef: true });
    expect(p.startsWith('A painted character illustration of the person in <image1> and <image2>, head and shoulders.')).toBe(true);
    expect(p).toContain('pose skeleton in <image3>:');
    expect(p).toContain('<image3> is a keypoint map only');
    expect(p).not.toContain('<image3>, head and shoulders');
    const plain = buildQwen21LockPrompt(2, false, undefined, undefined, { frameRef: true });
    expect(plain.startsWith('A head-and-shoulders portrait of the person in <image1>. ')).toBe(true);
    expect(plain).toContain('pose skeleton in <image2>:');
    expect(buildQwen21LockPrompt(2, true)).not.toContain('pose skeleton');
  });

  it('loraStart > 0 → two-stage sampling: bare CACHE for the first k steps, LoRA chain (patched onto CACHE) for the rest', () => {
    const wf = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, loras: LORAS, loraStart: 0.3 }) as Record<string, Node>;
    // The DiT is loaded once: CACHE stays on UNET and the LoRAs patch the cached model.
    expect(wf.CACHE.inputs.model).toEqual(['UNET', 0]);
    expect(wf.LORA_1.inputs.model).toEqual(['CACHE', 0]);
    expect(wf.LORA_2.inputs.model).toEqual(['LORA_1', 0]);
    // 25 steps × 0.3 → the LoRA joins at step 8.
    expect(wf.SAMPLE_A.class_type).toBe('KSamplerAdvanced');
    expect(wf.SAMPLE_A.inputs).toMatchObject({ model: ['CACHE', 0], latent_image: ['TEXT_ENCODE', 2], add_noise: 'enable', start_at_step: 0, end_at_step: 8, return_with_leftover_noise: 'enable', noise_seed: 3, steps: 25, cfg: 1, sampler_name: 'euler', scheduler: 'simple' });
    expect(wf.SAMPLE.class_type).toBe('KSamplerAdvanced');
    expect(wf.SAMPLE.inputs).toMatchObject({ model: ['LORA_2', 0], latent_image: ['SAMPLE_A', 0], add_noise: 'disable', start_at_step: 8, end_at_step: 10000, return_with_leftover_noise: 'disable', noise_seed: 3, steps: 25 });
    expect(wf.SAMPLE.inputs.positive).toEqual(['TEXT_ENCODE', 0]);
    expect(wf.DECODE.inputs.samples).toEqual(['SAMPLE', 0]);
    expect(wf.TEXT_ENCODE.inputs.prompt).toBe('cine1p, Inklingv2, P'); // triggers still lead the shared prompt
    // An explicit canvas feeds stage A.
    const wf2 = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, loras: LORAS, loraStart: 0.5, size: QWEN21_BODY_SIZE }) as Record<string, Node>;
    expect(wf2.SAMPLE_A.inputs.latent_image).toEqual(['EMPTY_LATENT', 0]);
    expect(wf2.SAMPLE_A.inputs.end_at_step).toBe(13);
    // 0 / no LoRAs → the single-sampler workflow, no SAMPLE_A.
    expect((buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, loras: LORAS, loraStart: 0 }) as Record<string, Node>).SAMPLE_A).toBeUndefined();
    expect((buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, loraStart: 0.5 }) as Record<string, Node>).SAMPLE_A).toBeUndefined();
    expect(clampLoraStart(undefined)).toBe(0);
    expect(clampLoraStart(-1)).toBe(0);
    expect(clampLoraStart(2)).toBe(0.9);
    expect(clampLoraStart(0.4)).toBe(0.4);
  });

  it('mid-generation ink: stopAt → KSamplerAdvanced [0,k) snapping to the clean prediction; resumeFrom → VAE-encode the inked image, re-noise at k, run [k,N)', () => {
    const a = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, size: QWEN21_BODY_SIZE, stopAt: 0.4 }) as Record<string, Node>;
    expect(a.SAMPLE.class_type).toBe('KSamplerAdvanced');
    expect(a.SAMPLE.inputs).toMatchObject({ model: ['CACHE', 0], latent_image: ['EMPTY_LATENT', 0], add_noise: 'enable', start_at_step: 0, end_at_step: 10, return_with_leftover_noise: 'disable', noise_seed: 3, steps: 25 });
    expect(a.LOAD_INIT).toBeUndefined();
    expect(a.DECODE.inputs.samples).toEqual(['SAMPLE', 0]);

    const b = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, size: QWEN21_BODY_SIZE, resumeFrom: { image: 'inked.png', at: 0.4 } }) as Record<string, Node>;
    expect(b.LOAD_INIT).toEqual({ class_type: 'LoadImage', inputs: { image: 'inked.png' } });
    expect(b.VAE_ENCODE).toEqual({ class_type: 'VAEEncode', inputs: { pixels: ['LOAD_INIT', 0], vae: ['VAE', 0] } });
    expect(b.SAMPLE.inputs).toMatchObject({ model: ['CACHE', 0], latent_image: ['VAE_ENCODE', 0], add_noise: 'enable', start_at_step: 10, end_at_step: 10000, return_with_leftover_noise: 'disable', noise_seed: 3 });
    // The identity refs still condition job B; LoRAs still chain into CACHE.
    const c = buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3, loras: LORAS, resumeFrom: { image: 'inked.png', at: 0.75 } }) as Record<string, Node>;
    expect(c.CACHE.inputs.model).toEqual(['LORA_2', 0]);
    expect(c.SAMPLE.inputs.start_at_step).toBe(19);
    expect(c.TEXT_ENCODE.inputs['images.image_1']).toEqual(['LOAD_REF1', 0]);
    // Neither → the plain KSampler.
    expect((buildQwen21Workflow(template, { prompt: 'P', images: ['a.png'], seed: 3 }) as Record<string, Node>).SAMPLE.class_type).toBe('KSampler');
  });

  it('prepends triggers once, in order, deduped', () => {
    expect(applyQwen21LoraTriggers('A dwarf.', LORAS)).toBe('cine1p, Inklingv2, A dwarf.');
    expect(applyQwen21LoraTriggers('A dwarf.', [...LORAS, { file: 'c.safetensors', strength: 1, trigger: 'cine1p' }])).toBe('cine1p, Inklingv2, A dwarf.');
    expect(applyQwen21LoraTriggers('cine1p, Inklingv2, A dwarf.', LORAS)).toBe('cine1p, Inklingv2, A dwarf.');
    expect(applyQwen21LoraTriggers('A dwarf.', [{ file: 'a.safetensors', strength: 1 }])).toBe('A dwarf.');
    expect(applyQwen21LoraTriggers('A dwarf.', [])).toBe('A dwarf.');
    const wf = buildQwen21Workflow(template, { prompt: 'A dwarf.', images: ['a.png'], seed: 3, loras: LORAS }) as Record<string, Node>;
    expect(wf.TEXT_ENCODE.inputs.prompt).toBe('cine1p, Inklingv2, A dwarf.');
  });
});
