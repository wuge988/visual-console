# P3 Evaluation Harness Result — 2026-09-15

Status: `P3B_SUPPORT_V2_HUMAN_FAIL / SUPPORT_V3_READY / P3A_FIXED_SOURCE_PENDING`

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

Target-Windows evidence for `DC-ZY-SZ-31001` established:

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

## P3-B Mask Human Visual Gate — FAIL

The uploaded `selected_frames_contact_sheet.jpg`, `mask_contact_sheet.jpg`, and `masked_contact_sheet.jpg` were reviewed at the Human Visual Gate.

Result: **FAIL**.

Observed failure class: `SEMANTIC_MASK_TARGET_MISMATCH`.

The automatic SAM2 candidate selector consistently isolated tiled-wall/background regions rather than the Exact Piece driftwood identity. Several accepted masks visibly contain rectangular tile surfaces and grout lines. Therefore `usable_masks=19` is only an algorithmic threshold pass; it is not a valid wood-only identity pass.

Consequences:

- the historical SHA match is not sufficient to approve source-content identity;
- `WOOD_ONLY_MASK` Human Visual Gate is FAIL;
- reconstruction remains BLOCKED;
- no mesh/splat/GLB or Aquarium 3D-assisted route may depend on this evidence;
- do not tune the same background/warm-color heuristic indefinitely.

## Existing-source identity triage — Human Visual Gate FAIL

The bounded existing-video triage produced one contact sheet covering 28 discovered candidates across the known project roots. The first historical SHA candidate remains visibly the tiled-wall/background capture. The remaining videos contain several different driftwood pieces plus unrelated screen/person recordings.

The triage sheet was compared against the verified Exact Piece reference for `DC-ZY-SZ-31001`.

Verified reference:

- SC01 SHA256: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`;
- scene archetype: `Heavy Stump + Rightward Branch Flow + Central Negative Space`;
- critical landmarks: `top_double_crowns`, `central_upright_branch`, `central_left_large_cavity`, `right_major_fork`, `longest_lower_right_branch`.

Result: **FAIL — `NO_EXACT_PIECE_MATCH_IN_BOUNDED_EXISTING_VIDEO_POOL`**.

No existing candidate shows the verified topology and critical landmarks consistently enough to approve it as the Exact Piece source. Similar-looking stump/branch pieces are not sufficient; SKU identity is exact-piece, not morphology-class identity.

Therefore the bounded existing-source search is now exhausted and `reshoot_required=true` is justified. This is the first point at which reshoot becomes required; it was intentionally not required before the existing pool was visually reviewed.

## Replacement capture contract

The next P3-B source must be one short fixed-camera turntable video of the verified Exact Piece only.

Requirements:

- exact physical piece must match the verified SC01 topology and critical landmarks;
- full piece remains visible through the useful rotation interval;
- static camera; rotate the piece/turntable, not the phone;
- background must not dominate the frame;
- no hands or people in the useful rotation interval;
- no multi-ring/manual photogrammetry route;
- replacement video receives a new SHA256 binding;
- source-content identity Human Gate must PASS before Frame-QC is allowed to become current evidence.

The old 19-frame / 19-mask run remains historical failure evidence only and must not be reused as source truth for the replacement capture.

## Replacement source candidate — 2026-09-30

A new local replacement video candidate has been provided for `DC-ZY-SZ-31001`. Repository support now includes an explicit replacement-source identity Gate:

- `tools/P3B_REPLACEMENT_SOURCE_IDENTITY_GATE.ps1`
- `tools/p3b_replacement_source_identity.py`

The Gate accepts exactly one explicit video path plus its SHA256, verifies source bytes before/after sampling, generates eight representative frames, records video metadata, pins the verified SC01 Exact Piece reference and critical landmarks into the evaluation manifest, and stops at `VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE`.

The target Windows Gate bound the replacement source to SHA256 `c92391e35aa867bf19a183a55e4c6471a50e54a3fb4c6c56d7f6399f86782bdf`. The eight-frame Human Visual Gate passed against the verified SC01 Exact Piece landmarks. Source bytes were unchanged during evidence generation.

Replacement source metadata:

- duration: 23.400 s;
- resolution: 1920x1080;
- frame rate: 30 fps;
- source-content identity Human Gate: PASS.

The replacement source then passed the current Frame-QC profile (`sample_fps=8`, `window=3`, `max_frames=30`, minimum 16) with **30 selected frames** and `source_mutated=false`.

Current boundary:

- replacement source SHA binding: PASS;
- source-content identity: PASS;
- Frame-QC: PASS;
- wood-only mask automatic candidate: 30/30 generated;
- replacement mask Human Visual Gate: FAIL;
- reconstruction: BLOCKED until a refined mask Human Visual Gate passes.

## Replacement wood-only mask Human Visual Gate — FAIL

The replacement capture produced 30 automatic SAM2 masks and reached the Human Visual Gate. Source identity and Frame-QC remain valid.

Result: **FAIL — `SUPPORT_CONTAMINATION_AND_PARTIAL_WOOD_COVERAGE`**.

Observed issues:

- white plastic support pegs remain inside multiple accepted masks;
- at least one view materially omits a pale diagonal wood branch while retaining the main trunk;
- therefore `usable_masks=30` remains an algorithmic acceptance count, not a valid wood-only identity pass.

This does **not** invalidate the replacement video, SHA256 binding, source-content identity PASS, or 30-frame Frame-QC PASS. The failure is isolated to segmentation quality.

A bounded refinement route is now prepared:

- `tools/P3B_MASK_REFINE_WINDOWS_GATE.ps1`
- `tools/p3b_wood_mask_refine.py`

The refinement consumes the existing mask evidence, reuses SAM2 proposals only within the current object neighborhood, unions plausible warm wood segments, applies deterministic bright-near-achromatic white-support suppression, emits refined mask/masked/delta contact sheets, and stops at another Human Visual Gate.

No per-frame clicks, no source mutation, no production registration, and no reconstruction are authorized by the refinement harness.

## First bounded refinement Human Visual Gate — FAIL

The first bounded refinement completed with 30/30 refined masks and `source_frames_mutated=false`.

Human Visual Gate result: **FAIL — `RESIDUAL_SUPPORT_CONTAMINATION`**.

The refinement successfully recovered the previously missing pale diagonal wood branch, so the earlier partial-coverage regression is considered resolved. However, residual white support pegs remain visible across multiple refined masks and masked previews. Reconstruction therefore remains blocked.

The next route is intentionally narrower than the first refinement. It does not rerun SAM2 and does not reopen general segmentation tuning. It consumes the already-refined masks and applies deterministic lower-object support suppression based on:

- bright / near-neutral support color;
- slender vertical geometry;
- lower-object position;
- proximity to the bottom of the current object mask;
- bounded removal-area limits.

Repository assets:

- `tools/P3B_SUPPORT_V2_WINDOWS_GATE.ps1`
- `tools/p3b_support_suppression_v2.py`

The v2 harness emits mask, masked-preview and delta contact sheets and stops at `WOOD_ONLY_MASK_SUPPORT_V2_HUMAN_VISUAL_GATE`. Reconstruction remains blocked until that Human Gate passes.

## Support V2 Human Visual Gate — FAIL

Support V2 completed with 30/30 accepted masks and preserved the recovered wood coverage.

Human Visual Gate result: **FAIL — `RESIDUAL_SUPPORT_CONTAMINATION_MINOR_BUT_PERSISTENT`**.

The large support regions were reduced, but short white/near-neutral peg remnants remain visible in multiple views. No return to Frame-QC or SAM2 is required. The next route is a narrower deterministic residual-peg cleanup that consumes Support V2 outputs directly.

Repository assets:

- `tools/P3B_SUPPORT_V3_WINDOWS_GATE.ps1`
- `tools/p3b_support_suppression_v3.py`

Support V3 uses strong white/neutral seeds, a bounded low-saturation grow corridor, slender lower-object geometry, and strict removal-area limits. It emits v3 mask, masked-preview and removal-delta contact sheets and stops at `WOOD_ONLY_MASK_SUPPORT_V3_HUMAN_VISUAL_GATE`.

Reconstruction remains blocked until the Support V3 Human Gate passes.

## Safety review

Repository tests assert that:

- `production_registration=false`;
- `pdp_blocking=false`;
- no P3 harness edits `enabled_workflows`;
- no P3 Windows gate silently runs `pip install` or `uv pip install`;
- source video/source frame mutation checks remain present;
- the failed mask Human Visual Gate cannot unlock reconstruction;
- the existing source pool was reviewed before reshoot became required;
- replacement capture stays one low-touch turntable video, not manual RealityScan multi-ring capture;
- reconstruction remains blocked until replacement source-content identity passes.

## Next evidence

### P3-B

Run Support V3 against the Support V2 evidence. Review the v3 mask, masked preview, and removal-delta contact sheets. Only a Support V3 Human Visual Gate PASS may unlock reconstruction.

### P3-A

Identify and bind the verified Exact Piece RGBA source and fixed Aquarium backplate, then run the deterministic identity baseline.

No production registration is authorized by this result.
