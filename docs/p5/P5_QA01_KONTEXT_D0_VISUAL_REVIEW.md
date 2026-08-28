# P5 QA01 Kontext D0 visual review

Status: `D0_RUNTIME_PASS / D0_VISUAL_FAIL / IDENTITY_DRIFT / SCENE_REALISM_BELOW_BAR / QA01_DISABLED`

## Evidence

Target-Windows D0 evaluation completed at exact head `767aeeb4e27fb2e8e26013eee3e5c9cc929c4499`.

- SKU: `DC-ZY-SZ-31001`
- seed: `52073101`
- steps: `20`
- guidance: `2.5`
- source SC01 SHA256: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- candidate SHA256: `decc03e580b60d9f3223a603967a7ffbf28d401303627c1d64abc3ec5533de82`
- prompt id: `0d75c3a7-0d7c-4485-90d4-8c521fcbbcc4`
- evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D0_20260828-133418`

The runtime Gate itself passed and remained evaluation-only: `production_authorized=False / qa01_enabled=False`.

## Human visual decision: FAIL

D0 is materially better than the rejected v1 hard-composite experiment because the wood and environment now share one generated lighting/contact space. It is still below the production quality bar and must not be registered.

### Release blockers

1. **Exact Piece identity drift.** The generated wood is recognizably derived from the SC01 piece, but it is not the same physical piece. Upper crowns, the central cavity geometry, right-side branch forks, lower silhouette and several smaller landmarks are reshaped/simplified.
2. **Excess generated moss masks identity.** Large continuous moss blankets replace visible wood texture and make the piece read as a generated prop instead of the photographed SKU.
3. **Scene remains too generic/studio-like.** Smooth blue backdrop, sparse isolated round stones and shallow background treatment do not read like the photographic aquarium references. The hardscape is staged as an object on a set rather than designed as a mature aquarium around this piece.
4. **Aquarium evidence is weak.** Glass/water depth, substrate grain, support-rock clustering, planted depth layers and physically believable aquarium cues are not strong enough.
5. **Contact realism improved but is insufficient to offset identity mutation.** This is a useful runtime proof, not a visual PASS.

## D1 correction

D1 remains a single-candidate evaluation Gate to minimize GPU cost and human review load.

It changes the generation strategy rather than merely rewriting adjectives:

- use the exact SC01 white-backed image only as Kontext reference conditioning;
- create a second deterministic aquarium scaffold that already contains the exact SC01 pixels, a restrained water/background field and sand bed;
- use that scaffold as the KSampler starting latent;
- reduce denoise from `1.0` to `0.62` to retain much more of the photographed geometry while still allowing the environment to form;
- use a new fixed seed `52073111`, `24` steps and guidance `2.2`;
- correct the per-SKU recipe to the actual visible structure: central-left dominant mass, two upper crowns, central upright prong, multiple rightward forks and a longest low-right branch;
- prohibit blanket moss, isolated decorative pebbles, smooth studio gradient backgrounds and generic object-on-pedestal staging;
- require clustered support stones, realistic sand grain, restrained epiphytes, planted depth and subtle glass/water cues;
- keep `QA01 NOT_REGISTERED / executable=false` and write only evidence artifacts.

If D1 still mutates the Identity Core, the next escalation is masked/inpaint identity protection rather than repeated prompt-only retries.