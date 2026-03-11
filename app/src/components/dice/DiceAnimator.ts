/**
 * Dice Animator — Manages 3D dice as persistent physical objects on the canvas.
 *
 * Dice are real — physics determines the result. No snapping to pre-computed
 * values. The random generator biases the spin/orientation so the die TENDS
 * toward a target face, but whatever actually lands up IS the roll.
 *
 * Multiple dice can be grabbed at once — drag over dice to scoop them up.
 * They orbit the cursor while shaking, then all drop on release.
 *
 * Godhead injection can later strengthen (or guarantee) the bias.
 */

import * as THREE from 'three';
import type { RollResult, DieType, DieColor } from '@/types/dice';
import { DiceScene } from './DiceScene';
import { DicePhysicsWorld, type DiceBody } from './DicePhysics';
import {
  createDieMesh,
  getFaceIndexForValue,
  getHighlightTexture,
  getNormalTexture,
  getMysteryTexture,
  getRandomGlitchTexture,
  readUpFaceIndex,
  readUpFaceValue,
  prewarmTextures,
  type DiceMeshResult,
} from './DiceMesh';

export interface SettledDie {
  dieType: DieType;
  color: DieColor;
  value: number;  // The face that actually landed up
  label: string;
}

export type SettleSource = 'physical' | 'service';

export interface AnimatorCallbacks {
  /** Called when dice are thrown (flung or spawned) — trigger server roll here. throwId ties the response back to the correct dice. */
  onThrow: (dice: Array<{ dieType: DieType; color: DieColor }>, throwId: number) => void;
  /** Called when all dice have settled and revealed their server-authoritative values */
  onSettle: (dice: SettledDie[], source: SettleSource) => void;
}

interface AnimatedDie {
  body: DiceBody;
  meshResult: DiceMeshResult;
  dieType: DieType;
  color: DieColor;
  label: string;
  /** Random generator's target — used to bias spin, NOT to snap. */
  targetValue: number;
  /** Server-authoritative value — set after /api/dice/roll returns */
  serverValue: number | null;
  /** Which throw this die belongs to — used to match server responses */
  throwId: number;
  /** Glow mesh on the top face when settled */
  glowMesh: THREE.Mesh | null;
  /** Whether this die's numbers have been revealed */
  revealed: boolean;
  /** Timestamp when the number was revealed (for pulse animation) */
  revealTime: number;
}

interface GrabbedDie {
  ad: AnimatedDie;
  orbitOffset: number; // angle offset from base orbit
  shakeVelocity: THREE.Vector3;
  shakeTarget: THREE.Vector3;
}

interface VelocitySample {
  pos: THREE.Vector2;
  time: number;
}

// ── Impact forcefield visual ─────────────────────────────────────────────

const IMPACT_DURATION_MS = 350;

interface ImpactFlash {
  mesh: THREE.Mesh;
  startTime: number;
  strength: number;
}

let barrierTextureCache: THREE.CanvasTexture | null = null;

/**
 * Barrier flash texture — a soft vertical/horizontal glow bloom.
 * Bright teal center that falls off with a wide soft gradient.
 * Looks like an energy membrane briefly becoming visible.
 */
function getBarrierTexture(): THREE.CanvasTexture {
  if (barrierTextureCache) return barrierTextureCache;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  // Main soft radial glow — bright center, wide feathered falloff
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, 'rgba(180, 255, 240, 0.9)');
  grad.addColorStop(0.08, 'rgba(120, 240, 220, 0.7)');
  grad.addColorStop(0.2, 'rgba(45, 184, 160, 0.45)');
  grad.addColorStop(0.45, 'rgba(45, 184, 160, 0.15)');
  grad.addColorStop(0.7, 'rgba(45, 184, 160, 0.04)');
  grad.addColorStop(1, 'rgba(45, 184, 160, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle hex-like structure: faint fine grid lines through the glow
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = 'rgba(120, 230, 210, 0.08)';
  ctx.lineWidth = 1;
  const step = size / 12;
  for (let i = 1; i < 12; i++) {
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  barrierTextureCache = new THREE.CanvasTexture(canvas);
  barrierTextureCache.needsUpdate = true;
  return barrierTextureCache;
}

let barrierPlaneGeo: THREE.PlaneGeometry | null = null;

function getBarrierPlaneGeo(): THREE.PlaneGeometry {
  if (!barrierPlaneGeo) {
    barrierPlaneGeo = new THREE.PlaneGeometry(4, 4);
  }
  return barrierPlaneGeo;
}

const VELOCITY_WINDOW_MS = 80;
const DRAG_Y_BASE = 10;
const DRAG_Y_RANDOM = 3;
const ORBIT_RADIUS = 0.35;
const ORBIT_SPEED = 5; // radians per second — energetic swirl

// Pre-glitch: "?" faces flicker with glitch symbols while dice are in the air.
// Starts immediately on throw — runs the entire roll.
const PRE_GLITCH_INTERVAL_MS = 35;


// ── Glow texture for settled dice ────────────────────────────────────────

let glowTextureCache: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTextureCache) return glowTextureCache;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Radial gradient: bright center → transparent edges
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  glowTextureCache = new THREE.CanvasTexture(canvas);
  glowTextureCache.needsUpdate = true;
  return glowTextureCache;
}

// Pillar color hex values for die glow
const GLOW_COLORS: Record<DieColor, number> = {
  red: 0xE8585A,
  blue: 0x4080D0,
  purple: 0x9070D0,
  teal: 0x2DB8A0,
  gold: 0xD0A030,
  white: 0xFFFFFF,
  black: 0xC02020,
};

export class DiceAnimator {
  private scene: DiceScene;
  private physics: DicePhysicsWorld;
  private animatedDice: AnimatedDie[] = [];
  private callbacks: AnimatorCallbacks;

  // (settle tracking is per-batch in throwBatches)
  private loopRunning = false;

  /** Active throw batches — each spawn/fling is its own independent batch. */
  private throwBatches: Array<{ dice: Set<AnimatedDie>; source: SettleSource; reported: boolean }> = [];
  /** Monotonically increasing throw ID — ties server responses to the correct dice. */
  private nextThrowId = 1;

  /** Pre-glitch: symbols flicker while dice are still winding down */
  private preGlitchActive = false;
  private preGlitchLastSwap = 0;


  private impactFlashes: ImpactFlash[] = [];

  private grabbedDice: GrabbedDie[] = [];
  private mousePos = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private velocitySamples: VelocitySample[] = [];
  private dragY = DRAG_Y_BASE;
  private orbitStartTime = 0;

  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseUp: (e: MouseEvent) => void;
  private canvasEl: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, callbacks: AnimatorCallbacks) {
    const rect = canvas.getBoundingClientRect();
    this.canvasEl = canvas;
    this.scene = new DiceScene({
      canvas,
      width: rect.width,
      height: rect.height,
    });
    this.physics = new DicePhysicsWorld();
    this.callbacks = callbacks;

    this.physics.setWallsFromFrustum(this.scene.camera);

    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);

    // Pre-warm all textures so the first roll doesn't lag
    prewarmTextures();
    getGlowTexture();
    getBarrierTexture();
    getBarrierPlaneGeo();
  }

  // ── Grab ──────────────────────────────────────────────────────────────

  tryGrab(e: MouseEvent): boolean {
    const ndc = this.screenToNDC(e);
    const hit = this.raycastDice(ndc);
    if (!hit) return false;

    this.mousePos.copy(ndc);
    this.velocitySamples = [{ pos: ndc.clone(), time: performance.now() }];

    // Randomize grab height and start orbit
    this.dragY = DRAG_Y_BASE + (Math.random() - 0.5) * DRAG_Y_RANDOM;
    this.orbitStartTime = performance.now();

    // Reset frame cap so flings don't get instantly frozen
    this.physics.resetFrameCounter();

    // Grab the first die
    this.grabbedDice = [];
    this.scoopDie(hit);

    // Mark unsettled so we report the new result after this fling
    this.preGlitchActive = false;


    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', this.boundOnMouseMove);
    window.addEventListener('mouseup', this.boundOnMouseUp);

    return true;
  }

  /** Add a die to the grabbed set. */
  private scoopDie(ad: AnimatedDie): void {
    // Don't grab the same die twice
    if (this.grabbedDice.some(g => g.ad === ad)) return;

    // Remove settle glow and hide numbers (back to "?")
    this.removeGlow(ad);
    this.hideNumbers(ad);
    ad.revealed = false;

    // Unfreeze — keep DYNAMIC so dice collide with each other in hand
    ad.body.frozen = false;
    ad.body.settled = false;
    ad.body.settleFrames = 0;
    ad.body.body.wakeUp();
    ad.body.body.type = 1; // DYNAMIC — keeps inter-dice collisions

    ad.targetValue = this.randomValue(ad.dieType);

    // Each die gets evenly spaced orbit offset
    const count = this.grabbedDice.length;
    const orbitOffset = count * (Math.PI * 2 / Math.max(count + 1, 2));

    // Redistribute all orbit offsets evenly
    const total = count + 1;
    const speed = 15 + Math.random() * 10;
    const grabbed: GrabbedDie = {
      ad,
      orbitOffset: 0,
      shakeVelocity: new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        (Math.random() - 0.5) * speed,
        (Math.random() - 0.5) * speed,
      ),
      shakeTarget: new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        (Math.random() - 0.5) * speed,
        (Math.random() - 0.5) * speed,
      ),
    };
    this.grabbedDice.push(grabbed);

    // Redistribute offsets evenly
    for (let i = 0; i < this.grabbedDice.length; i++) {
      this.grabbedDice[i].orbitOffset = (i / this.grabbedDice.length) * Math.PI * 2;
    }
  }

  // ── Initial throw (from dice service roll event) ──────────────────────

  start(result: RollResult): void {
    this.preGlitchActive = false;
    this.throwBatches = [];

    this.animatedDice = [];

    const rollableDice = result.rolls.filter(r => r.die !== 'flat' && r.maxValue > 0);

    if (rollableDice.length === 0) {
      this.callbacks.onSettle([], 'service');
      return;
    }

    let serviceBatch: { dice: Set<AnimatedDie>; source: SettleSource; reported: boolean } | null = null;

    for (let i = 0; i < rollableDice.length; i++) {
      const outcome = rollableDice[i];
      const dieType = outcome.die as DieType;
      const color = result.request.dice[i]?.color ?? 'white';

      const meshResult = createDieMesh(dieType, color, true); // mystery=true: show "?" while rolling
      this.scene.add(meshResult.group);

      const body = this.physics.addDie(meshResult.group, meshResult.geometry, dieType);

      // Bias the initial throw toward the pre-computed target value
      this.throwDieWithBias(body, meshResult, dieType, outcome.value, i, rollableDice.length);

      const ad: AnimatedDie = {
        body,
        meshResult,
        dieType,
        color,
        label: outcome.label,
        targetValue: outcome.value,
        serverValue: outcome.value, // From RollResult — already server-authoritative
        throwId: 0, // Service rolls have values already — throwId not used for matching
        glowMesh: null,
        revealed: false,
        revealTime: 0,
      };
      this.animatedDice.push(ad);
      if (!serviceBatch) {
        serviceBatch = { dice: new Set(), source: 'service', reported: false };
        this.throwBatches.push(serviceBatch);
      }
      serviceBatch.dice.add(ad);
    }

    this.ensureLoopRunning();
  }

  // ── Physics-biased throw ──────────────────────────────────────────────

  private throwDieWithBias(
    diceBody: DiceBody,
    meshResult: DiceMeshResult,
    dieType: DieType,
    targetValue: number,
    index: number,
    totalDice: number,
  ): void {
    const { body } = diceBody;
    body.wakeUp();

    const spread = totalDice > 1 ? (index - (totalDice - 1) / 2) * 0.9 : 0;

    body.position.set(
      spread + (Math.random() - 0.5) * 0.3,
      3 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2,
    );

    const faceIdx = getFaceIndexForValue(dieType, targetValue);
    const biasQuat = meshResult.getSnapRotation(faceIdx);
    const noise = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (Math.random() - 0.5) * Math.PI * 0.33,
      (Math.random() - 0.5) * Math.PI * 0.33,
      (Math.random() - 0.5) * Math.PI * 0.33,
    ));
    biasQuat.multiply(noise);
    body.quaternion.set(biasQuat.x, biasQuat.y, biasQuat.z, biasQuat.w);

    body.velocity.set(
      (Math.random() - 0.5) * 5,
      -5 - Math.random() * 4,
      (Math.random() - 0.5) * 5,
    );

    body.angularVelocity.set(
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15,
    );
  }

  // ── Frame update ──────────────────────────────────────────────────────

  private update(dt: number): void {
    if (this.grabbedDice.length > 0) {
      this.updateGrabbedDice();
    }

    const allSettled = this.physics.step(dt);

    // Process each throw batch independently
    if (this.grabbedDice.length === 0) {
      for (const batch of this.throwBatches) {
        if (batch.reported) continue;
        const batchDice = Array.from(batch.dice);

        // Pre-glitch: start if any unrevealed dice in this batch
        if (!this.preGlitchActive && batchDice.some(ad => !ad.revealed)) {
          this.preGlitchActive = true;
          this.preGlitchLastSwap = 0;
        }

        // Per-die instant reveal: each die reveals the frame it freezes + has server value
        for (const ad of batchDice) {
          if (!ad.revealed && ad.body.frozen && ad.serverValue !== null) {
            ad.revealed = true;
            ad.revealTime = performance.now();
            this.revealNumbers(ad);
            this.addGlow(ad);
          }
        }

        // Once all dice in this batch are revealed, report it
        if (batchDice.every(ad => ad.revealed)) {
          batch.reported = true;

          const results: SettledDie[] = batchDice.map(ad => ({
            dieType: ad.dieType,
            color: ad.color,
            label: ad.label,
            value: ad.serverValue!,
          }));
          this.callbacks.onSettle(results, batch.source);
        }
      }

      // Clean up reported batches
      this.throwBatches = this.throwBatches.filter(b => !b.reported);

      // Stop pre-glitch when no unrevealed dice remain across all batches
      if (this.preGlitchActive && !this.throwBatches.some(b => Array.from(b.dice).some(ad => !ad.revealed))) {
        this.preGlitchActive = false;
      }
    }

    // Run pre-glitch symbol flickering
    if (this.preGlitchActive) {
      this.updatePreGlitch();
    }

    // Spawn barrier flashes from physics collisions
    this.processImpacts();

    // Animate and clean up barrier flashes
    this.updateImpactFlashes();

    // Pulse glow on settled dice
    this.pulseGlows();
  }

  // ── Mouse Interaction ─────────────────────────────────────────────────

  private screenToNDC(e: MouseEvent | { clientX: number; clientY: number }): THREE.Vector2 {
    const rect = this.canvasEl.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private raycastDice(ndc: THREE.Vector2): AnimatedDie | null {
    this.raycaster.setFromCamera(ndc, this.scene.camera);
    for (const ad of this.animatedDice) {
      const hits = this.raycaster.intersectObject(ad.meshResult.group, true);
      if (hits.length > 0) return ad;
    }
    return null;
  }

  /** Raycast on the floor plane to find dice near the cursor for scooping. */
  private checkForScoopableDice(): void {
    // Raycast from cursor to floor to find nearby dice
    this.raycaster.setFromCamera(this.mousePos, this.scene.camera);
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const cursorWorld = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(floorPlane, cursorWorld);
    if (!cursorWorld) return;

    const scoopRadius = 1.5; // world units — how close cursor needs to be

    for (const ad of this.animatedDice) {
      // Skip already grabbed
      if (this.grabbedDice.some(g => g.ad === ad)) continue;

      const diePos = ad.body.mesh.position;
      const dx = diePos.x - cursorWorld.x;
      const dz = diePos.z - cursorWorld.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < scoopRadius) {
        this.scoopDie(ad);
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.grabbedDice.length === 0) return;
    this.mousePos.copy(this.screenToNDC(e));

    const now = performance.now();
    this.velocitySamples.push({ pos: this.mousePos.clone(), time: now });
    const cutoff = now - VELOCITY_WINDOW_MS;
    this.velocitySamples = this.velocitySamples.filter(s => s.time >= cutoff);

    // Check if we're passing over more dice to scoop up
    this.checkForScoopableDice();
  }

  private computeFlingVelocity(): THREE.Vector2 {
    if (this.velocitySamples.length < 2) return new THREE.Vector2(0, 0);

    const first = this.velocitySamples[0];
    const last = this.velocitySamples[this.velocitySamples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt < 0.001) return new THREE.Vector2(0, 0);

    return new THREE.Vector2(
      (last.pos.x - first.pos.x) / dt,
      (last.pos.y - first.pos.y) / dt,
    );
  }

  private updateGrabbedDice(): void {
    if (this.grabbedDice.length === 0) return;

    this.raycaster.setFromCamera(this.mousePos, this.scene.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.dragY);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, target);
    if (!target) return;

    const elapsed = (performance.now() - this.orbitStartTime) / 1000;
    const baseAngle = elapsed * ORBIT_SPEED;
    const radius = ORBIT_RADIUS + (this.grabbedDice.length - 1) * 0.6;

    // Position tracking: 0.9 = crisp following, 0.1 = collision bumps bleed through
    const TRACK = 0.9;
    const CHASE = 25;
    // Angular: 0.6 tracking + 0.4 physics — collisions visibly spin dice off each other
    const ANG_TRACK = 0.6;

    for (const g of this.grabbedDice) {
      const angle = baseAngle + g.orbitOffset;
      // Tilt orbit plane per die so they swirl in 3D, not just a flat ring
      const tilt = g.orbitOffset * 0.7;
      const goalX = target.x + Math.cos(angle) * radius;
      const goalZ = target.z + Math.sin(angle) * Math.cos(tilt) * radius;
      const goalY = this.dragY + Math.sin(angle) * Math.sin(tilt) * radius;

      const body = g.ad.body.body;
      const pos = body.position;

      // Position: crisp tracking with collision response bleed-through
      const trackVx = (goalX - pos.x) * CHASE;
      const trackVy = (goalY - pos.y) * CHASE;
      const trackVz = (goalZ - pos.z) * CHASE;

      body.velocity.x = trackVx * TRACK + body.velocity.x * (1 - TRACK);
      body.velocity.y = trackVy * TRACK + body.velocity.y * (1 - TRACK);
      body.velocity.z = trackVz * TRACK + body.velocity.z * (1 - TRACK);

      // Cancel gravity while grabbed
      body.force.set(0, body.mass * 60, 0);

      // Rotation: BLEND shake with physics angular velocity (don't override)
      // This lets collision spin responses show through
      g.shakeVelocity.lerp(g.shakeTarget, 0.06);
      body.angularVelocity.x = g.shakeVelocity.x * ANG_TRACK + body.angularVelocity.x * (1 - ANG_TRACK);
      body.angularVelocity.y = g.shakeVelocity.y * ANG_TRACK + body.angularVelocity.y * (1 - ANG_TRACK);
      body.angularVelocity.z = g.shakeVelocity.z * ANG_TRACK + body.angularVelocity.z * (1 - ANG_TRACK);

      // Drift shake target — more vigorous, more frequent changes
      if (Math.random() < 0.04) {
        const speed = 15 + Math.random() * 10;
        g.shakeTarget.set(
          (Math.random() - 0.5) * speed,
          (Math.random() - 0.5) * speed,
          (Math.random() - 0.5) * speed,
        );
      }
    }
  }

  private onMouseUp(_e: MouseEvent): void {
    if (this.grabbedDice.length === 0) return;

    const flingVel = this.computeFlingVelocity();
    const flingStrength = 8;

    for (const g of this.grabbedDice) {
      const body = g.ad.body.body;

      // Clear anti-gravity — let gravity pull them down naturally
      body.force.set(0, 0, 0);

      // Fling: horizontal from mouse movement, vertical = 0 (gravity handles the drop)
      body.velocity.set(
        flingVel.x * flingStrength + (Math.random() - 0.5) * 3,
        0,
        -flingVel.y * flingStrength + (Math.random() - 0.5) * 3,
      );

      // Strong tumble on release — they were being shaken
      const spinStrength = 20;
      body.angularVelocity.set(
        (Math.random() - 0.5) * spinStrength,
        (Math.random() - 0.5) * spinStrength,
        (Math.random() - 0.5) * spinStrength,
      );

      g.ad.body.settled = false;
      g.ad.body.settleFrames = 0;

      g.ad.body.frozen = false;
    }

    // Collect thrown dice info before clearing
    const thrownDice = this.grabbedDice.map(g => ({
      dieType: g.ad.dieType,
      color: g.ad.color,
    }));

    // Build the throw batch — only these dice will be reported on settle
    this.throwBatches.push({
      dice: new Set(this.grabbedDice.map(g => g.ad)),
      source: 'physical',
      reported: false,
    });

    // Assign throw ID to this batch
    const throwId = this.nextThrowId++;

    // Mark thrown dice as unrevealed — server will provide authoritative values
    for (const g of this.grabbedDice) {
      g.ad.revealed = false;
      g.ad.serverValue = null;
      g.ad.throwId = throwId;
      this.hideNumbers(g.ad);
      // Remove any existing glow
      if (g.ad.glowMesh) {
        g.ad.meshResult.group.remove(g.ad.glowMesh);
        g.ad.glowMesh = null;
      }
    }

    this.grabbedDice = [];
    this.velocitySamples = [];
    document.body.style.cursor = '';

    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);

    // Fire throw callback — DiceOverlay calls the server for authoritative values
    if (thrownDice.length > 0) {
      this.callbacks.onThrow(thrownDice, throwId);
    }
  }

  // ── Glitch Reveal & Glow ────────────────────────────────────────────

  /** Pre-glitch: swap "?" to random glitch symbols while dice are still winding down. */
  private updatePreGlitch(): void {
    const now = performance.now();
    if (now - this.preGlitchLastSwap < PRE_GLITCH_INTERVAL_MS) return;
    this.preGlitchLastSwap = now;

    for (const batch of this.throwBatches) {
      for (const ad of batch.dice) {
        if (ad.revealed) continue;

        ad.meshResult.group.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const ud = child.userData;
          if (!ud.numberPlane) return;
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.map = getRandomGlitchTexture();
          mat.needsUpdate = true;
        });
      }
    }
  }

  /**
   * Swap all "?" textures to actual number textures.
   * The up-facing face displays the server-authoritative value.
   * All other faces show their intrinsic values (not visible from above anyway).
   */
  private revealNumbers(ad: AnimatedDie): void {
    const quat = ad.body.mesh.quaternion as THREE.Quaternion;
    const upFaceIdx = readUpFaceIndex(ad.meshResult, quat);
    const isD4 = ad.dieType === 'd4';

    ad.meshResult.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const ud = child.userData;
      if (!ud.numberPlane) return;
      const mat = child.material as THREE.MeshBasicMaterial;

      // Check if this number plane belongs to the up-facing face/vertex
      const isUpFace = isD4
        ? ud.vertexIndex === upFaceIdx
        : ud.faceIndex === upFaceIdx;

      if (isUpFace && ad.serverValue !== null) {
        // Show the server-authoritative value on the up face
        mat.map = getNormalTexture(ad.serverValue);
      } else {
        // Other faces show their intrinsic values
        mat.map = getNormalTexture(ud.value);
      }
      mat.needsUpdate = true;
    });
  }

  /** Swap all number textures back to "?" (for re-rolling grabbed dice). */
  private hideNumbers(ad: AnimatedDie): void {
    ad.meshResult.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const ud = child.userData;
      if (!ud.numberPlane) return;
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.map = getMysteryTexture();
      mat.needsUpdate = true;
    });
  }

  /** Determine highlight style based on whether the value is min (1) or max for this die type. */
  private getHighlightStyle(ad: AnimatedDie): 'gold' | 'red' | 'green' {
    const value = ad.serverValue ?? 0;
    if (value === 1) return 'red';
    const maxValues: Record<DieType, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };
    if (value === (maxValues[ad.dieType] ?? 6)) return 'green';
    return 'gold';
  }

  private addGlow(ad: AnimatedDie): void {
    if (ad.glowMesh) return;

    const quat = ad.body.mesh.quaternion as THREE.Quaternion;
    const upFaceIdx = readUpFaceIndex(ad.meshResult, quat);

    // Get face center and normal in local space
    const normal = ad.meshResult.faceNormals[upFaceIdx];
    const center = ad.meshResult.faceCenters[upFaceIdx];
    if (!normal || !center) return;

    const highlightStyle = this.getHighlightStyle(ad);

    // Swap the top face's number planes to highlighted color
    const isD4 = ad.dieType === 'd4';
    ad.meshResult.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const ud = child.userData;
      if (!ud.numberPlane) return;

      let shouldHighlight = false;
      if (isD4) {
        // D4: highlight all numbers matching the top vertex
        shouldHighlight = ud.vertexIndex === upFaceIdx;
      } else {
        shouldHighlight = ud.faceIndex === upFaceIdx;
      }

      ud.highlighted = shouldHighlight;
      if (shouldHighlight) {
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.map = getHighlightTexture(ad.serverValue ?? ud.value, highlightStyle);
        mat.needsUpdate = true;
      }
    });

    // Glow disc color matches the highlight style
    const glowColors: Record<string, number> = { gold: 0xD0A030, red: 0xFF4444, green: 0x44FF66 };
    const glowMat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: glowColors[highlightStyle],
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
    });

    const glowSize = ad.dieType === 'd4' ? 0.8 : ad.dieType === 'd6' ? 1.2 : 0.9;
    const glowGeo = new THREE.PlaneGeometry(glowSize, glowSize);
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);

    glowMesh.position.copy(center).addScaledVector(normal, 0.035);
    const lookTarget = center.clone().add(normal);
    glowMesh.lookAt(lookTarget);

    ad.meshResult.group.add(glowMesh);
    ad.glowMesh = glowMesh;
  }

  private removeGlow(ad: AnimatedDie): void {
    // Remove glow disc
    if (ad.glowMesh) {
      ad.meshResult.group.remove(ad.glowMesh);
      ad.glowMesh.geometry.dispose();
      (ad.glowMesh.material as THREE.Material).dispose();
      ad.glowMesh = null;
    }

    // Revert all number planes back to white and clear highlight/scale
    ad.meshResult.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const ud = child.userData;
      if (!ud.numberPlane) return;
      ud.highlighted = false;
      child.scale.set(1, 1, 1);
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.map = getNormalTexture(ud.value);
      mat.needsUpdate = true;
    });
  }

  private pulseGlows(): void {
    const now = performance.now();
    const t = now / 1000;
    for (const ad of this.animatedDice) {
      if (!ad.glowMesh) continue;

      const mat = ad.glowMesh.material as THREE.MeshBasicMaterial;

      // Reveal pop: scale up the top-face number planes then ease back
      if (ad.revealTime > 0) {
        const elapsed = now - ad.revealTime;
        const popDuration = 300; // ms

        if (elapsed < popDuration) {
          // Quick elastic pop: overshoot then settle
          const p = elapsed / popDuration;
          const ease = 1 + Math.sin(p * Math.PI) * 0.6; // peaks at 1.6x, settles to 1.0

          ad.meshResult.group.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (!child.userData.highlighted) return;
            child.scale.set(ease, ease, 1);
          });

          // Glow brighter during pop
          mat.opacity = 0.25 + (1 - p) * 0.5;
        } else {
          // Reset scales and stop tracking
          ad.meshResult.group.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (child.userData.highlighted) {
              child.scale.set(1, 1, 1);
            }
          });
          ad.revealTime = 0;
          mat.opacity = 0.25 + Math.sin(t * 2) * 0.1;
        }
      } else {
        // Ambient pulse
        mat.opacity = 0.25 + Math.sin(t * 2) * 0.1;
      }
    }
  }

  // ── Impact Forcefield ───────────────────────────────────────────────

  private processImpacts(): void {
    const impacts = this.physics.pendingImpacts;
    if (impacts.length === 0) return;

    const now = performance.now();

    for (const impact of impacts) {
      // Only show forcefield on wall/floor hits
      if (!impact.isWall) continue;

      const geo = getBarrierPlaneGeo();
      const mat = new THREE.MeshBasicMaterial({
        map: getBarrierTexture(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(impact.position.x, impact.position.y, impact.position.z);

      // Orient flush against the surface — barrier lives ON the wall/floor
      if (impact.position.y < 0.3) {
        // Floor hit — barrier lies flat on the floor
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.02;
      } else {
        // Wall hit — barrier faces inward from the wall
        const ax = Math.abs(impact.position.x);
        const az = Math.abs(impact.position.z);
        if (ax > az) {
          // Left/right wall
          mesh.rotation.y = Math.PI / 2;
          // Nudge inward slightly so the quad is visible
          mesh.position.x += impact.position.x > 0 ? -0.05 : 0.05;
        } else {
          // Front/back wall — default orientation faces along Z
          mesh.position.z += impact.position.z > 0 ? -0.05 : 0.05;
        }
        // Center vertically on the impact but clamp to reasonable wall height
        mesh.position.y = Math.max(impact.position.y, 0.5);
      }

      this.scene.add(mesh);
      this.impactFlashes.push({ mesh, startTime: now, strength: impact.strength });
    }

    impacts.length = 0;
  }

  private updateImpactFlashes(): void {
    if (this.impactFlashes.length === 0) return;

    const now = performance.now();
    const expired: number[] = [];

    for (let i = 0; i < this.impactFlashes.length; i++) {
      const flash = this.impactFlashes[i];
      const elapsed = now - flash.startTime;
      const t = elapsed / IMPACT_DURATION_MS;

      if (t >= 1) {
        expired.push(i);
        continue;
      }

      // Barrier stays roughly the same size — slight bloom expansion
      const scale = 1 + t * 0.3;
      flash.mesh.scale.set(scale, scale, scale);

      const mat = flash.mesh.material as THREE.MeshBasicMaterial;
      // Flash in fast, fade out smoothly — like a shield flicker
      const fadeIn = Math.min(t * 8, 1); // near-instant appear
      const fadeOut = 1 - t;             // linear fade
      const peak = 0.15 + flash.strength * 0.25;
      mat.opacity = fadeIn * fadeOut * peak;
    }

    // Remove expired flashes (reverse order)
    for (let i = expired.length - 1; i >= 0; i--) {
      const flash = this.impactFlashes[expired[i]];
      this.scene.remove(flash.mesh);
      (flash.mesh.material as THREE.Material).dispose();
      this.impactFlashes.splice(expired[i], 1);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private randomValue(dieType: DieType): number {
    const sides: Record<DieType, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };
    return Math.floor(Math.random() * (sides[dieType] ?? 6)) + 1;
  }

  private ensureLoopRunning(): void {
    if (!this.loopRunning) {
      this.loopRunning = true;
      this.scene.startLoop((dt) => this.update(dt));
    }
  }

  // ── Public API ────────────────────────────────────────────────────────

  spawnDie(dieType: DieType, color: DieColor, screenX: number, screenY: number): void {
    const meshResult = createDieMesh(dieType, color, true); // mystery=true: show "?" until server value arrives
    this.scene.add(meshResult.group);

    const body = this.physics.addDie(meshResult.group, meshResult.geometry, dieType);

    const rect = this.canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.scene.camera);
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const worldPos = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(floorPlane, worldPos);

    const dropX = worldPos?.x ?? 0;
    const dropZ = worldPos?.z ?? 0;

    body.body.position.set(dropX, 12, dropZ);
    body.body.quaternion.setFromEuler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    body.body.velocity.set(0, -3, 0);
    body.body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    );

    const targetValue = this.randomValue(dieType);
    const throwId = this.nextThrowId++;

    const ad: AnimatedDie = {
      body,
      meshResult,
      dieType,
      color,
      label: dieType.toUpperCase(),
      targetValue,
      serverValue: null, // Will be set by server response
      throwId,
      glowMesh: null,
      revealed: false, // Hidden until server value arrives and die settles
      revealTime: 0,
    };

    this.animatedDice.push(ad);

    // Each spawn is its own independent batch
    this.throwBatches.push({ dice: new Set([ad]), source: 'physical', reported: false });
    this.physics.resetFrameCounter();
    this.ensureLoopRunning();

    // Fire throw callback — DiceOverlay calls the server for authoritative values
    this.callbacks.onThrow([{ dieType, color }], throwId);
  }

  /**
   * Set server-authoritative values for a specific throw batch.
   * Called by DiceOverlay after /api/dice/roll returns.
   * throwId ties the response to the exact dice that triggered the call.
   */
  setServerValues(throwId: number, values: Array<{ dieType: DieType; value: number }>): void {
    const batch = this.animatedDice.filter(ad => ad.throwId === throwId && ad.serverValue === null);
    for (let i = 0; i < Math.min(values.length, batch.length); i++) {
      batch[i].serverValue = values[i].value;
    }
  }

  removeDieAt(screenX: number, screenY: number): boolean {
    const rect = this.canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1,
    );
    const hit = this.raycastDice(ndc);
    if (!hit) return false;

    this.physics.removeDie(hit.body);

    this.scene.remove(hit.meshResult.group);
    hit.meshResult.group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else if (mat.dispose) mat.dispose();
      }
      if (obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });

    this.animatedDice = this.animatedDice.filter(ad => ad !== hit);
    return true;
  }

  removeAllDice(): void {
    for (const ad of this.animatedDice) {
      this.physics.removeDie(ad.body);
      this.scene.remove(ad.meshResult.group);
      ad.meshResult.group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else if (mat.dispose) mat.dispose();
        }
        if (obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    this.animatedDice = [];
    this.throwBatches = [];
  }

  hasDieAt(screenX: number, screenY: number): boolean {
    const rect = this.canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1,
    );
    return this.raycastDice(ndc) !== null;
  }

  hasDice(): boolean {
    return this.animatedDice.length > 0;
  }

  resize(width: number, height: number): void {
    this.scene.resize(width, height);
    this.physics.setWallsFromFrustum(this.scene.camera);
  }

  syncWithViewBox(x: number, y: number, width: number, height: number): void {
    this.scene.syncWithViewBox(x, y, width, height);
    this.physics.setWallsFromFrustum(this.scene.camera);
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);
    document.body.style.cursor = '';

    this.scene.stopLoop();

    for (const ad of this.animatedDice) {
      this.scene.remove(ad.meshResult.group);
      ad.meshResult.group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else if (mat.dispose) mat.dispose();
        }
        if (obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }

    // Clean up impact flashes
    for (const flash of this.impactFlashes) {
      this.scene.remove(flash.mesh);
      (flash.mesh.material as THREE.Material).dispose();
    }
    this.impactFlashes = [];

    this.physics.dispose();
    this.scene.dispose();
    this.animatedDice = [];
  }
}
