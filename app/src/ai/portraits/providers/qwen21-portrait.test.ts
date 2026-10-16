/**
 * THE PORTRAIT (plan 2026-10-15 §4 C, Mike 16 Oct): renderPortrait paints JEWL's brief from
 * <image1> = the approved face and <image2> = the body on the v1 recipe (LoRA 0.7 + mid-generation
 * ink 0.8), 4:5 canvas, saved under portraits/<id>/portrait/. Transport stubbed — nothing leaves.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import sharp from 'sharp';
import { Qwen21Provider, QWEN21_PORTRAIT_SIZE, buildQwen21PortraitPrompt, portraitMood } from './qwen21';
import type { ComfyUIQueueResponse } from '../types';
import { GROWTH_MEDIUM, getCampaignMood } from '../style-config';
import { LOCK_REALISM } from '../qwen21-workflow';

type Wf = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 32, height: 40, channels: 3, background: { r: 120, g: 110, b: 100 } } }).png().toBuffer();
});

class TestQwen extends Qwen21Provider {
  queued: Wf[] = [];
  saved: Array<{ characterId: string; step?: string }> = [];
  metas: Array<Record<string, unknown> | undefined> = [];
  protected override async uploadReferenceImage(p: string) { return `ref:${p}`; }
  protected override async uploadBuffer(_b: Buffer, name: string) { return `buf:${name}`; }
  protected override async queuePrompt(wf: object): Promise<ComfyUIQueueResponse> {
    this.queued.push(wf as Wf);
    return { prompt_id: `job${this.queued.length}`, number: 0 };
  }
  protected override async waitForCompletion(id: string) { return { filename: '0', subfolder: id, type: 'serverless' }; }
  protected override async downloadImage() { return png; }
  protected override async savePortrait(characterId: string, _d: Buffer, step?: string, _seed?: number, meta?: Record<string, unknown>) {
    this.saved.push({ characterId, step });
    this.metas.push(meta);
    const p = `/portraits/${characterId}/${step}/.thumbs/g${this.saved.length}.webp`;
    return { imagePath: p, thumbnailPath: p };
  }
  protected override async saveRaw(imageWebPath: string) { return imageWebPath.replace('/.thumbs/', '/raw/').replace(/\.webp$/, '.png'); }
}

const BRIEF = { prompt: 'A painted character illustration of the person in <image1> with the body in <image2>, wearing her grey wool coat, standing square, the face at rest, in a walkup studio, grey morning light.' };
const REFS = { face: '/portraits/ch1/faces/approved.png', body: '/portraits/ch1/bodies/body.png' };

afterEach(() => { delete process.env.QWEN21_LOCK_INK_AT; delete process.env.QWEN21_LORAS; delete process.env.GROWTH_FINISH; });

describe('Qwen21Provider.renderPortrait', () => {
  it('ONE multi-reference render on the v1 recipe: face = <image1>, body = <image2>, LoRA 0.7, 4:5 canvas, saved under portrait/', async () => {
    process.env.QWEN21_LOCK_INK_AT = 'off';
    process.env.GROWTH_FINISH = 'off';
    const p = new TestQwen();
    const r = await p.renderPortrait('ch1', BRIEF, { ...REFS, seed: 4242, mood: 'growth' });
    expect(r.success).toBe(true);
    expect(r.imagePath).toBe('/portraits/ch1/portrait/.thumbs/g1.webp');
    expect(p.queued).toHaveLength(1);
    const wf = p.queued[0];
    expect(wf.LOAD_REF1.inputs.image).toBe('ref:/portraits/ch1/faces/approved.png');
    expect(wf.LOAD_REF2.inputs.image).toBe('ref:/portraits/ch1/bodies/body.png');
    expect(wf.LOAD_REF3).toBeUndefined();
    expect(wf.LORA_1.inputs).toMatchObject({ lora_name: 'grwthpaint_v1.safetensors', strength_model: 0.7 });
    expect(wf.EMPTY_LATENT.inputs).toMatchObject({ width: 832, height: 1040 }); // the portrait is waist up (2026-10-16)
    const prompt = String(wf.TEXT_ENCODE.inputs.prompt);
    expect(prompt).toMatch(/^grwthpaint, A painted character illustration of the person in <image1> with the body in <image2>, wearing her grey wool coat/);
    expect(prompt).toContain('A PORTRAIT framed from just above the top of the head down to just above the waist');
    expect(prompt).toContain(LOCK_REALISM);
    expect(prompt).toContain(portraitMood(getCampaignMood('growth')));
    expect(prompt).not.toContain('a dark moody ground behind'); // a portrait has a place behind her (2026-10-16)
    expect(prompt).not.toContain(GROWTH_MEDIUM);
    expect(p.saved[0]).toEqual({ characterId: 'ch1', step: 'portrait' });
    expect(p.metas[0]).toMatchObject({ provider: 'qwen21', stage: 'portrait', inkAt: 0 });
    expect(r.metadata.seed).toBe(4242);
    expect((r.metadata as unknown as Record<string, unknown>).portrait).toBe(true);
  });

  it('MID-GENERATION INK by default (0.8): job A stops at the midpoint, job B resumes from the inked image with the same seed and strength', async () => {
    process.env.GROWTH_FINISH = 'off';
    const p = new TestQwen();
    const r = await p.renderPortrait('ch1', BRIEF, { ...REFS, seed: 7 });
    expect(r.success).toBe(true);
    expect(p.queued).toHaveLength(2);
    expect(p.queued[0].SAMPLE.inputs).toMatchObject({ start_at_step: 0, end_at_step: 20 });
    expect(String(p.queued[1].LOAD_INIT.inputs.image)).toMatch(/^buf:qwen21-ink-mid-/);
    expect(p.queued[1].SAMPLE.inputs).toMatchObject({ start_at_step: 20 });
    expect(p.queued[1].LORA_1.inputs.strength_model).toBe(0.7);
    expect(p.queued[1].LOAD_REF1.inputs.image).toBe('ref:/portraits/ch1/faces/approved.png');
    expect(p.metas[0]?.inkAt).toBe(0.8);
    expect((r.metadata as unknown as Record<string, unknown>).inkAt).toBe(0.8);
  });

  it('refuses a brief that forgot the references (no job queued, no money spent)', async () => {
    process.env.QWEN21_LOCK_INK_AT = 'off';
    const p = new TestQwen();
    const r = await p.renderPortrait('ch1', { prompt: 'A woman in a coat.' }, REFS);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/<image1>/);
    expect(p.queued).toHaveLength(0);
  });

  it('buildQwen21PortraitPrompt is pure: brief + framing + realism + mood', () => {
    const s = buildQwen21PortraitPrompt('  x <image1> <image2>  ', 'noir');
    expect(s.startsWith('x <image1> <image2> A PORTRAIT framed')).toBe(true);
    expect(buildQwen21PortraitPrompt('x <image1> <image2>', 'noir', 'figure')).toContain('Framed from the head to the feet');
    expect(s).toContain(portraitMood(getCampaignMood('noir')));
  });
});
