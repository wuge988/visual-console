# P5 QA01 Capability Probe Review Checklist

Date: 2026-08-27
Packet: `VC-P5-QA01-AQUARIUM-001`
Branch: `feat/p5-qa01-scene-freeze`

This checklist records the repository-side acceptance criteria for the read-only target-Windows capability probe. It intentionally does not select or install a generative model.

## Probe acceptance

A valid probe run must show:

- `P5_QA01_CAPABILITY_PROBE=PASS`;
- exact branch `feat/p5-qa01-scene-freeze` and clean worktree;
- `qa01_enabled=false` in the evidence JSON;
- GPU/VRAM inventory, D free-space inventory and ComfyUI install-root presence;
- installed checkpoint filenames and SDXL-like checkpoint count;
- IP-Adapter node/model and CLIP-Vision inventory;
- ControlNet node/model inventory;
- VAE/inpaint node availability;
- evidence written only below the existing `control_root/evidence` directory.

## Fail-closed interpretation

The probe is capability inventory, not production authorization.

- `ComfyUI offline` is not itself a destructive failure; filesystem inventory remains useful, but node truth is incomplete.
- Missing checkpoint or conditioning component means `MISSING_CAPABILITY`, not permission to install automatically.
- No model/runtime is promoted from filename heuristics alone.
- QA01 remains `NOT_REGISTERED / executable=false` until an isolated sample workflow and human Exact Piece scene Gate pass.

## Path selection after probe

- Path A: suitable installed checkpoint + necessary native/basic nodes are present → construct the smallest isolated Aquarium background sample workflow.
- Path B: suitable checkpoint exists but optional conditioning components are absent → test text/background generation first; only add conditioning if placement/style control is inadequate.
- Path C: no viable static-image checkpoint exists → produce one bounded minimal-install plan before any download.

Regardless of path, the final QA01 asset must preserve the verified SC01 subject as a deterministic product layer. No full-image product redraw is authorized in QA01 v1.
