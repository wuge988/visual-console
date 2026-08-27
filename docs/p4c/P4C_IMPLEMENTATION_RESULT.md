# Visual Console P4C — SD01 Static Dark Master Result

Date: 2026-08-27
Packet: `VC-P4C-SD01-DARK-001`
PR: `#8`
Status: `P4C_RELEASE_CANDIDATE / TARGET_WINDOWS_GATE_PASS / VISUAL_DARK_PASS / SIX_PAGE_INTEGRATION_COMPLETE / REGISTRY_PROMOTED / RELEASE_CANDIDATE_CI_PASS`

## Frozen renderer

- Workflow: `SD01` — Static Dark Master
- Engine: `LOCAL_RENDERER`
- Renderer: `sd01-flat-gallery-surface-rgb-v1`
- Input: `VERIFIED_SC01_ARCHIVE`
- Background: exact `#171B20` / RGB `(23,27,32)`
- Output: same-size opaque RGB PNG
- Resize/crop: disabled
- Relight: disabled
- Synthetic shadow: disabled
- Vignette: disabled
- Generative inference: disabled

## Automated validation

The pre-physical implementation head `13ff8ab453b3a7d479d920b41a25cafa30ea90a4` passed CI #227 with:

`Parse Windows physical self-checks → Parse validation JavaScript → npm ci → npm test → npm run build`

The bounded safety suite covers archive + Manifest source provenance, F source drift rejection, deterministic #171B20 composition, PNG fail-closed behavior, version/no-overwrite, journal recovery, QA D-snapshot verification, local-only routes, approved-only Gate15 archive, `destinations.dark` asset-root boundary, F conflict/hash/size verification, Manifest conflict/idempotence, D delete-last and archive retry.

## Real target-Windows evidence

Human visual and physical Gate executed on exact runtime-tested head:

`13ff8ab453b3a7d479d920b41a25cafa30ea90a4`

Result:

- `P4C_SD01_FINAL_PHYSICAL_SELF_CHECK=PASS`
- `P4C_SD01_WINDOWS_GATE=PASS`
- Site: `drift-curio`
- SKU: `DC-ZY-SZ-31001`
- formal SD01 asset ID: `c756a0e4657ba8b9923625b2156c67cd`
- evidence directory: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P4C_SD01_20260827-214807`

The Gate proved:

- exact-piece visual identity against the VERIFIED SC01 Cutout;
- frozen `#171B20` background with unchanged wood geometry/color treatment;
- D standardized SD01 staging identity;
- QA persistence;
- F `Manifest.destinations.dark` archive;
- F SHA256 + byte-size identity;
- exactly one matching SD01 Gate15 Manifest history row;
- D delete-last final state;
- shared archive journal reconstruction;
- F preview hash/size identity;
- idempotent archive retry;
- runtime restart followed by reconstruction and F preview re-verification.

## Release-only integration after physical Gate

After the physical Gate passed, only release-surface changes were made: Registry promotion, six-page UI integration, regression tests and documentation. No post-Gate commit changed `p4-dark.ts`, `png-dark.ts`, the Windows self-check scripts, source provenance, QA backend, Gate15 archive semantics, F/D mutation order or physical storage contract.

Git compare from runtime-tested `13ff8ab453b3a7d479d920b41a25cafa30ea90a4` to release-candidate code confirms only UI / Registry / tests / docs changed.

Release-candidate head `9a44640baf51426abc854b849d7dfd8090269a15` passed CI #236:

`Parse Windows physical self-checks → Parse validation JavaScript → npm ci → npm test → npm run build`

Therefore no second physical D/E/F Gate is required for the release-only delta.

## Six-page integration

No new permanent navigation page is introduced.

1. `/workspace` — select VERIFIED SC01 Cutout and generate SD01;
2. `/workflows` — display validated local-renderer truth and frozen background;
3. `/jobs` — display SD01 deterministic derivative tasks separately from ComfyUI prompts;
4. `/qa` — compare SC01 Cutout vs SD01 Dark and persist PASS/FAIL/NOTE;
5. `/assets` — display staging/formal Dark Masters and archive QA_PASS assets to F;
6. `/system` — expose SD01 renderer, background, GPU-free execution and formal asset count.

## Registry release truth

- `workflow_status=VALIDATED_LOCAL_RENDERER`
- `executable=true`
- `execution_engine=LOCAL_RENDERER`
- `renderer=sd01-flat-gallery-surface-rgb-v1`
- `input=VERIFIED_SC01_ARCHIVE`
- `background=#171B20`
- `relight=false`
- `synthetic_shadow=false`
- `vignette=false`
- `generative_inference=false`

## Fail-closed non-scope

No scene/video workflow, relighting, shadow synthesis, vignette, generative processing, RAW deletion, public deployment, `control_root` rename, 4179→4177 consolidation or staging GC is part of P4C.
