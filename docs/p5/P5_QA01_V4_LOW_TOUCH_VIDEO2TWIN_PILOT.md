# P5 QA01 v4 — Low-Touch Video2Twin Pilot

## Current status — 2026-09-11

`LOW_TOUCH_VIDEO2TWIN_PILOT_IMPLEMENTED / HF_COMMERCIAL_ACCESS_PASS / TORCH_CU128_RUNTIME_PASS / GSPLAT_PASS / VGGT_CODE_PASS / SAM2_SOURCE_RUNTIME_PASS / RECON3D_LOCAL_CACHE_PASS / FINAL_RESUME_V2_DIRECT_EXECUTION_FORBIDDEN / FINAL_RESUME_V3_SEMANTIC_SELF_REVIEW_PASS / BYTE_PINNED_V3_HANDOFF_CI_PASS / FINAL_WINDOWS_PHYSICAL_GATE_NEXT / QA01_DISABLED`

### Pilot identity

- SKU: `DC-ZY-SZ-31001`
- Frozen source-video SHA256: `a322cd09820af0fe7d3092101d7660787853c7b2979c7e207c3be5e0bf4778aa`
- Commercial model: `facebook/VGGT-1B-Commercial`
- SAM2 model: `facebook/sam2.1-hiera-base-plus`
- recon3d donor commit: `59fe356bceab74ef7d5839b68aba232bce20e14d`
- photo-to-mesh temporal-sampling concept donor: `Hasasasaki/photo-to-mesh @ 6a1697e839113e12802b52d5cc6951044a4abe47`
- VGGT code commit: `a288dd0f14786c93483e45524328726ab7b1b4ce`
- SAM2 source commit: `2b90b9f5ceec907a1c18123530e92e794ad901a4`
- gsplat pilot version: `1.5.3`
- uv portable version: `0.12.10`
- uv Windows x64 ZIP SHA256: `f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2`

### Runtime already proven on Windows

- Python 3.10.21
- torch `2.9.1+cu128`
- torchvision `0.24.1+cu128`
- CUDA available on NVIDIA GeForce RTX 3060 Ti
- gsplat `1.5.3`
- VGGT source install PASS
- SAM2 exact-source install PASS
- combined runtime import PASS
- runtime marker PASS
- recon3d exact commit local bare cache PASS

### Known v2 defect — do not execute v2 directly

`tools/P5_QA01_V4_FINAL_RESUME_RECOVERY_V2.ps1` is retained only as an exact byte-pinned source artifact for v3 patching. It contains the historical embedded GPU probe typo `torch.cuda.is_availe()` and MUST NOT be executed directly.

Direct v2 execution reproduces the already-classified failure:

`AttributeError: module 'torch.cuda' has no attribute 'is_availe'`

A Windows log on 2026-09-11 reproduced exactly that known v2-only failure. It did not contain the v3 handoff markers and therefore is not evidence against v3. No downstream runtime/model/reconstruction regression was established by that run.

### Required final handoff path

Use only `tools/P5_QA01_V4_FINAL_RESUME_V3_HANDOFF.ps1`.

The handoff:

1. verifies the audited local branch/head `feat/p5-qa01-scene-freeze @ ed216ac6bcd2f703ac6826631b9984dd43320172`;
2. requires a clean worktree;
3. verifies the frozen source-video SHA256;
4. downloads exact V2/V3 from validated remote head `4dce2f1fb8fd6e4e58df6e333ec8c90c174be687`;
5. verifies V2 Git blob `a81d5307cbab518786a5171144e8851d32b27cc0`;
6. verifies V3 Git blob `d3bc233484cb3815a564ba832d9bfe913782a21b`;
7. parses both downloaded PowerShell runners;
8. emits `THIS_IS_V3_HANDOFF=PASS` and `DIRECT_V2_EXECUTION=FORBIDDEN_KNOWN_TYPO` before downstream work;
9. invokes V3 only after all exact-byte checks pass.

Windows Schannel recovery for the small byte-pinned V2/V3 downloads uses `--ssl-revoke-best-effort`, with `--ssl-no-revoke` only as a fallback. Execution remains blocked until the downloaded script bytes match the expected Git blob exactly.

Current handoff Git blob: `3d9481fbfe64df8214f38fa7e61ce5a5905af95f`.

Authoritative current branch head and exact-head CI belong in PR #9 / Notion, not in this tracked document, to avoid self-referential doc-only commits invalidating the recorded head.

CI verifies the handoff self-check path, exact V2/V3 blobs, PowerShell parsing, V3 semantic GPU probe regression, full server tests, and web/server build.

### Expected final execution sequence

`byte-pinned handoff -> V3 corrected GPU probe contract -> REAL_GPU_PROBE -> corrected temporary V2 -> recon3d local cache -> automatic frame/mask prep -> SAM2 checkpoint -> VGGT-1B-Commercial checkpoint/inference -> gsplat training -> scene.ply + scene.splat -> Human Exact-SKU Identity Gate`

### Frozen donor / architecture notes

- `Hasasasaki/photo-to-mesh @ 6a1697e839113e12802b52d5cc6951044a4abe47` is used only as a concept donor for temporal-window sharpest-frame selection plus even capping; SAM3 is not part of this route.
- recon3d remains pinned to `59fe356bceab74ef7d5839b68aba232bce20e14d`.
- VGGT code remains pinned to `a288dd0f14786c93483e45524328726ab7b1b4ce` and runtime model ID remains `facebook/VGGT-1B-Commercial`.
- SAM2 remains pinned to `2b90b9f5ceec907a1c18123530e92e794ad901a4` with `facebook/sam2.1-hiera-base-plus`.
- gsplat remains `1.5.3`.
- portable uv remains `0.12.10` with pinned Windows x64 ZIP SHA256 `f65744f94072152b1f86ba2aace4d01f1124d9a8ecb235805039e3718c36cac2`.

### Stop-loss and production boundary

- no reshoot before the current existing-video pilot is judged;
- no return to RealityScan Mobile manual still-photo workflow;
- no v3.2 foreground-materialization tuning;
- no old Kontext route;
- no silent fallback to non-commercial `facebook/VGGT-1B`;
- QA01 remains `NOT_REGISTERED / executable=false`;
- QA01 remains absent from enabled workflows;
- PR remains Draft / Open / Unmerged;
- No production Manifest mutation;
- no F archive mutation;
- no deploy / merge / enable;
- source video remains read-only;
- No files are written back to RAW or any production asset destination by this pilot.

If the first resulting digital twin materially fails exact-piece identity, stop v4 tuning and move the same evidence to the next low-touch A/B family rather than entering an indefinite parameter loop.
