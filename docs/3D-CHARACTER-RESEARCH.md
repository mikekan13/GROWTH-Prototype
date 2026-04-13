# 3D Character Model Research for GRO.WTH

> Deep research conducted 2026-04-12. Target hardware: RTX 4060 8GB VRAM, 32GB RAM.

---

## Table of Contents
1. [AI 3D Model Generation from Reference Images](#1-ai-3d-model-generation)
2. [3D Model to 2D Portrait Rendering Pipeline](#2-3d-to-2d-rendering)
3. [Sprite Sheet Generation from 3D Models](#3-sprite-sheets)
4. [Token Generation for VTT](#4-vtt-tokens)
5. [Hybrid Approach: 3D Mesh + 2D Texture Painting](#5-hybrid-approach)
6. [Multi-View Generation from Single Image](#6-multi-view-generation)
7. [Real-Time Character Rendering in Browser](#7-browser-3d-rendering)
8. [Identity-Preserving Portrait Updates WITHOUT 3D](#8-2d-identity-preservation)
9. [Recommended Path for GRO.WTH](#9-recommended-path)

---

## 1. AI 3D Model Generation from Reference Images {#1-ai-3d-model-generation}

### Current Landscape (2025-2026)

The field has exploded since late 2023. Here is every major open-source option evaluated against the RTX 4060 8GB constraint:

| Model | Stars | VRAM | Speed | Output Quality | Rigged? | Open Source | RTX 4060 Viable? |
|-------|-------|------|-------|---------------|---------|-------------|-------------------|
| **TripoSR** | 6.4k | ~6GB | ~5s | Medium mesh + vertex colors, optional baked texture | No | MIT | YES |
| **InstantMesh** | 4.3k | ~10GB (2 GPUs recommended) | ~30s | Good mesh, multi-view intermediate | No | Apache 2.0 | TIGHT (single GPU may OOM) |
| **Wonder3D** | 5.4k | ~8-12GB | ~3min (NeuS reconstruction) | Good geometry + texture, NeuS smoothing | No | Custom | BORDERLINE |
| **LGM** | 2.1k | ~10GB | ~5s | Gaussian splats, needs conversion to mesh | No | MIT | NO (10GB needed) |
| **Unique3D** | 3.6k | ~10-12GB estimated | ~30s | High-quality textured mesh | No | Custom | BORDERLINE (Windows support via community) |
| **CharacterGen** | 787 | ~8-10GB estimated | ~1min | Character-specific, A-pose output, VRM-compatible | Partial (A-pose) | Apache 2.0 | TIGHT |
| **Hunyuan3D-2** | 13.5k | 6GB shape / 16GB shape+texture | ~30s shape | Excellent mesh quality, PBR texture | No | Tencent license | SHAPE ONLY (6GB), texture needs 16GB |
| **Hunyuan3D-2mini** | (included above) | ~4-6GB shape | ~10-15s | Good mesh, 0.6B params | No | Tencent license | YES (shape), NO (texture) |
| **TRELLIS (Microsoft)** | 12.2k | ~8-12GB estimated | ~30s | High quality, structured latents, CVPR'25 Spotlight | No | MIT | BORDERLINE |
| **Rodin Gen-1** | N/A | Cloud API only | ~30s | High quality, game-ready | Optional rigging | CLOSED SOURCE | N/A (API only) |

### Key Findings

**Best fit for RTX 4060 8GB:**
- **Hunyuan3D-2mini (Turbo)** is the strongest option. The 0.6B parameter mini model with `--low_vram_mode` fits in 6GB for shape generation. Texture synthesis requires 16GB, so you would need to generate textures on CPU offload (slow) or use a separate texture approach.
- **TripoSR** is the simplest/fastest option at ~6GB, but output quality is noticeably lower (good for prototyping, not production).

**None produce game-ready rigged models.** Every single tool outputs an unrigged mesh (OBJ, GLB, PLY). Rigging is a separate step.

**CharacterGen** is the only character-specific model but is anime-focused (VRM dataset). Not ideal for GRO.WTH's diverse seed system.

**Rodin Gen-1** (by Tripo/HyperHuman) is the only production-quality option with optional rigging, but it is a closed API service, not local-first.

### Auto-Rigging: UniRig

**UniRig** (SIGGRAPH 2025, by VAST-AI/Tripo) is a breakthrough:
- Automatic skeleton prediction + skinning weights from ANY mesh
- GPT-like transformer predicts topologically valid skeleton hierarchy
- **Only 8GB VRAM required** -- fits RTX 4060
- Open source (Apache 2.0 equivalent)
- Outputs FBX with skeleton + skin weights, can merge into GLB
- Works on humanoids, animals, fantasy creatures -- "One Model to Rig Them All"

**This is the missing piece.** Hunyuan3D-2mini (mesh) + UniRig (auto-rig) = rigged character from a single image, all on 8GB VRAM.

---

## 2. 3D Model to 2D Portrait Rendering Pipeline {#2-3d-to-2d-rendering}

### The Core Idea
Generate a 3D model once at character creation. Then render all portraits, tokens, sprites, and scene illustrations FROM that model. Same mesh = same face = permanent identity consistency.

### Rendering Options

| Engine | Type | Speed | Quality | Equipment Swap | Expressions |
|--------|------|-------|---------|---------------|-------------|
| **Blender Python (bpy)** | Offline/headless | 2-10s per frame (Cycles), <1s (Eevee) | Excellent | Easy (scene composition) | Via blend shapes or armature |
| **Three.js** | Browser real-time | 60fps | Good-excellent | Easy (swap mesh parts) | Via morph targets |
| **Babylon.js** | Browser real-time | 60fps | Excellent | Easy | Via morph targets |
| **Unity Headless** | Server-side | <1s (URP) | Excellent | Native (equipment system) | Full support |
| **Blender + Python** | CLI batch render | Scriptable | Best | Full scene control | Full control |

### Recommended: Blender Headless for Server-Side Rendering

**Why Blender:**
- Free, open source, scriptable via Python (`bpy` module)
- Can run headless on the server (no GUI needed)
- Eevee renderer: real-time quality, <1s per portrait render
- Cycles renderer: ray-traced quality for high-res portraits (2-10s)
- Full support for:
  - Camera angles (front, 3/4, profile, looking up)
  - Lighting changes (campfire, dungeon, daylight)
  - Equipment overlays (import armor/weapon meshes into scene)
  - Wound/scar texture overlays
  - Expression via blend shapes / shape keys
  - Post-processing (GROWTH visual glitch effects)

**Pipeline:**
```
Character creation
  -> Generate 2D portrait (FLUX + PuLID, existing pipeline)
  -> Generate 3D mesh (Hunyuan3D-2mini)
  -> Auto-rig (UniRig)
  -> Store as GLB with skeleton
  
Portrait request (different angle, equipment, wound)
  -> Load GLB into Blender scene
  -> Attach equipment meshes
  -> Apply wound/scar texture overlays
  -> Set camera angle + lighting
  -> Render with Eevee (<1s)
  -> Return PNG
```

### Why NOT Unity Headless
- Proprietary license (even free tier has revenue caps)
- Heavy install (~5GB)
- Overkill for static portrait rendering
- Would make sense IF we needed real-time multiplayer 3D (we don't)

---

## 3. Sprite Sheet Generation from 3D Models {#3-sprite-sheets}

### The Problem
Battle maps need top-down or isometric character sprites with multiple poses and equipment variants.

### Approach: Blender Batch Render to Sprite Sheet

**Workflow:**
1. Load rigged GLB character model in Blender
2. Apply Mixamo animations (idle, walk, attack, dead, cast) -- Mixamo provides free animation FBX files
3. Set camera to top-down (orthographic, 45 or 90 degree)
4. Render each animation frame
5. Pack frames into sprite sheet (PIL/Pillow grid)
6. Export with transparency (PNG)

**Equipment overlay:**
- Each equipment piece is a separate mesh/GLB
- Attach to character skeleton bones (helm to head, sword to hand)
- Blender Python handles attachment automatically via armature constraints
- Re-render sprite sheet with new equipment = updated sprites

**Existing Tools:**
- **SpriteForge** (GitHub): Blender addon for automated sprite sheet generation from 3D models. Supports batch rendering, multiple animations, transparency.
- **Mixamo** (Adobe): Free animation library, 2000+ animations, auto-retargets to humanoid skeletons. UniRig output is Mixamo-compatible.
- **TexturePacker**: Industry-standard sprite sheet packing tool, CLI available.
- **Aseprite**: Pixel art tool with sprite sheet import/export (if stylized look needed).

**Performance:** Rendering a 16-frame walk cycle at 64x64 top-down takes ~5-10 seconds in Blender Eevee. A full character sprite sheet (5 animations x 8 directions x 8 frames) = 320 frames, ~2-3 minutes.

### Alternative: Pre-Made Sprite Templates
For the MVP, consider using standardized sprite silhouettes (like RPG Maker) with color/equipment overlays applied via canvas compositing in the browser. This avoids 3D entirely for battle map sprites and is how most VTTs work today.

---

## 4. Token Generation for VTT {#4-vtt-tokens}

### What VTTs Use Today
- **Roll20**: Circular PNG tokens, typically 280x280px. Uploaded as images. No dynamic updating.
- **Foundry VTT**: Circular or hex tokens, supports animated (WebM/GIF). Token Attacher module allows equipment overlays. Tokens are static images but modules can swap them.
- **Owlbear Rodeo**: Circular PNG tokens. Simple drag-and-drop. No dynamic system.
- **All major VTTs**: Static image tokens. "Dynamic tokens" is an unsolved problem across the industry.

### Dynamic Token Strategy for GRO.WTH

**From 3D Model:**
```
Rigged GLB character
  -> Blender: top-down camera, portrait lighting
  -> Render circular crop at 280x280
  -> Apply token ring/border (pillar color: Body=red, Spirit=purple, etc.)
  -> Apply status overlays (wounded glow, poisoned tint, dead X)
  -> Export PNG
```

**From 2D Portrait (simpler, works today):**
```
Existing PuLID portrait
  -> Circular crop (face center detection via face_recognition lib)
  -> Apply token ring matching pillar color
  -> Status overlays as semi-transparent layers
  -> Export PNG
```

**Equipment/Wound Updates:**
- 3D approach: re-render token from updated model (best quality, ~2s)
- 2D approach: inpaint equipment onto existing portrait (faster iteration, ~10s with FLUX)

**Token Border Standard:**
- 4px ring in pillar color (Body=#E8585A, Spirit=#7050A8, Soul=Blue)
- Health bar arc around bottom
- Status icons in corners (poisoned, blessed, concentrating)
- Name plate below
- All compositable in canvas/SVG without 3D

### Recommendation for GRO.WTH
Start with 2D circular tokens from PuLID portraits (you already generate these). Add token borders and status overlays as pure frontend compositing. Upgrade to 3D-rendered tokens later when the pipeline is proven.

---

## 5. Hybrid Approach: 3D Mesh + 2D Texture Painting {#5-hybrid-approach}

### The Concept
Use a standardized humanoid mesh (one per seed body type) and AI-paint the face/body texture onto it. Equipment as swappable 3D accessories.

### Assessment

**Advantages:**
- Consistent topology across all characters of same seed -> animations are reusable
- Face texture from AI (PuLID portrait) mapped via UV projection
- Equipment meshes created once, attach to any character
- Blend shapes for expressions defined once per seed
- Much lighter than generating unique meshes per character

**Challenges:**
- UV mapping a 2D face onto a 3D mesh requires multi-view consistency (the generated face must wrap around the head correctly)
- Standardized meshes look... standardized. Every human looks like the same body type.
- Seed variation (different body builds per HUMANOID_BODY) requires mesh variants

**Practical Implementation:**
1. **Base meshes per seed body type** (e.g., HUMANOID standard, HUMANOID muscular, HUMANOID lean, etc.)
   - Source: ReadyPlayerMe base meshes, MakeHuman exports, or custom Blender models
   - These are static assets, not AI-generated
2. **AI face texture**: Generate front + side face views (see Section 6), project onto head UV
3. **Equipment library**: Modular armor/weapon GLB files that attach to skeleton bones
4. **Blend shapes**: Standard expression set (neutral, angry, scared, dead, smiling) per base mesh
5. **Skin/hair color**: Tint the base texture via shader parameters, not regeneration

**Hunyuan3D-Paint as Alternative:**
Hunyuan3D-2 includes a texture synthesis model (Hunyuan3D-Paint) that can paint textures onto ANY mesh -- including handcrafted ones. This means you could:
1. Use a standardized body mesh
2. Generate a face portrait with PuLID
3. Use Hunyuan3D-Paint to synthesize the full body texture to match the face
4. But: requires 16GB VRAM for texture generation (not viable on RTX 4060 without aggressive offloading)

### Verdict
The hybrid approach is the most **practical production path** for a TTRPG. It trades uniqueness for consistency and performance. Recommended as the Phase 2 target after the 2D portrait pipeline is solid.

---

## 6. Multi-View Generation from Single Image {#6-multi-view-generation}

### Purpose
Generate front, side, and back views of a character from a single portrait. These views serve as texture maps for 3D models or as standalone art assets.

### Available Models

| Model | Method | VRAM | Quality | Consistency | Open Source |
|-------|--------|------|---------|-------------|-------------|
| **Zero123** (Stability AI) | Diffusion + camera conditioning | ~8GB | Medium | Medium (drift on large angles) | Repo taken down (license issues) |
| **Stable Zero123** | Improved Zero123 | ~8GB | Good | Good for small angles | Repo taken down |
| **SV3D** (Stability AI) | Video diffusion for 3D | ~12GB | Good | Good | Repo taken down |
| **MVDream** | Multi-view diffusion | ~10GB | Good | Good (trained for it) | Open |
| **Era3D** | Multi-view with focal length control | ~8-10GB | Good | Very good (reduces distortion) | Apache 2.0 |
| **Zero123++ (used by InstantMesh)** | 6-view generation | ~6GB | Good | Good | Open |
| **Wonder3D** | Multi-view normal + color maps | ~8-12GB | Very good | Very good | Open |
| **Hunyuan3D-2mv** | Multi-view variant, 1.1B params | ~6-8GB (mini) | Excellent | Excellent | Tencent license |

### Key Findings

**Stability AI repos are gone.** Zero123, Stable Zero123, and SV3D repos have been taken down or made private following Stability AI's restructuring. The weights are still on HuggingFace but official code is unavailable. Community forks exist but are unmaintained.

**Era3D** is the best standalone multi-view generator for RTX 4060:
- Specifically addresses focal length distortion (a major issue with other methods)
- Generates 6 views with consistent appearance
- ~8GB VRAM, fits RTX 4060
- Apache 2.0 license
- Includes Blender integration scripts

**Zero123++ (via InstantMesh)** generates 6 views and is used as the first stage of InstantMesh's pipeline. Can be run standalone.

**For GRO.WTH:** Multi-view generation is most useful as an intermediate step toward 3D mesh generation, not as a standalone feature. The Hunyuan3D pipeline already handles this internally.

---

## 7. Real-Time Character Rendering in Browser {#7-browser-3d-rendering}

### Three.js

**The standard.** 112k GitHub stars. Full WebGL + WebGPU support.

- **GLTFLoader**: Load GLB/GLTF models (the standard 3D format, what our pipeline outputs)
- **SkinnedMesh**: Animated character support with skeleton
- **MorphTargets**: Facial expressions via blend shapes
- **OrbitControls**: Click-and-drag rotation for character inspection
- **Performance**: A single character model at 10k-50k triangles renders at 60fps on integrated GPUs. No issues on any modern hardware.
- **WebGPU**: Three.js r160+ includes WebGPU renderer. Faster than WebGL, supported in Chrome 113+, Edge, Firefox behind flag. Not yet universal but growing.
- **File size**: Three.js core is ~150KB gzipped. GLTFLoader adds ~30KB.

### Babylon.js

Heavier (500KB+) but more batteries-included:
- Built-in character animation system
- PBR material pipeline
- Inspector/debugger
- Better documentation for game-like scenarios

### PlayCanvas

Editor-based, better for full 3D games than embedded components.

### Recommendation for GRO.WTH Character Sheet

**Three.js is the right choice.** Here's what a rotatable character model on the character sheet would look like:

```tsx
// React component sketch
import { Canvas } from '@react-three/fiber'  // React wrapper for Three.js
import { OrbitControls, useGLTF } from '@react-three/drei'  // Helper hooks

function CharacterModel({ glbUrl }) {
  const { scene } = useGLTF(glbUrl)
  return <primitive object={scene} />
}

function CharacterViewer({ characterGlbUrl }) {
  return (
    <Canvas camera={{ position: [0, 1.5, 2.5] }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} />
      <CharacterModel glbUrl={characterGlbUrl} />
      <OrbitControls 
        target={[0, 1, 0]} 
        minDistance={1} 
        maxDistance={5}
        enablePan={false}
      />
    </Canvas>
  )
}
```

**Dependencies:**
- `three` (~150KB gzip)
- `@react-three/fiber` (~40KB) - React reconciler for Three.js
- `@react-three/drei` (~100KB) - Useful helpers (OrbitControls, GLTF loader, etc.)

**Performance considerations:**
- A single character GLB at 20k triangles: negligible GPU load
- Multiple characters on a battle map: up to ~50 characters at 5k triangles each = fine
- Mobile: works on phones from 2020+
- WebGPU: use as progressive enhancement, fallback to WebGL

**File sizes for character GLBs:**
- Raw mesh from Hunyuan3D-2mini: ~2-5MB (can be optimized)
- With Draco compression: ~200KB-1MB
- With texture atlas: +500KB-2MB
- Total per character: ~1-3MB compressed (acceptable for a web app)

---

## 8. Identity-Preserving Portrait Updates WITHOUT 3D {#8-2d-identity-preservation}

### Current Best Approach (What GRO.WTH Already Has)

The existing PuLID + FLUX pipeline is the right foundation. Here's how to extend it for dynamic portraits WITHOUT 3D:

### PuLID for FLUX (Already Chosen)

- Face embedding locks identity across generations
- fp8 + aggressive_offload: ~11GB (still over 8GB, needs GGUF quantization)
- fp8 + offload: ~15GB (not viable on RTX 4060)
- **Solution already identified**: FLUX.1 Dev Q4_0 GGUF (4-bit quantized) fits in ~6GB, PuLID adds ~1-2GB overhead. Total ~7-8GB. This is the config in PORTRAIT-PIPELINE.md.

### ControlNet for FLUX (Pose/Composition Control)

**XLabs-AI x-flux** provides:
- Canny edge ControlNet for FLUX
- Depth ControlNet for FLUX
- OpenPose and more coming

**Use cases for GRO.WTH:**
- Generate a portrait with specific pose (arms raised casting spell, kneeling wounded)
- Maintain composition across updates (same camera angle)
- **VRAM**: ControlNet adds ~1-2GB on top of FLUX. Tight but possible with GGUF base model.

### IP-Adapter (Style/Identity Transfer)

- IP-Adapter works with SDXL, not yet fully ported to FLUX
- **InstantID** (11.9k stars): Zero-shot identity-preserving generation. SDXL-based, ~11GB minimum. NOT compatible with FLUX.
- **InstantStyle**: Style transfer (not identity). Works with SDXL.
- **For FLUX**: PuLID is the correct identity solution. IP-Adapter for FLUX is in development by XLabs-AI but not released.

### Inpainting for Equipment/Wounds

**Best current approach for dynamic portraits without 3D:**

1. **Base portrait**: Generate with PuLID + FLUX (identity-locked)
2. **Add equipment**: Use FLUX inpainting with mask over body area
   - Prompt: "wearing plate armor and holding a longsword" + PuLID face lock
   - Mask covers torso/arms, preserves face
3. **Add wounds**: Inpaint with mask over affected area
   - Prompt: "with a bloody gash across left cheek" + PuLID face lock
   - Small mask, high denoising
4. **Change expression**: Inpaint face region
   - Prompt: "grimacing in pain" + PuLID face lock
   - Risk: identity drift on face inpainting (PuLID helps but isn't perfect)

**ComfyUI workflow:**
```
Load checkpoint (FLUX Dev Q4 GGUF)
  -> Load PuLID model
  -> Load face embedding (from PersonaLock)
  -> Load existing portrait as init image
  -> Apply inpaint mask (body region)
  -> Set prompt (new equipment/wound description)
  -> Sample (denoise 0.7 for equipment, 0.5 for wounds)
  -> Save
```

### PhotoMaker V2

- Improved ID fidelity over V1
- Supports ControlNet, T2I-Adapter, and IP-Adapter integration
- **11GB minimum** GPU memory
- SDXL-based, not FLUX
- Not recommended given we're already committed to FLUX + PuLID

### Verdict for 2D-Only Path

**PuLID + FLUX GGUF + inpainting is the best 2D-only approach and should remain the Phase 1 pipeline.** It works on RTX 4060 8GB with quantization. The main limitation is that each inpainted portrait is a new generation -- you can't guarantee pixel-perfect consistency of non-face regions across generations. This is where 3D would help long-term.

---

## 9. Recommended Path for GRO.WTH {#9-recommended-path}

### Phase 1: 2D Portraits (CURRENT -- already designed)
**Status: Service layer complete, needs ComfyUI integration**

- PuLID + FLUX.1 Dev GGUF for identity-locked portraits
- Inpainting for equipment/wound updates
- Circular token generation from portrait crops (pure frontend)
- **No 3D involved.** Ship this first.
- **VRAM budget**: ~7-8GB (fits RTX 4060)

### Phase 2: 3D Mesh Generation (NEXT -- 3-6 months out)
**When to start: After Phase 1 is deployed and tested**

Pipeline:
```
PuLID portrait (existing)
  -> Hunyuan3D-2mini Turbo (image to mesh, 6GB VRAM, ~10-15s)
  -> UniRig (auto-rig mesh, 8GB VRAM, ~30s)
  -> Store as GLB with skeleton
```

- Sequential GPU usage (portrait gen -> mesh gen -> rigging), not parallel
- Total time: ~30-60s per character creation (acceptable, one-time cost)
- All open source, all local, all fits 8GB VRAM (one task at a time)
- Mesh quality from Hunyuan3D-2mini is good but not AAA -- fine for TTRPG

### Phase 3: 3D-Powered Portraits (6-12 months out)
**When to start: After Phase 2 meshes are reliable**

- Blender headless renders portraits from 3D model
- Equipment meshes attached to skeleton
- Wound/scar texture overlays
- Expression blend shapes
- Camera angle variations
- **This replaces inpainting** with deterministic rendering
- Identity is PERMANENTLY solved (same mesh = same face)

### Phase 4: Browser 3D Viewer (12+ months out)
**When to start: After Phase 3 is working**

- Three.js (via @react-three/fiber) character viewer on character sheet
- Rotatable 3D model
- Equipment preview (try before you equip)
- Battle map with 3D tokens (optional, sprites may be preferred)
- WebGPU for enhanced rendering on supported browsers

### Phase 5: Sprite Sheets from 3D (parallel with Phase 4)

- Blender batch renders top-down sprite sheets from rigged models
- Mixamo animations for walk/attack/idle/dead
- Equipment overlay system
- Generated on-demand when equipment changes
- Cached and served as sprite sheets

### What NOT to Build

- **Do not use Rodin Gen-1 or any cloud API** for mesh generation. Against local-first principles.
- **Do not use Unity** for rendering. Blender is superior for offline rendering and is truly free.
- **Do not build a custom auto-rigging system.** UniRig solves this completely.
- **Do not try to run full Hunyuan3D-2 (shape + texture) on 8GB.** Use mini for shape, Blender for texturing.
- **Do not invest in SDXL-based identity tools** (InstantID, PhotoMaker). FLUX + PuLID is the correct foundation.
- **Do not pursue real-time 3D on battle maps** before static sprites work. 3D battle maps are a massive scope increase.

### Critical Dependencies to Watch

1. **Hunyuan3D-2mini quality improvements** -- Tencent is actively developing (v2.1 released June 2025 with 3.0B model). The mini model will keep getting better.
2. **UniRig community adoption** -- SIGGRAPH 2025 paper, just released. Watch for stability improvements and community tooling.
3. **FLUX ControlNet maturity** -- XLabs-AI is actively developing. Depth + OpenPose ControlNets will enable better pose-controlled portraits.
4. **PuLID for FLUX improvements** -- fp8 mode works but degrades face details. Watch for better quantization support.
5. **WebGPU browser support** -- Chrome and Edge support it today. Firefox and Safari are lagging. Not a blocker (WebGL fallback works).

### Cost Summary

| Phase | Hardware Needed | Software Cost | Time Investment |
|-------|----------------|---------------|-----------------|
| Phase 1 (2D) | RTX 4060 8GB | $0 (all open source) | Already designed |
| Phase 2 (3D mesh) | Same | $0 | 2-3 sessions to integrate |
| Phase 3 (3D portraits) | Same + Blender install | $0 | 3-5 sessions |
| Phase 4 (Browser 3D) | None extra | $0 (Three.js is free) | 2-3 sessions |
| Phase 5 (Sprites) | Same + Mixamo account (free) | $0 | 2-3 sessions |

**Total additional cost: $0.** Everything is open source and runs locally on consumer hardware.

---

## Appendix: Model Repository Links

- TripoSR: https://github.com/VAST-AI-Research/TripoSR (MIT)
- InstantMesh: https://github.com/TencentARC/InstantMesh (Apache 2.0)
- Wonder3D: https://github.com/xxlong0/Wonder3D
- LGM: https://github.com/3DTopia/LGM (MIT)
- Unique3D: https://github.com/AiuniAI/Unique3D (NeurIPS 2024)
- CharacterGen: https://github.com/zjp-shadow/CharacterGen (SIGGRAPH 2024)
- Hunyuan3D-2: https://github.com/Tencent-Hunyuan/Hunyuan3D-2 (13.5k stars)
- TRELLIS: https://github.com/microsoft/TRELLIS (CVPR 2025 Spotlight, MIT)
- UniRig: https://github.com/VAST-AI-Research/UniRig (SIGGRAPH 2025)
- Era3D: https://github.com/pengHTYX/Era3D (Apache 2.0)
- PuLID for FLUX: https://github.com/ToTheBeginning/PuLID
- XLabs x-flux (ControlNet): https://github.com/XLabs-AI/x-flux
- InstantID: https://github.com/instantX-research/InstantID
- Three.js: https://github.com/mrdoob/three.js (112k stars)
- @react-three/fiber: https://github.com/pmndrs/react-three-fiber
