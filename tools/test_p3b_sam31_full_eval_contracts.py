"""P3-B full-video SAM3.1 promotion invariants (stdlib only)."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FULL = ROOT / "p3b_sam31_video_benchmark.py"
GATE = ROOT / "P3B_SAM31_VIDEO_GATE.ps1"


class FullEvaluationContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = FULL.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source, filename=str(FULL))

    def test_exact_thirty_frames_and_forward_only(self):
        self.assertIn(
            'if len(rows) != 30:', self.source,
        )
        self.assertIn(
            '"P3B_SAM31_EXPECTED_30_SOURCE_FRAMES:found="', self.source.replace(
                'f"P3B_SAM31_EXPECTED_30_SOURCE_FRAMES:found={len(rows)}"',
                '"P3B_SAM31_EXPECTED_30_SOURCE_FRAMES:found="',
            ),
        )
        self.assertIn('propagation_direction="forward"', self.source)
        self.assertIn('start_frame_index=0', self.source)
        self.assertIn('max_frame_num_to_track=len(rows)', self.source)

    def test_six_frame_proven_adapter_after_seed_before_propagation(self):
        seed_end = self.source.index(
            'point_labels=torch.tensor(point_labels, dtype=torch.int32),'
        )
        adapter = self.source.index(
            'merge_policy = install_uncached_refined_mask_diagnostic('
        )
        propagation = self.source.index('for resp in predictor.handle_stream_request(')
        self.assertLess(seed_end, adapter)
        self.assertLess(adapter, propagation)

    def test_trace_and_quality_gate_unrelaxed(self):
        for item in (
            '"uncached_mask_merge_policy":merge_policy',
            '"propagation_direction":"forward"',
            '"observed_output_frame_count":len(returned_ids_by_frame)',
            '"per_frame_merge_trace":[',
            'merge_trace.get(idx)',
            'np.asarray(ids).reshape(-1).astype(int).tolist()',
            'MIN_USABLE_FRAMES = 16',
            '0.02 <= area <= 0.48',
            'br > 0.20',
            'accepted < MIN_USABLE_FRAMES',
        ):
            self.assertIn(item, self.source)
        self.assertIn('prev.any() and tracked.any()', self.source)

    def test_reconstruction_and_source_immutability(self):
        for item in (
            '"authority":"EVALUATION_ONLY"',
            '"production_registration":False',
            '"pdp_blocking":False',
            '"archive_eligible":False',
            '"source_frames_mutated":False',
            '"RECONSTRUCTION":"BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS"',
            'if sha256_file(Path(source)) != before:',
        ):
            self.assertIn(item, self.source)

    def test_windows_gate_does_not_close_terminal(self):
        script = GATE.read_text(encoding="utf-8")
        self.assertIn('$ErrorActionPreference = "Continue"', script)
        self.assertIn('RECONSTRUCTION=BLOCKED', script)
        self.assertNotIn('$ErrorActionPreference = "Stop"', script)
        self.assertNotIn('throw ', script)
        self.assertNotIn('exit ', script)


if __name__ == "__main__":
    unittest.main()
