# Visual Console P5 — QA01 Aquarium Isolated Style Sample Contract

Date: 2026-08-28
Packet: `VC-P5-QA01-AQUARIUM-001`
Mode: `MODE_B_AI_INNOVATION`
Status: `TARGET_RUNTIME_PASS / ISOLATED_STYLE_SAMPLE_READY / QA01_DISABLED`

## Purpose

This Gate produces the first **style-only** Aquarium candidates after the target Windows runtime passed with the frozen SDXL Base checkpoint. It is not a production QA01 run.

The sample is designed to answer two visual questions in one human review:

1. which generated Aquarium environment direction is acceptable;
2. which of two bounded uniform product scales is the better shared Four Realms placement candidate.

## Frozen subject truth

The product subject must come from the latest VERIFIED P3 `SC01` Cutout on F for the selected SKU. The Gate must:

- resolve the source from Manifest `archive_history`;
- require `gate=15`, `workflow_code=SC01`, `destination_key=cutout`, `result=VERIFIED_ARCHIVE`;
- verify current F size and SHA256 against that durable history before use;
- copy the verified source into the evidence folder only for review provenance;
- never regenerate or repaint the product body.

## Generative boundary

SDXL Base generates only the Aquarium environment/background. The prompt explicitly reserves an unobstructed central zone and forbids driftwood/wood/root/branch/log/stump/tree content.

The generated layer may contain aquarium glass, water, restrained stones, low aquatic plants, sand and water caustics, but generated foreground content must not obscure the product subject.

The Gate does not use img2img, inpainting, IP-Adapter, ControlNet, LoRA, refiner or any custom node.

## Frozen runtime for this sample

- checkpoint: `sd_xl_base_1.0.safetensors`;
- exact SHA256: `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`;
- canvas: `1024 × 1024`;
- sampler: `dpmpp_2m`;
- scheduler: `karras`;
- steps: `28`;
- CFG: `6.0`;
- denoise: `1.0`;
- sequential seeds: `41073101`, `41073102`, `41073103`;
- GPU execution remains serial;
- `PreviewImage` is used so the ComfyUI result remains a temporary style artifact rather than a production output.

## Prompt freeze

Positive prompt:

> photorealistic premium freshwater aquascape aquarium, straight-on product display viewpoint, fully underwater scene, dark charcoal aquarium glass background, restrained warm-neutral aquarium lighting, clean fine sand substrate, subtle water caustics, natural river stones and low aquatic plants kept around the outer edges and lower corners, broad unobstructed central foreground and midground reserved for one sculptural display object, realistic water depth, refined editorial aquarium photography, calm negative space, physically plausible glass and substrate, no central object

Negative prompt:

> driftwood, wood, wooden, root, roots, branch, branches, log, stump, tree, central sculpture, central object, foreground obstruction, dense plants in center, large rock in center, fish crossing center, animal crossing center, bubbles obscuring center, text, logo, watermark, fantasy, illustration, painting, cartoon, oversaturated, extreme teal, warped glass, fisheye, duplicate objects

## Candidate placement contract

The verified SC01 alpha subject is deterministically composited onto every background with:

- no rotation;
- no perspective warp;
- no non-uniform scale;
- no crop of opaque subject pixels;
- no relighting;
- no color grading;
- no generated shadow;
- no vignette.

Two uniform scale candidates are rendered for every background seed:

- `1 = Natural`: fit subject alpha bounding box within 78% canvas width and 68% canvas height;
- `2 = Hero`: fit subject alpha bounding box within 86% canvas width and 76% canvas height;
- both are horizontally centered and bottom-anchored at 90% canvas height;
- scale is uniform and deterministic.

Candidate labels are therefore `A1`, `A2`, `B1`, `B2`, `C1`, `C2`.

The selected transform is **not frozen** until the human visual Gate accepts one candidate.

## Evidence-only outputs

The Gate may write only:

- evidence under the existing `control_root/evidence/P5_QA01_STYLE_SAMPLE_*` folder;
- ComfyUI temporary preview files required by `PreviewImage`.

It must not:

- write QA01 production staging records;
- mutate jobs/QA/archive journals;
- write `Manifest.destinations.aquarium`;
- modify Manifest `archive_history`;
- copy a scene asset to F;
- enable QA01 in Site Profile or Registry.

## Human visual acceptance

Accept exactly one candidate only if all are true:

1. the driftwood is immediately recognizable as the exact SC01 piece;
2. silhouette, holes, branches and proportions remain intact;
3. scale and bottom contact look plausible for an Aquarium context;
4. the generated environment does not contain a competing fake driftwood/wood object;
5. no generated foreground content obscures the subject;
6. the scene feels restrained, premium and realistically aquatic rather than fantasy/CGI-heavy;
7. the image is clearly a contextual visualization, not physical-test evidence.

If none pass, reject all candidates and revise the style sample only. QA01 remains disabled either way.
