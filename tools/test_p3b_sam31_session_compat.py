"""Executable, stdlib-only tests for the bounded SAM3.1 session adapter."""
import unittest

from sam31_session_compat import install_sam31_session_compat


class LegacyMultiplexModel:
    def __init__(self):
        self.received = None

    def init_state(
        self, resource_path, offload_video_to_cpu=False,
        async_loading_frames=False, use_torchcodec=False, use_cv2=False,
        input_is_mp4=False,
    ):
        self.received = (resource_path, offload_video_to_cpu, async_loading_frames)
        return {"num_frames": 30}


class NativeMultiplexModel:
    def init_state(
        self, resource_path, offload_video_to_cpu=False,
        offload_state_to_cpu=False,
    ):
        return {"offloaded": offload_state_to_cpu}


class Predictor:
    def __init__(self, model):
        self.model = model


class AdapterTests(unittest.TestCase):
    def test_expected_base_session_call_is_supported(self):
        model = LegacyMultiplexModel()
        predictor = Predictor(model)
        self.assertEqual(
            install_sam31_session_compat(predictor),
            "DROP_UNSUPPORTED_FALSE_FLAG_ONLY",
        )
        state = predictor.model.init_state(
            resource_path="frames",
            offload_video_to_cpu=False,
            offload_state_to_cpu=False,
            async_loading_frames=False,
        )
        self.assertEqual(state, {"num_frames": 30})
        self.assertEqual(model.received, ("frames", False, False))

    def test_true_offload_request_is_never_silently_dropped(self):
        predictor = Predictor(LegacyMultiplexModel())
        install_sam31_session_compat(predictor)
        with self.assertRaisesRegex(RuntimeError, "STATE_OFFLOAD_NOT_SUPPORTED"):
            predictor.model.init_state(
                resource_path="frames", offload_state_to_cpu=True
            )

    def test_unrecognized_kwarg_is_not_swallowed(self):
        predictor = Predictor(LegacyMultiplexModel())
        install_sam31_session_compat(predictor)
        with self.assertRaisesRegex(TypeError, "UNEXPECTED_ARGUMENTS:typo"):
            predictor.model.init_state(resource_path="frames", typo=True)

    def test_native_api_is_untouched(self):
        model = NativeMultiplexModel()
        original = model.init_state.__func__
        predictor = Predictor(model)
        self.assertEqual(install_sam31_session_compat(predictor), "NATIVE_SUPPORTED")
        self.assertIs(model.init_state.__func__, original)
        self.assertEqual(
            model.init_state("frames", offload_state_to_cpu=True), {"offloaded": True}
        )


if __name__ == "__main__":
    unittest.main()
