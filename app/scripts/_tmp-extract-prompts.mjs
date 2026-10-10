// Extract the CLIPTextEncode prompt text embedded in past generation PNGs
// (ComfyUI stores the submitted workflow in a tEXt chunk keyed "prompt").
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'public/portraits';
const pngs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.png')) pngs.push({ p, mtime: fs.statSync(p).mtimeMs });
  }
})(ROOT);
pngs.sort((a, b) => b.mtime - a.mtime);

function extractPromptChunk(file) {
  const buf = fs.readFileSync(file);
  let off = 8; // skip PNG signature
  while (off < buf.length - 8) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(off + 8, off + 8 + len);
      const nul = data.indexOf(0);
      const key = data.toString('latin1', 0, nul);
      if (key === 'prompt') return data.toString('utf8', nul + 1);
    }
    if (type === 'IDAT') break; // metadata precedes image data
    off += 12 + len;
  }
  return null;
}

const seen = new Set();
let shown = 0;
for (const { p, mtime } of pngs) {
  if (shown >= 8) break;
  const wf = extractPromptChunk(p);
  if (!wf) continue;
  let texts = [];
  try {
    const nodes = JSON.parse(wf);
    for (const node of Object.values(nodes)) {
      if (node?.class_type === 'CLIPTextEncode' && typeof node.inputs?.text === 'string' && node.inputs.text.trim()) {
        texts.push(node.inputs.text.trim());
      }
    }
  } catch { continue; }
  for (const t of texts) {
    const key = t.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    shown++;
    console.log(`\n===== ${new Date(mtime).toISOString().slice(0, 16)} ${p.replace(ROOT, '')} =====`);
    console.log(t.slice(0, 700));
  }
}
console.log(`\n(scanned ${pngs.length} PNGs, ${shown} distinct prompts shown)`);
