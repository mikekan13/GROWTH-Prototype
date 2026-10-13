/**
 * Contact sheet for the style lab (scripts/style-lab.ts): rows of labelled
 * tiles composited onto one JPEG with sharp. Pure (buffers in, buffer out).
 */

import sharp from 'sharp';

export interface SheetTile {
  image: Buffer;
  label: string;
  /** Optional second line under the label (style lab --gate: "PASS" / "FAIL: reasons"). */
  note?: string;
  /** Draw the note in warning gold instead of teal. */
  noteWarn?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * rows[r][c] → a grid of tiles, each `tile` px wide (height from the first image's
 * aspect), with a label strip under every tile. Missing cells stay background.
 */
export async function buildContactSheet(
  rows: SheetTile[][],
  opts: { tile?: number; label?: number; gap?: number; background?: string; quality?: number } = {},
): Promise<Buffer> {
  const tileW = opts.tile ?? 384;
  const lineH = opts.label ?? 28;
  const hasNotes = rows.flat().some(t => !!t.note);
  const labelH = hasNotes ? Math.round(lineH * 1.8) : lineH;
  const gap = opts.gap ?? 8;
  const bg = opts.background ?? '#141414';
  const first = rows.flat()[0];
  if (!first) throw new Error('buildContactSheet: no tiles');
  const fm = await sharp(first.image).metadata();
  const tileH = Math.round(tileW * ((fm.height ?? tileW) / (fm.width ?? tileW)));
  const cols = Math.max(...rows.map(r => r.length));
  const width = gap + cols * (tileW + gap);
  const height = gap + rows.length * (tileH + labelH + gap);

  const layers: sharp.OverlayOptions[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const t = rows[r][c];
      const left = gap + c * (tileW + gap);
      const top = gap + r * (tileH + labelH + gap);
      const img = await sharp(t.image)
        .resize(tileW, tileH, { fit: 'contain', background: bg })
        .flatten({ background: bg })
        .png()
        .toBuffer();
      layers.push({ input: img, left, top });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${labelH}">` +
        `<rect width="100%" height="100%" fill="#000"/>` +
        `<text x="8" y="${Math.round(lineH * 0.68)}" font-family="Consolas, monospace" font-size="${Math.round(lineH * 0.5)}" fill="#22ab94">${esc(t.label)}</text>` +
        (t.note
          ? `<text x="8" y="${Math.round(lineH * 1.5)}" font-family="Consolas, monospace" font-size="${Math.round(lineH * 0.4)}" fill="${t.noteWarn ? '#ffcc78' : '#22ab94'}">${esc(t.note)}</text>`
          : '') +
        `</svg>`;
      layers.push({ input: Buffer.from(svg), left, top: top + tileH });
    }
  }
  return sharp({ create: { width, height, channels: 3, background: bg } })
    .composite(layers)
    .jpeg({ quality: opts.quality ?? 90 })
    .toBuffer();
}
