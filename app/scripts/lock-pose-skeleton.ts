/**
 * Draw the BASE-LOCK POSE SKELETON: an OpenPose (COCO-18, controlnet_aux colours) keypoint map of the fixed passport
 * bust on a mid-grey canvas at the lock size (832x1040). Qwen-Image-2.1 takes it as the lock's last reference image
 * ("copy the exact pose and framing of the pose skeleton in <imageN>") — see qwen21-workflow.ts lockFrameRefClause.
 *
 * Why grey, why this geometry (Mike, 14 Oct, style-refs/lab/2026-10-14-pose-ref-test-v2|v3): a black map pulled dark
 * atmosphere, blouses and insets into the paint (0/6 seeds); grey held pose and bareness on 6/6. v2 asked for the
 * shoulder line at 82% and the model, keeping real anatomy, put it at ~69% and painted chest below; v3 scales the
 * figure 1.3x and lands the shoulder line at 91% → 5/6 through the gate, the sixth a hair low. v4 goes tighter still:
 * the lock is the FACE reference for every later step, so the face fills the frame and the shoulders barely enter.
 *
 *   cd app && npx tsx scripts/lock-pose-skeleton.ts            # rewrites src/ai/portraits/refs/lock-pose-grey.png
 *   npx tsx scripts/lock-pose-skeleton.ts out.png black 1.0 0.82   # custom: path, background, scale, shoulder line
 */
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const W = 832, H = 1040;
const OUT = process.argv[2] ?? path.resolve('src/ai/portraits/refs/lock-pose-grey.png');
const BG = process.argv[3] ?? 'rgb(128,128,128)';
// v4 (Mike, 14 Oct: "We can frame even tighter on the face… doesn't even have to have shoulders or very minimum"):
// scale 1.7 and the shoulder line at 116% — just below the bottom edge, so the frame ends at the base of the neck.
const SCALE = Number(process.argv[4] ?? 1.7);
const SHOULDER_Y = Number(process.argv[5] ?? 1.16);

// OpenPose 18: 0 nose, 1 neck, 2 Rsho, 3 Relb, 4 Rwri, 5 Lsho, 6 Lelb, 7 Lwri, 8 Rhip, 9 Rknee, 10 Rank, 11 Lhip,
// 12 Lknee, 13 Lank, 14 Reye, 15 Leye, 16 Rear, 17 Lear (R = image left, as OpenPose draws a facing person).
// Base geometry (scale 1): nose 45%, neck 69%, shoulders 82%; upper arms drop straight down and leave the frame.
const cx = W / 2;
const base: Record<number, [number, number]> = {
  0: [cx, 470], 1: [cx, 720], 2: [cx - 190, 850], 3: [cx - 235, 1180], 5: [cx + 190, 850], 6: [cx + 235, 1180],
  14: [cx - 52, 415], 15: [cx + 52, 415], 16: [cx - 118, 450], 17: [cx + 118, 450],
};
const noseY = base[0][1];
const shift = SHOULDER_Y * H - (noseY + (base[2][1] - noseY) * SCALE);
const K: Record<number, [number, number]> = {};
for (const [i, [x, y]] of Object.entries(base)) K[Number(i)] = [cx + (x - cx) * SCALE, noseY + (y - noseY) * SCALE + shift];

// controlnet_aux draw_bodypose limb sequence (1-indexed pairs) and colours, in order.
const LIMBS: [number, number][] = [[2, 3], [2, 6], [3, 4], [4, 5], [6, 7], [7, 8], [2, 9], [9, 10], [10, 11], [2, 12], [12, 13], [13, 14], [2, 1], [1, 15], [15, 17], [1, 16], [16, 18]];
const COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]];
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const stick = 10;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${BG}"/>`;
LIMBS.forEach(([a1, b1], i) => {
  const a = K[a1 - 1], b = K[b1 - 1];
  if (!a || !b) return;
  svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${rgb(COLORS[i])}" stroke-width="${stick}" stroke-linecap="round" stroke-opacity="0.6"/>`;
});
for (const [idx, [x, y]] of Object.entries(K)) svg += `<circle cx="${x}" cy="${y}" r="${stick * 0.8}" fill="${rgb(COLORS[Number(idx)])}"/>`;
svg += '</svg>';

async function main() {
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(OUT);
  console.log(`lock pose skeleton (${BG}, scale ${SCALE}, shoulders at ${SHOULDER_Y}) → ${OUT}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
