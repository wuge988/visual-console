"""Stdlib-only tests for the diagnostic-only SAM3.1 uncached-mask adapter."""
import unittest
from pathlib import Path

from sam31_uncached_mask_merge_diagnostic import (
    install_uncached_refined_mask_diagnostic,
)


class FakeNumber:
    def __init__(self, count):
        self.count = count

    def item(self):
        return self.count


class FakeMask:
    def __init__(self, count):
        self.count = count

    def sum(self):
        return FakeNumber(self.count)


class OfficialShapeFake:
    def _build_sam2_output(
        self, inference_state, frame_idx, refined_obj_id_to_mask=None
    ):
        if not frame_idx in inference_state["cached_frame_outputs"]:
            return {}
        cached_outputs = inference_state["cached_frame_outputs"][frame_idx]
        obj_id_to_mask = cached_outputs.copy()
        if refined_obj_id_to_mask is not None:
            for obj_id, refined_mask in refined_obj_id_to_mask.items():
                assert refined_mask is not None
                obj_id_to_mask[obj_id] = refined_mask
        return obj_id_to_mask


class ChangedUpstreamFake:
    def _build_sam2_output(
        self, inference_state, frame_idx, refined_obj_id_to_mask=None
    ):
        return dict(refined_obj_id_to_mask or {})


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.model = OfficialShapeFake()
        self.trace = {}

    def test_uncached_valid_refined_mask_is_merged(self):
        policy = install_uncached_refined_mask_diagnostic(self.model, self.trace)
        self.assertEqual(policy, "USE_REFINED_MASKS_ON_UNCACHED_FRAME_ONLY")
        raw = {0: FakeMask(55)}
        result = self.model._build_sam2_output(
            {"cached_frame_outputs": {}}, 1, raw
        )
        self.assertEqual(result, raw)
        self.assertIsNot(result, raw)
        self.assertEqual(
            self.trace[1]["raw_refined_mask_pixels"], {"0": 55}
        )
        self.assertTrue(self.trace[1]["uncached_merge_applied"])
        self.assertEqual(self.trace[1]["merged_obj_ids"], [0])

    def test_cached_frame_uses_official_merge_path(self):
        install_uncached_refined_mask_diagnostic(self.model, self.trace)
        existing = FakeMask(12)
        new = FakeMask(34)
        result = self.model._build_sam2_output(
            {"cached_frame_outputs": {2: {7: existing}}}, 2, {0: new}
        )
        self.assertIs(result[7], existing)
        self.assertIs(result[0], new)
        self.assertFalse(self.trace[2]["uncached_merge_applied"])
        self.assertEqual(self.trace[2]["cached_obj_ids_before_merge"], [7])

    def test_uncached_without_raw_mask_remains_empty(self):
        install_uncached_refined_mask_diagnostic(self.model, self.trace)
        result = self.model._build_sam2_output(
            {"cached_frame_outputs": {}}, 3, {}
        )
        self.assertEqual(result, {})
        self.assertFalse(self.trace[3]["uncached_merge_applied"])
        self.assertEqual(self.trace[3]["raw_refined_mask_pixels"], {})

    def test_zero_pixel_mask_is_not_fabricated_into_positive(self):
        install_uncached_refined_mask_diagnostic(self.model, self.trace)
        raw = {0: FakeMask(0)}
        result = self.model._build_sam2_output(
            {"cached_frame_outputs": {}}, 4, raw
        )
        self.assertIs(result[0], raw[0])
        self.assertEqual(self.trace[4]["raw_refined_mask_pixels"], {"0": 0})

    def test_unknown_upstream_guard_fails_closed(self):
        model = ChangedUpstreamFake()
        with self.assertRaisesRegex(RuntimeError, "UPSTREAM_GUARD_CHANGED"):
            install_uncached_refined_mask_diagnostic(model, {})
        self.assertEqual(model._build_sam2_output({}, 0), {})

    def test_reinstall_fails_closed(self):
        install_uncached_refined_mask_diagnostic(self.model, self.trace)
        with self.assertRaisesRegex(RuntimeError, "ALREADY_INSTALLED"):
            install_uncached_refined_mask_diagnostic(self.model, {})

    def test_only_six_frame_diagnostic_instruments_compat(self):
        root = Path(__file__).resolve().parent
        diag = (root / "p3b_sam31_six_frame_diagnostic.py").read_text(
            encoding="utf-8"
        )
        full = (root / "p3b_sam31_video_benchmark.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("install_uncached_refined_mask_diagnostic", diag)
        self.assertIn('"merge_trace": merge_trace.get(idx)', diag)
        self.assertIn('"acceptance_gate_executed": False', diag)
        self.assertIn('"reconstruction": "BLOCKED"', diag)
        self.assertNotIn("install_uncached_refined_mask_diagnostic", full)


if __name__ == "__main__":
    unittest.main()
