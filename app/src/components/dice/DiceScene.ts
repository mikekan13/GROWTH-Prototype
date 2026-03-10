/**
 * Dice Scene — Three.js scene setup for dice rolling visualization.
 *
 * Creates camera, lights, floor plane, and manages the render loop.
 * Designed to be mounted into a canvas element and reused across rolls.
 */

import * as THREE from 'three';

export interface DiceSceneConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export class DiceScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  private floorMesh: THREE.Mesh;
  private animationId: number | null = null;

  constructor(config: DiceSceneConfig) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent — overlay handles background

    // Camera — looking down at the table at an angle
    this.camera = new THREE.PerspectiveCamera(45, config.width / config.height, 0.1, 100);
    this.camera.position.set(0, 8, 6);
    this.camera.lookAt(0, 0, 1);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: config.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(config.width, config.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    directionalLight.position.set(4, 10, 4);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -8;
    directionalLight.shadow.camera.right = 8;
    directionalLight.shadow.camera.top = 8;
    directionalLight.shadow.camera.bottom = -8;
    this.scene.add(directionalLight);

    // Subtle fill light from below
    const fillLight = new THREE.PointLight(0x2DB8A0, 0.15, 20);
    fillLight.position.set(0, -1, 0);
    this.scene.add(fillLight);

    // Invisible floor — receives shadows but not visible itself
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.25 });
    this.floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = 0;
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);
  }

  /** Add an object to the scene. */
  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  /** Remove an object from the scene. */
  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  /** Render a single frame. */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Start the render loop with a callback per frame. */
  startLoop(onFrame: (dt: number) => void): void {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      onFrame(Math.min(dt, 0.05)); // Clamp to prevent spiral of death
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  /** Stop the render loop. */
  stopLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Handle resize. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Clean up all resources. */
  dispose(): void {
    this.stopLoop();
    this.renderer.dispose();
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
