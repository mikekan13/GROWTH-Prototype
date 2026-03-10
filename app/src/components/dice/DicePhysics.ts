/**
 * Dice Physics — Cannon-es rigid body simulation for realistic dice rolling.
 *
 * Creates a physics world with floor + walls, spawns dice bodies,
 * applies throw forces, and syncs positions/rotations to Three.js meshes.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────

const GRAVITY = -30;
const FLOOR_Y = 0;
const WALL_DISTANCE = 4;
const DICE_MASS = 1;
const RESTITUTION = 0.3;
const FRICTION = 0.4;
const LINEAR_DAMPING = 0.3;
const ANGULAR_DAMPING = 0.3;
const SETTLE_VELOCITY_THRESHOLD = 0.05;
const SETTLE_ANGULAR_THRESHOLD = 0.1;
const SETTLE_FRAMES_REQUIRED = 30; // ~0.5s at 60fps

// ── Physics World ─────────────────────────────────────────────────────────

export interface DiceBody {
  body: CANNON.Body;
  mesh: THREE.Object3D;
  settled: boolean;
  settleFrames: number;
}

export class DicePhysicsWorld {
  world: CANNON.World;
  bodies: DiceBody[] = [];
  private floorBody: CANNON.Body;
  private wallBodies: CANNON.Body[] = [];

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, GRAVITY, 0),
    });

    // Floor
    this.floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      position: new CANNON.Vec3(0, FLOOR_Y, 0),
    });
    this.floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.floorBody);

    // Walls (4 sides)
    const wallPositions: [number, number, number, number, number, number][] = [
      [WALL_DISTANCE, 2, 0, 0, 0, -Math.PI / 2],    // +X wall
      [-WALL_DISTANCE, 2, 0, 0, 0, Math.PI / 2],     // -X wall
      [0, 2, WALL_DISTANCE, Math.PI / 2, 0, 0],      // +Z wall
      [0, 2, -WALL_DISTANCE, -Math.PI / 2, 0, 0],    // -Z wall
    ];

    for (const [x, y, z, rx, ry, rz] of wallPositions) {
      const wall = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
        position: new CANNON.Vec3(x, y, z),
      });
      wall.quaternion.setFromEuler(rx, ry, rz);
      this.world.addBody(wall);
      this.wallBodies.push(wall);
    }

    // Contact material
    const diceMaterial = new CANNON.Material('dice');
    const floorMaterial = new CANNON.Material('floor');
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      diceMaterial, floorMaterial,
      { friction: FRICTION, restitution: RESTITUTION }
    ));
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      diceMaterial, diceMaterial,
      { friction: FRICTION, restitution: RESTITUTION * 0.5 }
    ));

    this.floorBody.material = floorMaterial;
    for (const wall of this.wallBodies) {
      wall.material = floorMaterial;
    }
  }

  /**
   * Add a die to the physics world.
   * Returns the DiceBody for tracking.
   */
  addDie(mesh: THREE.Object3D, dieType: string): DiceBody {
    // Approximate all dice as spheres for physics (simpler + faster than polyhedra)
    const radius = dieType === 'd4' ? 0.45 : 0.5;
    const shape = new CANNON.Sphere(radius);

    const diceMaterial = new CANNON.Material('dice');
    const body = new CANNON.Body({
      mass: DICE_MASS,
      shape,
      material: diceMaterial,
      linearDamping: LINEAR_DAMPING,
      angularDamping: ANGULAR_DAMPING,
    });

    this.world.addBody(body);

    const diceBody: DiceBody = { body, mesh, settled: false, settleFrames: 0 };
    this.bodies.push(diceBody);
    return diceBody;
  }

  /**
   * Throw a die from a position with randomized velocity.
   */
  throwDie(diceBody: DiceBody, index: number, totalDice: number): void {
    const { body } = diceBody;

    // Spread dice horizontally based on index
    const spread = totalDice > 1 ? (index - (totalDice - 1) / 2) * 1.5 : 0;

    // Start position: above the table, offset by index
    body.position.set(
      spread + (Math.random() - 0.5) * 0.5,
      5 + Math.random() * 2,
      -2 + (Math.random() - 0.5) * 0.5,
    );

    // Random initial rotation
    body.quaternion.setFromEuler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );

    // Throw velocity: forward and down with some randomness
    body.velocity.set(
      (Math.random() - 0.5) * 4,
      -2 - Math.random() * 3,
      3 + Math.random() * 3,
    );

    // Random spin
    body.angularVelocity.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
    );
  }

  /**
   * Step the physics simulation and sync mesh transforms.
   * Returns true if all dice have settled.
   */
  step(dt: number): boolean {
    this.world.step(1 / 60, dt, 3);

    let allSettled = true;

    for (const db of this.bodies) {
      // Sync mesh to physics body
      const p = db.body.position;
      const q = db.body.quaternion;
      db.mesh.position.set(p.x, p.y, p.z);
      db.mesh.quaternion.set(q.x, q.y, q.z, q.w);

      // Check settle
      const linVel = db.body.velocity.length();
      const angVel = db.body.angularVelocity.length();

      if (linVel < SETTLE_VELOCITY_THRESHOLD && angVel < SETTLE_ANGULAR_THRESHOLD) {
        db.settleFrames++;
        if (db.settleFrames >= SETTLE_FRAMES_REQUIRED) {
          db.settled = true;
        }
      } else {
        db.settleFrames = 0;
        db.settled = false;
      }

      if (!db.settled) allSettled = false;
    }

    return allSettled;
  }

  /**
   * Clean up: remove all bodies and reset.
   */
  clear(): void {
    for (const db of this.bodies) {
      this.world.removeBody(db.body);
    }
    this.bodies = [];
  }

  dispose(): void {
    this.clear();
    this.world.removeBody(this.floorBody);
    for (const wall of this.wallBodies) {
      this.world.removeBody(wall);
    }
  }
}
