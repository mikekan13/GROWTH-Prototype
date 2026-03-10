/**
 * Dice Animator — Manages 3D dice as physical objects on the Relations Canvas.
 *
 * Dice roll, settle with result face up, and stay on the canvas.
 * The render/physics loop runs continuously so dice can be interacted with.
 * Mouse drag applies forces to fling dice around.
 */

import * as THREE from 'three';
import type { RollResult, DieType } from '@/types/dice';
import { DiceScene } from './DiceScene';
import { DicePhysicsWorld, type DiceBody } from './DicePhysics';
import { createDieMesh, getFaceIndexForValue, type DiceMeshResult } from './DiceMesh';

export interface AnimatorCallbacks {
  onComplete: () => void;
}

interface AnimatedDie {
  body: DiceBody;
  meshResult: DiceMeshResult;
  targetValue: number;
  snapped: boolean;
  preSnapQuat: THREE.Quaternion | null;
}

export class DiceAnimator {
  private scene: DiceScene;
  private physics: DicePhysicsWorld;
  private animatedDice: AnimatedDie[] = [];
  private settled = false;
  private completed = false;
  private snapStartTime: number | null = null;
  private callbacks: AnimatorCallbacks;

  // Mouse interaction state
  private draggedDie: AnimatedDie | null = null;
  private mousePos = new THREE.Vector2();
  private lastMousePos = new THREE.Vector2();
  private mouseVelocity = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private dragPlaneY = 1.5; // Height at which dragged die floats

  // Bound event handlers (for cleanup)
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

    // Bind mouse handlers
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
  }

  /**
   * Try to grab a die at the mouse position. Called by DiceOverlay's hit-test div.
   * Returns true if a die was captured (caller should stop propagation).
   * Returns false if no die was hit (caller should pass event through to canvas below).
   */
  tryGrab(e: MouseEvent): boolean {
    const ndc = this.screenToNDC(e);
    const hit = this.raycastDice(ndc);
    if (!hit) return false;

    this.draggedDie = hit;
    this.mousePos.copy(ndc);
    this.lastMousePos.copy(ndc);
    this.mouseVelocity.set(0, 0);

    // Make body kinematic while dragging
    hit.body.body.type = 2; // KINEMATIC
    hit.body.body.velocity.setZero();
    hit.body.body.angularVelocity.setZero();

    // If dice were snapped/settled, allow re-interaction
    this.settled = false;
    this.completed = false;
    hit.snapped = false;

    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', this.boundOnMouseMove);
    window.addEventListener('mouseup', this.boundOnMouseUp);

    return true;
  }

  start(result: RollResult): void {
    this.settled = false;
    this.completed = false;
    this.snapStartTime = null;
    this.animatedDice = [];

    const rollableDice = result.rolls.filter(r => r.die !== 'flat' && r.maxValue > 0);

    if (rollableDice.length === 0) {
      this.callbacks.onComplete();
      return;
    }

    for (let i = 0; i < rollableDice.length; i++) {
      const outcome = rollableDice[i];
      const dieType = outcome.die as DieType;
      const color = result.request.dice[i]?.color ?? 'white';

      const meshResult = createDieMesh(dieType, color);
      this.scene.add(meshResult.group);

      const body = this.physics.addDie(meshResult.group, dieType);
      this.physics.throwDie(body, i, rollableDice.length);

      this.animatedDice.push({
        body, meshResult,
        targetValue: outcome.value,
        snapped: false,
        preSnapQuat: null,
      });
    }

    // Start continuous loop
    this.scene.startLoop((dt) => this.update(dt));
  }

  private update(dt: number): void {
    // If dragging a die, move it to mouse position
    if (this.draggedDie) {
      this.updateDraggedDie();
    }

    if (!this.settled) {
      const allSettled = this.physics.step(dt);
      if (allSettled && !this.draggedDie) {
        this.settled = true;
        this.snapStartTime = performance.now();
        for (const ad of this.animatedDice) {
          ad.body.body.velocity.setZero();
          ad.body.body.angularVelocity.setZero();
          ad.preSnapQuat = ad.body.mesh.quaternion.clone();
        }
      }
    } else if (!this.completed) {
      this.performSnap();
    } else {
      // Keep physics running for interaction
      this.physics.step(dt);
    }
  }

  private performSnap(): void {
    if (!this.snapStartTime) return;

    const elapsed = performance.now() - this.snapStartTime;
    const duration = 400;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    let allDone = true;
    for (const ad of this.animatedDice) {
      if (ad.snapped) continue;
      if (!ad.preSnapQuat) { ad.snapped = true; continue; }

      const faceIdx = getFaceIndexForValue(ad.meshResult.dieType, ad.targetValue);
      const targetQuat = ad.meshResult.getSnapRotation(faceIdx);
      const current = ad.preSnapQuat.clone().slerp(targetQuat, eased);
      ad.body.mesh.quaternion.copy(current);

      // Sync physics body quaternion
      ad.body.body.quaternion.set(current.x, current.y, current.z, current.w);

      if (t >= 1) {
        ad.body.mesh.quaternion.copy(targetQuat);
        ad.body.body.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);
        ad.snapped = true;
      } else {
        allDone = false;
      }
    }

    if (allDone && !this.completed) {
      this.completed = true;
      this.callbacks.onComplete();
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
    this.lastMousePos.copy(this.mousePos);
    this.mousePos.copy(this.screenToNDC(e));
    this.mouseVelocity.set(
      this.mousePos.x - this.lastMousePos.x,
      this.mousePos.y - this.lastMousePos.y,
    );
  }

  private updateDraggedDie(): void {
    if (!this.draggedDie) return;

    // Project mouse to 3D position on the drag plane
    this.raycaster.setFromCamera(this.mousePos, this.scene.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.dragPlaneY);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, target);

    if (target) {
      const body = this.draggedDie.body.body;
      body.position.set(target.x, this.dragPlaneY, target.z);
      this.draggedDie.body.mesh.position.set(target.x, this.dragPlaneY, target.z);
    }
  }

  private onMouseUp(_e: MouseEvent): void {
    if (!this.draggedDie) return;

    const body = this.draggedDie.body.body;

    // Make dynamic again
    body.type = 1; // DYNAMIC

    // Apply fling velocity based on mouse movement
    const flingStrength = 40;
    body.velocity.set(
      this.mouseVelocity.x * flingStrength,
      -5, // Drop
      -this.mouseVelocity.y * flingStrength,
    );

    // Add spin based on velocity
    const spinStrength = 15;
    body.angularVelocity.set(
      (Math.random() - 0.5) * spinStrength,
      (Math.random() - 0.5) * spinStrength,
      (Math.random() - 0.5) * spinStrength,
    );

    // Reset settle tracking
    this.draggedDie.body.settled = false;
    this.draggedDie.body.settleFrames = 0;
    this.draggedDie = null;

    document.body.style.cursor = '';

    window.removeEventListener('mousemove', this.boundOnMouseMove);
    window.removeEventListener('mouseup', this.boundOnMouseUp);
  }

  // ── Public API ────────────────────────────────────────────────────────

  skip(): void {
    if (this.completed) return;

    this.settled = true;
    for (const ad of this.animatedDice) {
      ad.body.body.velocity.setZero();
      ad.body.body.angularVelocity.setZero();
      ad.body.body.position.y = 0.5;
      ad.body.mesh.position.y = 0.5;

      const faceIdx = getFaceIndexForValue(ad.meshResult.dieType, ad.targetValue);
      const targetQuat = ad.meshResult.getSnapRotation(faceIdx);
      ad.body.mesh.quaternion.copy(targetQuat);
      ad.body.body.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);
      ad.snapped = true;
    }
    this.completed = true;
    this.callbacks.onComplete();
  }

  hasDice(): boolean {
    return this.animatedDice.length > 0;
  }

  resize(width: number, height: number): void {
    this.scene.resize(width, height);
  }

  dispose(): void {
    // Remove event listeners
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
