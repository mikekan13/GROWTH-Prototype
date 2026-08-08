// Probe the serverless worker's model visibility: submit a workflow with a
// bogus unet/clip/vae name — ComfyUI's validation error lists the AVAILABLE
// options, telling us whether the volume layout (/runpod-volume/models/*)
// matches what our workflows expect. Cheap: fails before any model loads.
import fs from 'node:fs';
const env = fs.readFileSync('.env.local', 'utf-8');
const KEY = env.match(/^RUNPOD_API_KEY=["']?([^"'\r\n]+)/m)[1];
const EP = env.match(/^RUNPOD_ENDPOINT_ID=["']?([^"'\r\n]+)/m)[1];
const headers = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

const workflow = {
  UNET: { class_type: 'UNETLoader', inputs: { unet_name: '___probe___.safetensors', weight_dtype: 'default' } },
  CLIP: { class_type: 'CLIPLoader', inputs: { clip_name: '___probe___.safetensors', type: 'flux2' } },
  VAE: { class_type: 'VAELoader', inputs: { vae_name: '___probe___.safetensors' } },
  ENC: { class_type: 'CLIPTextEncode', inputs: { text: 'probe', clip: ['CLIP', 0] } },
  LAT: { class_type: 'EmptyFlux2LatentImage', inputs: { width: 256, height: 256, batch_size: 1 } },
  NOISE: { class_type: 'RandomNoise', inputs: { noise_seed: 1 } },
  SAMPSEL: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
  SCHED: { class_type: 'Flux2Scheduler', inputs: { steps: 1, width: 256, height: 256, denoise: 1, model: ['UNET', 0] } },
  GUID: { class_type: 'BasicGuider', inputs: { model: ['UNET', 0], conditioning: ['ENC', 0] } },
  SAMP: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['NOISE', 0], guider: ['GUID', 0], sampler: ['SAMPSEL', 0], sigmas: ['SCHED', 0], latent_image: ['LAT', 0] } },
  DEC: { class_type: 'VAEDecode', inputs: { samples: ['SAMP', 0], vae: ['VAE', 0] } },
  SAVE: { class_type: 'SaveImage', inputs: { images: ['DEC', 0], filename_prefix: 'probe' } },
};

console.log('Submitting probe (cold start may take 30-90s)...');
const r = await fetch(`https://api.runpod.ai/v2/${EP}/runsync`, {
  method: 'POST', headers,
  body: JSON.stringify({ input: { workflow } }),
  signal: AbortSignal.timeout(300_000),
});
const out = await r.json().catch(() => null);
const text = JSON.stringify(out, null, 1);
// Surface the available-options lists if present.
console.log('HTTP', r.status, 'status:', out?.status);
const m = text.match(/[^"]*not in list[^"]*/g);
if (m) m.slice(0, 6).forEach(x => console.log('VALIDATION:', x.slice(0, 700)));
else console.log(text.slice(0, 2500));
