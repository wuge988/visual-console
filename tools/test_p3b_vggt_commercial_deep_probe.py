"""Offline P3-B Commercial VGGT deep-probe safety and evidence tests."""
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import p3b_vggt_commercial_deep_probe as probe


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CommercialDeepProbeContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "piece"
        self.stage = self.root / "approved"
        self.stage.mkdir(parents=True)
        (self.stage / "images").mkdir()
        (self.stage / "masks").mkdir()
        records = []
        for i in range(30):
            name = "frame_%03d.png" % i
            image = self.stage / "images" / name
            mask = self.stage / "masks" / name
            image.write_bytes(("image_" + name).encode())
            mask.write_bytes(("mask_" + name).encode())
            records.append({
                "frame_index": i, "width": 960, "height": 540,
                "source_sha256": digest(image), "mask_sha256": digest(mask),
            })
        self.receipt = self.stage / "approved_trial_input_manifest.json"
        self.receipt.write_text(json.dumps({
            "pilot_id": "P3B-M3D01-DC-ZY-SZ-31001",
            "item_id": probe.ITEM_ID,
            "human_gate": {"state": "PASS_FOR_ISOLATED_3D_EVALUATION_ONLY"},
            "reconstruction_executed": False, "trial_inputs": records,
        }))
        self.weight = (
            self.base / probe.MODEL_FOLDER / "snapshots" / "id" / "model.safetensors"
        )
        self.weight.parent.mkdir(parents=True)
        metadata = {"tensor.weight": {
            "dtype": "F32", "shape": [1], "data_offsets": [0, 4]
        }}
        encoded = json.dumps(metadata).encode()
        self.weight.write_bytes(struct.pack("<Q", len(encoded)) + encoded + b"abcd")
        self.first = self.stage / "engine_probe.json"
        self.first.write_text(json.dumps({
            "item_id": probe.ITEM_ID,
            "input_manifest_sha256": digest(self.receipt),
            "validated_staged_pairs": 30,
            "reconstruction_executed": False,
            "discovery": {"possible_checkpoint_files": [{
                "path": str(self.weight), "size_bytes": self.weight.stat().st_size
            }]},
        }))
        self.patches = [
            patch.object(probe, "PROJECT_ROOT", self.root),
            patch.object(probe, "EXPECTED_STAGE_NAME", "approved"),
            patch.object(probe, "RECEIPT_SHA", digest(self.receipt)),
            patch.object(probe, "FIRST_PROBE_SHA", digest(self.first)),
            patch.object(probe, "MODEL_BYTES", self.weight.stat().st_size),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def test_hash_pinned_stage_checks_thirty_pairs(self):
        receipt, first = probe.check_staged_inputs(self.stage)
        self.assertEqual(len(receipt["trial_inputs"]), 30)
        self.assertEqual(first["validated_staged_pairs"], 30)

    def test_staged_mask_tampering_fails_closed(self):
        (self.stage / "masks" / "frame_017.png").write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "STAGED_BYTES_DRIFT:17"):
            probe.check_staged_inputs(self.stage)

    def test_receipt_drift_fails_before_invoking_model(self):
        self.receipt.write_bytes(self.receipt.read_bytes() + b"\n")
        with self.assertRaisesRegex(RuntimeError, "RECEIPT_HASH_DRIFT"):
            probe.check_staged_inputs(self.stage)

    def test_valid_safetensors_header_requires_complete_payload(self):
        result = probe.safetensors_header(self.weight)
        self.assertEqual(result["num_tensors"], 1)
        self.assertEqual(result["tensor_dtypes"], {"F32": 1})
        self.assertIs(result["weights_loaded_to_cuda"], False)
        with self.weight.open("ab") as dest:
            dest.write(b"x")
        with patch.object(probe, "MODEL_BYTES", self.weight.stat().st_size):
            with self.assertRaisesRegex(RuntimeError, "PAYLOAD_BOUNDS"):
                probe.safetensors_header(self.weight)

    def test_read_only_probe_writes_one_additive_json_no_gpu_inference(self):
        with patch.object(probe, "module_inventory", return_value={
            "model_class_import": "FAIL_SOURCE_NOT_FOUND",
        }), patch.object(probe, "gpu_inventory", return_value={
            "cuda_available": False, "model_instantiated": False,
            "weights_loaded": False,
        }):
            out = self.stage / "engine_deep_probe_test.json"
            result = probe.run(self.stage, out)
        self.assertEqual(result, 0)
        row = json.loads(out.read_text())
        self.assertEqual(row["staged_pair_sha256_verified"], 30)
        self.assertIs(row["reconstruction_executed"], False)
        self.assertIs(row["model_forward_executed"], False)
        self.assertEqual(row["engine_entrypoint"], "NOT_SELECTED")
        with self.assertRaisesRegex(RuntimeError, "OUTPUT_ALREADY_EXISTS"):
            probe.run(self.stage, out)

    def test_venv_is_not_scanned_and_launcher_is_terminal_safe(self):
        root = self.base / "tools"
        (root / "venv-py310").mkdir(parents=True)
        (root / "venv-py310" / "train.py").write_text("unsafe")
        (root / "reconstruct.py").write_text("candidate")
        row = probe.scan_candidate_sources([root])
        self.assertEqual(row["candidate_files"], [str(root / "reconstruct.py")])
        text = (
            Path(__file__).parent / "P3B_VGGT_COMMERCIAL_DEEP_PROBE_WINDOWS.ps1"
        ).read_text(encoding="utf-8")
        for banned in ('$ErrorActionPreference = "Stop"', "throw ", "exit ",
                       "git fetch", "hf_hub_download"):
            self.assertNotIn(banned, text)


if __name__ == "__main__":
    unittest.main()
