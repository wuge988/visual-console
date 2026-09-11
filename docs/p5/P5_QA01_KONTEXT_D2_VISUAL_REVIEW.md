# P5 QA01 Kontext D2 Visual Review

Status: `D2_RUNTIME_PASS / D2_IDENTITY_PASS / D2_SCENE_REALISM_FAIL / D2_VISUAL_FAIL / QA01_DISABLED`

## Evidence reviewed

Target Windows D2 evaluation completed at head `ad1d20e7d3c276c5fc7bdb797db3d75c81f3f8ab` for SKU `DC-ZY-SZ-31001`.

- mask runtime: `VAEEncodeForInpaint`
- protected-core coverage: `0.920418`
- protected-core exact pixel reassertion: `true`
- seed: `52073121`
- steps: `28`
- guidance: `2.4`
- denoise: `1.0`
- source SC01 SHA256: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- final candidate SHA256: `8dd1fc1f4a6419e669a86622b166d7481477311173ad1cdc9fce5ed16158b988`
- evidence directory: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P5_QA01_V2_KONTEXT_D2_20260828-172510`

## Human visual Gate

**FAIL.**

### Exact Piece identity: PASS

The D2 protected-core architecture materially solves the identity failure seen in D0. The final candidate retains the photographed piece's major silhouette and landmarks, including the two upper crowns, thin central upright prong, central-left cavity, major rightward forks and the longest low-right branch. The deterministic protected-core reassertion is therefore retained as the architectural baseline for the next iteration.

### Scene realism: FAIL

The environment remains below the required real-aquarium photography bar:

- the background still reads as a smooth blue/teal AI field rather than a mature planted aquarium with credible water-column depth;
- the substrate is too clean and flat, with insufficient granular variation and terrain;
- the support stones read as individually placed decorative pebbles rather than one partially buried structural cluster carrying the wood mass;
- planting is sparse and patch-like instead of forming a coherent foreground/midground/background system around the actual branch flow;
- front-glass, water attenuation, subtle reflection/refraction and contact-shadow evidence remain weak;
- the final composition still reads as an AI product scene with aquarium cues rather than a real established aquarium photographed through glass.

## Architectural conclusion

Do **not** return to whole-frame prompt/denoise tuning. D2 proves that identity protection is viable, but one-pass masked generation does not provide enough composition control for the realism target.

Escalate to D3 as a two-stage masked/inpaint evaluation:

1. **Stage 1 — environment skeleton:** keep the protected Identity Core while generating a structure-guided aquarium environment with non-template background planting, substrate terrain and a coherent buried support-stone cluster.
2. **Stage 2 — local contact refinement:** edit only bounded lower-contact and anchor zones to improve stone-to-wood, substrate-to-wood, plant-attachment and local wetness/contact-shadow integration.
3. Reassert the exact protected SC01 core after each generative stage.

D3 remains `EVALUATION_ONLY / NON_PRODUCTION`; QA01 stays `NOT_REGISTERED / executable=false` until a later human visual Gate passes.