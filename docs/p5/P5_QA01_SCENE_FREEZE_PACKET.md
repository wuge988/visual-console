# Visual Console P5 — QA01 Aquarium Scene Freeze Packet

Date: 2026-08-27
Packet: `VC-P5-QA01-AQUARIUM-001`
Base: `main @ 598bb5362eeff719d4bd882412de346f12cda330`
Branch: `feat/p5-qa01-scene-freeze`
Mode: `MODE_B_AI_INNOVATION`
Status: `DISCOVERY_COMPLETE / LOCAL_CAPABILITY_PROBE_REQUIRED / QA01_DISABLED`

## 1. Purpose

P5 starts the first generative Four Realms scene workflow:

1. `QA01` — Scene Aquarium;
2. `QR01` — Scene Rainforest / Paludarium;
3. `QP01` — Scene Reptile;
4. `QC01` — Scene Collectible;
5. video remains later.

This Packet authorizes **discovery, capability validation, and read-only scene-style prototyping only**. It does not yet authorize production scene generation, QA mutation, Manifest mutation, or F archive.

## 2. Existing authoritative semantics

The existing DRIFT CURIO workflow registry defines:

- workflow code: `QA01`;
- English: `Scene Aquarium`;
- asset key: `scene_aquarium`;
- output type: image;
- destination key: `aquarium`;
- filename prefix: `{SKU}__scene__aquarium__wf-QA01`;
- formal example: `{SKU}__scene__aquarium__wf-QA01__vNNN.png`.

The current Visual Console registry remains `NOT_REGISTERED / executable=false` for QA01.

## 3. Design truth inherited from Four Realms

Authoritative design material freezes the following identity contract:

- the same driftwood piece must appear across Aquatic / Rainforest / Reptile / Object;
- angle, position, and size should remain fixed or near-fixed across the four states;
- environment and lighting may vary;
- the wood must remain immediately recognizable as the exact piece;
- geometry facts, Archive/SKU identity, measurements, condition, availability, media provenance, price, package/shipping facts do not change between Realms;
- scene output is a possible-context visualization, not evidence that the piece was physically tested in that habitat.

## 4. QA01 v1 identity architecture — frozen before model selection

QA01 v1 will use an **identity-first layered scene architecture**:

1. formal subject truth = verified P3 SC01 Cutout on F;
2. current F bytes must match archive snapshot + Manifest Gate15 history SHA256/size;
3. a generative model may create the aquarium **environment/background layer**;
4. the model is not allowed to regenerate, repaint, deform, or hallucinate the product body in the final asset;
5. the final product layer is deterministically composited from the verified SC01 alpha subject;
6. no generated foreground object may obscure the product in QA01 v1;
7. no rotation, non-uniform warp, perspective warp, or geometry-changing subject transform is allowed;
8. any uniform scale/translation needed for the shared Four Realms canvas must be frozen once and reused by QA01/QR01/QP01/QC01;
9. the exact canvas size and placement transform remain **PENDING_STYLE_GATE** and will not be guessed before local sample review.

This design deliberately chooses exact-piece fidelity over maximum photographic integration for QA01 v1. If a later workflow needs controlled subject relighting or foreground occlusion, it must receive a new workflow version/code and a separate evidence Gate.

## 5. Generative model/runtime — not yet frozen

No local image-generation model or scene workflow is currently proven in the Visual Console evidence set. Therefore this Packet does not invent a checkpoint or claim that the target 8 GB GPU can run a specific stack.

Candidate family for capability evaluation:

- SDXL-class background generation / inpainting;
- optional IP-Adapter / ControlNet conditioning if already available and stable;
- low-VRAM execution required on the target RTX 3060 Ti 8 GB;
- GPU execution must remain serial.

Model/checkpoint, node pack, sampler, steps, CFG, seed policy, resolution, prompt template and negative prompt remain `PENDING_LOCAL_CAPABILITY_PROBE`.

## 6. Why full-image img2img is not the default

A workflow that sends the complete driftwood image through generative img2img can improve environmental coherence but creates an unacceptable default risk of changing fine branches, holes, external contours, wood texture, or proportions. That conflicts with the Exact Piece requirement.

QA01 v1 therefore requires generated environment + deterministic verified-product composite. Full-image generative editing remains out of scope unless a later controlled experiment proves exact geometry at a stricter visual Gate.

## 7. Capability probe contract

`tools/P5_QA01_CAPABILITY_PROBE.ps1` is read-only. It may inspect:

- GPU name / VRAM;
- D drive free space;
- ComfyUI install presence;
- ComfyUI `/object_info` when the service is already online;
- installed checkpoint/model filenames;
- ControlNet/IP-Adapter/CLIP-Vision model folders;
- relevant custom-node directories.

It must not:

- install packages;
- download models;
- edit ComfyUI config;
- start an inference;
- mutate D staging, E Manifest/control journals, or F assets;
- enable QA01 in Site Profile or Registry.

The probe writes evidence only under the existing Visual Console `control_root/evidence` directory and copies a compact summary to the clipboard.

## 8. Decision after probe

The capability report will select the lowest-complexity viable path:

### Path A — existing SDXL + required nodes/models are already available
Create a minimal isolated QA01 background workflow and run one low-cost local sample Gate.

### Path B — base checkpoint exists but conditioning components are missing
First test text/inpaint background generation with exact subject composite. Add IP-Adapter/ControlNet only if visual composition cannot be controlled adequately.

### Path C — no viable static image checkpoint is installed
Freeze a minimal download list only after the report confirms what is missing. No blind multi-model download.

## 9. Future production safety requirements

Before QA01 can become executable:

- source identity must be server-side from VERIFIED SC01 archive + matching Manifest history;
- prompt/model/workflow hash and seed must be persisted;
- output background and final composite identities must be journaled separately;
- standardized versioned staging filename, no overwrite;
- human QA must compare scene against SC01 truth;
- QA must explicitly reject changed geometry, missing/added branches/holes, severe texture/color drift, implausible scale/contact, or scene artifacts;
- formal archive only after QA_PASS to `Manifest.destinations.aquarium`;
- F no-overwrite + SHA256/size + exactly-one history + D delete-last + retry/restart evidence;
- generated background is never product evidence and must not alter factual product fields.

## 10. Current hard stop

The next truthful Gate is local capability inventory. Repository work may proceed through CI around this read-only probe, then stop for one target-Windows run. No visual sample or model installation is requested until that report is reviewed.
