# P3-B: VGGT Commercial next gate, no model forward yet

Status: `READ_ONLY_DEEP_PROBE_READY`; source: approved 30-pair stage from `20261003-001219`.

## Grounded local findings

The user-provided `approved_trial_input_manifest.json` has 30 indexed, size-consistent 960 × 540 RGB/mask pairs. The initial `engine_probe.json` references its exact SHA-256 and verifies all 30 copies. Python is `D:\AI\TOOLS\DC_Video2Twin\venv-py310\Scripts\python.exe`, 3.10.21, with Torch `2.9.1+cu128`, gsplat `1.5.3`, VGGT distribution `0.0.1`, NVIDIA RTX 3060 Ti (8 GB). The initial `vggt` top-level module origin was null, and no local reconstruction runner was identified. The only discovered model checkpoint was the locally cached `facebook/VGGT-1B-Commercial` `model.safetensors` of `5,026,367,224` bytes.

Local approval receipt SHA-256:
`5fe8c92c7476e70e1f7e6bd3139efa251383ebd986449743b330a37b1ad46b27`.
Local first engine probe SHA-256:
`d651f44adef0679f273e84ae70e06138ac36a372687d9d856223889e4a31e7f9`.

## Official upstream compatibility boundaries

Meta's official VGGT main SHA inspected while preparing this gate:
`a288dd0f14786c93483e45524328726ab7b1b4ce`.

- Official model API is `from vggt.models.vggt import VGGT`, with `vggt.utils.load_fn` helpers.
- The official `demo_colmap.py` as inspected imports `pycolmap`, includes a TODO to add segmentation mask support, and **defaults to downloading `facebook/VGGT-1B` original weights**. It must **not** be run unchanged for this project: the original checkpoint is noncommercial and the currently staged background/support inputs need a mask-aware path.
- Meta's commercial model card says `facebook/VGGT-1B-Commercial` is the designated separately licensed commercial checkpoint, with military-use exclusions and additional terms in `VGGT License`. A locally cached file proves neither user license acceptance nor complete compliance. Use only the cached Commercial checkpoint, subject to applicable terms.
- Neither a `vggt==0.0.1` installed-distribution record nor a 5 GB safetensors file alone proves the model class, matching source version or acceptable 8-GB CUDA feasibility.

## Approved new gate

`tools/P3B_VGGT_COMMERCIAL_DEEP_PROBE_WINDOWS.ps1` invokes
`tools/p3b_vggt_commercial_deep_probe.py` under the existing local venv.

Before any output write, it checks the exact two prior file hashes; full byte
identities of all 30 staged frame/mask copies; the one exact Commercial
checkpoint path and byte length; safetensors header/payload bounds; actual
`vggt.models.vggt` module import; local package installation metadata; a
bounded source/entrypoint scan without traversing old virtualenvs; current
available VRAM and available system RAM.

It writes only one additive `engine_deep_probe_*.json` into the isolated stage.
It must not load Commercial weights into CPU/GPU memory, instantiate VGGT,
download models, install pycolmap, run reconstruction, or mutate existing source
assets.

## Following stage (conditional)

On validated local probe evidence, select the *actual* installed VGGT module
and exclusively pinned local Commercial checkpoint, and then construct a
small (2–4 view) mask-neutralized test with a strict RTX 3060 Ti VRAM gate.
Record whether 3D camera/depth outputs are consistent with turntable
object-centric reconstruction and reject background-derived geometry; no
automatic jump to all 30 views or gsplat optimization. If source import,
license compliance, GPU headroom, mask semantics or model-loader compatibility
remain uncertain, stay blocked and report the exact issue.

The project remains `EVALUATION_ONLY`, with 3D pipeline separated from
production archive, PDP and commerce.
