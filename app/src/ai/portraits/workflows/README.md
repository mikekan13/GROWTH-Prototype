# ComfyUI Workflow Templates (FLUX.2)

This directory contains ComfyUI workflow JSON files exported in **API format**.
The pipeline is **FLUX.2 only** — FLUX.1 + PuLID workflows were dropped Apr 2026
when the project moved to FLUX.2 Dev FP16 on H100 cloud pods.

## How to create workflow files

1. Open ComfyUI (cloud pod proxy URL or `http://127.0.0.1:8188` local)
2. Design your workflow using the node editor
3. Click the gear icon → "Save (API Format)"
4. Save the exported JSON here with the matching filename

## Active FLUX.2 workflows

| File | Purpose |
|------|---------|
| `flux2-t2i.json` | Plain text-to-image FLUX.2 generation (no refs) |
| `flux2-face-cloud.json` | Face-lock generation, cloud H100 path |
| `flux2-face-klein.json` | Face-lock generation, Klein-style variant |
| `flux2-face-multiref.json` | Face-lock with multiple identity reference images |
| `flux2-face-posed-multiref.json` | Face-lock + pose template + multi-ref |
| `flux2-body-posed-multiref.json` | Full-body posed generation with multi-ref |
| `flux2-edit-reference.json` | Reference-driven edit/regeneration |
| `flux2-edit-with-refpull.json` | Edit while pulling identity from refs |
| `flux2-edit-masked.json` | Masked region edit (inpaint-style) |

## Node naming convention

The prompt injection system (`providers/local.ts`) finds nodes by `class_type`
and `_meta.title`. Workflows must use these conventions so prompts and refs land
in the right slots. See `local.ts` for the active key list.
