"""Static P3-B SAM3.1 safety contracts; uses Python stdlib only."""
import ast
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
BENCH = TOOLS / "p3b_sam31_video_benchmark.py"
GATE = TOOLS / "P3B_SAM31_VIDEO_GATE.ps1"


class Sam31ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = BENCH.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source, filename=str(BENCH))

    def test_multiplex_checkpoint_slots_and_object_limit_are_independent(self):
        calls = [
            node
            for node in ast.walk(self.tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "build_sam3_multiplex_video_predictor"
        ]
        self.assertEqual(len(calls), 1)
        kw = {k.arg: ast.literal_eval(k.value) for k in calls[0].keywords
              if k.arg in ("multiplex_count", "max_num_objects", "compile", "warm_up")}
        self.assertEqual(kw["multiplex_count"], 16)
        self.assertEqual(kw["max_num_objects"], 4)
        self.assertIs(kw["compile"], False)
        self.assertIs(kw["warm_up"], False)

    def test_verbose_upstream_load_and_full_failure_are_file_only(self):
        self.assertIn('out / "model_load_details.log"', self.source)
        self.assertIn('with redirect_stdout(details):', self.source)
        self.assertIn('out / "benchmark_failure.log"', self.source)
        self.assertIn("error_summary=", self.source)

    def test_evaluation_only_and_safe_windows_gate(self):
        gate = GATE.read_text(encoding="utf-8")
        self.assertIn('production_registration=false', gate)
        self.assertIn('RECONSTRUCTION=BLOCKED', gate)
        self.assertNotIn('$ErrorActionPreference = "Stop"', gate)
        self.assertNotIn('throw ', gate)
        self.assertNotIn('exit ', gate)


if __name__ == "__main__":
    unittest.main()
