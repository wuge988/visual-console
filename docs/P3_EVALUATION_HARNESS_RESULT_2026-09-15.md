# P3 Evaluation Harness Result — 2026-09-15

Status: `REPOSITORY_HARNESS_READY / LOCAL_PHYSICAL_EVIDENCE_PENDING`

## Scope

This result records repository-side preparation for the two bounded P3 pilots only:

- P3-A Aquarium Scene MVP;
- P3-B low-touch 3D MVP.

It does **not** claim that either pilot has passed local source/runtime, visual, reconstruction, QA, Archive, or production-registration Gates.

## P3-A result

Repository assets:

- `tools/P3A_AQUARIUM_LOCAL_GATE.ps1`
- `tools/p3a_aquarium_identity_baseline.py`

The harness:

1. requires the pilot SKU `DC-ZY-SZ-31001`;
2. requires a verified Exact Piece RGBA source and a fixed Aquarium backplate;
3. requires explicit SHA256 binding for both source files;
4. refuses a non-empty evaluation output directory;
5. performs no resize or generative mutation;
6. verifies fully opaque Exact Piece pixels remain byte-equal in the output composite;
7. verifies source-file hashes remain unchanged after execution;
8. writes only an evaluation image, alpha preview and evaluation manifest;
9. emits `HUMAN_VISUAL_GATE_REQUIRED` and `archive_eligible=false`.

Interpretation: this establishes an identity-preserving deterministic lower bound. It is not Aquarium realism PASS and is not a production QA01 workflow.

## P3-B result

Repository assets:

- `tools/P3B_3D_WINDOWS_GATE.ps1`
- `tools/p3b_video_frame_qc.py`

The harness:

1. requires the pilot SKU `DC-ZY-SZ-31001`;
2. requires an existing/short turntable video and explicit SHA256 binding;
3. probes existing local Python/OpenCV/NumPy/Pillow capability;
4. reports Torch/SAM2/gsplat presence without auto-installing dependencies;
5. performs deterministic temporal candidate sampling, sharpest-frame selection and even capping;
6. requires at least 16 selected frames;
7. verifies the source video hash remains unchanged after execution;
8. writes only selected frames, a contact sheet and evaluation manifest;
9. stops with `WOOD_ONLY_MASK=PENDING_WINDOWS_PHYSICAL_GATE` and reconstruction blocked.

Interpretation: repository work reaches the target-Windows physical boundary without silently importing historical P5 runtime state. No reconstruction or 3D identity claim is made yet.

## Historical R&D inheritance

The historical branch `feat/p5-qa01-scene-freeze` remains advisory only. This work selectively retained structural lessons:

- deterministic compositing can protect exact identity;
- repeated D0–D6 masked-generation tuning is closed;
- small foreground materialization is insufficient for whole-scene coherence;
- existing/short turntable video is preferable to manual RealityScan multi-ring capture for one-person operation;
- automated frame selection and wood-only masking are required before low-touch reconstruction.

Historical script bytes, paths, model pins, source-video hashes and runtime PASS records are not automatically promoted into current P3 truth.

## Safety review

Repository tests assert that:

- `production_registration=false`;
- `pdp_blocking=false`;
- no P3 harness edits `enabled_workflows`;
- no P3 Windows gate silently runs `pip install` or `uv pip install`;
- P3-A contains an exact opaque-pixel identity guard;
- P3-B contains source-video mutation detection;
- masking and reconstruction remain blocked until the physical Gate advances them.

## Next evidence

The next evidence must come from the target Windows environment:

### P3-A

- locally identify the verified Exact Piece RGBA source;
- locally identify the fixed Aquarium backplate;
- bind both by SHA256;
- run the local gate;
- inspect the resulting baseline at the Human Visual Gate.

### P3-B

- locally identify the existing/short turntable video;
- bind it by SHA256;
- run the Windows probe/frame-QC gate;
- review frame-QC evidence;
- only then advance to the wood-only mask/reconstruction runtime Gate.

No production registration is authorized by this result.
