import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalAssetsFromP2Jobs,
  pipelineFromLegacyWorkflow,
} from "../src/canonical-contract.js";
import { loadP3PilotRegistry, parseP3PilotRegistry } from "../src/p3-pilots.js";
import type { P2Job } from "../src/p2-runtime.js";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

test("P3 workflow codes map to business pipelines without granting execution authority", () => {
  assert.equal(pipelineFromLegacyWorkflow("QA01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("QR01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("QP01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("QC01"), "SCENE_IMAGE");
  assert.equal(pipelineFromLegacyWorkflow("M3D01"), "MODEL_3D");
});

test("canonical generated asset kind follows the mapped P3 pipeline", () => {
  const base: P2Job = {
    job_id: "job-p3",
    site_id: "drift-curio",
    item_id: "DC-ZY-SZ-31001",
    workflow_code: "QA01",
    source_asset_id: "source-1",
    source_filename: "source.png",
    state: "QA_PENDING",
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:01:00.000Z",
    generated_asset_id: "scene-1",
    generated_filename: "scene.png",
  };
  const scene = canonicalAssetsFromP2Jobs([base]).find((asset) => asset.asset_id === "scene-1");
  assert.equal(scene?.kind, "SCENE");

  const model = canonicalAssetsFromP2Jobs([
    { ...base, workflow_code: "M3D01", generated_asset_id: "model-1", generated_filename: "model.glb" },
  ]).find((asset) => asset.asset_id === "model-1");
  assert.equal(model?.kind, "MODEL_3D");
});

test("tracked P3 pilot registry is bounded, evaluation-only and harness-ready", async () => {
  const registry = await loadP3PilotRegistry();
  assert.equal(registry.schema_version, "1.1");
  assert.equal(registry.pilots.length, 2);
  const p3a = registry.pilots.find((pilot) => pilot.phase === "P3-A");
  const p3b = registry.pilots.find((pilot) => pilot.phase === "P3-B");
  assert.equal(p3a?.workflow_code, "QA01");
  assert.equal(p3a?.pipeline, "SCENE_IMAGE");
  assert.match(String(p3a?.status), /HARNESS_READY/);
  assert.equal((p3a?.source_contract as any)?.harness, "tools/P3A_AQUARIUM_LOCAL_GATE.ps1");
  assert.equal(p3b?.workflow_code, "M3D01");
  assert.equal(p3b?.pipeline, "MODEL_3D");
  assert.match(String(p3b?.status), /SAM2_VIDEO_TRACKING_EXHAUSTED_SAM31_BENCHMARK_READY/);
  assert.equal((p3b?.capture_contract as any)?.windows_gate, "tools/P3B_3D_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.mask_windows_gate, "tools/P3B_MASK_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.mask_harness, "tools/p3b_wood_only_mask.py");
  assert.equal((p3b?.capture_contract as any)?.source_identity_triage_gate, "tools/P3B_VIDEO_SOURCE_IDENTITY_TRIAGE.ps1");
  assert.equal((p3b?.capture_contract as any)?.source_identity_triage_harness, "tools/p3b_video_source_identity_triage.py");
  assert.equal((p3b?.capture_contract as any)?.replacement_source_identity_gate, "tools/P3B_REPLACEMENT_SOURCE_IDENTITY_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.replacement_source_identity_harness, "tools/p3b_replacement_source_identity.py");
  assert.equal((p3b?.capture_contract as any)?.frame_qc_profile?.sample_fps, 8);
  assert.equal((p3b?.capture_contract as any)?.frame_qc_profile?.historical_local_selected_frames, 19);
  assert.equal((p3b?.capture_contract as any)?.frame_qc_profile?.current_local_selected_frames, 30);
  assert.equal((p3b?.capture_contract as any)?.frame_qc_profile?.current_local_selected_frames, 30);
  assert.equal((p3b?.capture_contract as any)?.mask_local_evidence?.usable_masks, 19);
  assert.equal((p3b?.capture_contract as any)?.mask_local_evidence?.rejected_masks, 0);
  assert.equal((p3b?.capture_contract as any)?.mask_local_evidence?.human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.mask_local_evidence?.failure_class, "SEMANTIC_MASK_TARGET_MISMATCH");
  assert.equal((p3b?.capture_contract as any)?.mask_local_evidence?.source_frames_mutated, false);
  assert.equal((p3b?.capture_contract as any)?.source_identity_triage?.candidate_count, 28);
  assert.equal((p3b?.capture_contract as any)?.source_identity_triage?.human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.source_identity_triage?.existing_candidate_search_exhausted, true);
  assert.equal((p3b?.capture_contract as any)?.source_identity_triage?.reshoot_required, true);
  assert.equal((p3b?.capture_contract as any)?.reshoot_required, false);
  assert.equal((p3b?.capture_contract as any)?.source_binding, "APPROVED_REPLACEMENT_VIDEO_SHA256_BOUND");
  assert.equal((p3b?.capture_contract as any)?.source_sha256, "c92391e35aa867bf19a183a55e4c6471a50e54a3fb4c6c56d7f6399f86782bdf");
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.candidate_provided, true);
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.local_sha256_binding, "PASS");
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.human_source_identity_gate, "PASS");
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.frame_qc, "PASS");
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.frame_qc_selected_frames, 30);
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.source_mutated, false);
  assert.equal((p3b?.capture_contract as any)?.replacement_capture?.mask, "HUMAN_FAIL");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.usable_masks, 30);
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.failure_class, "SUPPORT_CONTAMINATION_AND_PARTIAL_WOOD_COVERAGE");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.refinement_gate, "tools/P3B_MASK_REFINE_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.refinement_harness, "tools/p3b_wood_mask_refine.py");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.refinement_human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.refinement_failure_class, "RESIDUAL_SUPPORT_CONTAMINATION");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.coverage_regression, "RESOLVED");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v2_gate, "tools/P3B_SUPPORT_V2_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v2_harness, "tools/p3b_support_suppression_v2.py");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v2_human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v2_failure_class, "RESIDUAL_SUPPORT_CONTAMINATION_MINOR_BUT_PERSISTENT");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v3_gate, "tools/P3B_SUPPORT_V3_WINDOWS_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v3_harness, "tools/p3b_support_suppression_v3.py");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.support_v3_human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.replacement_mask_local_evidence?.legacy_recovery_route, "PILOT_RECOVERY_PATH_ONLY");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.gate, "tools/P3B_SAM2_VIDEO_TRACKING_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.harness, "tools/p3b_sam2_video_tracking_experiment.py");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.max_attempts, 3);
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.current_attempt, 3);
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_policy?.[0]?.status, "HUMAN_FAIL");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_policy?.[1]?.status, "HUMAN_FAIL");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_policy?.[2]?.status, "HUMAN_FAIL");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[0]?.human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[0]?.failure_class, "RESIDUAL_WHITE_SUPPORT_IN_TRACKED_MASKS");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[0]?.usable_tracked_masks, 30);
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[1]?.human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[1]?.strategy, "DUAL_AUTO_CLEAN_MASK_SEEDS");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[1]?.median_adjacent_mask_iou, 0.698);
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[2]?.human_visual_gate, "FAIL");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[2]?.failure_class, "PROMPT_INDUCED_WOOD_EROSION_WITH_RESIDUAL_SUPPORT");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.attempt_results?.[2]?.median_adjacent_mask_iou, 0.6744);
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.sam3_1_fallback?.authorized, true);
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.sam3_1_fallback?.status, "READY_SEPARATE_RUNTIME_PROBE");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.sam3_1_fallback?.probe, "tools/P3B_SAM31_WINDOWS_PROBE.ps1");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.sam3_1_fallback?.gate, "tools/P3B_SAM31_VIDEO_GATE.ps1");
  assert.equal((p3b?.capture_contract as any)?.sam2_video_tracking_experiment?.sam3_1_fallback?.harness, "tools/p3b_sam31_video_benchmark.py");
  assert.equal((p3b?.capture_contract as any)?.exact_piece_reference?.source_sha256, "f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399");
  assert.deepEqual((p3b?.capture_contract as any)?.exact_piece_reference?.critical_landmarks, [
    "top_double_crowns",
    "central_upright_branch",
    "central_left_large_cavity",
    "right_major_fork",
    "longest_lower_right_branch",
  ]);
  for (const pilot of registry.pilots) {
    assert.equal(pilot.production_registration, false);
    assert.equal(pilot.pdp_blocking, false);
    assert.ok(pilot.gates.length > 0);
  }
});

test("P3 harnesses remain evaluation-only and fail closed at physical gates", async () => {
  const [p3aPy, p3aPs, p3bPy, p3bPs, maskPy, maskPs, triagePy, triagePs, replacementPy, replacementPs, refinePy, refinePs, supportV2Py, supportV2Ps, supportV3Py, supportV3Ps, trackPy, trackPs, sam31Py, sam31ProbePs, sam31GatePs] = await Promise.all([
    readFile(join(ROOT, "tools", "p3a_aquarium_identity_baseline.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3A_AQUARIUM_LOCAL_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_video_frame_qc.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_3D_WINDOWS_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_wood_only_mask.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_MASK_WINDOWS_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_video_source_identity_triage.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_VIDEO_SOURCE_IDENTITY_TRIAGE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_replacement_source_identity.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_REPLACEMENT_SOURCE_IDENTITY_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_wood_mask_refine.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_MASK_REFINE_WINDOWS_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_support_suppression_v2.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_SUPPORT_V2_WINDOWS_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_support_suppression_v3.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_SUPPORT_V3_WINDOWS_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_sam2_video_tracking_experiment.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_SAM2_VIDEO_TRACKING_GATE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "p3b_sam31_video_benchmark.py"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_SAM31_WINDOWS_PROBE.ps1"), "utf8"),
    readFile(join(ROOT, "tools", "P3B_SAM31_VIDEO_GATE.ps1"), "utf8"),
  ]);
  assert.match(p3aPy, /EVALUATION_ONLY/);
  assert.match(p3aPy, /production_registration.*False/);
  assert.match(p3aPy, /P3A_OPAQUE_IDENTITY_PIXEL_DRIFT/);
  assert.match(p3aPs, /PieceSha256/);
  assert.match(p3aPs, /AquariumSha256/);
  assert.doesNotMatch(p3aPs, /enabled_workflows/);

  assert.match(p3bPy, /P3B_SOURCE_VIDEO_MUTATED/);
  assert.match(p3bPy, /WOOD_ONLY_MASK.*PENDING_WINDOWS_PHYSICAL_GATE/);
  assert.match(p3bPy, /RECONSTRUCTION.*BLOCKED_UNTIL_MASK_PASS/);
  assert.match(p3bPs, /VideoSha256/);
  assert.match(p3bPs, /FrameQcSampleFps = 8\.0/);
  assert.match(p3bPs, /venv-py310/);
  assert.match(p3bPs, /SAM2/);
  assert.match(p3bPs, /GSPLAT/);
  assert.doesNotMatch(p3bPs, /pip install|uv pip install|enabled_workflows/);

  assert.match(maskPy, /SAM2_AUTOMATIC_MASK_GENERATOR_FAIL_CLOSED/);
  assert.match(maskPy, /AUTO_CANDIDATE_READY_HUMAN_GATE_REQUIRED/);
  assert.match(maskPy, /BLOCKED_UNTIL_MASK_HUMAN_GATE_PASS/);
  assert.match(maskPy, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(maskPy, /MIN_USABLE_FRAMES = 16/);
  assert.match(maskPs, /FRAME_QC_EVIDENCE=PASS/);
  assert.match(maskPs, /MASK_RUNTIME=PASS/);
  assert.match(maskPs, /HF_HUB_OFFLINE/);
  assert.match(maskPs, /local_files_only=True/);
  assert.match(maskPs, /SAM2_LOCAL_CACHE=PASS/);
  assert.match(maskPs, /WOOD_ONLY_MASK_HUMAN_VISUAL_GATE/);
  assert.doesNotMatch(maskPs, /pip install|uv pip install|enabled_workflows/);

  assert.match(triagePy, /VIDEO_SOURCE_CONTENT_IDENTITY.*HUMAN_VISUAL_GATE_REQUIRED/);
  assert.match(triagePy, /KNOWN_HUMAN_REJECTED/);
  assert.match(triagePy, /P3B_SOURCE_VIDEO_MUTATED/);
  assert.match(triagePs, /known_rejected_sha256/);
  assert.match(triagePs, /VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE/);
  assert.match(triagePs, /reshoot_required=false/);
  assert.doesNotMatch(triagePs, /pip install|uv pip install|enabled_workflows/);

  assert.match(replacementPy, /VIDEO_SOURCE_CONTENT_IDENTITY.*HUMAN_VISUAL_GATE_REQUIRED/);
  assert.match(replacementPy, /EXACT_PIECE_REFERENCE_SHA256/);
  assert.match(replacementPy, /P3B_SOURCE_VIDEO_MUTATED/);
  assert.match(replacementPs, /VideoSha256/);
  assert.match(replacementPs, /VIDEO_SOURCE_SHA256=PASS/);
  assert.match(replacementPs, /FRAME_QC=BLOCKED_UNTIL_SOURCE_CONTENT_IDENTITY_PASS/);
  assert.match(replacementPs, /VIDEO_SOURCE_CONTENT_IDENTITY_HUMAN_GATE/);
  assert.doesNotMatch(replacementPs, /pip install|uv pip install|enabled_workflows/);

  assert.match(refinePy, /SAM2_PROPOSAL_UNION_PLUS_DETERMINISTIC_WHITE_SUPPORT_SUPPRESSION/);
  assert.match(refinePy, /REFINED_AUTO_CANDIDATE_READY_HUMAN_GATE_REQUIRED/);
  assert.match(refinePy, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(refinePs, /MASK_EVIDENCE=PASS/);
  assert.match(refinePs, /HF_HUB_OFFLINE/);
  assert.match(refinePs, /WOOD_ONLY_MASK_REFINED_HUMAN_VISUAL_GATE/);
  assert.match(refinePs, /RECONSTRUCTION=BLOCKED_UNTIL_REFINED_MASK_HUMAN_GATE_PASS/);
  assert.doesNotMatch(refinePs, /pip install|uv pip install|enabled_workflows/);

  assert.match(supportV2Py, /DETERMINISTIC_LOWER_SLENDER_NEUTRAL_SUPPORT_SUPPRESSION/);
  assert.match(supportV2Py, /SUPPORT_V2_CANDIDATE_READY_HUMAN_GATE_REQUIRED/);
  assert.match(supportV2Py, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(supportV2Ps, /REFINED_MASK_EVIDENCE=PASS/);
  assert.match(supportV2Ps, /WOOD_ONLY_MASK_SUPPORT_V2_HUMAN_VISUAL_GATE/);
  assert.match(supportV2Ps, /RECONSTRUCTION=BLOCKED_UNTIL_SUPPORT_V2_HUMAN_GATE_PASS/);
  assert.doesNotMatch(supportV2Ps, /pip install|uv pip install|enabled_workflows/);

  assert.match(supportV3Py, /SEEDED_RESIDUAL_PEG_NEUTRAL_GEOMETRY_CLEANUP/);
  assert.match(supportV3Py, /SUPPORT_V3_CANDIDATE_READY_HUMAN_GATE_REQUIRED/);
  assert.match(supportV3Py, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(supportV3Ps, /SUPPORT_V2_EVIDENCE=PASS/);
  assert.match(supportV3Ps, /WOOD_ONLY_MASK_SUPPORT_V3_HUMAN_VISUAL_GATE/);
  assert.match(supportV3Ps, /RECONSTRUCTION=BLOCKED_UNTIL_SUPPORT_V3_HUMAN_GATE_PASS/);
  assert.doesNotMatch(supportV3Ps, /pip install|uv pip install|enabled_workflows/);

  assert.match(trackPy, /SAM2VideoPredictor/);
  assert.match(trackPy, /MAX_ATTEMPTS = 3/);
  assert.match(trackPy, /SINGLE_AUTO_CLEAN_MASK_SEED/);
  assert.match(trackPy, /DUAL_AUTO_CLEAN_MASK_SEEDS/);
  assert.match(trackPy, /AUTO_BOX_POSITIVE_AND_SUPPORT_NEGATIVE_POINTS/);
  assert.match(trackPy, /NOT_ELIGIBLE_BEFORE_THREE_SAM2_VIDEO_HUMAN_FAILS/);
  assert.match(trackPy, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(trackPs, /max_sam2_video_attempts=3/);
  assert.match(trackPs, /sam3_1_fallback=AUTHORIZED_AFTER_THREE_HUMAN_FAILS/);
  assert.match(trackPs, /SAM2_VIDEO_TRACKING_HUMAN_VISUAL_GATE/);
  assert.match(trackPs, /RECONSTRUCTION=BLOCKED_UNTIL_SAM2_VIDEO_TRACKING_HUMAN_GATE_PASS/);
  assert.doesNotMatch(trackPs, /pip install|uv pip install|enabled_workflows/);

  assert.match(sam31Py, /Sam3MultiplexVideoPredictor/);
  assert.match(sam31Py, /TEXT_DRIFTWOOD|driftwood/);
  assert.match(sam31Py, /P3B_SOURCE_FRAME_MUTATED/);
  assert.match(sam31ProbePs, /separate_runtime_required=true/);
  assert.match(sam31ProbePs, /sam2_runtime_mutation=false/);
  assert.match(sam31ProbePs, /SAM31_LOCAL_CACHE/);
  assert.match(sam31GatePs, /sam2_attempts_exhausted=true/);
  assert.match(sam31GatePs, /sam31_fallback_authorized=true/);
  assert.match(sam31GatePs, /RECONSTRUCTION=BLOCKED_UNTIL_SAM31_HUMAN_GATE_PASS/);
  assert.doesNotMatch(sam31ProbePs, /pip install|uv pip install|enabled_workflows/);
  assert.doesNotMatch(sam31GatePs, /pip install|uv pip install|enabled_workflows/);
});

test("P3 pilot parser rejects accidental production registration", () => {
  assert.throws(
    () => parseP3PilotRegistry({
      schema_version: "1.1",
      pilots: [{
        pilot_id: "unsafe",
        phase: "P3-A",
        site_id: "drift-curio",
        item_id: "DC-ZY-SZ-31001",
        pipeline: "SCENE_IMAGE",
        workflow_code: "QA01",
        title_zh: "unsafe",
        status: "unsafe",
        production_registration: true,
        pdp_blocking: false,
        strategy: {},
        gates: ["SOURCE_IDENTITY"],
      }],
    }),
    /P3_PRODUCTION_REGISTRATION_FORBIDDEN/,
  );
});

test("P3 pilot parser rejects a 3D pilot that can block PDP", () => {
  assert.throws(
    () => parseP3PilotRegistry({
      schema_version: "1.1",
      pilots: [{
        pilot_id: "unsafe-3d",
        phase: "P3-B",
        site_id: "drift-curio",
        item_id: "DC-ZY-SZ-31001",
        pipeline: "MODEL_3D",
        workflow_code: "M3D01",
        title_zh: "unsafe",
        status: "unsafe",
        production_registration: false,
        pdp_blocking: true,
        strategy: {},
        gates: ["VIDEO_SOURCE"],
      }],
    }),
    /P3_PDP_BLOCKING_FORBIDDEN/,
  );
});
