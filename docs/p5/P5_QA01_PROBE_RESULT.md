# P5 QA01 Probe Result

Packet: `VC-P5-QA01-AQUARIUM-001`
Status: `TARGET_WINDOWS_PROBE_PASS / PATH_C_SELECTED / ONE_MODEL_INSTALL_GATE_NEXT`

## Target-Windows evidence

- probe marker: `P5_QA01_CAPABILITY_PROBE=PASS`
- exact probe head: `66d7f06b2cc097991acb64aa4a6a726643198ef0`
- GPU: `NVIDIA GeForce RTX 3060 Ti`
- VRAM: `8192 MiB total / 6480 MiB free at probe`
- driver: `591.86`
- D free space: `274.61 GB`
- ComfyUI `/object_info`: `false / unavailable during probe`
- model roots scanned: `2`
- all checkpoints: `0`
- effective checkpoints: `0`
- SDXL-like checkpoints: `0`
- effective SDXL-like checkpoints: `0`
- IP-Adapter node/models: `false / 0`
- CLIP-Vision models: `0`
- ControlNet node/models/effective models: `false / 0 / 0`
- VAE/inpaint node evidence: `false` while ComfyUI was offline
- evidence directory: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_CAPABILITY_20260827-235815`

## Decision

`PATH_C`

No viable static-image checkpoint is installed. The next authorized Gate is a bounded single-checkpoint install plus native-runtime visibility verification.

Selected first model:

- `stabilityai/stable-diffusion-xl-base-1.0`
- `sd_xl_base_1.0.safetensors`
- size: `6938078334` bytes
- SHA256: `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`

No custom node, IP-Adapter, ControlNet, CLIP-Vision, refiner, LoRA or second checkpoint is included in this Gate.

## Next Gate

`tools/P5_QA01_PATH_C_INSTALL_GATE.ps1`

The Gate must:

1. keep QA01 disabled;
2. bind execution to an exact audited Git head;
3. download or reuse only the exact selected checkpoint;
4. verify byte size and SHA256 before promoting the file;
5. use an already-configured external model root when present, otherwise the native portable checkpoint directory;
6. start ComfyUI locally with `--lowvram` only when `/object_info` is not already available;
7. prove the checkpoint is visible in ComfyUI;
8. prove the required native nodes exist;
9. submit no inference prompt and mutate no Manifest/F asset.

Only after this Gate passes may the isolated Aquarium background sample workflow be frozen and submitted.
