/**
 * Body gen with PuLID hair transfer from player references.
 * - Primary PuLID (weight 0.7): locked face = face identity
 * - Secondary PuLID (weight 0.3, chained): player photos = hair source
 * - PULID_KEEP_HAIR=1 must be set in ComfyUI's env so secondary preserves hair pixels
 *
 * NUDE prompt (creationMode + NSFW LoRA) — DO NOT view output, just save for Mike.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const COMFY = 'http://127.0.0.1:8188';
const WORKFLOW_PATH = path.join(__dirname, '..', 'src', 'ai', 'portraits', 'workflows', 'character-portrait-pulid.json');

const PRIMARY_REF = path.join(__dirname, '..', 'public', 'portraits', 'creation-preview', 'refined', '542a44a3-9340-4c67-9bc5-ec4eedd0085a.webp');

// Pick 4 player reference photos. These should show Tara's hair.
const PLAYER_REFS = [
  path.join(__dirname, '..', 'public', 'uploads', 'references', 'cmnwdbkvn0000os48x6o2qulm', '02fd5036-19c6-44c3-8528-ae59187a9c1d.png'),
  path.join(__dirname, '..', 'public', 'uploads', 'references', 'cmnwdbkvn0000os48x6o2qulm', '03885a14-6504-4d52-a164-b274b6930935.jpg'),
  path.join(__dirname, '..', 'public', 'uploads', 'references', 'cmnwdbkvn0000os48x6o2qulm', '03a8891f-e0aa-426c-9a4a-d5b5a3629af9.jpg'),
  path.join(__dirname, '..', 'public', 'uploads', 'references', 'cmnwdbkvn0000os48x6o2qulm', '5753d7ab-0d84-478d-a414-7f018f1118de.png'),
];

const CLIP_L = 'in the style of ckpf, aidmafluxpro1.1, drkfnts style, hyperrealistic fantasy portrait, art nouveau influence, extremely detailed, subtle painterly quality, a 19-year-old Female Altered Human, very long thick wavy black hair made of individual strands, hair texture clearly visible as thousands of individual hair strands, voluminous fuller hair, multiple loose braids cascading down, partially braided sections, side-swept bangs, hair ends at thigh-length, thigh-length hair past hips down to mid-thighs, glossy black silken hair flowing freely behind shoulders and down the back, Porcelain skin, Bright green with gold center eyes, Slim build, nude, completely bare, no clothing, no accessories, A-pose standing arms slightly away from body, full body from head to feet, entire body visible feet on ground, full body reference shot standing figure centered in frame head at top feet at bottom, long shot framing, wide angle, neutral grey background';
const T5XXL = 'A 19-year-old Female Altered Human with very long thick wavy black hair made of individual strands. Her hair is voluminous and fuller, with multiple loose braids cascading down and partially braided sections at the sides. Side-swept bangs frame her face. The hair is thigh-length, flowing freely behind her shoulders and down her back, ending at her mid-thighs. Glossy black silken hair texture clearly visible as thousands of individual hair strands. Porcelain skin. Bright green with gold center eyes. Slim build. The character is completely nude with bare skin, no clothing whatsoever. She stands in an A-pose with arms held slightly away from the body. The entire body is visible from head to feet including the full figure and both feet on the ground. Full body reference shot, standing figure centered in frame, head at top of frame and feet at bottom, long shot framing, wide angle, neutral grey background with balanced even lighting.';
const NEG = 'robe, cloak, cape, dress, gown, kimono, fabric panel, fabric drape, garment, robes, shawl, mantle, train, fabric flowing behind';

const SEED = Math.floor(Math.random() * 2147483647);
const WIDTH = 768, HEIGHT = 1152, STEPS = 15, CFG = 1.0;
const PULID_PRIMARY_WEIGHT = 0.7;
const PULID_SECONDARY_WEIGHT = 0.4;  // bumped from 0.3 — hair signal needs strength

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => { let c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${t}`)); try { resolve(JSON.parse(t)); } catch { resolve(t); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}
function getJson(url) {
  return new Promise((resolve, reject) => { http.get(url, res => { let c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${t}`)); try { resolve(JSON.parse(t)); } catch { resolve(t); } }); }).on('error', reject); });
}
async function uploadImage(localPath) {
  const buf = fs.readFileSync(localPath);
  const filename = path.basename(localPath);
  const ct = filename.endsWith('.png') ? 'image/png' : (filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
  const boundary = '----formdata-' + Date.now() + Math.random();
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${ct}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([Buffer.from(head), buf, Buffer.from(tail)]);
  return new Promise((resolve, reject) => {
    const u = new URL(COMFY + '/upload/image');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length } },
      res => { let c = []; res.on('data', d => c.push(d)); res.on('end', () => { const t = Buffer.concat(c).toString('utf8'); if (res.statusCode >= 400) return reject(new Error(`upload: ${res.statusCode}: ${t}`)); try { resolve(JSON.parse(t).name); } catch { resolve(filename); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function main() {
  console.log('[hairtest] uploading primary:', path.basename(PRIMARY_REF));
  const uploadedPrimary = await uploadImage(PRIMARY_REF);
  console.log('[hairtest] uploaded primary:', uploadedPrimary);

  const uploadedSecondaries = [];
  for (const p of PLAYER_REFS) {
    try {
      const u = await uploadImage(p);
      uploadedSecondaries.push(u);
      console.log('[hairtest]   secondary:', u);
    } catch (e) { console.log('[hairtest]   skipping (missing):', path.basename(p)); }
  }

  const wf = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  for (const k of Object.keys(wf)) if (k.startsWith('_')) delete wf[k];

  // Swap GGUF CLIP loader → standard
  for (const n of Object.values(wf)) if (n.class_type === 'DualCLIPLoaderGGUF') n.class_type = 'DualCLIPLoader';

  // Inject params, set primary PuLID
  let primaryPulidId = null, primaryLoadId = null;
  for (const [id, n] of Object.entries(wf)) {
    const ct = n.class_type;
    if (ct === 'EmptyLatentImage') { n.inputs.width = WIDTH; n.inputs.height = HEIGHT; }
    if (ct === 'KSampler') { n.inputs.seed = SEED; n.inputs.steps = STEPS; n.inputs.cfg = CFG; n.inputs.denoise = 1.0; }
    if (ct === 'CLIPTextEncodeFlux' && n._meta?.title?.toLowerCase().includes('positive')) { n.inputs.clip_l = CLIP_L; n.inputs.t5xxl = T5XXL; }
    if (ct === 'CLIPTextEncode' && n._meta?.title?.toLowerCase().includes('negative')) { n.inputs.text = NEG; }
    if (ct === 'ApplyPulidFlux') { n.inputs.weight = PULID_PRIMARY_WEIGHT; primaryPulidId = id; }
    if (ct === 'LoadImage' && n._meta?.title?.toLowerCase().includes('pulid')) { n.inputs.image = uploadedPrimary; primaryLoadId = id; }
  }

  // LoRA weights — body gen final
  for (const n of Object.values(wf)) {
    if (n.class_type !== 'LoraLoader') continue;
    const t = (n._meta?.title || '').toLowerCase();
    if (t.includes('style')) { n.inputs.strength_model = 0.5; n.inputs.strength_clip = 0.5; }
    else if (t.includes('campaign')) { n.inputs.strength_model = 0.4; n.inputs.strength_clip = 0.4; }
    else if (t.includes('hand detail')) { n.inputs.strength_model = 0; n.inputs.strength_clip = 0; }  // off for body
    else if (t.includes('nsfw')) { n.inputs.strength_model = 0.8; n.inputs.strength_clip = 0.8; }  // ON for nude
    else if (t.includes('detail')) { n.inputs.strength_model = 0.55; n.inputs.strength_clip = 0.55; }
  }

  // Strip 0-strength LoRAs (only hand-detail in this config)
  for (const [id, n] of Object.entries(wf)) {
    if (n.class_type !== 'LoraLoader') continue;
    if (n.inputs.strength_model === 0 && n.inputs.strength_clip === 0) {
      const modelIn = n.inputs.model, clipIn = n.inputs.clip;
      for (const other of Object.values(wf)) { const oi = other.inputs; if (!oi) continue; for (const [k, v] of Object.entries(oi)) { if (Array.isArray(v) && v[0] === id) { if (v[1] === 0) oi[k] = modelIn; if (v[1] === 1) oi[k] = clipIn; } } }
      delete wf[id];
    }
  }

  // Build secondary PuLID chain — chain ApplyPulidFlux off primary's model output
  if (uploadedSecondaries.length > 0 && primaryPulidId) {
    const primary = wf[primaryPulidId];
    const primaryInputs = primary.inputs;
    let secondaryImage;
    if (uploadedSecondaries.length === 1) {
      const lid = 'sec_load_0';
      wf[lid] = { class_type: 'LoadImage', inputs: { image: uploadedSecondaries[0] }, _meta: { title: 'PuLID Secondary 0' } };
      secondaryImage = [lid, 0];
    } else {
      const lid0 = 'sec_load_0';
      wf[lid0] = { class_type: 'LoadImage', inputs: { image: uploadedSecondaries[0] }, _meta: { title: 'PuLID Secondary 0' } };
      let last = [lid0, 0];
      for (let i = 1; i < uploadedSecondaries.length; i++) {
        const lid = `sec_load_${i}`;
        const bid = `sec_batch_${i}`;
        wf[lid] = { class_type: 'LoadImage', inputs: { image: uploadedSecondaries[i] }, _meta: { title: `PuLID Secondary ${i}` } };
        wf[bid] = { class_type: 'ImageBatch', inputs: { image1: last, image2: [lid, 0] }, _meta: { title: `PuLID Secondary Batch ${i}` } };
        last = [bid, 0];
      }
      secondaryImage = last;
    }
    const secId = 'pulid_secondary';
    wf[secId] = {
      class_type: 'ApplyPulidFlux',
      inputs: { model: [primaryPulidId, 0], pulid_flux: primaryInputs.pulid_flux, eva_clip: primaryInputs.eva_clip, face_analysis: primaryInputs.face_analysis, image: secondaryImage, weight: PULID_SECONDARY_WEIGHT, start_at: 0, end_at: 1 },
      _meta: { title: 'PuLID Secondary (hair refs)' },
    };
    // Rewire downstream consumers of primary.model → secondary.model
    for (const [oid, on] of Object.entries(wf)) {
      if (oid === primaryPulidId || oid === secId) continue;
      const oi = on.inputs; if (!oi) continue;
      for (const [k, v] of Object.entries(oi)) {
        if (Array.isArray(v) && v[0] === primaryPulidId && v[1] === 0) oi[k] = [secId, 0];
      }
    }
    console.log(`[hairtest] PuLID chain: primary=${PULID_PRIMARY_WEIGHT}, secondary=${PULID_SECONDARY_WEIGHT} (${uploadedSecondaries.length} hair refs)`);
  }

  console.log(`[hairtest] params: ${WIDTH}x${HEIGHT} steps=${STEPS} seed=${SEED}`);
  const queueRes = await postJson(COMFY + '/prompt', { prompt: wf, client_id: 'hairtest-' + Date.now() });
  console.log('[hairtest] queued:', queueRes.prompt_id);

  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const h = await getJson(COMFY + '/history/' + queueRes.prompt_id);
    if (h[queueRes.prompt_id]) {
      const status = h[queueRes.prompt_id].status;
      if (status.completed) {
        console.log('[hairtest] completed:', status.status_str);
        const outputs = h[queueRes.prompt_id].outputs;
        for (const o of Object.values(outputs)) {
          if (o.images) {
            for (const img of o.images) {
              const url = `${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder||'')}&type=${encodeURIComponent(img.type||'output')}`;
              const imgBuf = await new Promise((resolve, reject) => { http.get(url, res => { let c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); }).on('error', reject); });
              const outPath = path.join(__dirname, `test-hair-${Date.now()}.png`);
              fs.writeFileSync(outPath, imgBuf);
              console.log('[hairtest] saved:', outPath, `(${imgBuf.length} bytes)`);
            }
          }
        }
        break;
      }
    }
  }
}
main().catch(e => { console.error('[hairtest] ERROR:', e.message); process.exit(1); });
