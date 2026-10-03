"""Stdlib-only regression contracts for the P3-B CPU meta compatibility gate."""
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import p3b_vggt_commercial_meta_compat as probe


class CompatContracts(unittest.TestCase):
    def test_shape_compare_success_and_failures(self):
        equal = probe.compare_shapes({"a": (2, 3), "b": (4,)},
                                     {"a": (2, 3), "b": (4,)})
        self.assertTrue(equal["exact_match"])
        wrong = probe.compare_shapes({"a": (2, 3), "b": (4,)},
                                     {"a": (2, 4), "extra": (9,)})
        self.assertFalse(wrong["exact_match"])
        self.assertEqual(wrong["missing_in_installed_model_count"], 1)
        self.assertEqual(wrong["extra_in_installed_model_count"], 1)
        self.assertEqual(wrong["shape_mismatch_count"], 1)

    def test_safetensors_header_no_tensor_load(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "model.safetensors"
            header = json.dumps({
                "weights.a": {"dtype": "F32", "shape": [2],
                              "data_offsets": [0, 8]},
                "weights.b": {"dtype": "F32", "shape": [1],
                              "data_offsets": [8, 12]},
            }).encode()
            path.write_bytes(struct.pack("<Q", len(header)) + header + b"x" * 12)
            with patch.object(probe, "CHECKPOINT_BYTES", path.stat().st_size), \
                 patch.object(probe, "EXPECTED_TENSORS", 2):
                self.assertEqual(probe.header_metadata(path),
                                 {"weights.a": (2,), "weights.b": (1,)})
                # On-disk gap must fail before any simulated model allocation.
                gap = json.dumps({
                    "weights.a": {"dtype": "F32", "shape": [2],
                                  "data_offsets": [0, 8]},
                    "weights.b": {"dtype": "F32", "shape": [1],
                                  "data_offsets": [12, 16]},
                }).encode()
                path.write_bytes(struct.pack("<Q", len(gap)) + gap + b"x" * 16)
                with patch.object(probe, "CHECKPOINT_BYTES",
                                  path.stat().st_size):
                    with self.assertRaisesRegex(RuntimeError, "PAYLOAD_GAP_OR_OVERLAP"):
                        probe.header_metadata(path)

    def test_source_and_windows_gate_never_execute_gpu_model(self):
        source = (Path(__file__).parent /
                  "p3b_vggt_commercial_meta_compat.py").read_text(encoding="utf-8")
        ps1 = (Path(__file__).parent /
               "P3B_VGGT_META_COMPAT_WINDOWS.ps1").read_text(encoding="utf-8")
        self.assertIn('with torch.device("meta"):', source)
        self.assertIn('torch_weights_loaded": False', source)
        self.assertIn('"forward_executed": False', source)
        self.assertIn('STAGE_RECEIPT_SHA =', source)
        self.assertIn('DEEP_INVENTORY_SHA =', source)
        self.assertIn('EXPECTED_TENSORS = 1797', source)
        self.assertIn('TORCH', source.upper())
        for banned in (
            "torch.load(", ".from_pretrained(", "hf_hub_download(",
            "load_state_dict(", "model.to(", "model.cuda(",
        ):
            self.assertNotIn(banned, source)
        for banned in ('$ErrorActionPreference = "Stop"', "throw ", "exit ",
                       "git fetch", "hf_hub_download"):
            self.assertNotIn(banned, ps1)
        self.assertIn("TERMINAL_REMAINS_OPEN", ps1)


if __name__ == "__main__":
    unittest.main()
