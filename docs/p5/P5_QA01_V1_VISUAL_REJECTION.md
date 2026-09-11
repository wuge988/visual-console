# P5 QA01 v1 Visual Rejection

Decision: `REJECT_ALL / NO_CANDIDATE_SELECTED / V1_BACKGROUND_PASTE_NON_PRODUCTION`

Target Windows evidence recovered successfully:

- source SC01 SHA256: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- backgrounds reused: `True`
- SDXL rerun during recovery: `False`
- recovered candidates: `A1,A2,B1,B2,C1,C2`
- QA01 enabled: `False`
- production mutation: `NONE`
- evidence directory: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_STYLE_SAMPLE_20260828-024926`

## Human review result

All six recovered candidates are rejected.

Observed failure pattern:

- the driftwood reads as a foreground cutout over a separately generated tank/room;
- lighting direction and exposure are not physically shared between product and environment;
- contact/support is not designed around the actual wood geometry;
- there is little or no believable substrate occlusion, edge interaction, moss/plant attachment, water response or ambient contact shadow;
- scale and perspective are weakly coupled to the tank/set;
- the same empty-central-space strategy encourages generic composition and cannot satisfy per-SKU landscaping;
- visual quality is below the uploaded photorealistic reference set.

## Requirement correction

The production objective is not "one protected cutout pasted into four reusable scenes".

The production objective is:

`one exact piece -> four individually designed Realms -> each Realm composition adapted to that SKU -> strong photographic realism`

The four workflows remain QA01 Aquarium, QR01 Rainforest, QP01 Reptile and QC01 Collectible. Scene generation must be context-aware and shape-aware; repeated prefab scenes are forbidden.

Superseding architecture: `docs/p5/P5_FOUR_REALMS_ADAPTIVE_SCENE_V2.md`.

No v1 candidate may be promoted, registered, archived, or used as a production baseline.