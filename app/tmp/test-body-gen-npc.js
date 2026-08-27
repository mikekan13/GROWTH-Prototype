/**
 * Standalone body-gen test: hits ComfyUI directly with the current body config
 * to verify the dimension / PuLID-weight / prompt changes produce a saved image.
 *
 * Run from app/: `node tmp/test-body-gen.js`
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const COMFY = 'http://127.0.0.1:8188';
const WORKFLOW_PATH = path.join(__dirname, '..', 'src', 'ai', 'portraits', 'workflows', 'character-portrait-pulid.json');

// Use the existing locked face as PuLID ref
const PULID_REF = path.join(__dirname, '..', 'public', 'portraits', 'cmnz3fegs00019048cr1wc2d5', 'refined', '6ac8040d-76e3-41ce-902d-5ce82f74018a.webp');

// Hand-crafted prompt approximating what the builder would produce for Tara's body
// Iteration 2: previous gen confused "knee-length hair" with a robe/cape. Adding
// strand-level hair tokens + explicit no-robe negatives. Hair MUST read as discrete
// strands of hair, not as a flowing fabric panel behind the figure.
const CLIP_L = 'in the style of ckpf, aidmafluxpro1.1, drkfnts style, hyperrealistic fantasy portrait, art nouveau influence, extremely detailed, subtle painterly quality, a 19-year-old Female Altered Human, very long straight black hair made of individual strands, hair texture clearly visible as thousands of individual hair strands, knee-length hair, hair flowing freely past her hips down to her knees behind her shoulders, side-swept bangs, partially braided sections at the sides, glossy black silken hair, Porcelain skin, Bright green with gold center eyes, Slim build, wearing plain neutral grey bra and panties, simple modest underwear only, A-pose standing arms slightly away from body, full body from head to feet, entire body visible feet on ground, full body reference shot standing figure centered in frame head at top feet at bottom, long shot framing, wide angle, neutral grey background';
const T5XXL = 'A 19-year-old Female Altered Human with very long straight black hair made of individual strands. Her hair is knee-length, flowing freely behind her shoulders and down her back, with hair texture clearly visible as thousands of individual hair strands. She has side-swept bangs and partially braided sections at the sides. Her hair is glossy black and silken. Porcelain skin. Bright green with gold center eyes. Slim build. She wears only simple plain neutral grey underwear (bra and panties). She stands in an A-pose with arms held slightly away from the body. The entire body is visible from head to feet including the full figure and both feet on the ground. Full body reference shot, standing figure centered in frame, head at top of frame and feet at bottom, long shot framing, wide angle, neutral grey background with balanced even lighting.';
const NEG = 'robe, cloak, cape, dress, gown, kimono, fabric panel, fabric drape, garment, robes, shawl, mantle, train, fabric flowing behind';

const SEED = Math.floor(Math.random() * 2147483647);
const WIDTH = 768;
const HEIGHT = 1152;
const STEPS = parseInt(process.env.STEPS || '20', 10);
const CFG = 1.0;
const PULID_WEIGHT = parseFloat(process.env.PULID_WEIGHT || '0.7');

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${txt}`));
        try { resolve(JSON.parse(txt)); } catch { resolve(txt); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${txt}`));
        try { resolve(JSON.parse(txt)); } catch { resolve(txt); }
      });
    }).on('error', reject);
  });
}

async function uploadImage(localPath) {
  const buf = fs.readFileSync(localPath);
  const filename = path.basename(localPath);
  const boundary = '----formdata-' + Date.now();
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/webp\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head), buf, Buffer.from(tail)]);

  return new Promise((resolve, reject) => {
    const u = new URL(COMFY + '/upload/image');
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
    }, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) return reject(new Error(`upload: ${res.statusCode}: ${txt}`));
        try { resolve(JSON.parse(txt).name); } catch { resolve(filename); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('[test] uploading PuLID ref:', path.basename(PULID_REF));
  const uploadedRef = await uploadImage(PULID_REF);
  console.log('[test] uploaded as:', uploadedRef);

  const wf = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));

  // Strip comment keys
  for (const k of Object.keys(wf)) if (k.startsWith('_')) delete wf[k];

  // Swap GGUF CLIP loader → standard (fp8)
  for (const n of Object.values(wf)) {
    if (n.class_type === 'DualCLIPLoaderGGUF') n.class_type = 'DualCLIPLoader';
  }

  // Inject params
  for (const n of Object.values(wf)) {
    const ct = n.class_type;
    if (ct === 'EmptyLatentImage') { n.inputs.width = WIDTH; n.inputs.height = HEIGHT; }
    if (ct === 'KSampler') { n.inputs.seed = SEED; n.inputs.steps = STEPS; n.inputs.cfg = CFG; n.inputs.denoise = 1.0; }
    if (ct === 'CLIPTextEncodeFlux') {
      if (n._meta?.title?.toLowerCase().includes('positive')) {
        n.inputs.clip_l = CLIP_L; n.inputs.t5xxl = T5XXL;
      }
    }
    if (ct === 'CLIPTextEncode' && n._meta?.title?.toLowerCase().includes('negative')) {
      n.inputs.text = NEG;
    }
    if (ct === 'ApplyPulidFlux') { n.inputs.weight = PULID_WEIGHT; }
    if (ct === 'LoadImage' && n._meta?.title?.toLowerCase().includes('pulid')) {
      n.inputs.image = uploadedRef;
    }
  }

  // Strip zero-strength LoRAs (our standard provider behavior)
  // For body gen with composition='full_body': handDetailLoraWeight=0.6 (isFinal true), nsfw=0.
  // painterly 0.75 (face-lock final? no — not face-lock here since no anglePreset)
  // Actually for body gen isFaceLock=false, isFinal=true: painterly=config.loraStrength=0.5, detail=0.55, campaign=0.4, hand=0.6
  // Set these weights now.
  for (const n of Object.values(wf)) {
    if (n.class_type !== 'LoraLoader') continue;
    const t = (n._meta?.title || '').toLowerCase();
    if (t.includes('style')) { n.inputs.strength_model = 0.5; n.inputs.strength_clip = 0.5; }
    else if (t.includes('campaign')) { n.inputs.strength_model = 0.4; n.inputs.strength_clip = 0.4; }
    else if (t.includes('hand detail')) { n.inputs.strength_model = 0.6; n.inputs.strength_clip = 0.6; }
    else if (t.includes('nsfw')) { n.inputs.strength_model = 0; n.inputs.strength_clip = 0; }
    else if (t.includes('detail')) { n.inputs.strength_model = 0.55; n.inputs.strength_clip = 0.55; }
  }

  // Strip 0-strength LoRAs
  for (const [id, n] of Object.entries(wf)) {
    if (n.class_type !== 'LoraLoader') continue;
    if (n.inputs.strength_model === 0 && n.inputs.strength_clip === 0) {
      const modelIn = n.inputs.model, clipIn = n.inputs.clip;
      for (const other of Object.values(wf)) {
        const oi = other.inputs;
        if (!oi) continue;
        for (const [k, v] of Object.entries(oi)) {
          if (Array.isArray(v) && v[0] === id) {
            if (v[1] === 0) oi[k] = modelIn;
            if (v[1] === 1) oi[k] = clipIn;
          }
        }
      }
      delete wf[id];
    }
  }

  console.log('[test] params: dims=' + WIDTH + 'x' + HEIGHT + ' steps=' + STEPS + ' pulid=' + PULID_WEIGHT + ' seed=' + SEED);
  const clientId = 'test-' + Date.now();
  const queueRes = await postJson(COMFY + '/prompt', { prompt: wf, client_id: clientId });
  console.log('[test] queued prompt_id:', queueRes.prompt_id);

  // Poll for completion
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const h = await getJson(COMFY + '/history/' + queueRes.prompt_id);
    if (h[queueRes.prompt_id]) {
      const status = h[queueRes.prompt_id].status;
      if (status.completed) {
        console.log('[test] completed, status:', status.status_str);
        const outputs = h[queueRes.prompt_id].outputs;
        for (const o of Object.values(outputs)) {
          if (o.images) {
            for (const img of o.images) {
              const url = `${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder||'')}&type=${encodeURIComponent(img.type||'output')}`;
              console.log('[test] output:', url);
              // Download
              const imgBuf = await new Promise((resolve, reject) => {
                http.get(url, res => {
                  let chunks = [];
                  res.on('data', c => chunks.push(c));
                  res.on('end', () => resolve(Buffer.concat(chunks)));
                }).on('error', reject);
              });
              const outPath = path.join(__dirname, `test-body-${Date.now()}.png`);
              fs.writeFileSync(outPath, imgBuf);
              console.log('[test] saved:', outPath, `(${imgBuf.length} bytes)`);
            }
          }
        }
        break;
      }
    }
  }
}

main().catch(e => { console.error('[test] ERROR:', e.message); process.exit(1); });
