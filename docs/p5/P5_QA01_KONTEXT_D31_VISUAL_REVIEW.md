# P5 QA01 Kontext D3.1 Visual Review

Status: `D31_RUNTIME_PASS / D31_GRAY_ARTIFACT_REPAIR_PASS / D31_IDENTITY_PASS / D31_SCENE_REALISM_FAIL / QA01_DISABLED`

## Runtime evidence

Target Windows completed D3.1 at exact head `8ad38c80f5a24c2911984266a9e6b5007a03a728` for `DC-ZY-SZ-31001`.

- prior D3 evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D3_20260828-211413`
- D3.1 evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D31_20260828-223558`
- Stage 2 runtime: `VAEEncode_PLUS_SetLatentNoiseMask`
- seed `52073132`
- steps `18`
- guidance `2.0`
- denoise `0.72`
- source SC01 SHA256 `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- exact reused Stage 1 SHA256 `6bd58f363026e9a73edcd67b3403c7448f0fd484c1ec491c571bd86270410136`
- D3.1 final SHA256 `1955e5ac8d7ba7c3623509f3da13636a55bc0718549115b0c90089cab99109f4`

Runtime Gate passed. Production remains disabled.

## Human visual Gate

Overall result: **FAIL for production realism**, with the D3 Stage-2 artifact repair itself **PASS**.

### Gray placeholder leakage — PASS

The broad mask-shaped gray regions visible in D3 are gone in both the D3.1 raw Stage 2 output and D3.1 final candidate. The latent-path correction is therefore accepted: keeping real Stage 1 RGB in ordinary `VAEEncode` and attaching only the noise mask removes the `VAEEncodeForInpaint` neutral-fill leakage at partial denoise.

Do not reopen this root cause.

### Exact Piece identity — PASS

The same physical driftwood remains recognizable. Major silhouette landmarks, upper crowns, central upright prong, central-left cavity, rightward forks, long lower-right branch, orientation and photographed texture remain stable.

### Scene realism — FAIL

D3.1 is still below the visual reference bar:

- the wood remains conspicuously dry/bright relative to the underwater environment, so exact-pixel core reassertion now reads as a compositing seam;
- the background still has a synthetic dark green/blue aquarium-field character rather than convincing layered front-glass photography;
- the support stones remain too smooth/rounded and staged, with insufficient irregular burial and load-bearing overlap;
- the sand remains relatively flat and clean;
- foreground/midground/background planting hierarchy and water-column optical cues are still weaker than the accepted reference direction;
- local contact refinement no longer artifacts, but it does not by itself solve the broader photometric mismatch between photographed dry SC01 pixels and a submerged scene.

## Decision

Do not tune D3.1 Stage 2 parameters further. The artifact was repaired; the remaining issue is architectural.

Proceed to D4 with three separated responsibilities:

1. rewrite only the environment outside an expanded Exact-Piece keepout;
2. preserve exact SC01 geometry/texture but apply deterministic underwater/wet photometry instead of reasserting dry RGB pixels;
3. run a bounded contact-mask refinement and reassert the geometry-locked photometric core afterward.

QA01 stays disabled; no production Manifest or F aquarium state may be mutated.