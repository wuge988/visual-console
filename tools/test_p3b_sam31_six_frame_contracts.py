"""Static P3-B six-frame SAM3.1 diagnosis and no-false-stability contracts."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIAG = ROOT / "p3b_sam31_six_frame_diagnostic.py"
GATE = ROOT / "P3B_SAM31_SIX_FRAME_DIAG_GATE.ps1"
BENCH = ROOT / "p3b_sam31_video_benchmark.py"


class SixFrameDiagnosticContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.diagnostic = DIAG.read_text(encoding="utf-8")
        cls.diagnostic_tree = ast.parse(cls.diagnostic, filename=str(DIAG))
        cls.gate = GATE.read_text(encoding="utf-8")
        cls.benchmark = BENCH.read_text(encoding="utf-8")
        ast.parse(cls.benchmark, filename=str(BENCH))

    def test_exact_six_frame_limit_and_forward_only(self):
        assign = [
            node for node in self.diagnostic_tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(t, ast.Name) and t.id == "DIAGNOSTIC_FRAME_LIMIT"
                for t in node.targets
            )
        ]
        self.assertEqual(len(assign), 1)
        self.assertEqual(ast.literal_eval(assign[0].value), 6)
        self.assertIn('"propagation_direction": "forward"', self.diagnostic)
        self.assertIn('"start_frame_index": 0', self.diagnostic)
        self.assertIn('"max_frame_num_to_track": DIAGNOSTIC_FRAME_LIMIT', self.diagnostic)
        self.assertIn("rows = parent_rows[:DIAGNOSTIC_FRAME_LIMIT]", self.diagnostic)

    def test_diagnostic_captures_ids_and_internal_filters(self):
        for token in (
            '"out_obj_ids"',
            '"tracker_obj_ids"',
            '"cached_obj_ids"',
            '"cached_mask_pixels"',
            '"suppressed_obj_ids"',
            '"removed_obj_ids"',
            '"tracker_state_obj_ids"',
            '"objects_after_text"',
            '"objects_after_refine"',
            '"selected_obj_present"',
        ):
            self.assertIn(token, self.diagnostic)
        self.assertIn("tmp.replace(mp)", self.diagnostic)

    def test_no_quality_gate_or_production_widening(self):
        for token in (
            '"diagnostic_only": True',
            '"acceptance_gate_executed": False',
            '"production_registration": False',
            '"pdp_blocking": False',
            '"archive_eligible": False',
            '"reconstruction": "BLOCKED"',
            '"source_frames_mutated"] = False',
        ):
            self.assertIn(token, self.diagnostic)
        self.assertNotIn('P3B_SAM31_VIDEO_BENCHMARK_AUTO_CANDIDATE=PASS', self.diagnostic)

    def test_terminal_safe_gate(self):
        self.assertIn('$ErrorActionPreference = "Continue"', self.gate)
        self.assertIn('propagation_direction=forward', self.gate)
        self.assertIn('max_frames=6', self.gate)
        self.assertIn('RECONSTRUCTION=BLOCKED', self.gate)
        for forbidden in ('throw ', 'exit ', '$ErrorActionPreference = "Stop"'):
            self.assertNotIn(forbidden, self.gate)

    def test_no_false_empty_mask_adjacency(self):
        self.assertIn(
            "if prev is not None and prev.any() and tracked.any():",
            self.benchmark,
        )
        self.assertIn('"adjacent_nonempty_pair_count":len(adjacent)', self.benchmark)


if __name__ == "__main__":
    unittest.main()
