# P3-B: owner human-gate approval and isolated 3D trial handoff

Status: `HUMAN_GATE=PASS_FOR_ISOLATED_3D_EVALUATION_ONLY`  
Piece: `DC-ZY-SZ-31001`  
Approved evidence: SAM3.1 `20261002-224710-sam31-30frame-evaluation-object-verified`  
Benchmark code: `82006dfd0eb5bdbd53b3acc9b9f1a5cc9eaf0a23`

## Chronological authorization

1. PR #77 verified and merged the SAM3.1 uncached-frame mask repair and 30-frame automated evaluation. All 30 masks passed automatic thresholds.
2. Three contact sheets and `evaluation_manifest.json` were supplied and reviewed in the project conversation; PR #78 records the exact SHA256 of all four evidence files and the contact-sheet-level visual pre-review.
3. The assistant then directly asked whether the owner approved **this batch of masks passing the P3-B human visual gate and authorized an evaluation-only 3D trial**.
4. The owner replied: **“授予全部权限，连续推进”**. In that direct context this is the user's express approval for the proposed evaluation-only operation. It is a conversational authorization record, not a digital signature or a production-quality certification.

## Exact approved evidence

- `evaluation_manifest.json`: `989e737bb02dc73f1cb36a7000f00d202c588dd6c3b4991118ec44a58552b85d`
- `sam31_mask_contact_sheet.jpg`: `dd9d0e93006fee305e687045362958ba9f8a4cb4b8d17264df5157ed01688c16`
- `sam31_masked_contact_sheet.jpg`: `af51314377a5a350491509f823b564e414b485c63906f7f2576a2025105f7209`
- `sam31_delta_contact_sheet.jpg`: `a5769f561103c62e858b55d7d90bd51ca705c885de097d377450256d5d918b9c`

Approval **only** covers making a separately isolated 3D research/reconstruction trial from this exact 30-frame batch, retaining production and release gates. It does not imply that each contact-tip pixel was examined at native resolution or that downstream 3D quality will pass.

## Existing engine direction and prerequisites

Prior decisions: prefer low-touch already captured video; existing `D:\AI\TOOLS\DC_Video2Twin\venv-py310` Python environment has previously verified Torch, SAM2, gsplat and RTX 3060 Ti CUDA. Target reconstruction direction is a `recon3d`-style donor + licensed VGGT Commercial + gsplat pipeline, with Postshot considered only if a later fallback/A-B is needed. This approval does **not** authorize repeated SAM2 mask experiments or a 60–300 manual-capture workflow.

Actual local recon3d/VGGT Commercial source entrypoint, cached model weights, valid commercial license usage, camera-pose interface and 8-GB GPU feasibility remain **unverified** in this conversation. Do not infer them from the environment's earlier SAM2/gsplat import success.

## Controlled next steps

- Run `tools/P3B_SAM31_APPROVED_3D_STAGE_WINDOWS.ps1` locally or its source-identical offline bundle. It checks the above evidence hashes, manifest identity, all source-frame SHA256 values, mask binary shapes/area, outputs, and all 30 tracking IDs, then copies 30 original images + 30 SAM3.1 masks to a fresh directory.
- The copied masks have **no preexisting per-mask SHA256 fields in the benchmark manifest**. Pin newly measured SHA256 in the additive stage receipt, check binary pixels and per-frame area against the signed-off manifest, and verify all copies; do not misrepresent the contact sheet as pixel-for-pixel cryptographic attestation.
- Probe only the preexisting reconstruction runtime and likely local model sources and return `engine_probe.json`. Probe does not download models, retrain, execute reconstruction or mutate any source.
- Only after inspecting the actual local probe evidence should a specific isolated 3D adapter with bounded resource settings be wired and run once. Do not silently fall back to other models, unknown weights, cloud uploads or new paid providers.
- If a 3D trial succeeds, independently test silhouette, branch topology, natural voids, support-induced phantom geometry, texture alignment, scale and web GLB performance. Visual Console 3D UI is still a planned scaffold, not a proven executable backend.
- No Asset Registry, Archive, public PDP viewer or checkout/production mutation. PDP remains non-blocking and runs on its approved 2D assets.

The original `evaluation_manifest.json`, old failed SAM2/V3 evidence and source frames remain immutable; local stage results are additive, independent, trial-only evidence.
