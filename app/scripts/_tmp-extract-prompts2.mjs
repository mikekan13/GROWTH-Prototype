// v2: also parse CLIPTextEncodeFlux (clip_l/t5xxl), scan the retired fork's
// portraits too, and label which node each text came from.
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = [
  ['app', 'public/portraits'],
  ['fork', 'C:/Projects/GROWTH Character Creator/public/portraits'],
];
const pngs = [];
for (const [tag, root] of ROOTS) {
  if (!fs.existsSync(root)) continue;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.png')) pngs.push({ tag, p, mtime: fs.statSync(p).mtimeMs });
    }
  })(root);
}
pngs.sort((a, b) => b.mtime - a.mtime);

function chunkText(file) {
  const buf = fs.readFileSync(file);
  let off = 8;
  while (off < buf.length - 8) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(off + 8, off + 8 + len);
      const nul = data.indexOf(0);
      if (data.toString('latin1', 0, nul) === 'prompt') return data.toString('utf8', nul + 1);
    }
    if (type === 'IDAT') break;
    off += 12 + len;
  }
  return null;
}

const seen = new Set();
let shown = 0, noChunk = 0;
for (const { tag, p, mtime } of pngs) {
  if (shown >= 10) break;
  const wf = chunkText(p);
  if (!wf) { noChunk++; continue; }
  let nodes;
  try { nodes = JSON.parse(wf); } catch { continue; }
  const texts = [];
  for (const [key, node] of Object.entries(nodes)) {
    const ct = node?.class_type;
    const inp = node?.inputs || {};
    if (ct === 'CLIPTextEncode' && typeof inp.text === 'string' && inp.text.trim()) {
      texts.push([`${ct}:${key}`, inp.text.trim()]);
    } else if (ct === 'CLIPTextEncodeFlux') {
      for (const f of ['clip_l', 't5xxl']) {
        if (typeof inp[f] === 'string' && inp[f].trim()) texts.push([`${ct}.${f}:${key}`, inp[f].trim()]);
      }
    }
  }
  for (const [label, t] of texts) {
    const k = t.slice(0, 150);
    if (seen.has(k)) continue;
    seen.add(k);
    shown++;
    console.log(`\n===== [${tag}] ${new Date(mtime).toISOString().slice(0, 16)} ${label} ${p.split(/portraits[\/]/)[1]} =====`);
    console.log(t.slice(0, 650));
    if (shown >= 10) break;
  }
}
console.log(`\n(${pngs.length} PNGs scanned, ${noChunk} without prompt chunk)`);
