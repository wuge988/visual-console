# P5 QA01 Capability Decision Template

Packet: `VC-P5-QA01-AQUARIUM-001`
Status: `WAITING_FOR_TARGET_WINDOWS_PROBE`

Fill this document only from a real `P5_QA01_CAPABILITY_PROBE=PASS` report.

## Machine evidence

- Probe head: `PENDING`
- GPU / VRAM: `PENDING`
- D free space: `PENDING`
- ComfyUI object_info: `PENDING`
- Installed checkpoints: `PENDING`
- SDXL-like checkpoints: `PENDING`
- IP-Adapter node/models: `PENDING`
- CLIP-Vision models: `PENDING`
- ControlNet node/models: `PENDING`
- VAE/inpaint nodes: `PENDING`

## Selected path

`PENDING: A / B / C`

The selected path must be the lowest-complexity viable route that can generate only the Aquarium environment while keeping the verified SC01 subject as a deterministic final product layer.

## Model/runtime freeze

No values may be filled from guesswork. After the real capability report, freeze only the components actually selected for the isolated sample:

- checkpoint/model: `PENDING`
- workflow/node set: `PENDING`
- low-VRAM mode: `PENDING`
- sampler / scheduler: `PENDING`
- steps / CFG: `PENDING`
- seed policy: `PENDING`
- environment generation resolution: `PENDING`
- final canvas: `PENDING_STYLE_GATE`
- shared product placement transform: `PENDING_STYLE_GATE`

## Authorization boundary

Until this template is completed from target-machine evidence and the isolated scene sample is visually approved:

`QA01 = NOT_REGISTERED / executable=false`

No production scene batch, Manifest mutation, F archive, model download, custom-node installation, or full-image product redraw is authorized by this document.
