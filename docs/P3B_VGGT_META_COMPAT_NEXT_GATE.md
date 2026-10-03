# P3-B: Meta-only Commercial checkpoint/source compatibility gate

Status: `READY_FOR_READ_ONLY_LOCAL_RUNTIME_VALIDATION` (2026-10-03).

The previous user-uploaded `engine_deep_probe_offline_20261003-131150.json` conclusively verified 30 hash-matched isolated input pairs and detected one cached `facebook/VGGT-1B-Commercial` safetensors checkpoint, 5,026,367,224 bytes, 1,797 tensors all `F32`. The installed `vggt.models.vggt.VGGT` import succeeds from the existing Py3.10 Video2Twin venv, but none of the five scanned candidate files is a reconstruction entrypoint. RTX 3060 Ti had 6.96 GiB free of 8 GiB total at that read-only inventory point. Prior probe did **not** validate the checkpoint tensor names/shapes against the installed model or execute a forward pass.

New read-only safety gate:
- Pin the exact approved stage receipt `5fe8c92c7476e70e1f7e6bd3139efa251383ebd986449743b330a37b1ad46b27` and latest uploaded deep-inventory SHA-256 `b34384a36807fd8ae8efd87b626772334b7c6e6fb3186e765a3d4a8f1efcf34f`.
- Verify all 30 staged RGB/mask byte hashes before proceeding; validate checkpoint path, byte size and complete F32 safetensors header payload offsets.
- **Only** instantiate `VGGT()` under `torch.device("meta")`, reject any non-meta persistent model tensor, compare *all* expected state_dict keys and shapes with the checkpoint header; do not instantiate or load a real FP32/FP16 model.
- Hash the complete cached checkpoint (read-only) to establish exact provenance. Record installed model source code SHA-256, match results, available VRAM and theoretical FP16 parameter bytes **excluding activation/workspace**, with a fresh additive JSON receipt.
- No network, downloads, installs, GPU model allocation, inference, gsplat training, automatic archive or PDP change. Failure must leave existing evidence intact.
- Official upstream COLMAP demo is unsuitable as-is: it imports currently missing `pycolmap`, has no native mask support and defaults to **original** noncommercial weights. The local isolated masked turntable pilot must exclusively reference the licensed Commercial checkpoint and an explicitly engineered masked input path.
- Commercial license acceptance and exact business compliance remain unverified by local files and are a separate gate, even if the technical source/checkpoint match succeeds.

If full meta compatibility passes and applicable Commercial model terms are confirmed, prepare **one separately bounded 2-view GPU feasibility smoke**. It should neutralize non-wood pixels before model preprocessing, strictly budget FP16 weights + activations on the 8-GiB RTX 3060 Ti, and examine only camera/depth predictions with no training, giant 30-view forward, pycolmap install or production model export until evidence supports such escalation.

The original 30-frame input stage, earlier mask experiments, Visual Console shared control-plane design, approved 2D PDP, Asset Registry, Archive and all public commerce data are unchanged.
