#!/usr/bin/env python3
"""Fail-closed runtime patcher for the pinned recon3d donor used by P5 v4.

The donor remains an external MIT project. This patcher operates only on a fresh
clone at the frozen commit and records exact provenance. It prevents accidental
use of the non-production VGGT checkpoint and constrains the 3DGS pilot to the
automatically isolated driftwood foreground.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

EXPECTED_RECON3D_COMMIT = "59fe356bceab74ef7d5839b68aba232bce20e14d"
COMMERCIAL_MODEL_ID = "facebook/VGGT-1B-Commercial"
FORBIDDEN_MODEL_ID = "facebook/VGGT-1B"
GRAY_VALUE_EXPR = "(127.0 / 255.0)"
GRAY_TOLERANCE = "0.03"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def replace_exact(text: str, old: str, new: str, expected_count: int, label: str) -> str:
    count = text.count(old)
    if count != expected_count:
        raise RuntimeError(f"PATCH_SOURCE_MISMATCH:{label}:expected={expected_count}:actual={count}")
    return text.replace(old, new)


def git_output(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"GIT_FAILED:{' '.join(args)}:{proc.stderr.strip()}")
    return proc.stdout.strip()


def patch_file(path: Path, transforms: list[tuple[str, str, int, str]]) -> dict[str, str]:
    before = path.read_text(encoding="utf-8")
    after = before
    for old, new, count, label in transforms:
        after = replace_exact(after, old, new, count, label)
    if after == before:
        raise RuntimeError(f"PATCH_NO_CHANGE:{path}")
    path.write_text(after, encoding="utf-8", newline="\n")
    return {
        "path": str(path),
        "before_sha256": sha256_text(before),
        "after_sha256": sha256_text(after),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="fresh pinned recon3d clone")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    if not (repo / ".git").exists():
        raise SystemExit(f"RECON3D_GIT_DIR_MISSING:{repo}")

    head = git_output(repo, "rev-parse", "HEAD")
    if head != EXPECTED_RECON3D_COMMIT:
        raise SystemExit(f"RECON3D_HEAD_MISMATCH:expected={EXPECTED_RECON3D_COMMIT}:actual={head}")

    dirty_before = git_output(repo, "status", "--porcelain=v1", "--untracked-files=all")
    if dirty_before:
        raise SystemExit(f"RECON3D_CLONE_NOT_CLEAN:{dirty_before.replace(chr(10), ' | ')}")

    pose = repo / "recon3d" / "pose_estimation.py"
    chunked = repo / "recon3d" / "chunked_vggt.py"
    train = repo / "recon3d" / "gaussian_train.py"
    for path in (pose, chunked, train):
        if not path.is_file():
            raise SystemExit(f"RECON3D_REQUIRED_FILE_MISSING:{path}")

    point_old = """            valid = c > conf_threshold\n            all_points.append(pts[valid])\n            all_colors.append(colors[valid])"""
    point_new = f"""            foreground = np.max(np.abs(colors - {GRAY_VALUE_EXPR}), axis=1) > {GRAY_TOLERANCE}\n            valid = (c > conf_threshold) & foreground\n            all_points.append(pts[valid])\n            all_colors.append(colors[valid])"""

    files: list[dict[str, str]] = []
    files.append(
        patch_file(
            pose,
            [
                (
                    'model = VGGT.from_pretrained("facebook/VGGT-1B").to(device)',
                    f'model = VGGT.from_pretrained("{COMMERCIAL_MODEL_ID}").to(device)',
                    1,
                    "pose_commercial_model",
                ),
                (point_old, point_new, 1, "pose_foreground_point_filter"),
            ],
        )
    )

    chunk_point_old = """            valid = c > conf_threshold\n            all_points.append(pts[valid])\n            all_colors.append(colors[valid])"""
    chunk_point_new = point_new
    files.append(
        patch_file(
            chunked,
            [
                (
                    'model = VGGT.from_pretrained("facebook/VGGT-1B").to(device)',
                    f'model = VGGT.from_pretrained("{COMMERCIAL_MODEL_ID}").to(device)',
                    1,
                    "chunked_commercial_model",
                ),
                (chunk_point_old, chunk_point_new, 1, "chunked_foreground_point_filter"),
            ],
        )
    )

    l1_old = """        l1_loss = F.l1_loss(rendered, gt_image)\n        loss = (1 - config.ssim_weight) * l1_loss"""
    l1_new = f"""        foreground = torch.max(torch.abs(gt_image - {GRAY_VALUE_EXPR}), dim=-1).values > {GRAY_TOLERANCE}\n        if not torch.any(foreground):\n            raise RuntimeError(\"DC_VIDEO2TWIN_EMPTY_FOREGROUND_TRAINING_FRAME\")\n        l1_loss = torch.abs(rendered - gt_image)[foreground].mean()\n        loss = (1 - config.ssim_weight) * l1_loss"""
    files.append(
        patch_file(
            train,
            [
                ("    ssim_weight: float = 0.2", "    ssim_weight: float = 0.0", 1, "disable_unmasked_ssim"),
                (l1_old, l1_new, 1, "foreground_only_l1"),
            ],
        )
    )

    # No accidental noncommercial VGGT reference may remain in executable donor code.
    remaining = []
    for path in (pose, chunked):
        text = path.read_text(encoding="utf-8")
        if f'"{FORBIDDEN_MODEL_ID}"' in text:
            remaining.append(str(path))
        if f'"{COMMERCIAL_MODEL_ID}"' not in text:
            raise SystemExit(f"COMMERCIAL_MODEL_PATCH_MISSING:{path}")
    if remaining:
        raise SystemExit("FORBIDDEN_VGGT_MODEL_REMAINS:" + ",".join(remaining))

    provenance = {
        "schema_version": "1.0",
        "patch": "DRIFT_CURIO_P5_V4_VIDEO2TWIN",
        "upstream_repo": "jashshah999/recon3d",
        "upstream_commit": EXPECTED_RECON3D_COMMIT,
        "commercial_model_id": COMMERCIAL_MODEL_ID,
        "forbidden_model_id": FORBIDDEN_MODEL_ID,
        "neutral_gray_rgb": [127, 127, 127],
        "neutral_gray_tolerance_0_1": float(GRAY_TOLERANCE),
        "ssim_weight": 0.0,
        "mast3r_enabled_for_pilot": False,
        "files": files,
    }
    marker = repo / ".dc_video2twin_patch.json"
    marker.write_text(json.dumps(provenance, indent=2), encoding="utf-8")

    print("P5_QA01_V4_RECON3D_PATCH=PASS")
    print(f"upstream_commit={EXPECTED_RECON3D_COMMIT}")
    print(f"commercial_model_id={COMMERCIAL_MODEL_ID}")
    print("forbidden_model_fallback=false")
    print("foreground_only_point_cloud=true")
    print("foreground_only_l1=true")
    print("ssim_weight=0.0")
    print(f"provenance={marker}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
