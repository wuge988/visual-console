# P5 QA01 Kontext D4 Visual Review

Status: `D4_RUNTIME_PASS / D4_IDENTITY_PASS / D4_SCENE_REALISM_FAIL / D5_REFERENCE_GUIDED_REQUIRED / QA01_DISABLED`

## Runtime evidence

Target Windows completed D4 at exact head `4d84a5f63b82322cb9c1b247fd19cb7f7cd126a4` for `DC-ZY-SZ-31001`.

- evidence: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D4_20260828-233428`
- architecture: `ENVIRONMENT_PLUS_GEOMETRY_LOCKED_PHOTOMETRIC_CORE_PLUS_CONTACT_MASK`
- source SC01 SHA256 `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- prior D3.1 final SHA256 `1955e5ac8d7ba7c3623509f3da13636a55bc0718549115b0c90089cab99109f4`
- environment raw SHA256 `c23f59088bb1748a9d07b427a389f7e9554e4ad68c206aa691b0b28f1cfc3955`
- final SHA256 `904acda038d220a35046776dc217ef0e84b3eac7fc3726872dfcb9ec465fb9d3`
- wet-core alpha geometry exact `True`
- photometric-core exact reassertion `True`

Runtime PASS is not production authorization.

## Human visual Gate

Overall result: **FAIL for scene realism**.

### Exact Piece identity — PASS

The sellable physical driftwood remains stable and recognizable. The geometry-locked photometric route keeps the original silhouette, crowns, upright prong, central-left cavity, major rightward forks, longest low-right branch and source texture without generative reshaping.

### Wet photometric integration — useful but insufficient

D4 reduces the obvious dry-white-background mismatch from D3.1. The wood is darker and more coherent with the aquarium light while retaining exact geometry. This is a valid reusable component.

### Environment realism — FAIL

The D4 review and user acceptance feedback show that the surrounding aquarium is still materially below the accepted original reference direction:

- it reads as a generated aquascape visualization rather than an actual-use aquarium photograph;
- the rear field remains too smooth and synthetic, with limited real front-glass/water-column evidence;
- support stones still feel stylized and staged rather than naturally buried, load-bearing geology;
- the substrate remains too clean and controlled;
- planting density and foreground/midground/background depth are too weak for a mature real aquarium;
- the scene lacks the messy-but-coherent physical integration, micro-occlusion and optical imperfection visible in the accepted reference images;
- the piece is present in the scene, but the scene still feels built around a product cutout rather than the product being naturally used inside a living aquarium.

The user explicitly rejected D4 on this basis: environment realism is not close enough to the previously supplied original reference images and does not yet provide the required real-use + fully integrated scene feeling.

## Decision

Do not continue prompt-only or denoise-only tuning of the same single-reference environment generator.

The next architecture must add a real photographic scene reference as a second visual condition while keeping the sellable piece as a separate first identity reference. The second reference is allowed to guide only photographic realism, materials, water optics, biological density and camera evidence; its driftwood/layout must not be copied.

Proceed to D5 multi-reference evaluation. QA01 stays disabled and no production Manifest/F aquarium state may be mutated.
