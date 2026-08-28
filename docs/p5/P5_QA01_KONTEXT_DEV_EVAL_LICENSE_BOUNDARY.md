# P5 QA01 — FLUX.1 Kontext [dev] evaluation-only boundary

Status: `EVALUATION_ONLY / NON_PRODUCTION / QA01_DISABLED`

## Why this boundary exists

The v2 adaptive-scene experiment needs a context-aware image-edit model to test whether a verified SC01 driftwood piece can be integrated into a scene with substantially better physical realism than the rejected v1 background-paste architecture.

The locally downloadable `FLUX.1 Kontext [dev]` weights are distributed under the FLUX [dev] Non-Commercial License. That license permits testing/evaluation in a non-production environment, while commercial/revenue-generating use of the model itself is outside the default grant. Although the license separately states that generated Outputs may be used commercially, this repository will not treat local Kontext [dev] inference as an approved production runtime for DRIFT CURIO without a separate commercial-license/legal decision.

Therefore:

- local Kontext [dev] may be downloaded and used only for bounded visual evaluation;
- `QA01` must remain `NOT_REGISTERED / executable=false` during this evaluation;
- evaluation outputs must not be archived to production `Manifest.destinations.aquarium` or F scene assets;
- no production workflow may declare `FLUX.1 Kontext [dev]` as its licensed execution engine;
- if the v2 visual gate succeeds, production must choose either a commercially licensed BFL route or another model/runtime whose license permits the intended commercial workflow.

## Evaluation model set

The bounded native ComfyUI evaluation uses the official/native FP8-oriented set:

| Role | File | Exact bytes | SHA256 |
|---|---|---:|---|
| diffusion model | `flux1-dev-kontext_fp8_scaled.safetensors` | `11904640136` | `630ba795ec64283b4230ea23cf79406c2c68b7c578229ed139f30043eadb30a2` |
| VAE | `ae.safetensors` | `335304388` | `afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38` |
| text encoder | `clip_l.safetensors` | `246144152` | `660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd` |
| text encoder | `t5xxl_fp8_e4m3fn_scaled.safetensors` | `5157348688` | `a498f0485dc9536735258018417c3fd7758dc3bccc0a645feaa472b34955557a` |

Target external model root remains `D:\AI\MODELS\ComfyUI` with subdirectories `diffusion_models`, `vae`, and `text_encoders`.

## Download integrity contract

The installer must be restart-safe and progress-preserving:

1. download only to `*.download` partial files;
2. use resumable range requests and preserve partial bytes after transport failure;
3. retry from the current byte offset rather than restarting from zero;
4. reject any partial larger than the expected file size;
5. quarantine any complete-size file whose SHA256 is wrong;
6. promote to the formal model filename only after exact byte-size and SHA256 both match;
7. never overwrite a different complete model silently;
8. write bounded evidence logs under the site control-root evidence directory.

This model-install gate does not submit inference and does not mutate Manifest, F, Registry, Site Profile, jobs, QA, or archive journals.
