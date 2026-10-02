"""Stdlib-only regression tests for SAM3.1's decoder-scoped SDPA fallback."""
import unittest
from contextlib import nullcontext
from enum import Enum
from pathlib import Path
from types import SimpleNamespace

from sam31_decoder_sdpa_compat import (
    install_sam31_decoder_sdpa_fallback,
)


class FakeBackend(Enum):
    FLASH_ATTENTION = "flash"
    MATH = "math"
    EFFICIENT_ATTENTION = "efficient"


# The source guard must recognize the verified upstream decoder's context.
def fake_upstream_functional_attention():
    with sdpa_kernel(SDPBackend.FLASH_ATTENTION):
        return None


def unknown_upstream_functional_attention():
    with sdpa_kernel(SDPBackend.MATH):
        return None


class DecoderFallbackTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

        def native_kernel(backends, *args, **kwargs):
            self.calls.append((backends, args, kwargs))
            return nullcontext()

        self.native = native_kernel
        self.module = SimpleNamespace(
            SDPBackend=FakeBackend,
            sdpa_kernel=self.native,
            functional_attention=fake_upstream_functional_attention,
        )

    def install(self):
        return install_sam31_decoder_sdpa_fallback(
            decoder_module=self.module,
            native_sdpa_kernel=self.native,
            backend_enum=FakeBackend,
        )

    def test_flash_only_context_gets_math_fallback(self):
        self.assertEqual(self.install(), "DECODER_FLASH_OR_MATH")
        with self.module.sdpa_kernel(FakeBackend.FLASH_ATTENTION):
            pass
        self.assertEqual(
            self.calls,
            [([FakeBackend.FLASH_ATTENTION, FakeBackend.MATH], (), {})],
        )

    def test_unrelated_contexts_preserved_exactly(self):
        self.install()
        other = [FakeBackend.EFFICIENT_ATTENTION]
        with self.module.sdpa_kernel(other, set_priority=True):
            pass
        self.assertIs(self.calls[0][0], other)
        self.assertEqual(self.calls[0][2], {"set_priority": True})

    def test_install_is_idempotent(self):
        self.install()
        first_wrapper = self.module.sdpa_kernel
        self.assertEqual(
            self.install(), "DECODER_FLASH_OR_MATH_ALREADY_INSTALLED"
        )
        self.assertIs(first_wrapper, self.module.sdpa_kernel)

    def test_unrecognized_upstream_change_fails_closed(self):
        self.module.functional_attention = unknown_upstream_functional_attention
        with self.assertRaisesRegex(
            RuntimeError, "FLASH_ONLY_CONTEXT_NOT_FOUND"
        ):
            self.install()
        self.assertIs(self.module.sdpa_kernel, self.native)

    def test_preexisting_third_party_override_fails_closed(self):
        self.module.sdpa_kernel = lambda _: nullcontext()
        with self.assertRaisesRegex(
            RuntimeError, "SDPA_ALREADY_MODIFIED"
        ):
            self.install()

    def test_benchmark_installs_before_model_load_and_records_policy(self):
        source = (
            Path(__file__).resolve().parent / "p3b_sam31_video_benchmark.py"
        ).read_text(encoding="utf-8")
        install_pos = source.index(
            "sdpa_policy = install_sam31_decoder_sdpa_fallback()"
        )
        build_pos = source.index(
            "predictor = build_sam3_multiplex_video_predictor("
        )
        self.assertLess(install_pos, build_pos)
        self.assertIn('"decoder_sdpa_policy":sdpa_policy', source)
        self.assertIn("SAM31_SDPA_POLICY=", source)
        self.assertIn('"production_registration":False', source)
        self.assertIn('"RECONSTRUCTION":"BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS"', source)


if __name__ == "__main__":
    unittest.main()
