# P3 Evaluation Harness Result — 2026-09-15

Status: `P3B_MASK_HUMAN_GATE_FAIL / SOURCE_IDENTITY_TRIAGE_NEXT / P3A_FIXED_SOURCE_PENDING`

## Scope

This result records the bounded P3 pilots only:

- P3-A Aquarium Scene MVP;
- P3-B low-touch 3D MVP.

It does **not** authorize production registration, Archive promotion, or PDP blocking.

## P3-A result

Repository assets:

- `tools/P3A_AQUARIUM_LOCAL_GATE.ps1`
- `tools/p3a_aquarium_identity_baseline.py`

The harness requires a verified Exact Piece RGBA source plus a fixed Aquarium backplate, binds both by SHA256, refuses non-empty output directories, performs no resize/generative mutation, verifies exact opaque-piece pixels remain byte-identical, and stops at a Human Visual Gate. P3-A fixed-source evidence is still pending.

## P3-B local evidence

Target-Windows evidence for `DC-ZY-SZ-31001` establishes:

- historical source-video SHA256 matched: `a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa`;
- isolated runtime: `D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe`;
- OpenCV / NumPy / Pillow / Torch / SAM2 / gsplat: available;
- CUDA: PASS on NVIDIA GeForce RTX 3060 Ti;
- SAM2 local offline cache: PASS;
- frame-QC profile: `sample_fps=8`, `window=3`, `max_frames=30`;
- selected frames: 19;
- automatic mask candidates: 19 accepted / 0 rejected;
- source mutation: false;
- production registration: false.

The 3 fps and 6 fps attempts correctly failed the minimum-16-frame gate. The 8 fps profile passed with 19 frames without lowering the minimum.

## P3-B Human Visual Gate — FAIL

The uploaded `selected_frames_contact_sheet.jpg`, `mask_contact_sheet.jpg`, and `masked_contact_sheet.jpg` were reviewed at the Human Visual Gate.

Result: **FAIL**.

Observed failure class: `SEMANTIC_MASK_TARGET_MISMATCH`.

The automatic SAM2 candidate selector consistently isolated tiled-wall/background regions rather than the Exact Piece driftwood identity. Several accepted masks visibly contain rectangular tile surfaces and grout lines. Therefore `usable_masks=19` is only an algorithmic threshold pass; it is not a valid wood-only identity pass.

Consequences:

- the current historical SHA match is not sufficient to approve source-content identity;
- `WOOD_ONLY_MASK` Human Visual Gate is FAIL;
- reconstruction remains BLOCKED;
- no mesh/splat/GLB or Aquarium 3D-assisted route may depend on this evidence;
- do not tune the same background/warm-color heuristic indefinitely.

## Bounded recovery — existing-source triage before reshoot

New evaluation-only assets:

- `tools/P3B_VIDEO_SOURCE_IDENTITY_TRIAGE.ps1`
- `tools/p3b_video_source_identity_triage.py`

The triage harness searches only bounded existing project roots, samples representative frames from candidate videos, hashes sources before/after, marks the rejected historical SHA as `KNOWN_HUMAN_REJECTED`, and produces a contact sheet plus manifest for a new Human Visual Gate.

It does not choose a source automatically and does not authorize frame QC, masking or reconstruction. `reshoot_required=false` remains in force until the existing candidate pool is visually exhausted.

## Safety review

Repository tests assert that:

- `production_registration=false`;
- `pdp_blocking=false`;
- no P3 harness edits `enabled_workflows`;
- no P3 Windows gate silently runs `pip install` or `uv pip install`;
- source video/source frame mutation checks remain present;
- the failed mask Human Visual Gate cannot unlock reconstruction;
- source triage is Human-Gate-only and tries existing candidates before reshoot.

## Next evidence

### P3-B

Run the bounded source-identity triage, inspect `video_source_identity_contact_sheet.jpg`, and approve only a candidate that visibly contains the Exact Piece `DC-ZY-SZ-31001` through useful turntable coverage. Then re-bind by SHA256 and rerun Frame-QC → wood-only mask.

### P3-A

Identify and bind the verified Exact Piece RGBA source and fixed Aquarium backplate, then run the deterministic identity baseline.

No production registration is authorized by this result.
