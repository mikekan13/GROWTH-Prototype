import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/portraits/existing?characterId=xxx
 *
 * Returns existing portraits, deduplicated, scanning:
 *   - portraits/<characterId>/sketch/   → tier 'sketch'   (Step 1 face discovery)
 *   - portraits/<characterId>/refined/  → tier 'refined'  (Step 2 locked face)
 *   - portraits/<characterId>/angles/   → tier 'angle'    (Step 3 non-front angles)
 *   - portraits/<characterId>/          → tier 'sketch'   (legacy/golden refs)
 * Sorted newest first by mtime. Only .webp returned (png/thumb siblings filtered).
 */
export async function GET(request: NextRequest) {
  const characterId = request.nextUrl.searchParams.get('characterId') || 'creation-preview';
  const baseDir = path.join(process.cwd(), 'public', 'portraits', characterId);

  type Entry = { path: string; tier: 'sketch' | 'refined' | 'angle' | 'body'; mtime: number; angleKey?: string };
  const entries: Entry[] = [];

  // For angle PNGs, read the ComfyUI tEXt "prompt" chunk to find which angle ref
  // image was used (three_quarter_left.jpg, etc.) so we can map back to the angle key.
  async function readAngleKeyFromPng(pngFullPath: string): Promise<string | undefined> {
    try {
      const buf = await fs.readFile(pngFullPath);
      let off = 8;
      while (off < buf.length) {
        const len = buf.readUInt32BE(off); off += 4;
        const ctype = buf.slice(off, off + 4).toString('ascii'); off += 4;
        const data = buf.slice(off, off + len); off += len; off += 4;  // +4 for CRC
        if (ctype === 'tEXt') {
          const sep = data.indexOf(0);
          const key = data.slice(0, sep).toString();
          if (key === 'prompt') {
            const val = data.slice(sep + 1).toString('utf8');
            // Look for anglePreset-style reference file names.
            for (const k of ['three_quarter_left', 'three_quarter_right', 'profile_left', 'profile_right', 'front']) {
              if (val.includes(`${k}.jpg`)) return k;
            }
            return undefined;
          }
        }
        if (ctype === 'IEND') break;
      }
    } catch { /* skip */ }
    return undefined;
  }

  async function scan(subfolder: string | null, tier: 'sketch' | 'refined' | 'angle' | 'body') {
    const dir = subfolder ? path.join(baseDir, subfolder) : baseDir;
    let files: string[];
    try { files = await fs.readdir(dir); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.webp') || f.includes('_thumb')) continue;
      try {
        const stat = await fs.stat(path.join(dir, f));
        if (!stat.isFile()) continue;
        const url = subfolder
          ? `/portraits/${characterId}/${subfolder}/${f}`
          : `/portraits/${characterId}/${f}`;
        let angleKey: string | undefined;
        if (tier === 'angle') {
          const pngSibling = path.join(dir, f.replace(/\.webp$/, '.png'));
          angleKey = await readAngleKeyFromPng(pngSibling);
        }
        entries.push({ path: url, tier, mtime: stat.mtimeMs, angleKey });
      } catch { /* skip */ }
    }
  }

  try {
    await Promise.all([
      scan('refined', 'refined'),
      scan('sketch', 'sketch'),
      scan('angles', 'angle'),
      scan('body', 'body'),
      scan(null, 'sketch'),  // legacy/goldens at root default to sketch
    ]);

    // Dedupe by path (shouldn't happen but safety)
    const byPath = new Map<string, Entry>();
    for (const e of entries) if (!byPath.has(e.path)) byPath.set(e.path, e);
    const unique = Array.from(byPath.values()).sort((a, b) => b.mtime - a.mtime);

    return NextResponse.json({
      images: unique.map(e => e.path),                            // backward-compat
      candidates: unique.map(e => ({ imagePath: e.path, tier: e.tier, angleKey: e.angleKey })),
    });
  } catch {
    return NextResponse.json({ images: [], candidates: [] });
  }
}
