/**
 * Dice Physics — Cannon-es rigid body simulation.
 *
 * Collision shapes per die type:
 *   D4  → Compound spheres at tetrahedron vertices (avoids ConvexPolyhedron jitter)
 *   D6  → Native CANNON.Box (avoids ConvexPolyhedron jitter)
 *   D8/D12/D20 → ConvexPolyhedron from Three.js geometry
 *
 * Box floor (not Plane) to reduce edge-contact solver noise.
 * Velocity-based settle detection freezes dice via body.sleep().
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────

const GRAVITY = -60;
const FLOOR_Y = 0;
const DICE_MASS = 3;
const RESTITUTION = 0.35;
const FRICTION = 0.65;
const LINEAR_DAMPING = 0.4;
const ANGULAR_DAMPING = 0.4;
const WALL_HEIGHT = 15;
const WALL_MARGIN = 1.0;
// Frustum bounds computed slightly above floor so walls account for perspective.
const FRUSTUM_SAMPLE_Y = 1.5;

// Settle detection — velocity threshold
const SETTLE_VELOCITY_THRESHOLD = 0.2;
const SETTLE_ANGULAR_THRESHOLD = 0.3;
const SETTLE_FRAMES_REQUIRED = 10;

// D4: use compound Sphere shape instead of ConvexPolyhedron.
// ConvexPolyhedron-on-Box has a known cannon-es jitter bug.
// 4 spheres at tetrahedron vertices create the same collision hull
// but use sphere-box contacts which cannon-es solves cleanly.
const D4_VERTEX_SPHERE_RADIUS = 0.55;
const D4_EDGE_SPHERE_RADIUS = 0.40; // fills gaps between vertex spheres
// If a D4 settles on a point/edge (no face clearly down), nudge it off.
const D4_MIN_UP_DOT = 0.85;

// Hard frame cap as absolute fallback
const MAX_FRAMES = 600; // ~10s

// Cannon-es sleep
const SLEEP_SPEED_LIMIT = 0.5;
const SLEEP_TIME_LIMIT = 0.4;

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

export interface ImpactEvent {
  position: { x: number; y: number; z: number };
  strength: number; // 0-1 normalized
  isWall: boolean;  // wall/floor vs dice-on-dice
}

export interface DiceBody {
  body: CANNON.Body;
  mesh: THREE.Object3D;
  settled: boolean;
  settleFrames: number;
  frozen: boolean;
  dieType?: string;
  /** D4: vertex positions for post-settle validation */
  d4Vertices?: THREE.Vector3[];
}

// Minimum impact velocity to trigger a visual effect
const IMPACT_MIN_VELOCITY = 3;
const IMPACT_MAX_VELOCITY = 20;

export class DicePhysicsWorld {
  world: CANNON.World;
  bodies: DiceBody[] = [];
  /** Impacts from the last physics step — consumed by the renderer each frame. */
  pendingImpacts: ImpactEvent[] = [];
  private floorBody: CANNON.Body;
  private wallBodies: CANNON.Body[] = [];
  private staticBodies = new Set<CANNON.Body>();
  private diceMaterial: CANNON.Material;
  private floorMaterial: CANNON.Material;
  private totalFrames = 0;
  private innerMinX = -5;
  private innerMaxX = 5;
  private innerMinZ = -5;
  private innerMaxZ = 5;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, GRAVITY, 0),
    });

    // More solver iterations for stable polyhedron contacts
    const solver = this.world.solver as CANNON.GSSolver;
    solver.iterations = 20;

    this.diceMaterial = new CANNON.Material('dice');
    this.floorMaterial = new CANNON.Material('floor');

    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.floorMaterial,
      { friction: FRICTION, restitution: RESTITUTION }
    ));
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.diceMaterial, this.diceMaterial,
      { friction: FRICTION, restitution: RESTITUTION * 0.7 }
    ));

    // Box floor instead of Plane — reduces ConvexPolyhedron edge jitter
    this.floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(100, 0.1, 100)),
      position: new CANNON.Vec3(0, FLOOR_Y - 0.1, 0),
      material: this.floorMaterial,
    });
    this.world.addBody(this.floorBody);
    this.staticBodies.add(this.floorBody);
  }

  setWallsFromFrustum(camera: THREE.PerspectiveCamera): void {
    for (const wall of this.wallBodies) {
      this.world.removeBody(wall);
      this.staticBodies.delete(wall);
    }
    this.wallBodies = [];

    const { minX, maxX, minZ, maxZ } = this.computeFrustumBounds(camera);

    const wallThickness = 3.0;
    const wallDefs: { pos: CANNON.Vec3; halfExtents: CANNON.Vec3 }[] = [
      { // Right
        pos: new CANNON.Vec3(maxX - WALL_MARGIN + wallThickness, WALL_HEIGHT / 2, 0),
        halfExtents: new CANNON.Vec3(wallThickness, WALL_HEIGHT / 2, 50),
      },
      { // Left
        pos: new CANNON.Vec3(minX + WALL_MARGIN - wallThickness, WALL_HEIGHT / 2, 0),
        halfExtents: new CANNON.Vec3(wallThickness, WALL_HEIGHT / 2, 50),
      },
      { // Bottom
        pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, maxZ - WALL_MARGIN + wallThickness),
        halfExtents: new CANNON.Vec3(50, WALL_HEIGHT / 2, wallThickness),
      },
      { // Top — flush with visible edge (canvas container excludes the header)
        pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, minZ + WALL_MARGIN - wallThickness),
        halfExtents: new CANNON.Vec3(50, WALL_HEIGHT / 2, wallThickness),
      },
    ];

    // Store inner bounds for clamping
    this.innerMinX = minX + WALL_MARGIN;
    this.innerMaxX = maxX - WALL_MARGIN;
    this.innerMinZ = minZ + WALL_MARGIN;
    this.innerMaxZ = maxZ - WALL_MARGIN;

    for (const def of wallDefs) {
      const wall = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(def.halfExtents),
        position: def.pos,
        material: this.floorMaterial,
      });
      this.world.addBody(wall);
      this.wallBodies.push(wall);
      this.staticBodies.add(wall);
    }

    // After wall repositioning, clamp any dice that ended up outside
    this.clampDiceInBounds();
  }

  /** Push any dice that ended up outside the walls back inside. */
  private clampDiceInBounds(): void {
    const pad = 0.5; // keep dice this far inside the walls
    for (const db of this.bodies) {
      const p = db.body.position;
      let clamped = false;

      if (p.x < this.innerMinX + pad) { p.x = this.innerMinX + pad; clamped = true; }
      if (p.x > this.innerMaxX - pad) { p.x = this.innerMaxX - pad; clamped = true; }
      if (p.z < this.innerMinZ + pad) { p.z = this.innerMinZ + pad; clamped = true; }
      if (p.z > this.innerMaxZ - pad) { p.z = this.innerMaxZ - pad; clamped = true; }
      if (p.y < FLOOR_Y + 0.5) { p.y = FLOOR_Y + 0.5; clamped = true; }

      if (clamped) {
        // Kill velocity toward the wall so it doesn't immediately escape again
        db.body.velocity.scale(0.3, db.body.velocity);
        db.body.wakeUp();
      }
    }
  }

  private computeFrustumBounds(camera: THREE.PerspectiveCamera) {
    // Sample at FRUSTUM_SAMPLE_Y (not floor) so walls are tight enough
    // that dice stay on-screen even when bouncing above the floor.
    const samplePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FRUSTUM_SAMPLE_Y);
    const raycaster = new THREE.Raycaster();
    const corners = [
      new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1),
      new THREE.Vector2(-1, 1), new THREE.Vector2(1, 1),
    ];

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const corner of corners) {
      raycaster.setFromCamera(corner, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(samplePlane, hit)) {
        minX = Math.min(minX, hit.x); maxX = Math.max(maxX, hit.x);
        minZ = Math.min(minZ, hit.z); maxZ = Math.max(maxZ, hit.z);
      }
    }
    return isFinite(minX) ? { minX, maxX, minZ, maxZ } : { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  }

  getFrustumBounds(camera: THREE.PerspectiveCamera) {
    return this.computeFrustumBounds(camera);
  }

  addDie(mesh: THREE.Object3D, geometry: THREE.BufferGeometry, dieType?: string): DiceBody {
    const body = new CANNON.Body({
      mass: DICE_MASS,
      material: this.diceMaterial,
      linearDamping: LINEAR_DAMPING,
      angularDamping: ANGULAR_DAMPING,
      allowSleep: true,
      sleepSpeedLimit: SLEEP_SPEED_LIMIT,
      sleepTimeLimit: SLEEP_TIME_LIMIT,
    });

    if (dieType === 'd6') {
      // D6: native Box — ConvexPolyhedron cubes jitter on flat floors
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.63, 0.63, 0.63)));
    } else if (dieType === 'd4') {
      // D4: compound spheres — vertex spheres + edge midpoint spheres.
      // Vertex spheres alone leave gaps that other dice can poke through.
      // Edge midpoint spheres plug those gaps.
      const verts = this.extractUniqueVertices(geometry);
      const vertSphere = new CANNON.Sphere(D4_VERTEX_SPHERE_RADIUS);
      for (const v of verts) {
        body.addShape(vertSphere, new CANNON.Vec3(v.x, v.y, v.z));
      }
      // Add smaller spheres at each edge midpoint (6 edges for a tetrahedron)
      const edgeSphere = new CANNON.Sphere(D4_EDGE_SPHERE_RADIUS);
      for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
          const mx = (verts[i].x + verts[j].x) / 2;
          const my = (verts[i].y + verts[j].y) / 2;
          const mz = (verts[i].z + verts[j].z) / 2;
          body.addShape(edgeSphere, new CANNON.Vec3(mx, my, mz));
        }
      }
    } else {
      body.addShape(createConvexShape(geometry));
    }

    // Store D4 vertex directions for post-settle validation
    const d4VertexDirs = dieType === 'd4'
      ? this.extractUniqueVertices(geometry).map(v => new THREE.Vector3(v.x, v.y, v.z).normalize())
      : undefined;

    // Listen for collisions to generate impact events
    body.addEventListener('collide', (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const other = event.body;
      const isWall = this.staticBodies.has(other);

      // Relative impact velocity
      const v = body.velocity;
      const ov = other.velocity;
      const relVel = Math.sqrt(
        (v.x - ov.x) ** 2 + (v.y - ov.y) ** 2 + (v.z - ov.z) ** 2,
      );

      if (relVel < IMPACT_MIN_VELOCITY) return;

      // Contact point from the contact equation
      const contact = event.contact;
      const cp = new CANNON.Vec3();
      // ri = contact point relative to body A in world frame
      contact.ri.vadd(contact.bi.position, cp);

      const strength = Math.min((relVel - IMPACT_MIN_VELOCITY) / (IMPACT_MAX_VELOCITY - IMPACT_MIN_VELOCITY), 1);

      this.pendingImpacts.push({
        position: { x: cp.x, y: cp.y, z: cp.z },
        strength,
        isWall,
      });
    });

    this.world.addBody(body);
    const diceBody: DiceBody = { body, mesh, settled: false, settleFrames: 0, frozen: false, dieType, d4Vertices: d4VertexDirs };
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

      // Cannon-es sleep
      if (db.body.sleepState === CANNON.Body.SLEEPING) {
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
      }

      db.settled = false;
      allSettled = false;
    }

    return allSettled;
  }

  /** Extract unique vertices from a BufferGeometry (used for D4 compound shape). */
  private extractUniqueVertices(geometry: THREE.BufferGeometry): { x: number; y: number; z: number }[] {
    const posAttr = geometry.getAttribute('position');
    const tolerance = 0.001;
    const verts: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const isDupe = verts.some(v =>
        Math.abs(v.x - x) < tolerance &&
        Math.abs(v.y - y) < tolerance &&
        Math.abs(v.z - z) < tolerance
      );
      if (!isDupe) verts.push({ x, y, z });
    }
    return verts;
  }

  private freezeBody(db: DiceBody): void {
    // D4 post-settle validation: if the die isn't clearly on a face
    // (e.g. balanced on a point or edge), nudge it so it topples.
    if (db.dieType === 'd4' && db.d4Vertices) {
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion(
        db.body.quaternion.x, db.body.quaternion.y,
        db.body.quaternion.z, db.body.quaternion.w,
      );
      let bestDot = -Infinity;
      for (const vdir of db.d4Vertices) {
        const worldDir = vdir.clone().applyQuaternion(q);
        bestDot = Math.max(bestDot, worldDir.dot(up));
      }
      if (bestDot < D4_MIN_UP_DOT) {
        // Not on a face — nudge it off the point/edge
        db.body.wakeUp();
        db.body.angularVelocity.set(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 3,
        );
        db.body.velocity.set(
          (Math.random() - 0.5) * 0.5,
          0.5,
          (Math.random() - 0.5) * 0.5,
        );
        db.settleFrames = 0;
        return; // Don't freeze — let it settle naturally
      }
    }

    db.body.velocity.setZero();
    db.body.angularVelocity.setZero();
    // Tell cannon-es to stop simulating this body entirely.
    // Without this, world.step() keeps running contact resolution on the body
    // which re-injects micro-velocity (the ConvexPolyhedron jitter bug).
    db.body.sleep();
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
