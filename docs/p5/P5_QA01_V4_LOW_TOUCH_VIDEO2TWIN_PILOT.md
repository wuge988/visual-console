# P5 QA01 — v4 Low-Touch Video2Twin Pilot

Date: 2026-09-10

Status: `V32_ROUTE_TERMINATED / REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED / LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED / HF_COMMERCIAL_ACCESS_GRANTED / NATIVE_STDERR_RECOVERY_VALIDATED / TORCH_TRANSPORT_RECOVERY_VALIDATED / EXACT_HEAD_CI_PASS / QA01_DISABLED`

## Decision

The next P5 experiment is a **one-SKU, existing-video, low-touch reconstruction pilot**. It must not ask the operator to reshoot hundreds of stills or manually triage per-frame connectivity.

Pilot SKU: `DC-ZY-SZ-31001`.

Input contract: one existing short turntable video from the DRIFT CURIO evidence set or another already-existing local DRIFT CURIO / 3D work area. No reshoot is required for the first Gate.

The pilot produces an **identity-oriented 3D Gaussian Splat** first. Mesh export is deliberately deferred until the splat proves that thin branches, cavities and overall product identity can be reconstructed with materially lower human effort than manual Mobile photogrammetry.

## Architecture

```text
existing SKU video
  -> bounded read-only source discovery
  -> automatic temporal sampling
  -> local sharp-frame selection
  -> automatic SAM 2.1 object masks
  -> exact neutral-gray object-only frames
  -> VGGT commercial checkpoint camera/geometry estimation
  -> gsplat training
  -> scene.ply + scene.splat
  -> Human Identity Gate
```

The first pilot does **not** attempt Aquarium rendering and does **not** register QA01.

## Existing-video source

The bounded read-only discovery resolved the current pilot source to an already-existing exact-SKU video under the DRIFT CURIO Trash evidence tree. The source remains read-only.

- SKU: `DC-ZY-SZ-31001`
- SHA256: `a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa`
- source mutation: `NONE`

## Windows recovery chain

The Windows pilot exposed several environment/runtime-shell defects before reconstruction. They are treated as implementation defects, not operator workflow requirements.

### Native argument forwarding

The original PowerShell helper used a parameter named `$Args`, which collided case-insensitively with PowerShell's automatic `$args` variable. This caused `uv` to receive no command payload. The helper now uses `$CommandArgs`; Windows subsequently installed CPython 3.10.21 and created the isolated venv successfully.

### Hugging Face commercial access

The operator successfully authenticated Hugging Face as `wujack6`. The browser model page now shows **"You have been granted access to this model"** for `facebook/VGGT-1B-Commercial`.

The formal access probe now returns `V4_VGGT_COMMERCIAL_ACCESS=PASS` and resolves the commercial checkpoint config. No fallback to `facebook/VGGT-1B` is permitted.

### Native stderr / Windows symlink warning trap

After commercial access was granted, the access probe initially failed before printing its own PASS result because `huggingface_hub` emitted a benign Windows cache warning to native stderr. Under Windows PowerShell 5.1 with `$ErrorActionPreference='Stop'`, merged native stderr can become a terminating PowerShell error even when Python itself exits successfully.

The validated recovery avoids native stream merging:

- runs the Python access probe with `Start-Process`;
- redirects stdout and stderr to separate temporary files;
- replays both only through `Write-Host`;
- returns only `[int]$probeProcess.ExitCode`;
- sets `HF_HUB_DISABLE_SYMLINKS_WARNING=1` for the child probe;
- deletes temporary stdout/stderr/probe files after use.

### Schannel certificate-revocation offline recovery

Windows Schannel returned `CRYPT_E_REVOCATION_OFFLINE` when downloading the small recovery runner. The download path uses a bounded fallback:

1. `curl.exe --ssl-revoke-best-effort`;
2. only if needed, `curl.exe --ssl-no-revoke` for the byte-pinned artifact;
3. exact Git blob/SHA verification before execution.

The TEMP Gate's audited uv download path uses the same transport principle while retaining the frozen uv ZIP SHA256 verification.

### PyTorch 2.9.1 + cu128 transport recovery

After commercial-model access passed, the first `torch==2.9.1+cu128` download repeatedly lost the connection while retrieving the 2.86 GB wheel. pip resumed several times, then failed with Windows `WinError 32` because its interrupted wheel in the Windows system TEMP unpack directory was locked by another process.

This is classified as a **transport / pip system-temp failure**, not a CUDA compatibility failure and not a reconstruction failure.

The audited recovery is `tools/P5_QA01_V4_TORCH_TRANSPORT_RECOVERY.ps1`. It uses the already-pinned portable `uv 0.12.10` and uv's PyTorch backend interface instead of pip's system-temp wheel flow:

- exact packages: `torch==2.9.1`, `torchvision==0.24.1`;
- exact PyTorch backend: `cu128`;
- persistent cache: `D:\AI\TOOLS\DC_Video2Twin\uv-cache`;
- `UV_HTTP_RETRIES=20`;
- `UV_HTTP_TIMEOUT=180`;
- `UV_HTTP_CONNECT_TIMEOUT=30`;
- `UV_CONCURRENT_DOWNLOADS=1`;
- `UV_LINK_MODE=copy`;
- three outer install attempts using the same persistent uv cache;
- native uv process runs through `Start-Process` with inherited console, avoiding PowerShell 5.1 native-stderr promotion;
- post-install verification requires `torch 2.9.1+cu128`, `torchvision 0.24.1+cu128`, and `torch.cuda.is_available() == True`.

After the torch runtime verifies, the recovery automatically resumes the already validated Video2Twin recovery runner. The original pip torch line then becomes a cheap requirement-satisfied check before gsplat / VGGT / SAM2 / automatic preparation / reconstruction continue.

## CI evidence

- Access-probe stderr isolation exact-head CI `#451`: PASS.
- Torch transport recovery first CI `#453`: failed only because the test's `-PlanOnly` mode evaluated Windows `D:` paths on the Linux runner before entering plan mode.
- The script was corrected to keep Windows path construction non-resolving before runtime.
- Torch transport recovery exact-head CI `#454 / run 34461809256`: **PASS** at `6a3d6f2f3379eab8849faaed46f3f81255c3ba1e`.
- Documentation-only exact-head CI `#455 / run 34462008166`: **PASS** at `0debda8827afa6efc8c228f18186da4fd79a54b2`.
- `npm test`: PASS.
- `npm run build`: PASS.
- PowerShell parse: PASS.
- `-PlanOnly` execution: PASS.

## Upstream donors and pinned provenance

### recon3d

- Repository: `jashshah999/recon3d`
- Pinned commit: `59fe356bceab74ef7d5839b68aba232bce20e14d`
- License: MIT

### photo-to-mesh

- Repository: `Hasasasaki/photo-to-mesh`
- Pinned commit: `6a1697e839113e12802b52d5cc6951044a4abe47`
- License: MIT
- Borrowed concept: temporal-window sharp-frame selection.

### VGGT

- Code repository: `facebookresearch/vggt`
- Pinned code commit: `a288dd0f14786c93483e45524328726ab7b1b4ce`
- Required model ID: `facebook/VGGT-1B-Commercial`
- Browser access state: granted as of 2026-09-10.

### SAM 2.1

- Repository: `facebookresearch/sam2`
- Pinned commit: `2b90b9f5ceec907a1c18123530e92e794ad901a4`
- License: Apache-2.0
- Model: `facebook/sam2.1-hiera-base-plus`

### gsplat

- Package version: `1.5.3`
- License: Apache-2.0
- Pilot environment: Python 3.10 + PyTorch 2.9.1 + CUDA 12.8 wheel path.

### uv

- Version: `0.12.10`
- Official x64 Windows ZIP SHA256: `f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2`

## Frame-preparation contract

`tools/p5_qa01_v4_video2twin_prep.py` must:

1. Read the existing input video without modifying it.
2. Sample candidate frames in temporal order.
3. Keep the sharpest frame within small temporal windows.
4. Evenly cap the final set to at most 30 frames for the first 8 GB GPU pilot.
5. Run SAM 2.1 automatic mask generation with no normal-path per-frame manual clicks.
6. Choose the likely driftwood mask deterministically using geometry, center, border and warm/brown-pixel evidence.
7. Reject obviously invalid masks and fail if too few usable views remain.
8. Place the accepted object on exact RGB `(127,127,127)` background.
9. Save raw selected frames, masks, masked frames, contact sheets and `prep_manifest.json` into the evidence directory.

No files are written back into formal RAW.

## First pilot parameters

- selected usable frames: target 24–30, minimum 16;
- reconstruction input long edge: 640 px;
- VGGT: commercial checkpoint only;
- metric alignment: OFF;
- factor graph: OFF;
- gsplat training: 3500 steps;
- viewer: not auto-launched during training;
- mesh: OFF for the first Gate.

## Human Identity Gate

The produced `scene.ply` is judged against the exact SKU on:

1. top double crowns;
2. central thin/upright branch;
3. central-left large cavity;
4. major right fork;
5. longest lower-right branch;
6. overall proportions/orientation/silhouette;
7. recognizable real wood-grain appearance;
8. materially fewer floating/phantom structures than the existing RealityScan baseline.

If the splat is recognizably the exact piece and materially useful, then evaluate interaction mesh/proxy geometry and compare with Postshot using the exact same video/mask evidence. If the one-video route fails exact-piece identity, do not enter another parameter-tuning loop; compare the same evidence in Postshot or one other low-touch reconstruction family.

## Production boundary

- `QA01` remains `NOT_REGISTERED / executable=false`.
- QA01 remains absent from site `enabled_workflows`.
- No production Manifest mutation.
- No F archive mutation.
- No deploy/merge/enable.
- Input video remains read-only.
- Output is P5 evidence only.
- No noncommercial model may silently replace the commercial checkpoint.
