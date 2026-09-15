# P3 Evaluation Harness Result — 2026-09-15

Status: `P3B_FRAME_QC_LOCAL_PASS / MASK_HARNESS_READY / P3A_FIXED_SOURCE_PENDING`

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

Target-Windows evidence for `DC-ZY-SZ-31001` now establishes:

- source-video SHA256: `a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa`;
- source-video identity Gate: PASS;
- isolated runtime: `D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe`;
- OpenCV / NumPy / Pillow runtime: PASS;
- Torch / SAM2 / gsplat presence: PASS;
- passing frame-QC profile: `sample_fps=8`, `window=3`, `max_frames=30`;
- selected frames: `19`;
- source mutation: false;
- production registration: false.

The initial default 3 fps profile selected only 8 frames and the historical 6 fps profile selected 15; both correctly failed the minimum-16-frame Gate. The minimum was not lowered. The bounded 8 fps profile passed with 19 frames.

## P3-B repository hardening

Repository assets now include:

- `tools/P3B_3D_WINDOWS_GATE.ps1`
- `tools/p3b_video_frame_qc.py`
- `tools/P3B_MASK_WINDOWS_GATE.ps1`
- `tools/p3b_wood_only_mask.py`

The Windows gate now prefers the already-isolated Video2Twin Python runtime when it exists and binds the passing frame-QC profile explicitly instead of relying on ambient PATH/default sampling.

The mask harness consumes the already-passed Frame-QC manifest and its exact selected frames. It does not resample the video. It uses the bounded SAM 2.1 automatic-mask route, requires CUDA, refuses non-empty output, requires at least 16 accepted masks, checks selected source-frame hashes before/after, writes mask/masked contact sheets and an evaluation manifest, and stops with:

`WOOD_ONLY_MASK=AUTO_CANDIDATE_READY_HUMAN_GATE_REQUIRED`

Reconstruction remains `BLOCKED_UNTIL_MASK_HUMAN_GATE_PASS`.

## Historical R&D inheritance

The historical branch `feat/p5-qa01-scene-freeze` remains advisory only. Current P3 selectively retained:

- existing/short turntable video instead of manual RealityScan multi-ring capture;
- temporal sharpest-frame selection;
- SAM 2.1 automatic wood-mask candidate generation;
- fail-closed minimum usable-frame/mask count;
- no manual per-frame click path.

Historical status does not itself grant current P3 PASS.

## Safety review

Repository tests assert that:

- `production_registration=false`;
- `pdp_blocking=false`;
- no P3 harness edits `enabled_workflows`;
- no P3 Windows gate silently runs `pip install` or `uv pip install`;
- source video/source frame mutation detection remains present;
- the frame-QC minimum remains 16;
- the passing frame-QC profile is explicitly 8 fps / window 3 / max 30;
- automatic masking cannot unlock reconstruction without the Human Visual Gate.

## Next evidence

### P3-B

Run the current Windows mask gate against the passing Frame-QC evidence directory, then inspect `mask_contact_sheet.jpg` and `masked_contact_sheet.jpg` at the Human Visual Gate. Only a mask Human Gate PASS may unlock reconstruction.

### P3-A

Identify and bind the verified Exact Piece RGBA source and fixed Aquarium backplate, then run the deterministic identity baseline.

No production registration is authorized by this result.
