#!/usr/bin/env python3
"""Stage exactly one human-approved SAM3.1 P3-B candidate for an isolated 3D trial.

Copies original RGB frames and binary masks without touching the sources.
Fails closed on evidence drift, missing/modified files, frame mismatch, or
non-empty output. Human approval is scoped to evaluation only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ITEM_ID = "DC-ZY-SZ-31001"
PILOT_ID = "P3B-M3D01-DC-ZY-SZ-31001"
RUN_NAME = "20261002-224710-sam31-30frame-evaluation-object-verified"
ITEM_ROOT = Path(r"E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\p3b\DC-ZY-SZ-31001")
SOURCE_FRAME_DIR = ITEM_ROOT / "20260930-211755-wood-mask-replacement" / "frames_raw"
EXPECTED_MANIFEST_SHA256 = "989e737bb02dc73f1cb36a7000f00d202c588dd6c3b4991118ec44a58552b85d"
CONTACTS = {
    "sam31_mask_contact_sheet.jpg": "dd9d0e93006fee305e687045362958ba9f8a4cb4b8d17264df5157ed01688c16",
    "sam31_masked_contact_sheet.jpg": "af51314377a5a350491509f823b564e414b485c63906f7f2576a2025105f7209",
    "sam31_delta_contact_sheet.jpg": "a5769f561103c62e858b55d7d90bd51ca705c885de097d377450256d5d918b9c",
}


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def demand(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError(code)


def validate_and_stage(manifest_path: Path, out: Path) -> dict:
    manifest_path = manifest_path.resolve()
    root = manifest_path.parent
    out = out.resolve()
    demand(root.name == RUN_NAME, "EVIDENCE_RUN_NAME_MISMATCH")
    demand(root.parent == ITEM_ROOT.resolve(), "EVIDENCE_ITEM_ROOT_MISMATCH")
    demand(manifest_path.name == "evaluation_manifest.json", "EVIDENCE_FILENAME_MISMATCH")
    demand(digest(manifest_path) == EXPECTED_MANIFEST_SHA256, "MANIFEST_SHA256_MISMATCH")
    demand(out != root and root not in out.parents, "OUTPUT_WITHIN_EVIDENCE_FORBIDDEN")
    demand(ITEM_ROOT.resolve() in out.parents, "OUTPUT_OUTSIDE_ITEM_ROOT_FORBIDDEN")
    demand(not out.exists() or (out.is_dir() and not any(out.iterdir())), "OUTPUT_NOT_EMPTY")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    track = manifest.get("tracking", {})
    demand(manifest.get("item_id") == ITEM_ID, "SKU_MISMATCH")
    demand(manifest.get("pilot_id") == PILOT_ID, "PILOT_MISMATCH")
    demand(manifest.get("authority") == "EVALUATION_ONLY", "AUTHORITY_MISMATCH")
    demand(manifest.get("production_registration") is False, "PRODUCTION_BOUNDARY")
    demand(manifest.get("archive_eligible") is False, "ARCHIVE_BOUNDARY")
    demand(manifest.get("source_frames_mutated") is False, "SOURCE_IDENTITY_STATUS")
    demand(track.get("accepted_count") == 30 and track.get("rejected_count") == 0, "AUTO_GATE_NOT_30_OF_30")
    demand(track.get("observed_output_frame_count") == 30, "TRACKER_OUTPUT_COUNT_MISMATCH")
    demand(track.get("propagation_direction") == "forward", "TRACKER_DIRECTION_MISMATCH")
    trace = track.get("per_frame_merge_trace", [])
    demand(len(trace) == 30 and all(
        x.get("frame_index") == i and x.get("returned_obj_ids") == [0]
        for i, x in enumerate(trace)
    ), "TRACKER_IDENTITY_DRIFT")
    rows = track.get("rows", [])
    demand(len(rows) == 30, "FRAME_COUNT_MISMATCH")
    demand(manifest.get("gate_state", {}).get("WOOD_ONLY_MASK") ==
        "SAM31_BENCHMARK_CANDIDATE_READY_HUMAN_GATE_REQUIRED", "AUTO_GATE_STATE_MISMATCH")

    for name, expected_hash in CONTACTS.items():
        current = root / name
        demand(current.is_file() and not current.is_symlink(), "CONTACT_MISSING_OR_LINK:" + name)
        demand(digest(current) == expected_hash, "CONTACT_HASH_DRIFT:" + name)

    source_root = SOURCE_FRAME_DIR.resolve()
    input_records = []
    for seq, row in enumerate(rows):
        demand(row.get("sequence") == seq and row.get("accepted") is True,
               "ROW_ORDER_OR_ACCEPTANCE:" + str(seq))
        frame = Path(row["source_file"]).resolve()
        mask = Path(row["mask_file"]).resolve()
        expected_frame = source_root / ("frame_%03d.png" % seq)
        expected_mask = root / "masks" / ("frame_%03d.png" % seq)
        demand(frame == expected_frame, "SOURCE_FRAME_PATH_MISMATCH:" + str(seq))
        demand(mask == expected_mask, "MASK_PATH_MISMATCH:" + str(seq))
        demand(frame.is_file() and mask.is_file(), "FRAME_OR_MASK_MISSING:" + str(seq))
        demand(not frame.is_symlink() and not mask.is_symlink(), "SOURCE_LINK_FORBIDDEN:" + str(seq))
        frame_hash = digest(frame)
        mask_hash = digest(mask)
        demand(frame_hash == row.get("source_sha256"), "FRAME_HASH_DRIFT:" + str(seq))
        with Image.open(frame) as rgb:
            size = rgb.size
            demand(rgb.mode in ("RGB", "RGBA"), "SOURCE_RGB_MODE_MISMATCH:" + str(seq))
        with Image.open(mask) as m:
            demand(m.mode == "L" and m.size == size, "MASK_SHAPE_OR_MODE:" + str(seq))
            colors = m.getcolors(maxcolors=256)
            demand(colors is not None and all(value in (0, 255) for _, value in colors),
                   "MASK_NOT_BINARY:" + str(seq))
            count = sum(freq for freq, value in colors if value == 255)
            demand(count > 0, "EMPTY_MASK:" + str(seq))
            demand(abs(count / (size[0] * size[1]) - float(row["area_ratio"])) < 1e-8,
                   "MASK_AREA_DRIFT:" + str(seq))
        input_records.append({
            "frame_index": seq, "source_path": str(frame), "mask_path": str(mask),
            "source_sha256": frame_hash, "mask_sha256": mask_hash,
            "mask_pixels": count, "width": size[0], "height": size[1],
        })

    # All validation completes BEFORE writing any trial files.
    out.mkdir(parents=True, exist_ok=True)
    (out / "images").mkdir()
    (out / "masks").mkdir()
    (out / "evidence").mkdir()
    for rec in input_records:
        name = "frame_%03d.png" % rec["frame_index"]
        image_dest = out / "images" / name
        mask_dest = out / "masks" / name
        shutil.copyfile(rec["source_path"], image_dest)
        shutil.copyfile(rec["mask_path"], mask_dest)
        demand(digest(image_dest) == rec["source_sha256"], "COPY_IMAGE_MISMATCH:" + name)
        demand(digest(mask_dest) == rec["mask_sha256"], "COPY_MASK_MISMATCH:" + name)
    shutil.copyfile(manifest_path, out / "evidence" / "evaluation_manifest.json")
    for name in CONTACTS:
        shutil.copyfile(root / name, out / "evidence" / name)
    demand(digest(manifest_path) == EXPECTED_MANIFEST_SHA256,
           "MANIFEST_CHANGED_DURING_STAGE")
    for rec in input_records:
        demand(digest(Path(rec["source_path"])) == rec["source_sha256"],
               "FRAME_CHANGED_DURING_STAGE:" + str(rec["frame_index"]))
        demand(digest(Path(rec["mask_path"])) == rec["mask_sha256"],
               "MASK_CHANGED_DURING_STAGE:" + str(rec["frame_index"]))
    receipt = {
        "schema_version": "1.0", "created_utc": datetime.now(timezone.utc).isoformat(),
        "pilot_id": PILOT_ID, "item_id": ITEM_ID, "authority": "EVALUATION_ONLY",
        "original_manifest_sha256": EXPECTED_MANIFEST_SHA256,
        "reviewed_contact_sheet_sha256": CONTACTS,
        "human_gate": {
            "state": "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY",
            "basis": "project owner replied 授予全部权限，连续推进 to the explicit question approving these masks and an isolated 3D reconstruction trial",
            "review_scope": "30-frame contact sheets; native-resolution support-foot residual risk recorded",
            "not_production_quality_attestation": True,
        },
        "source_mutated": False, "source_frames": 30,
        "trial_inputs": input_records,
        "trial_state": "INPUT_STAGED_ENGINE_PROBE_PENDING",
        "reconstruction_executed": False, "scale": "UNCALIBRATED",
        "asset_registry": "NOT_REGISTERED", "archive": "BLOCKED", "pdp": "UNCHANGED",
    }
    receipt_path = out / "approved_trial_input_manifest.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
    print("P3B_HUMAN_GATE=PASS_FOR_ISOLATED_3D_EVALUATION_ONLY", flush=True)
    print("STAGED_IMAGE_MASK_PAIRS=30", flush=True)
    print("TRIAL_INPUT_STAGE=PASS", flush=True)
    print("TRIAL_RECEIPT=" + str(receipt_path), flush=True)
    print("RECONSTRUCTION=NOT_YET_EXECUTED", flush=True)
    return receipt


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    try:
        validate_and_stage(args.manifest, args.out)
    except Exception as exc:
        print("TRIAL_INPUT_STAGE=FAIL", flush=True)
        print("error_type=" + type(exc).__name__, flush=True)
        print("error_summary=" + str(exc).splitlines()[0][:240], flush=True)
        print("RECONSTRUCTION=NOT_EXECUTED", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
