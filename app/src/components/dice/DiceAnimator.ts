/**
 * Dice Animator — Manages 3D dice as persistent physical objects on the canvas.
 *
 * Dice are real — physics determines the result. No snapping to pre-computed
 * values. The random generator biases the spin/orientation so the die TENDS
 * toward a target face, but whatever actually lands up IS the roll.
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
  readUpFaceValue,
  type DiceMeshResult,
} from './DiceMesh';

export interface SettledDie {
  dieType: DieType;
  color: DieColor;
  value: number;  // The face that actually landed up
  label: string;
}

export interface AnimatorCallbacks {
  onSettle: (dice: SettledDie[]) => void;
}

interface AnimatedDie {
  body: DiceBody;
  meshResult: DiceMeshResult;
  dieType: DieType;
  color: DieColor;
  label: string;
  /** Random generator's target — used to bias spin, NOT to snap. */
  targetValue: number;
}

interface VelocitySample {
  pos: THREE.Vector2;
  time: number;
}

const VELOCITY_WINDOW_MS = 80;
const DRAG_Y = 2;

export class DiceAnimator {
  private scene: DiceScene;
  private physics: DicePhysicsWorld;
  private animatedDice: AnimatedDie[] = [];
  private callbacks: AnimatorCallbacks;

  /** Tracks whether we've already reported the settle for the current throw. */
  private settleReported = false;
  private loopRunning = false;

  private draggedDie: AnimatedDie | null = null;
  private mousePos = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private velocitySamples: VelocitySample[] = [];
  private shakeAngularVelocity = new THREE.Vector3();
  private shakeFrameCount = 0;

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
  }

  // ── Grab ──────────────────────────────────────────────────────────────

  tryGrab(e: MouseEvent): boolean {
    const ndc = this.screenToNDC(e);
    const hit = this.raycastDice(ndc);
    if (!hit) return false;

    this.draggedDie = hit;
    this.mousePos.copy(ndc);
    this.velocitySamples = [{ pos: ndc.clone(), time: performance.now() }];

    // Unfreeze the body for interaction
    hit.body.frozen = false;
    hit.body.settled = false;
    hit.body.settleFrames = 0;
    hit.body.body.allowSleep = true;
    hit.body.body.wakeUp();
    hit.body.body.type = 2; // KINEMATIC
    hit.body.body.velocity.setZero();
    hit.body.body.angularVelocity.setZero();

    // Reset frame cap so flings don't get instantly frozen
    this.physics.resetFrameCounter();

    // Start shaking — die spins continuously while held
    this.shakeFrameCount = 0;
    this.shakeAngularVelocity.set(
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30,
    );

    // Mark unsettled so we report the new result after this fling
    this.settleReported = false;
    hit.targetValue = this.randomValue(hit.dieType); // stored for future Godhead bias

    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', this.boundOnMouseMove);
    window.addEventListener('mouseup', this.boundOnMouseUp);

    return true;
  }

  // ── Initial throw (from dice service roll event) ──────────────────────

  start(result: RollResult): void {
    this.settleReported = false;
    this.animatedDice = [];

    const rollableDice = result.rolls.filter(r => r.die !== 'flat' && r.maxValue > 0);

    if (rollableDice.length === 0) {
      this.callbacks.onSettle([]);
      return;
    }

    for (let i = 0; i < rollableDice.length; i++) {
      const outcome = rollableDice[i];
      const dieType = outcome.die as DieType;
      const color = result.request.dice[i]?.color ?? 'white';

      const meshResult = createDieMesh(dieType, color);
      this.scene.add(meshResult.group);

      const body = this.physics.addDie(meshResult.group, meshResult.geometry);

      // Bias the initial throw toward the pre-computed target value
      this.throwDieWithBias(body, meshResult, dieType, outcome.value, i, rollableDice.length);

      this.animatedDice.push({
        body,
        meshResult,
        dieType,
        color,
        label: outcome.label,
        targetValue: outcome.value,
      });
    }

    this.ensureLoopRunning();
  }

  // ── Physics-biased throw ──────────────────────────────────────────────

  /**
   * Throw a die with physics biased toward a target face.
   *
   * Sets the initial quaternion so the target face starts roughly upward,
   * then applies random forces. The die tumbles but statistically favors
   * landing on the target face. Not guaranteed — just biased.
   */
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

    // Position: above the floor
    body.position.set(
      spread + (Math.random() - 0.5) * 0.3,
      3 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2,
    );

    // Orientation: start with target face roughly up, then add noise
    const faceIdx = getFaceIndexForValue(dieType, targetValue);
    const biasQuat = meshResult.getSnapRotation(faceIdx);
    // Add random perturbation (±30° on each axis) so it's not obviously rigged
    const noise = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (Math.random() - 0.5) * Math.PI * 0.33,
      (Math.random() - 0.5) * Math.PI * 0.33,
      (Math.random() - 0.5) * Math.PI * 0.33,
    ));
    biasQuat.multiply(noise);
    body.quaternion.set(biasQuat.x, biasQuat.y, biasQuat.z, biasQuat.w);

    // Downward + random horizontal velocity
    body.velocity.set(
      (Math.random() - 0.5) * 5,
      -5 - Math.random() * 4,
      (Math.random() - 0.5) * 5,
    );

    // Angular velocity: moderate spin (enough to tumble but not wildly)
    body.angularVelocity.set(
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 15,
    );
  }

  // ── Frame update ──────────────────────────────────────────────────────

  private update(dt: number): void {
    if (this.draggedDie) {
      this.updateDraggedDie();
    }

    const allSettled = this.physics.step(dt);

    // When all dice settle naturally, just read the result — no snapping
    if (allSettled && !this.draggedDie && !this.settleReported) {
      this.settleReported = true;

      const results: SettledDie[] = [];
      for (const ad of this.animatedDice) {
        results.push({
          dieType: ad.dieType,
          color: ad.color,
          label: ad.label,
          value: readUpFaceValue(ad.meshResult, ad.body.mesh.quaternion as THREE.Quaternion),
        });
      }

      this.callbacks.onSettle(results);
    }
  }

  // ── Mouse Interaction ─────────────────────────────────────────────────

  private screenToNDC(e: MouseEvent): THREE.Vector2 {
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

  private onMouseMove(e: MouseEvent): void {
    if (!this.draggedDie) return;
    this.mousePos.copy(this.screenToNDC(e));

    const now = performance.now();
    this.velocitySamples.push({ pos: this.mousePos.clone(), time: now });
    const cutoff = now - VELOCITY_WINDOW_MS;
    this.velocitySamples = this.velocitySamples.filter(s => s.time >= cutoff);
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

  private updateDraggedDie(): void {
    if (!this.draggedDie) return;

    this.raycaster.setFromCamera(this.mousePos, this.scene.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, target);

    if (target) {
      const body = this.draggedDie.body.body;
      body.position.set(target.x, DRAG_Y, target.z);
      this.draggedDie.body.mesh.position.set(target.x, DRAG_Y, target.z);
    }

    // Spin the die while held — like shaking in your hand
    const spin = this.shakeAngularVelocity;
    const spinQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      spin.x * 0.016,
      spin.y * 0.016,
      spin.z * 0.016,
    ));
    this.draggedDie.body.mesh.quaternion.premultiply(spinQuat);
    // Sync physics body so step() doesn't overwrite our shake
    const mq = this.draggedDie.body.mesh.quaternion;
    this.draggedDie.body.body.quaternion.set(mq.x, mq.y, mq.z, mq.w);

    // Periodically re-randomize spin direction for chaotic shaking
    this.shakeFrameCount++;
    if (this.shakeFrameCount % 8 === 0) {
      this.shakeAngularVelocity.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30,
      );
    }
  }

  private onMouseUp(_e: MouseEvent): void {
    if (!this.draggedDie) return;

    const ad = this.draggedDie;
    const body = ad.body.body;

    body.type = 1; // DYNAMIC

    // Sync physics body to wherever the shake left the mesh orientation
    const meshQ = ad.body.mesh.quaternion;
    body.quaternion.set(meshQ.x, meshQ.y, meshQ.z, meshQ.w);

    // Simple fling: mouse velocity → world velocity + drop
    const flingStrength = 25;
    const flingVel = this.computeFlingVelocity();
    body.velocity.set(
      flingVel.x * flingStrength,
      -5, // Drop
      -flingVel.y * flingStrength,
    );

    // Random spin
    const spinStrength = 15;
    body.angularVelocity.set(
      (Math.random() - 0.5) * spinStrength,
      (Math.random() - 0.5) * spinStrength,
      (Math.random() - 0.5) * spinStrength,
    );

    ad.body.settled = false;
    ad.body.settleFrames = 0;
    ad.body.frozen = false;
    this.draggedDie = null;

    this.velocitySamples = [];
    document.body.style.cursor = '';

    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);
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

  /**
   * Spawn a single die at a screen position and drop it onto the canvas.
   */
  spawnDie(dieType: DieType, color: DieColor, screenX: number, screenY: number): void {
    const meshResult = createDieMesh(dieType, color);
    this.scene.add(meshResult.group);

    const body = this.physics.addDie(meshResult.group, meshResult.geometry);

    // Convert screen position to world position on the floor
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

    body.body.position.set(dropX, 2, dropZ);
    body.body.quaternion.setFromEuler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    // Small downward velocity — just a gentle drop
    body.body.velocity.set(0, -3, 0);
    body.body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    );

    const targetValue = this.randomValue(dieType);

    this.animatedDice.push({
      body,
      meshResult,
      dieType,
      color,
      label: dieType.toUpperCase(),
      targetValue,
    });

    this.settleReported = false;
    this.physics.resetFrameCounter();
    this.ensureLoopRunning();
  }

  /**
   * Remove a die at the given screen position. Returns true if a die was found.
   */
  removeDieAt(screenX: number, screenY: number): boolean {
    const rect = this.canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1,
    );
    const hit = this.raycastDice(ndc);
    if (!hit) return false;

    // Remove from physics
    this.physics.removeDie(hit.body);

    // Remove from scene + dispose
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

  /**
   * Check if there's a die at the given screen position (for context menu logic).
   */
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

    this.physics.dispose();
    this.scene.dispose();
    this.animatedDice = [];
  }
}
