# P5 Four Realms Adaptive Scene v2

Status: `V1_BACKGROUND_PASTE_REJECTED / V2_ADAPTIVE_SCENE_ARCHITECTURE_FROZEN / QA01_DISABLED`

## Human visual decision

The first QA01 Aquarium style-only experiment is rejected as a production direction. All A1/A2/B1/B2/C1/C2 candidates are rejected.

Reason: the experiment generated an independent empty environment and then deterministically pasted the verified SC01 cutout on top. It protected Exact Piece geometry, but it could not create believable scene interaction. The result reads as a cutout placed over a generic aquarium/room rather than one physical piece photographed inside a designed scene.

The uploaded reference set establishes the new quality bar: highly photographic scene integration, believable scale and contact, environment-specific lighting, natural partial occlusion, and a composition designed around the individual driftwood shape.

## Four Realms remain four separate production workflows

- `QA01` — Aquarium / planted aquascape.
- `QR01` — Rainforest / paludarium.
- `QP01` — Reptile / terrarium; may be arid, semi-arid, or tropical when appropriate.
- `QC01` — Collectible / interior display.

The current P5 work is only the first implementation path for `QA01`. It is not authorization to stamp one aquarium layout across all SKUs or reuse one scene across the other Realms.

## Core change: per-SKU scene recipe, not a fixed template

Every SKU receives a `SceneRecipe` before image generation. The recipe is derived from that exact piece and is specific to both SKU and Realm.

Minimum inputs:

- verified SC01 source identity and alpha silhouette;
- SKU and FORM code;
- visible aspect ratio and occupied-area ratio;
- dominant mass position;
- branch direction / spread;
- arch / hole / negative-space opportunities;
- likely support/contact zones;
- product dimensions when present in Manifest/SKU data.

The planner chooses composition from a grammar, not from a single shared background.

Example QA01 grammars include: open negative-space riverbank, branch-led Nature Aquarium, island composition, epiphyte-focused woodscape, cave/arch composition, asymmetric bank, and low-profile foreground composition. The planner may reject a grammar when it conflicts with the piece shape.

The same principle applies independently to QR01/QP01/QC01. A stump, long arch, dense multi-branch piece, and cavity-led piece should not receive the same camera, support, planting pattern, or set dressing.

## Realism contract

A production candidate must satisfy all of the following:

1. **One physical scene** — the piece, substrate, rocks, water/glass, plants and light must read as one photograph, not layers pasted together.
2. **Shape-driven composition** — rocks, plants, substrate contour and negative space respond to the exact piece geometry.
3. **Contact physics** — support points must visibly meet substrate/rock/plinth; no floating edge unless intentionally suspended.
4. **Shared lighting** — subject and environment share direction, softness, color temperature and exposure.
5. **Environmental interaction** — Aquarium may include water attenuation/caustics/wet appearance; Rainforest may include humidity/moss; Reptile may include dust/dry rock/contact; Collectible may include controlled gallery light and believable plinth contact.
6. **Controlled occlusion** — substrate, plants, moss or set dressing may naturally cover low-salience edge zones, but cannot erase or invent major branches, holes or silhouette landmarks.
7. **No prefab repetition** — a repeated background with only subject replacement is a release blocker.
8. **Photographic restraint** — avoid fantasy CGI, over-saturated color, impossible glass, exaggerated bokeh, fake dramatic rays, or ornamental clutter that competes with the product.

## Exact Piece identity model

The v1 rule "never modify a subject pixel" is too strict for realism and is retired for scene production. The replacement is a two-zone identity contract:

### Identity Core

Major branch topology, holes, silhouette landmarks, proportions and recognizable wood texture remain protected. No generated branch, deleted branch, stretched geometry, perspective warp or non-uniform deformation is allowed.

Photometric adaptation is allowed: exposure matching, white balance, physically plausible wetness/specular response, soft caustic/light overlay and local contrast changes, provided geometry and recognizable texture remain stable.

### Integration Band

A narrow boundary/contact zone may be regenerated or blended to create physically believable contact, partial substrate occlusion, attached moss/epiphytes and edge lighting. The band must not consume major identity landmarks.

This is the minimum freedom required to reach the uploaded reference quality without turning the product into a different piece.

## Generation architecture

`VERIFIED SC01 + per-SKU SceneRecipe -> context-aware image edit/generation -> identity verification -> human visual gate -> production registration`

The production path must use an image-edit model that sees the exact source while creating the scene. Empty-background text-to-image plus hard compositing is explicitly non-production.

First local candidate runtime to probe: native ComfyUI FLUX.1 Kontext edit workflow, because it is built for reference-image editing and exposes reference-latent conditioning in current ComfyUI. No model download or ComfyUI update is authorized until the read-only v2 capability probe reports the target machine state.

Qwen-Image-Edit is not the first local candidate for the RTX 3060 Ti 8 GB target because its official native workflow is materially heavier; it remains an escalation path rather than the minimum-cost first attempt.

## Gates

- Gate V2-A — repo architecture + human rejection recorded.
- Gate V2-B — target Windows read-only ComfyUI/FLUX Kontext capability probe.
- Gate V2-C — bounded model/runtime install only if V2-B requires it.
- Gate V2-D — one SKU, one QA01 adaptive scene recipe, three context-aware candidates.
- Gate V2-E — human visual gate against uploaded reference quality.
- Gate V2-F — only after visual PASS: production API/journal/Manifest/F integration and Registry promotion.

Until V2-E passes, `QA01` remains `NOT_REGISTERED / executable=false` and no Aquarium production asset may be archived to F.