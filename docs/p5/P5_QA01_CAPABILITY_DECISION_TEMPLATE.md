# P5 QA01 Capability Decision

Packet: `VC-P5-QA01-AQUARIUM-001`
Status: `TARGET_PROBE_PASS / PATH_C_SELECTED / MINIMAL_INSTALL_GATE_NEXT`

This decision is grounded only in the real target-Windows `P5_QA01_CAPABILITY_PROBE=PASS` report from 2026-08-27.

## Machine evidence

- Probe head: `66d7f06b2cc097991acb64aa4a6a726643198ef0`
- GPU / VRAM: `NVIDIA GeForce RTX 3060 Ti / 8192 MiB`
- GPU free VRAM at probe: `6480 MiB`
- NVIDIA driver: `591.86`
- D free space: `274.61 GB`
- ComfyUI `/object_info`: `offline / unavailable during probe`
- model roots scanned: `2`
- installed checkpoints: `0`
- effective checkpoints reported by ComfyUI: `0`
- SDXL-like checkpoints: `0`
- effective SDXL-like checkpoints: `0`
- IP-Adapter node: `false`; models: `0`
- CLIP-Vision models: `0`
- ControlNet node: `false`; models: `0`; effective models: `0`
- VAE/inpaint node evidence: `false` because `/object_info` was unavailable
- Evidence directory: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_CAPABILITY_20260827-235815`

## Selected path

`PATH_C — NO VIABLE STATIC IMAGE CHECKPOINT INSTALLED`

Reason:

- there is no installed checkpoint to execute a static-image background sample;
- optional conditioning stacks are also absent;
- adding IP-Adapter / ControlNet before proving that plain text-to-image can satisfy the background-only layer would increase install size, node risk and debugging scope without evidence of need.

The lowest-complexity next step is therefore **one checkpoint only, no custom-node install**.

## Minimal model install freeze

Selected first checkpoint:

- model family: `Stable Diffusion XL 1.0 Base`
- repository: `stabilityai/stable-diffusion-xl-base-1.0`
- file: `sd_xl_base_1.0.safetensors`
- expected byte size: `6938078334`
- expected SHA256: `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`
- license family: `OpenRAIL++`

Why this checkpoint:

1. one self-contained checkpoint is sufficient for the first native ComfyUI text-to-image capability Gate;
2. it avoids installing IP-Adapter, CLIP-Vision, ControlNet or third-party nodes before they are proven necessary;
3. QA01 v1 generates only the Aquarium **environment layer**; the product itself is always restored from VERIFIED SC01 Cutout, so the first scene experiment does not require product-identity conditioning inside the diffusion model;
4. the target has 274.61 GB free on D, so the single ~6.94 GB checkpoint is not a disk-capacity blocker;
5. the 8 GB GPU requires a low-VRAM test path and serial execution; final runtime parameters remain fail-closed until post-install node/model visibility is proven.

## Install boundary

The installation Gate may download **only** the selected checkpoint above.

It must not:

- install custom nodes;
- download refiner, LoRA, ControlNet, IP-Adapter, CLIP-Vision or a second checkpoint;
- edit `extra_model_paths.yaml` automatically;
- touch E Manifest/control journals except evidence output;
- touch F assets;
- enable QA01 in Registry or Site Profile;
- run production inference.

Preferred target selection:

1. if the existing `extra_model_paths.yaml` already maps `D:\AI\MODELS\ComfyUI`, use `D:\AI\MODELS\ComfyUI\checkpoints`;
2. otherwise use the native portable path `D:\AI\APPS\ComfyUI_windows_portable\ComfyUI\models\checkpoints`;
3. do not rewrite model-path configuration merely to satisfy this Gate.

## Runtime values intentionally still pending

The following are **not** frozen from guesswork because `/object_info` was unavailable during the capability probe:

- exact native node availability;
- ComfyUI launch flag: `PENDING_POST_INSTALL_RUNTIME_PROBE`;
- sampler / scheduler: `PENDING_POST_INSTALL_RUNTIME_PROBE`;
- steps / CFG: `PENDING_POST_INSTALL_RUNTIME_PROBE`;
- seed policy: `PENDING_POST_INSTALL_RUNTIME_PROBE`;
- environment generation resolution: `PENDING_POST_INSTALL_RUNTIME_PROBE`;
- final canvas: `PENDING_STYLE_GATE`;
- shared product placement transform: `PENDING_STYLE_GATE`.

After the checkpoint is installed and ComfyUI is online, a post-install probe must prove effective checkpoint visibility plus native loader/sampler/VAE capability before any isolated Aquarium sample is submitted.

## Authorization boundary

Until post-install runtime evidence and one isolated Aquarium scene sample pass the human Exact Piece/style Gate:

`QA01 = NOT_REGISTERED / executable=false`

No production scene batch, Manifest mutation, F archive, custom-node installation, or full-image product redraw is authorized.
