import 'server-only';

/**
 * BASE-LOCK GATE (2026-10-13).
 *
 * Mike's ruling: the base identity lock has ONE fixed composition for every
 * character — "keep the framing and pose exact regardless of character"
 * (passport-style: square to camera, head upright, head-and-shoulders with a
 * little headroom, eyes open to camera, bare shoulders, no accessories). The
 * painted look words still pull period costume / a seated 3/4 pose on ~3 seeds
 * in 10, so after a lock is rendered a cheap vision check judges it and the
 * provider re-rolls (qwen21.ts lockIdentity).
 *
 * THE WALL (ruling-cloud-soul-local-spirit-privacy-wall): a lock is derived from
 * photos of a REAL person, so it is judged by the LOCAL vision model only —
 * Ollama on this machine (OLLAMA_URL, default 127.0.0.1:11434), model
 * LOCK_GATE_VISION_MODEL (default qwen2.5vl:7b). Never a cloud model. A
 * vision host that is not loopback / private / tailnet is refused.
 *
 * FAIL-OPEN: any error (Ollama down, timeout, junk reply) → pass with reason
 * 'gate unavailable'. The checker being down never blocks a lock.
 */

import sharp from 'sharp';

export interface LockGateVerdict {
  pass: boolean;
  reasons: string[];
  /** 0..1 — fraction of the four checks passed (1 = all). Used to pick the best failing attempt. */
  score: number;
  /** true when the checker could not judge (fail-open). */
  unavailable?: boolean;
}

/** What lockIdentity puts in metadata.gate. */
export interface LockGateMeta {
  pass: boolean;
  reasons: string[];
  /** Renders made (1 = first seed passed; 3 = re-rolled twice). */
  attempts: number;
  /** Seed of the returned attempt (S, S+1 or S+2). */
  seed: number;
  score: number;
  /** QWEN21_LOCK_GATE=off. */
  bypassed?: boolean;
}

export const LOCK_GATE_TIMEOUT_MS = 45_000; // verified ~20 s warm, 33 s cold on qwen2.5vl:7b at 768 px — 20 s fail-opened too easily
export const LOCK_GATE_DEFAULT_MODEL = 'qwen2.5vl:7b';
/** Longest side sent to the VL model. 768 = the size verified 2026-10-13 (~20 s warm on qwen2.5vl:7b); LOCK_GATE_DIM lowers it for speed. */
const GATE_IMAGE_DIM = 768;
function gateImageDim(): number {
  const n = Number(process.env.LOCK_GATE_DIM);
  return Number.isFinite(n) && n >= 256 && n <= 1536 ? Math.round(n) : GATE_IMAGE_DIM;
}

export function lockGateEnabled(): boolean {
  return (process.env.QWEN21_LOCK_GATE || 'on').toLowerCase() !== 'off';
}

export const LOCK_GATE_PROMPT = `You are checking a generated portrait against a fixed passport-photo composition. Look only at the image. Answer four questions:
- clothed: true if ANY clothing, fabric, garment, strap, collar, neckline, choker, necklace, earring or other jewellery is visible on the person; false if the shoulders and chest are bare skin.
- tilted: true if the head is tilted, turned, leaning, in three-quarter or profile view, or the body is seated/turned; false if the face and shoulders are square to the camera and the head is upright.
- framing_ok: true if it is a head-and-shoulders crop with the whole head visible and a little space above the head; false if it is full body, half body, cropped through the head, or the head touches the top edge.
- eyes_ok: true if both eyes are open and looking at the camera.
Reply with ONLY this JSON, no other text: {"clothed": true|false, "tilted": true|false, "framing_ok": true|false, "eyes_ok": true|false}`;

type Check = { key: 'clothed' | 'tilted' | 'framing_ok' | 'eyes_ok'; failWhen: boolean; reason: string };
const CHECKS: Check[] = [
  { key: 'clothed', failWhen: true, reason: 'clothed (garment, strap or jewellery visible)' },
  { key: 'tilted', failWhen: true, reason: 'off-pose (tilt, turn, lean or three-quarter)' },
  { key: 'framing_ok', failWhen: false, reason: 'framing (not head-and-shoulders with headroom)' },
  { key: 'eyes_ok', failWhen: false, reason: 'eyes (closed or not to camera)' },
];

function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(s)) return true;
    if (['false', 'no', 'n', '0'].includes(s)) return false;
  }
  return undefined;
}

/** Fail-open verdict — the checker could not judge. */
export function gateUnavailable(why: string): LockGateVerdict {
  return { pass: true, reasons: [`gate unavailable: ${why}`], score: 1, unavailable: true };
}

/**
 * Parse the vision model's reply. Pure + defensive: tolerates code fences, prose
 * around the object, string booleans. No JSON object, or none of the four keys
 * readable → fail-open. A single unreadable key is not counted against the image.
 */
export function parseGateVerdict(text: string): LockGateVerdict {
  const m = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null;
  if (!m) return gateUnavailable('no JSON in reply');
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(m[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return gateUnavailable('reply is not an object');
    obj = parsed as Record<string, unknown>;
  } catch {
    return gateUnavailable('unparseable JSON');
  }
  const reasons: string[] = [];
  let read = 0;
  let passed = 0;
  for (const c of CHECKS) {
    const v = asBool(obj[c.key]);
    if (v === undefined) { passed++; continue; }
    read++;
    if (v === c.failWhen) reasons.push(c.reason);
    else passed++;
  }
  if (read === 0) return gateUnavailable('no verdict keys');
  return { pass: reasons.length === 0, reasons, score: passed / CHECKS.length };
}

/** Loopback, RFC1918, CGNAT/tailnet (100.64/10), *.local, *.ts.net, localhost. */
export function isLocalVisionHost(url: string): boolean {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.ts.net')) return true;
  const ip = host.split('.').map(Number);
  if (ip.length !== 4 || ip.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = ip;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Judge a lock image against the fixed base composition on the LOCAL vision model.
 * Never throws; errors fail open (pass: true, 'gate unavailable').
 */
export async function checkBaseLock(
  imageBuffer: Buffer,
  opts?: { timeoutMs?: number; model?: string; ollamaUrl?: string },
): Promise<LockGateVerdict> {
  const url = opts?.ollamaUrl ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const model = opts?.model ?? process.env.LOCK_GATE_VISION_MODEL ?? LOCK_GATE_DEFAULT_MODEL;
  const timeoutMs = Math.min(opts?.timeoutMs ?? LOCK_GATE_TIMEOUT_MS, 120_000);
  try {
    if (!isLocalVisionHost(url)) {
      const v = gateUnavailable('vision host is not local (privacy wall)');
      console.warn(`[LockGate] ${v.reasons[0]} — ${url}`);
      return v;
    }
    const jpeg = await sharp(imageBuffer)
      .resize(gateImageDim(), gateImageDim(), { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const res = await fetch(`${url.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: LOCK_GATE_PROMPT,
        images: [jpeg.toString('base64')],
        stream: false,
        format: 'json',
        keep_alive: '15m', // stay warm across the S → S+1 → S+2 re-rolls
        options: { temperature: 0, num_predict: 80 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const data = (await res.json()) as { response?: unknown };
    const v = parseGateVerdict(String(data.response ?? ''));
    if (v.unavailable) console.warn(`[LockGate] ${v.reasons[0]} — raw: ${String(data.response ?? '').slice(0, 200)}`);
    return v;
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' || e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e.message) : String(e);
    console.warn(`[LockGate] fail-open: ${why}`);
    return gateUnavailable(why);
  }
}
