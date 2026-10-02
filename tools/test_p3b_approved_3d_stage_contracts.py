"""Stdlib-only regression tests for P3-B approved trial staging and inventory."""
import hashlib
import importlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

# GitHub CI does not need Pillow/torch; simulated images exercise staging
# invariants. Actual local runtime uses the already verified Pillow install.
try:
    import PIL  # noqa: F401
except ImportError:
    stub = types.ModuleType("PIL")
    stub.Image = types.SimpleNamespace(open=lambda path: None)
    sys.modules["PIL"] = stub

import p3b_sam31_approved_recon_input as staging
import p3b_reconstruction_engine_probe as inventory


class DummyImage:
    def __init__(self, is_mask):
        self.mode = "L" if is_mask else "RGB"
        self.size = (4, 4)
        self._mask = is_mask

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def getcolors(self, maxcolors=256):
        return [(12, 0), (4, 255)] if self._mask else None


class ApprovedStageContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.item = Path(self.temp.name) / "piece"
        self.run = self.item / "approved-run"
        self.source = self.item / "raw" / "frames_raw"
        self.out = self.item / "new-eval"
        self.run.mkdir(parents=True)
        self.source.mkdir(parents=True)
        (self.run / "masks").mkdir()
        self.contacts = {}
        for name in staging.CONTACTS:
            p = self.run / name
            p.write_bytes(("contact:" + name).encode())
            self.contacts[name] = staging.digest(p)
        rows = []
        for i in range(30):
            name = "frame_%03d.png" % i
            frame, mask = self.source / name, self.run / "masks" / name
            frame.write_bytes(("frame:" + name).encode())
            mask.write_bytes(("mask:" + name).encode())
            rows.append({
                "sequence": i,
                "accepted": True,
                "source_file": str(frame),
                "source_sha256": staging.digest(frame),
                "mask_file": str(mask),
                "area_ratio": 0.25,
            })
        self.fixture = {
            "item_id": staging.ITEM_ID, "pilot_id": staging.PILOT_ID,
            "authority": "EVALUATION_ONLY",
            "production_registration": False, "archive_eligible": False,
            "source_frames_mutated": False,
            "tracking": {
                "accepted_count": 30, "rejected_count": 0,
                "observed_output_frame_count": 30,
                "propagation_direction": "forward",
                "per_frame_merge_trace": [
                    {"frame_index": i, "returned_obj_ids": [0]}
                    for i in range(30)
                ],
                "rows": rows,
            },
            "gate_state": {
                "WOOD_ONLY_MASK": "SAM31_BENCHMARK_CANDIDATE_READY_HUMAN_GATE_REQUIRED",
            },
        }
        self.mp = self.run / "evaluation_manifest.json"
        self.mp.write_text(json.dumps(self.fixture), encoding="utf-8")
        self.patchers = [
            patch.object(staging, "ITEM_ROOT", self.item),
            patch.object(staging, "SOURCE_FRAME_DIR", self.source),
            patch.object(staging, "RUN_NAME", "approved-run"),
            patch.object(staging, "EXPECTED_MANIFEST_SHA256", staging.digest(self.mp)),
            patch.object(staging, "CONTACTS", self.contacts),
            patch.object(staging.Image, "open",
                         side_effect=lambda path: DummyImage(
                             Path(path).parent.name == "masks"
                         )),
        ]
        for p in self.patchers:
            p.start()
            self.addCleanup(p.stop)

    def test_approved_stage_copies_exactly_thirty_pairs_without_mutation(self):
        before = [staging.digest(Path(r["source_file"]))
                  for r in self.fixture["tracking"]["rows"]]
        receipt = staging.validate_and_stage(self.mp, self.out)
        self.assertEqual(len(list((self.out / "images").glob("*.png"))), 30)
        self.assertEqual(len(list((self.out / "masks").glob("*.png"))), 30)
        self.assertEqual(receipt["source_frames"], 30)
        self.assertTrue(receipt["human_gate"]["not_production_quality_attestation"])
        self.assertEqual(receipt["archive"], "BLOCKED")
        self.assertEqual(receipt["pdp"], "UNCHANGED")
        after = [staging.digest(Path(r["source_file"]))
                 for r in self.fixture["tracking"]["rows"]]
        self.assertEqual(before, after)
        with self.assertRaisesRegex(ValueError, "OUTPUT_NOT_EMPTY"):
            staging.validate_and_stage(self.mp, self.out)

    def test_manifest_hash_drift_fails_before_writes(self):
        self.mp.write_text(self.mp.read_text() + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "MANIFEST_SHA256_MISMATCH"):
            staging.validate_and_stage(self.mp, self.out)
        self.assertFalse(self.out.exists())

    def test_contact_hash_drift_fails_before_writes(self):
        (self.run / next(iter(self.contacts))).write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "CONTACT_HASH_DRIFT"):
            staging.validate_and_stage(self.mp, self.out)
        self.assertFalse(self.out.exists())

    def test_frame_hash_drift_fails_before_writes(self):
        (self.source / "frame_010.png").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "FRAME_HASH_DRIFT:10"):
            staging.validate_and_stage(self.mp, self.out)
        self.assertFalse(self.out.exists())

    def test_trace_id_mismatch_fails_before_writes(self):
        self.fixture["tracking"]["per_frame_merge_trace"][18]["returned_obj_ids"] = []
        self.mp.write_text(json.dumps(self.fixture), encoding="utf-8")
        with patch.object(staging, "EXPECTED_MANIFEST_SHA256", staging.digest(self.mp)):
            with self.assertRaisesRegex(ValueError, "TRACKER_IDENTITY_DRIFT"):
                staging.validate_and_stage(self.mp, self.out)
        self.assertFalse(self.out.exists())

    def test_engine_probe_verifies_staged_copy_and_cannot_run_reconstruction(self):
        staging.validate_and_stage(self.mp, self.out)
        probe = inventory.probe(
            self.out, self.item / "no_tools", self.item / "no_models"
        )
        self.assertEqual(probe["validated_staged_pairs"], 30)
        self.assertEqual(probe["engine_adapter"], "NOT_YET_IDENTIFIED_OR_VALIDATED")
        self.assertIs(probe["reconstruction_executed"], False)
        (self.out / "masks" / "frame_018.png").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "STAGED_PAIR_HASH_DRIFT:18"):
            inventory.probe(self.out, self.item / "no_tools",
                            self.item / "no_models")

    def test_windows_launcher_is_terminal_safe_and_never_runs_engine(self):
        path = Path(__file__).parent / "P3B_SAM31_APPROVED_3D_STAGE_WINDOWS.ps1"
        script = path.read_text(encoding="utf-8")
        self.assertIn("TERMINAL_REMAINS_OPEN", script)
        self.assertIn("p3b_sam31_approved_recon_input.py", script)
        self.assertIn("p3b_reconstruction_engine_probe.py", script)
        for banned in ('$ErrorActionPreference = "Stop"', "throw ", "exit "):
            self.assertNotIn(banned, script)
        self.assertNotIn("git fetch", script.lower())
        self.assertNotIn("hf_hub_download", script)


if __name__ == "__main__":
    unittest.main()
