# P5 QA01 Kontext D2 — Masked Identity-Core evaluation

Status: `D2_MASK_RUNTIME_PASS / D2_MASKED_GATE_READY / EVALUATION_ONLY / QA01_DISABLED`

Target-Windows capability evidence at head `ec7d459757666252fd30ab10f1af0e712879726d`:

- `comfy_ready=True`
- `VAEEncodeForInpaint=True`
- `SetLatentNoiseMask=True`
- `InpaintModelConditioning=True`
- preferred runtime: `VAEEncodeForInpaint`
- `mask_runtime_ready=True`
- Evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_D2_MASK_CAPABILITY_20260828-164335`

## D2 architecture

D2 ends whole-frame denoise tuning. The VERIFIED SC01 alpha is converted into:

1. a protected Identity Core;
2. a narrow general Integration Band;
3. a wider editable lower contact band for substrate/stone/plant overlap;
4. an external generation region for the aquarium environment.

`LoadImage` alpha semantics are used intentionally: the D2 masked input stores the protected core as alpha 255 and the editable region as alpha 0, so the native LoadImage mask output (`1 - alpha`) becomes the inpaint generation mask. `VAEEncodeForInpaint` provides the latent `noise_mask`; D2 uses denoise 1.0 only in the permitted region.

After raw generation, the protected SC01 core is deterministically copied back pixel-for-pixel. The evaluator fails closed if any protected-core pixel differs after reassertion, if the core coverage drops below 72% of the visible wood subject, if the output dimensions change, or if the source Manifest/F archive identity is not verified.

Frozen evaluation parameters:

- seed `52073121`
- steps `28`
- Flux guidance `2.4`
- KSampler cfg `1.0`
- `euler/simple`
- denoise `1.0`
- VAE inpaint mask grow `4`
- normal silhouette erosion `1 px`
- lower contact erosion `9 px`, beginning at 66% of the subject bbox height

## Scene intent

This is not a prefab tank background. For `DC-ZY-SZ-31001`, the scene must use the central-left root mass, upper crowns, central upright prong, rightward branch flow, central-left cavity and longest low-right branch as the composition grammar. The target is a mature planted freshwater aquarium with physically embedded stone support, realistic fine sand, restrained epiphytes, real front/mid/back depth, front-glass/water cues and shared submerged lighting.

## Safety / license boundary

`FLUX.1 Kontext [dev]` remains `EVALUATION_ONLY / NON_PRODUCTION`. D2 does not register QA01, does not change `enabled_workflows`, does not mutate production Manifest history, and does not write F archive assets. The PR remains Draft until a human visual Gate accepts both Exact Piece identity and scene realism.
