# P5 QA01 Kontext D1 Visual Review

Status: `D1_RUNTIME_PASS / D1_VISUAL_FAIL / IDENTITY_MUCH_BETTER / SCENE_REALISM_FAIL / D2_MASK_ESCALATION_REQUIRED / QA01_DISABLED`

## Evidence

- SKU: `DC-ZY-SZ-31001`
- Gate head: `f39c540312db7a2fba3ab08c26900332eb9ed06d`
- D1 seed: `52073111`
- steps: `24`
- guidance: `2.2`
- denoise: `0.62`
- prompt id: `bedcfbde-cc7b-406d-86dd-8d9f210532bb`
- source SC01 SHA256: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- D1 candidate SHA256: `d3c06f44e219d20aa964000d8c5bfa85f6adbce8e4f644f72451378ecb502cce`
- evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D1_20260828-162741`

## Human visual result

D1 materially improves Exact Piece preservation compared with D0. The two upper crowns, central upright prong, central-left cavity, major rightward forks, longest low-right branch, overall silhouette, orientation and recognizable grain remain close enough to the SC01 reference that the candidate still reads as the same physical piece.

However D1 fails the scene-realism requirement and is not a production candidate:

1. The candidate remains very close to the deterministic starter instead of becoming a convincing planted aquarium. The background is still a smooth teal field and the lower region is a flat beige plane.
2. There is no credible aquarium depth structure: no planted foreground/midground/background, no natural support-rock cluster, no real sand granularity, no front-glass cues, no water-column depth and no believable physical contact system.
3. The wood is preserved largely because `denoise=0.62` leaves insufficient generative freedom to build the requested environment. Further prompt-only tuning or small denoise changes would trade scene realism against identity rather than solve the architecture.
4. The D1 starter mechanism therefore demonstrates the expected identity/realism conflict of whole-frame latent editing on a one-of-one SKU.

## Decision

`D1_VISUAL_FAIL`.

Do not continue with repeated whole-frame Kontext denoise tuning. Escalate to D2 masked/inpaint identity protection:

- preserve a deterministic Identity Core derived from the VERIFIED SC01 alpha and photographed pixels;
- allow generation primarily outside the wood plus a narrow Integration Band around edges/contact zones;
- permit rocks, substrate, plants, water and shared scene lighting to form around the exact shape;
- after generation, reassert the protected SC01 core deterministically so major geometry cannot drift;
- keep QA01 evaluation-only and fail-closed until the new visual Gate passes.

No QA01 registration, production journal, Manifest mutation or F archive output is authorized by D1.