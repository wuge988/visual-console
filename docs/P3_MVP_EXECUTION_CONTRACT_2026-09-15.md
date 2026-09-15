# Visual Console — P3 MVP Execution Contract

Date: 2026-09-15
Status: `P3_EVALUATION_HARNESSES_READY / WINDOWS_PHYSICAL_GATES_NEXT`
Authority: `docs/CANONICAL_ARCHITECTURE_2026-09-14.md`

## Objective

Run the first bounded Aquarium Scene MVP and the first low-touch 3D MVP inside the existing Visual Console without creating a new control plane and without granting production registration before independent Gates pass.

## Shared pilot Exact Piece

- Site: `drift-curio`
- Pilot SKU: `DC-ZY-SZ-31001`
- P3-A workflow: `QA01`
- P3-B workflow: `M3D01`
- Both pilots are evaluation-only.
- Both pilots are PDP non-blocking.

The tracked pilot registry is `config/pilots/p3-registry.json` and is exposed read-only through `/api/v2/pilots`.

## P3-A — Aquarium Scene MVP

### Repository evaluation harness

The first bounded candidate route is now represented by:

- `tools/P3A_AQUARIUM_LOCAL_GATE.ps1` — fixed-source identity/hash gate;
- `tools/p3a_aquarium_identity_baseline.py` — deterministic identity-first composite baseline.

The harness requires a locally re-bound verified Exact Piece RGBA and fixed Aquarium backplate, both with explicit SHA256 values. It writes only to an empty evaluation output directory. It does not resize either source, verifies that fully opaque Exact Piece pixels remain byte-exact after compositing, re-hashes both source files after execution, and emits an evaluation manifest with `archive_eligible=false`.

This baseline is intentionally not an Aquarium-realism solution by itself. It exists to establish a hard identity-preserving lower bound before the bounded scene comparison.

### Required gates

1. fixed source identity;
2. fixed source package;
3. bounded Engine benchmark;
4. Exact Piece identity;
5. Aquarium realism;
6. Human Visual Gate;
7. cost/time budget.

### Hard stop / closed routes

Historical P5/QA01 evidence is retained as R&D guidance only. The following routes are closed and must not be restarted as incremental tuning loops:

- D0–D6 Kontext / masked-inpaint tuning;
- v3.2 foreground-materialization tuning;
- intact donor-scene composition conditioning.

The retained lesson is structural: whole-frame or masked 2D generation can trade exact identity against realism, and small authorized foreground edits cannot create whole-scene physical coherence.

### Bounded candidate routes

At most two scene routes are evaluated in the first MVP:

1. deterministic identity-first composite baseline;
2. P3-B identity-twin-assisted Aquarium scene, only after the 3D identity Gate passes.

No third route is added without an explicit architecture review.

## P3-B — 3D MVP

### Repository evaluation harness

The low-touch source/frame-QC boundary is now represented by:

- `tools/P3B_3D_WINDOWS_GATE.ps1` — target-Windows source/runtime probe and frame-QC entry;
- `tools/p3b_video_frame_qc.py` — deterministic temporal sampling + sharpest-frame selection + even cap.

The harness requires an explicit source-video SHA256, keeps the source video read-only, writes selected frames/contact sheet/evaluation manifest only to an empty evaluation directory, requires at least 16 usable selected frames, and stops fail-closed before wood-only masking or reconstruction.

The Windows gate probes existing Python/OpenCV/NumPy/Pillow and reports Torch/SAM2/gsplat presence. It deliberately does **not** install or activate dependencies and does not import historical P5 runtime state as current P3 truth.

### Low-touch capture contract

Normal operator path:

`existing/short turntable video → automated frame QC → wood-only mask → reconstruction → identity Gate → mesh/texture cleanup → scale → GLB → 3D QA`

Rules:

- no mandatory reshoot for the first pilot;
- no manual per-frame click workflow in the normal path;
- no return to manual RealityScan multi-ring still capture unless explicitly reversed;
- source video remains read-only;
- reconstruction evidence is staging/evaluation evidence until QA and Archive gates pass.

### Required gates

1. video source binding;
2. frame QC;
3. wood-only mask;
4. reconstruction;
5. Exact Piece 3D identity;
6. mesh/texture cleanup;
7. scale calibration;
8. GLB export;
9. 3D QA;
10. Archive eligibility.

The first meaningful physical stop is now the target-Windows source/runtime Gate. Repository-side contracts, validators and fail-closed harnesses are prepared; actual local source binding and runtime evidence must be produced on the target Windows machine.

## Historical R&D relationship

Branch `feat/p5-qa01-scene-freeze` remains historical evidence only. Useful retained findings include:

- v3.1 demonstrated deterministic foreground Z-order and exact backplate registration;
- v3.2 showed the limit of materializing only small foreground proxy regions;
- manual RealityScan still-photo capture was terminated for poor one-person operational fit;
- the later low-touch video-to-twin work established an existing/short-turntable-video direction and a one-Human-Identity-Gate operating target.

No old P5 status, script, model pin, local path or hash automatically becomes current P3 production truth. Current P3 must re-bind local evidence under the canonical Control Plane.

## Safety invariants

- no P3 production registration before PASS;
- no QA01 or M3D01 addition to `enabled_workflows` during evaluation;
- Engine execution never owns SKU identity, QA or Archive truth;
- generation/reconstruction success is not QA PASS;
- 3D never blocks PDP/site release;
- P3 does not mutate RAW, existing Manifest history or formal Archive merely to run an evaluation;
- failed pilot evidence remains explainable and does not silently replace accepted evidence;
- evaluation harnesses never auto-install dependencies or silently fall back to another Engine.

## Merge progression

1. shared pilot contract + read model — **DONE**;
2. P3-A Aquarium evaluation harness — **READY FOR LOCAL SOURCE GATE**;
3. P3-B low-touch source/frame-QC harness — **READY FOR WINDOWS PHYSICAL GATE**;
4. target-Windows physical Gates — **NEXT**;
5. Human identity / realism Gates;
6. only then P4 workflow freeze and P5 production registration.
