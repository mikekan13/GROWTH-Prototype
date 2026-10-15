import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { Qwen21Provider, isStoredPortraitPath } from './qwen21';
import type { ComfyUIQueueResponse, PortraitInput } from '../types';
import type { LockGateVerdict } from '../lock-gate';
import { GROWTH_MEDIUM, getCampaignMood } from '../style-config';

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
  metas: Array<Record<string, unknown> | undefined> = [];
  protected override async savePortrait(characterId: string, _d: Buffer, step?: string, _seed?: number, meta?: Record<string, unknown>) {
    const p = `/portraits/${characterId}/${step}/.thumbs/g${this.saved.length}.webp`;
    this.saved.push(p);
    this.metas.push(meta);
    return { imagePath: p, thumbnailPath: p };
  }
  protected override async defaultStyleRefs() { return ['/abs/s1.png', '/abs/s2.png']; }
  raws: Array<{ path: string; raw: Buffer }> = [];
  protected override async saveRaw(imageWebPath: string, raw: Buffer) {
    const p = imageWebPath.replace('/.thumbs/', '/raw/').replace(/\.webp$/, '.png');
    this.raws.push({ path: p, raw });
    return p;
  }
  /** Gate stubbed: verdicts handed out in order (default pass); never reaches Ollama. */
  verdicts: LockGateVerdict[] = [];
  gateCalls = 0;
  protected override async checkLock() {
    this.gateCalls++;
    return this.verdicts.shift() ?? { pass: true, reasons: [], score: 1 };
  }
}

const fail = (score: number, reason: string): LockGateVerdict => ({ pass: false, reasons: [reason], score });

describe('Qwen21Provider.lockIdentity — BASE-LOCK GATE (gate stubbed)', () => {
  const seedOf = (wf: Wf) => {
    const node = Object.values(wf).find(n => n.inputs && typeof n.inputs.seed === 'number');
    return node?.inputs.seed;
  };

  it('pass first time → 1 render, gate { pass, attempts: 1 }', async () => {
    delete process.env.QWEN21_STYLE_MODE; delete process.env.QWEN21_LOCK_GATE;
    const p = new TestQwen();
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7);
    expect(p.queued).toHaveLength(1);
    expect(r.gate).toEqual({ pass: true, reasons: [], attempts: 1, seed: 7, score: 1 });
  });

  it('fail, fail, pass → 3 renders on seeds S, S+1, S+2; returns the third; only it is saved', async () => {
    delete process.env.QWEN21_STYLE_MODE; delete process.env.QWEN21_LOCK_GATE;
    const p = new TestQwen();
    p.verdicts = [fail(0.5, 'clothed'), fail(0.75, 'off-pose'), { pass: true, reasons: [], score: 1 }];
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7);
    expect(p.queued).toHaveLength(3);
    expect(p.queued.map(seedOf)).toEqual([7, 8, 9]);
    expect(p.gateCalls).toBe(3);
    expect(r.seed).toBe(9);
    expect(r.gate).toEqual({ pass: true, reasons: [], attempts: 3, seed: 9, score: 1 });
    expect(p.saved).toHaveLength(1);
  });

  it('all fail → max 2 retries; returns the best-scoring attempt, flagged', async () => {
    delete process.env.QWEN21_STYLE_MODE; delete process.env.QWEN21_LOCK_GATE;
    const p = new TestQwen();
    p.verdicts = [fail(0.25, 'clothed'), fail(0.75, 'off-pose'), fail(0.5, 'framing'), fail(1, 'never reached')];
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 100);
    expect(p.queued).toHaveLength(3);
    expect(p.gateCalls).toBe(3);
    expect(r.seed).toBe(101);
    expect(r.gate).toEqual({ pass: false, reasons: ['off-pose'], attempts: 3, seed: 101, score: 0.75 });
    expect(p.saved).toHaveLength(1);
  });

  it('QWEN21_LOCK_GATE=off → one render, no check, gate { bypassed }', async () => {
    delete process.env.QWEN21_STYLE_MODE;
    process.env.QWEN21_LOCK_GATE = 'off';
    const p = new TestQwen();
    p.verdicts = [fail(0, 'would fail')];
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7);
    delete process.env.QWEN21_LOCK_GATE;
    expect(p.queued).toHaveLength(1);
    expect(p.gateCalls).toBe(0);
    expect(r.gate).toMatchObject({ pass: true, attempts: 1, bypassed: true });
  });

  it('unpainted (two-step) lock is not gated', async () => {
    const p = new TestQwen();
    p.verdicts = [fail(0, 'would fail')];
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7, { painted: false });
    expect(p.gateCalls).toBe(0);
    expect(r.gate).toBeUndefined();
  });

  it('generatePortrait carries the gate into metadata.gate', async () => {
    delete process.env.QWEN21_STYLE_MODE; delete process.env.QWEN21_LOCK_GATE;
    const p = new TestQwen();
    p.verdicts = [fail(0.5, 'clothed')];
    const r = await p.generatePortrait(input({ refs: ['/uploads/references/c/a.jpg'] }));
    expect((r.metadata as unknown as Record<string, unknown>).gate).toEqual({ pass: true, reasons: [], attempts: 2, seed: 8, score: 1 });
    expect(r.metadata.seed).toBe(8);
  });
});

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
  // These cases exercise the prompt stack WITHOUT the GROWTH style LoRA (env unset = grwthpaint 0.6 since 14 Oct).
  beforeEach(() => { process.env.QWEN21_LORAS = 'none'; });
  afterEach(() => { delete process.env.QWEN21_LORAS; });

  it('env unset (the 14 Oct baseline): grwthpaint_v1 at 0.7 on every gen, trigger first, lock MEDIUM stripped', async () => {
    delete process.env.QWEN21_LORAS; delete process.env.QWEN21_STYLE_MODE;
    const p = patch(new TestQwen());
    const r = await p.generatePortrait(input({ refs: ['/uploads/references/c/a.jpg'] }));
    expect(r.success).toBe(true);
    const wf = p.queued[0];
    expect(wf.LORA_1.inputs.lora_name).toBe('grwthpaint_v1.safetensors');
    expect(wf.LORA_1.inputs.strength_model).toBe(0.7);
    const prompt = String(wf.TEXT_ENCODE.inputs.prompt);
    expect(prompt).toMatch(/^grwthpaint, A painted character illustration of the person in <image1>, head and shoulders\./);
    expect(prompt).not.toContain(GROWTH_MEDIUM);
    expect(prompt).not.toMatch(/no grain, no noise/);
    expect(prompt).toContain(getCampaignMood('growth'));
    expect(p.metas[0]?.loras).toBe('grwthpaint_v1.safetensors:0.7:grwthpaint');

    // A later alteration (body from the bust) carries the same LoRA at the same strength.
    await p.generateBody('c', p.saved[0], 3);
    const body = p.queued[1];
    expect(body.LORA_1.inputs.lora_name).toBe('grwthpaint_v1.safetensors');
    expect(body.LORA_1.inputs.strength_model).toBe(0.7);
    expect(String(body.TEXT_ENCODE.inputs.prompt).startsWith('grwthpaint, ')).toBe(true);
    expect(p.metas[1]?.loras).toBe('grwthpaint_v1.safetensors:0.7:grwthpaint');
  });

  it('default (single mode): photos → one painted lock pass, no second pass', async () => {
    delete process.env.QWEN21_STYLE_MODE;
    const p = patch(new TestQwen());
    const r = await p.generatePortrait(input({ refs: ['/uploads/references/c/a.jpg', '/uploads/references/c/b.jpg'] }));
    expect(r.success).toBe(true);
    expect(p.queued).toHaveLength(1);
    expect(p.queued[0].TEXT_ENCODE.inputs.prompt).toMatch(/^A painted character illustration of the person in <image1> and <image2>, head and shoulders\./);
    expect(p.queued[0].TEXT_ENCODE.inputs.prompt).toMatch(/no grain, no noise/);
    expect(r.imagePath).toBe(p.saved[0]);
  });

  it('refs mode: photos (no lock yet) → lockIdentity then applyStyle; never mixes photos and style refs', async () => {
    process.env.QWEN21_STYLE_MODE = 'refs';
    const p = patch(new TestQwen());
    const r = await p.generatePortrait(input({ refs: ['/uploads/references/c/a.jpg', '/uploads/references/c/b.jpg'] }));
    delete process.env.QWEN21_STYLE_MODE;
    expect(r.success).toBe(true);
    expect(p.queued).toHaveLength(2);

    const [lock, style] = p.queued;
    expect(lock.TEXT_ENCODE.inputs.prompt).toMatch(/^A head-and-shoulders portrait of the person in <image1> and <image2>\./);
    expect(lock.LOAD_REF1.inputs.image).toBe('ref:/uploads/references/c/a.jpg');
    expect(lock.LOAD_REF2.inputs.image).toBe('ref:/uploads/references/c/b.jpg');
    expect(lock.LOAD_REF3).toBeUndefined();

    expect(style.TEXT_ENCODE.inputs.prompt).toMatch(/^Repaint <image1> as a painted character illustration in the style of <image2> and <image3>:/);
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

  it('FINISH: saved image is finished, the raw model output is saved beside it under raw/', async () => {
    delete process.env.GROWTH_FINISH;
    const p = patch(new TestQwen());
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7);
    expect(r.rawData.equals(png)).toBe(true);
    expect(r.imageData.equals(png)).toBe(false);
    expect(p.raws).toHaveLength(1);
    expect(p.raws[0].raw.equals(png)).toBe(true);
    expect(r.rawPath).toBe('/portraits/char1/faces/raw/g0.png');
  });

  it('GROWTH_FINISH=off → saved image is the raw output (raw still saved)', async () => {
    process.env.GROWTH_FINISH = 'off';
    const p = patch(new TestQwen());
    const r = await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7);
    delete process.env.GROWTH_FINISH;
    expect(r.imageData.equals(png)).toBe(true);
    expect(p.raws).toHaveLength(1);
  });

  it('CORPUS generateContent → zero-image workflow on EMPTY_LATENT, plain prompt, finish skipped', async () => {
    delete process.env.GROWTH_FINISH;
    const p = patch(new TestQwen());
    const r = await p.generateContent('corpus-content', 'A lamp on a table, lit by a candle.', 42, { width: 1248, height: 832 });
    expect(p.queued).toHaveLength(1);
    const wf = p.queued[0];
    expect(wf.LOAD_REF1).toBeUndefined();
    expect(Object.keys(wf.TEXT_ENCODE.inputs).some(k => k.startsWith('images.'))).toBe(false);
    expect(wf.EMPTY_LATENT.inputs).toMatchObject({ width: 1248, height: 832 });
    expect(wf.SAMPLE.inputs.latent_image).toEqual(['EMPTY_LATENT', 0]);
    expect(wf.SAMPLE.inputs.seed).toBe(42);
    expect(wf.TEXT_ENCODE.inputs.prompt).toBe('A lamp on a table, lit by a candle. Sharp, well-lit, clear subject.');
    // finish skipped even though GROWTH_FINISH is on: saved image IS the raw output
    expect(r.imageData.equals(png)).toBe(true);
    expect(r.rawData.equals(png)).toBe(true);
    expect(p.saved[0]).toContain('/corpus/');
  });

  it('MOOD: campaignStyle.styleMood reaches the lock prompt; default is growth', async () => {
    delete process.env.QWEN21_STYLE_MODE;
    const p = patch(new TestQwen());
    await p.generatePortrait({ ...input({ refs: ['/uploads/references/c/a.jpg'] }), campaignStyle: { styleMood: 'horror' } });
    await p.generatePortrait(input({ refs: ['/uploads/references/c/a.jpg'] }));
    expect(p.queued[0].TEXT_ENCODE.inputs.prompt).toContain(getCampaignMood('horror'));
    expect(p.queued[1].TEXT_ENCODE.inputs.prompt).toContain(getCampaignMood('growth'));
  });

  it('object-ref edits are refused, not silently ignored', async () => {
    const p = patch(new TestQwen());
    const r = await p.editImage('/portraits/c/x.png', 'add a sword', { objectRefImagePath: '/uploads/sword.png' });
    expect(r.success).toBe(false);
    expect(p.queued).toHaveLength(0);
  });
});

describe('Qwen21Provider — community LoRA blend (QWEN21_LORAS)', () => {
  const SPEC = 'cine1p_c1-st4000.safetensors:0.7:cine1p,Inklingv2-qwen21_c1-st6000.safetensors:0.25:Inklingv2';
  const loraNodes = (wf: Wf) => Object.keys(wf).filter(k => k.startsWith('LORA_')).sort();

  it('env default reaches every generation (lock) and the saved metadata', async () => {
    process.env.QWEN21_LORAS = SPEC; process.env.QWEN21_LOCK_GATE = 'off'; delete process.env.QWEN21_STYLE_MODE;
    try {
      const p = new TestQwen();
      await p.lockIdentity('char1', ['/uploads/references/c/a.jpg'], 7);
      const wf = p.queued[0];
      expect(loraNodes(wf)).toEqual(['LORA_1', 'LORA_2']);
      expect(wf.CACHE.inputs.model).toEqual(['LORA_2', 0]);
      expect(String(wf.TEXT_ENCODE.inputs.prompt).startsWith('cine1p, Inklingv2, ')).toBe(true);
      expect(p.metas[0]?.loras).toBe(SPEC);
    } finally { delete process.env.QWEN21_LORAS; delete process.env.QWEN21_LOCK_GATE; }
  });

  it('setLoras overrides the env; [] disables; content generation never takes LoRAs', async () => {
    process.env.QWEN21_LORAS = SPEC;
    try {
      const p = new TestQwen();
      p.setLoras([{ file: 'x.safetensors', strength: 1 }]);
      await p.describeBase('c', 'a dwarf', 1);
      expect(loraNodes(p.queued[0])).toEqual(['LORA_1']);
      expect(p.queued[0].LORA_1.inputs.lora_name).toBe('x.safetensors');
      expect(p.metas[0]?.loras).toBe('x.safetensors:1');

      p.setLoras([]);
      await p.describeBase('c', 'a dwarf', 1);
      expect(loraNodes(p.queued[1])).toEqual([]);
      expect(p.metas[1]?.loras).toBeNull();

      const q = new TestQwen();
      await q.generateContent('c', 'a lamp', 1, { width: 64, height: 64 });
      expect(loraNodes(q.queued[0])).toEqual([]);
    } finally { delete process.env.QWEN21_LORAS; }
  });
});
