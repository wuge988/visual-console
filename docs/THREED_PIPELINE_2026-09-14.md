# Visual Console — 3D Model Pipeline

Date: 2026-09-14  
Status: `PLANNED_MVP / NON_BLOCKING_ENHANCEMENT`

## Purpose

Produce a web-ready 3D representation of one Exact Piece for spatial understanding and PDP enhancement without changing the underlying commerce truth.

The 3D Pipeline belongs inside the single Visual Console Control Plane. It is not a standalone PDP application or a separate visual workflow system.

## Product boundary

3D is a **NON_BLOCKING_ENHANCEMENT**.

The mature 2D Exact Piece PDP remains the release baseline. The PDP must stay complete and customer-usable without a 3D asset.

3D does not own:

- SKU identity;
- lifecycle/availability;
- inventory;
- price;
- measurements;
- shipping quote;
- reservation;
- checkout/payment.

## Canonical Pipeline

```text
Capture Session
→ Frame QC
→ Wood-only Mask
→ Reconstruction
→ Mesh Cleanup
→ Texture Cleanup
→ Scale Calibration
→ GLB/Web Asset Export
→ 3D QA
→ Asset Registry
→ Archive
→ feature-gated PDP publish
```

## Shared Capture Session

The 3D Pipeline should reuse the same Exact Piece Capture Session used by product/scene work where possible.

Recommended source set:

- front / left / right / back;
- top and useful oblique angles;
- continuous turntable/video sequence when used by the selected Engine;
- detail frames for texture/holes/branch transitions;
- known physical measurements for scale calibration;
- capture metadata and frame-quality decisions.

## Capture/background lesson retained

Earlier experiments showed that transparent or reflective support/background materials can enter reconstruction and create phantom geometry or contaminated meshes.

The active direction is:

- controlled, non-transparent, low-reflection/matte background;
- clear foreground/background separation;
- wood-only masks before reconstruction where the Engine benefits from them;
- reject unreliable frames rather than silently including them.

The previously selected blue matte/opaque capture background may be used as an implementation choice, but the Pipeline contract is **background separability**, not a hard-coded color dependency.

## Frame QC

Before reconstruction, each candidate frame should be classifiable as:

- `ACCEPT`;
- `REJECT_BLUR`;
- `REJECT_OCCLUSION`;
- `REJECT_MASK`;
- `REJECT_REFLECTION`;
- `REJECT_BACKGROUND_CONTAMINATION`;
- `REJECT_DUPLICATE/LOW_INFORMATION`.

The Pipeline should prefer fewer reliable frames over a larger contaminated set.

## Wood-only Mask

The mask stage exists to prevent background/support geometry from becoming part of the reconstruction.

Requirements:

- preserve thin branches and major holes;
- avoid filling natural voids;
- avoid clipping extremities;
- reject a frame if the mask cannot be trusted;
- keep the original RAW frame immutable.

## Reconstruction Engine

The 3D Engine is replaceable.

Possible future Engine Adapters may include photogrammetry, Gaussian/point-based reconstruction, neural reconstruction or commercial/local tools.

Visual Console owns:

- source package;
- Job lifecycle;
- engine/version metadata;
- output registration;
- QA;
- archive/publish status.

The reconstruction library/tool does not own those truths.

## Scale calibration

A visually plausible 3D model is not enough for Exact Piece commerce.

The web asset should record whether scale is:

- `UNCALIBRATED`;
- `CALIBRATED_FROM_KNOWN_DIMENSION`;
- `CALIBRATED_AND_QA_PASS`.

3D display must never override the authoritative measured dimensions already stored for the SKU.

## Web asset contract

Initial target deliverables:

```text
<SKU>.glb
poster.webp
3d-qa.json
provenance.json
```

Optional later outputs may include optimized LOD variants or compressed textures.

## 3D QA

At minimum review:

1. overall silhouette;
2. branch topology;
3. holes/voids;
4. missing/extra geometry;
5. phantom background geometry;
6. texture alignment;
7. excessive smoothing;
8. scale calibration;
9. model origin/orientation;
10. web performance/size;
11. desktop/mobile/WebGL fallback behavior before PDP release.

## PDP integration contract

When a 3D asset is production-ready:

- activate only when the exact SKU has an approved 3D asset;
- feature-gate the viewer;
- lazy-load it;
- do not block LCP/initial purchase information;
- automatically fall back to the approved 2D experience;
- preserve fallback on mobile/low-performance/WebGL-unavailable environments;
- respect `prefers-reduced-motion` where animation is involved;
- rerun PDP visual/performance/fallback QA before release.

## MVP gate

Start with one pilot SKU.

The MVP is complete only after:

- controlled Capture Session exists;
- accepted-frame policy works;
- masks exclude background/support contamination;
- a web-ready model is exported;
- Human 3D QA passes;
- provenance and Asset Registry entries exist;
- PDP integration remains reversible and non-blocking.

## Relationship to Scene Pipeline

Scene and 3D may proceed in parallel.

They share:

- Exact Piece;
- Capture Session;
- source assets;
- orientation/measurement metadata;
- masks where useful;
- Jobs;
- QA;
- Asset Registry;
- Archive.

They remain separate execution Pipelines with separate Engine Adapters.