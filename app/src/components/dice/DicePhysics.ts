/**
 * Dice Physics — Cannon-es rigid body simulation with ConvexPolyhedron shapes.
 *
 * Real polyhedron collision shapes so dice tumble on edges and land on faces
 * like real dice — not spheres that roll forever.
 *
 * ConvexPolyhedron-on-Plane has a known micro-jitter bug in Cannon-es.
 * We handle it with: Box floor (not Plane), high damping, and aggressive
 * velocity-based settle detection that freezes dice once they're nearly still.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────

const GRAVITY = -60;
const FLOOR_Y = 0;
const DICE_MASS = 5;
const RESTITUTION = 0.2;
const FRICTION = 0.8;
const LINEAR_DAMPING = 0.55;
const ANGULAR_DAMPING = 0.55;
const WALL_HEIGHT = 8;
const WALL_MARGIN = 0.3;

// Settle detection
const SETTLE_VELOCITY_THRESHOLD = 0.15;
const SETTLE_ANGULAR_THRESHOLD = 0.2;
const SETTLE_FRAMES_REQUIRED = 25; // ~0.4s at 60fps

// Hard frame cap as absolute fallback
const MAX_FRAMES = 600; // ~10s

// ── ConvexPolyhedron from Three.js geometry ──────────────────────────────

function createConvexShape(geometry: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  const tolerance = 0.001;

  const uniqueVerts: CANNON.Vec3[] = [];
  const vertexMap: number[] = new Array(posAttr.count);

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    let found = -1;
    for (let j = 0; j < uniqueVerts.length; j++) {
      const v = uniqueVerts[j];
      if (
        Math.abs(v.x - x) < tolerance &&
        Math.abs(v.y - y) < tolerance &&
        Math.abs(v.z - z) < tolerance
      ) {
        found = j;
        break;
      }
    }

    if (found >= 0) {
      vertexMap[i] = found;
    } else {
      vertexMap[i] = uniqueVerts.length;
      uniqueVerts.push(new CANNON.Vec3(x, y, z));
    }
  }

  const faces: number[][] = [];
  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      const a = vertexMap[indexAttr.getX(i)];
      const b = vertexMap[indexAttr.getX(i + 1)];
      const c = vertexMap[indexAttr.getX(i + 2)];
      if (a !== b && b !== c && a !== c) {
        faces.push([a, b, c]);
      }
    }
  } else {
    for (let i = 0; i < posAttr.count; i += 3) {
      const a = vertexMap[i];
      const b = vertexMap[i + 1];
      const c = vertexMap[i + 2];
      if (a !== b && b !== c && a !== c) {
        faces.push([a, b, c]);
      }
    }
  }

  return new CANNON.ConvexPolyhedron({ vertices: uniqueVerts, faces });
}

// ── Physics World ─────────────────────────────────────────────────────────

export interface DiceBody {
  body: CANNON.Body;
  mesh: THREE.Object3D;
  settled: boolean;
  settleFrames: number;
  frozen: boolean;
}

export class DicePhysicsWorld {
  world: CANNON.World;
  bodies: DiceBody[] = [];
  private floorBody: CANNON.Body;
  private wallBodies: CANNON.Body[] = [];
  private diceMaterial: CANNON.Material;
  private floorMaterial: CANNON.Material;
  private totalFrames = 0;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, GRAVITY, 0),
    });

    // More solver iterations for stable polyhedron contacts
    (this.world.solver as CANNON.GSSolver).iterations = 14;

    this.diceMaterial = new CANNON.Material('dice');
    this.floorMaterial = new CANNON.Material('floor');

    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.floorMaterial,
      { friction: FRICTION, restitution: RESTITUTION }
    ));
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.diceMaterial,
      { friction: FRICTION, restitution: RESTITUTION * 0.5 }
    ));

    // Box floor instead of Plane — reduces ConvexPolyhedron edge jitter
    this.floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(100, 0.1, 100)),
      position: new CANNON.Vec3(0, FLOOR_Y - 0.1, 0),
      material: this.floorMaterial,
    });
    this.world.addBody(this.floorBody);
  }

  setWallsFromFrustum(camera: THREE.PerspectiveCamera): void {
    for (const wall of this.wallBodies) this.world.removeBody(wall);
    this.wallBodies = [];

    const { minX, maxX, minZ, maxZ } = this.computeFrustumBounds(camera);

    const wallThickness = 0.5;
    const wallDefs: { pos: CANNON.Vec3; halfExtents: CANNON.Vec3 }[] = [
      {
        pos: new CANNON.Vec3(maxX - WALL_MARGIN + wallThickness, WALL_HEIGHT / 2, 0),
        halfExtents: new CANNON.Vec3(wallThickness, WALL_HEIGHT / 2, 50),
      },
      {
        pos: new CANNON.Vec3(minX + WALL_MARGIN - wallThickness, WALL_HEIGHT / 2, 0),
        halfExtents: new CANNON.Vec3(wallThickness, WALL_HEIGHT / 2, 50),
      },
      {
        pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, maxZ - WALL_MARGIN + wallThickness),
        halfExtents: new CANNON.Vec3(50, WALL_HEIGHT / 2, wallThickness),
      },
      {
        pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, minZ + WALL_MARGIN - wallThickness),
        halfExtents: new CANNON.Vec3(50, WALL_HEIGHT / 2, wallThickness),
      },
    ];

    for (const def of wallDefs) {
      const wall = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(def.halfExtents),
        position: def.pos,
        material: this.floorMaterial,
      });
      this.world.addBody(wall);
      this.wallBodies.push(wall);
    }
  }

  private computeFrustumBounds(camera: THREE.PerspectiveCamera) {
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const corners = [
      new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1),
      new THREE.Vector2(-1, 1), new THREE.Vector2(1, 1),
    ];

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const corner of corners) {
      raycaster.setFromCamera(corner, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(floorPlane, hit)) {
        minX = Math.min(minX, hit.x); maxX = Math.max(maxX, hit.x);
        minZ = Math.min(minZ, hit.z); maxZ = Math.max(maxZ, hit.z);
      }
    }
    return isFinite(minX) ? { minX, maxX, minZ, maxZ } : { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  }

  getFrustumBounds(camera: THREE.PerspectiveCamera) {
    return this.computeFrustumBounds(camera);
  }

  addDie(mesh: THREE.Object3D, geometry: THREE.BufferGeometry): DiceBody {
    const shape = createConvexShape(geometry);

    const body = new CANNON.Body({
      mass: DICE_MASS,
      shape,
      material: this.diceMaterial,
      linearDamping: LINEAR_DAMPING,
      angularDamping: ANGULAR_DAMPING,
    });

    this.world.addBody(body);
    const diceBody: DiceBody = { body, mesh, settled: false, settleFrames: 0, frozen: false };
    this.bodies.push(diceBody);
    return diceBody;
  }

  resetFrameCounter(): void {
    this.totalFrames = 0;
    for (const db of this.bodies) {
      if (!db.frozen) {
        db.settleFrames = 0;
      }
    }
  }

  throwDie(diceBody: DiceBody, index: number, totalDice: number): void {
    const { body } = diceBody;

    diceBody.frozen = false;
    diceBody.settled = false;
    diceBody.settleFrames = 0;
    this.totalFrames = 0;

    const spread = totalDice > 1 ? (index - (totalDice - 1) / 2) * 1.5 : 0;

    body.position.set(
      spread + (Math.random() - 0.5) * 0.5,
      5 + Math.random() * 2,
      -2 + (Math.random() - 0.5) * 0.5,
    );
    body.quaternion.setFromEuler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    body.velocity.set(
      (Math.random() - 0.5) * 4,
      -2 - Math.random() * 3,
      3 + Math.random() * 3,
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
    );
  }

  step(dt: number): boolean {
    this.world.step(1 / 60, dt, 3);
    this.totalFrames++;

    let allSettled = true;

    for (const db of this.bodies) {
      const p = db.body.position;
      const q = db.body.quaternion;
      db.mesh.position.set(p.x, p.y, p.z);
      db.mesh.quaternion.set(q.x, q.y, q.z, q.w);

      if (db.frozen) {
        db.settled = true;
        continue;
      }

      // Hard frame cap
      if (this.totalFrames >= MAX_FRAMES) {
        this.freezeBody(db);
        continue;
      }

      const linVel = db.body.velocity.length();
      const angVel = db.body.angularVelocity.length();

      if (linVel < SETTLE_VELOCITY_THRESHOLD && angVel < SETTLE_ANGULAR_THRESHOLD) {
        db.settleFrames++;
        if (db.settleFrames >= SETTLE_FRAMES_REQUIRED) {
          this.freezeBody(db);
          continue;
        }
      } else {
        db.settleFrames = 0;
        db.settled = false;
      }

      if (!db.settled) allSettled = false;
    }

    return allSettled;
  }

  private freezeBody(db: DiceBody): void {
    db.body.velocity.setZero();
    db.body.angularVelocity.setZero();
    db.frozen = true;
    db.settled = true;
  }

  removeDie(diceBody: DiceBody): void {
    this.world.removeBody(diceBody.body);
    this.bodies = this.bodies.filter(db => db !== diceBody);
  }

  clear(): void {
    for (const db of this.bodies) this.world.removeBody(db.body);
    this.bodies = [];
    this.totalFrames = 0;
  }

  dispose(): void {
    this.clear();
    this.world.removeBody(this.floorBody);
    for (const wall of this.wallBodies) this.world.removeBody(wall);
  }
}
