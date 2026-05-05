import 'server-only';
import sharp from 'sharp';

export interface FaceKeypoints {
  leftEye: [number, number];
  rightEye: [number, number];
  nose: [number, number];
  leftMouth: [number, number];
  rightMouth: [number, number];
}

export type AnglePreset = 'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right';

const COLORS = {
  stickLeftEye: '#FF0000',
  stickRightEye: '#00FF00',
  stickLeftMouth: '#0000FF',
  stickRightMouth: '#FFFF00',
  pointLeftEye: '#FF0000',
  pointRightEye: '#00FF00',
  pointNose: '#0000FF',
  pointLeftMouth: '#FFFF00',
  pointRightMouth: '#FF00FF',
};

const CIRCLE_RADIUS = 10;
const STICK_WIDTH = 4;

// Normalized face keypoints (relative to face center, in pixels at 1024x1024)
const BASE_KEYPOINTS = {
  leftEye: [-130, -60],
  rightEye: [130, -60],
  nose: [0, 30],
  leftMouth: [-80, 100],
  rightMouth: [80, 100],
};

function rotateY(x: number, y: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  const xPrime = x * Math.cos(rad);
  // y unchanged for Y-axis rotation in 3D->2D projection
  return [xPrime, y];
}

function getKeypointsForAngle(
  angle: AnglePreset,
  width: number,
  height: number,
): FaceKeypoints {
  const cx = width / 2;
  const cy = height * 0.46;
  const scale = width / 1024;

  let rotation = 0;
  let shiftX = 0;
  switch (angle) {
    case 'front': rotation = 0; shiftX = 0; break;
    case 'three_quarter_left': rotation = -55; shiftX = -120; break;
    case 'three_quarter_right': rotation = 55; shiftX = 120; break;
    case 'profile_left': rotation = -85; shiftX = -220; break;
    case 'profile_right': rotation = 85; shiftX = 220; break;
  }

  const transform = (bx: number, by: number): [number, number] => {
    const [rx, ry] = rotateY(bx * scale, by * scale, rotation);
    return [Math.round(cx + rx + shiftX * scale), Math.round(cy + ry)];
  };

  return {
    leftEye: transform(BASE_KEYPOINTS.leftEye[0], BASE_KEYPOINTS.leftEye[1]),
    rightEye: transform(BASE_KEYPOINTS.rightEye[0], BASE_KEYPOINTS.rightEye[1]),
    nose: transform(BASE_KEYPOINTS.nose[0], BASE_KEYPOINTS.nose[1]),
    leftMouth: transform(BASE_KEYPOINTS.leftMouth[0], BASE_KEYPOINTS.leftMouth[1]),
    rightMouth: transform(BASE_KEYPOINTS.rightMouth[0], BASE_KEYPOINTS.rightMouth[1]),
  };
}

function buildSvg(kps: FaceKeypoints, width: number, height: number): string {
  const sticks = [
    { from: kps.leftEye, to: kps.nose, color: COLORS.stickLeftEye },
    { from: kps.rightEye, to: kps.nose, color: COLORS.stickRightEye },
    { from: kps.leftMouth, to: kps.nose, color: COLORS.stickLeftMouth },
    { from: kps.rightMouth, to: kps.nose, color: COLORS.stickRightMouth },
  ];

  const points = [
    { pos: kps.leftEye, color: COLORS.pointLeftEye },
    { pos: kps.rightEye, color: COLORS.pointRightEye },
    { pos: kps.nose, color: COLORS.pointNose },
    { pos: kps.leftMouth, color: COLORS.pointLeftMouth },
    { pos: kps.rightMouth, color: COLORS.pointRightMouth },
  ];

  const sticksXml = sticks.map(s =>
    `<line x1="${s.from[0]}" y1="${s.from[1]}" x2="${s.to[0]}" y2="${s.to[1]}" stroke="${s.color}" stroke-width="${STICK_WIDTH}" stroke-linecap="round" opacity="0.6"/>`
  ).join('\n');

  const pointsXml = points.map(p =>
    `<circle cx="${p.pos[0]}" cy="${p.pos[1]}" r="${CIRCLE_RADIUS}" fill="${p.color}" opacity="0.6"/>`
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="black"/>
${sticksXml}
${pointsXml}
</svg>`;
}

export async function generatePoseImage(
  angle: AnglePreset,
  width = 1024,
  height = 1024,
): Promise<Buffer> {
  const kps = getKeypointsForAngle(angle, width, height);
  const svg = buildSvg(kps, width, height);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function generatePoseImageFromKeypoints(
  keypoints: FaceKeypoints,
  width = 1024,
  height = 1024,
): Promise<Buffer> {
  const svg = buildSvg(keypoints, width, height);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export { getKeypointsForAngle };
