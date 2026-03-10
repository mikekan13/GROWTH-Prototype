/**
 * Dice Scene — Three.js scene setup for dice rolling visualization.
 *
 * Creates camera, lights, floor plane, and manages the render loop.
 * Camera is nearly top-down so die faces read clearly.
 *
 * The camera syncs with the Relations Canvas SVG viewBox so dice
 * move with panning/zooming — they live ON the canvas, not over it.
 */

import * as THREE from 'three';

export interface DiceSceneConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

// Default SVG viewBox from RelationsCanvas (zoom=1, centered at origin)
const DEFAULT_VIEWBOX = { x: -693, y: -462, width: 1386, height: 924 };
const DEFAULT_CAMERA_HEIGHT = 14;

export class DiceScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  private directionalLight: THREE.DirectionalLight;
  private floorMesh: THREE.Mesh;
  private animationId: number | null = null;

  constructor(config: DiceSceneConfig) {
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent

    // Camera — nearly top-down (slight Z offset avoids degenerate up-vector)
    this.camera = new THREE.PerspectiveCamera(40, config.width / config.height, 0.1, 200);
    this.camera.up.set(0, 0, -1); // Redefine "up" for top-down view
    this.camera.position.set(0, DEFAULT_CAMERA_HEIGHT, 0.01); // Tiny Z offset avoids gimbal lock
    this.camera.lookAt(0, 0, 0);

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Shadow-casting light — slight offset from vertical so shadows are visible
    this.directionalLight = new THREE.DirectionalLight(0xfff5e6, 1.0);
    this.directionalLight.position.set(1, 15, 1);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 1024;
    this.directionalLight.shadow.mapSize.height = 1024;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.camera.left = -20;
    this.directionalLight.shadow.camera.right = 20;
    this.directionalLight.shadow.camera.top = 20;
    this.directionalLight.shadow.camera.bottom = -20;
    this.directionalLight.shadow.bias = -0.002;
    this.scene.add(this.directionalLight);

    // Fill light for edge definition
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-2, 10, -2);
    this.scene.add(fillLight);

    // Invisible floor — receives shadows (large enough for panning)
    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.35 });
    this.floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = 0;
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);
  }

  add(object: THREE.Object3D): void { this.scene.add(object); }
  remove(object: THREE.Object3D): void { this.scene.remove(object); }

  /**
   * Sync the Three.js camera with the SVG viewBox so dice track
   * canvas panning and zooming.
   *
   * SVG viewBox maps SVG coordinates to screen space.
   * We compute what SVG center/zoom changed and apply the same
   * offset/scale to the Three.js camera.
   */
  syncWithViewBox(vbX: number, vbY: number, vbWidth: number, vbHeight: number): void {
    // SVG center in SVG coords
    const svgCenterX = vbX + vbWidth / 2;
    const svgCenterY = vbY + vbHeight / 2;

    // Default SVG center (0, 0)
    const defCenterX = DEFAULT_VIEWBOX.x + DEFAULT_VIEWBOX.width / 2;
    const defCenterY = DEFAULT_VIEWBOX.y + DEFAULT_VIEWBOX.height / 2;

    // Pan offset in SVG units
    const panSvgX = svgCenterX - defCenterX;
    const panSvgY = svgCenterY - defCenterY;

    // Zoom ratio: how much wider/taller the viewBox is vs default
    // Larger viewBox = zoomed out = camera higher
    const zoomRatio = vbWidth / DEFAULT_VIEWBOX.width;

    // Compute scale: how many Three.js world units per SVG unit
    // At default camera height, the visible width at Y=0 is:
    //   2 * height * tan(fov/2) * aspect
    // We want SVG's default width to map to that visible width.
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const visibleHeight = 2 * DEFAULT_CAMERA_HEIGHT * Math.tan(fovRad);
    const svgToWorld = visibleHeight / DEFAULT_VIEWBOX.height;

    // Apply pan: SVG +X = Three.js +X, SVG +Y = Three.js +Z (top-down)
    const camX = panSvgX * svgToWorld;
    const camZ = panSvgY * svgToWorld;

    // Apply zoom: move camera up/down proportionally
    const camY = DEFAULT_CAMERA_HEIGHT * zoomRatio;

    this.camera.position.set(camX, camY, camZ + 0.01);
    this.camera.lookAt(camX, 0, camZ);

    // Move shadow light to follow camera
    this.directionalLight.position.set(camX + 1, camY + 1, camZ + 1);
    this.directionalLight.target.position.set(camX, 0, camZ);
    this.directionalLight.target.updateMatrixWorld();

    // Expand shadow camera to cover zoomed-out area
    const shadowSize = Math.max(20, 10 * zoomRatio);
    this.directionalLight.shadow.camera.left = -shadowSize;
    this.directionalLight.shadow.camera.right = shadowSize;
    this.directionalLight.shadow.camera.top = shadowSize;
    this.directionalLight.shadow.camera.bottom = -shadowSize;
    this.directionalLight.shadow.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  startLoop(onFrame: (dt: number) => void): void {
    let lastTime = performance.now();
    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      onFrame(Math.min(dt, 0.05));
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stopLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

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
