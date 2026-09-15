# P3 Evaluation Harness Result — 2026-09-15

Status: `P3B_EXISTING_VIDEO_POOL_HUMAN_FAIL / REPLACEMENT_EXACT_PIECE_CAPTURE_REQUIRED / P3A_FIXED_SOURCE_PENDING`

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

Capture one new short fixed-camera turntable video of the verified Exact Piece `DC-ZY-SZ-31001`. Bind the new file by SHA256, generate representative source-identity evidence, and pass the source-content Human Visual Gate before rerunning Frame-QC → wood-only mask → reconstruction.

### P3-A

Identify and bind the verified Exact Piece RGBA source and fixed Aquarium backplate, then run the deterministic identity baseline.

No production registration is authorized by this result.
