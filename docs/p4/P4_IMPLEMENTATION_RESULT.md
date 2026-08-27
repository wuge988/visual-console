# Visual Console P4A — SW01 Implementation Result

Date: 2026-08-27
Packet: `VC-P4-STATIC-DERIVATIVES-001`
Branch: `feat/p4-static-derivatives`
Base: `main @ a3be177d602c3bbc72f22a959eb3a5273b2fa1f3`
Status: `P4A_RELEASE_CANDIDATE / TARGET_WINDOWS_PHYSICAL_PASS / VISUAL_WHITE_PASS / SIX_PAGE_INTEGRATION_COMPLETE / REGISTRY_PROMOTED / CI_PASS`

## 1. Released candidate scope

P4A implements `SW01 = Static White Master` as a deterministic local renderer rather than another AI/RMBG pass.

Source:

`P3 VERIFIED_ARCHIVE SC01 Cutout Master on F`

Output:

`{SKU}__white__master__wf-SW01__vNNN.png`

Renderer:

`sw01-flat-white-rgb-v1`

Transform contract:

- same width/height as the verified SC01 Cutout;
- alpha composited over exact `#FFFFFF`;
- opaque RGB PNG;
- no resize, crop, relight, RMBG rerun, generative inference, or GPU use;
- deterministic output for identical verified source bytes and renderer version.

## 2. Source identity / provenance

The browser submits only an archive asset ID. Before rendering, the service requires and cross-checks:

1. P3 `archives.jsonl` snapshot;
2. `workflow_code=SC01`;
3. `destination_key=cutout`;
4. `result=VERIFIED_ARCHIVE`;
5. requested Site + SKU identity;
6. standardized Cutout filename;
7. matching durable Manifest `archive_history` row;
8. current F source inside the formal Site `asset_root`;
9. current F SHA256 + byte size equal to durable archive truth.

Browser-supplied filesystem paths, filename, SHA, size, or destination fields cannot establish source identity.

## 3. Deterministic PNG renderer

`apps/server/src/png-white.ts` provides the bounded renderer:

- PNG signature and chunk CRC validation;
- 8-bit RGBA / color type 6 only;
- non-interlaced input;
- PNG filters 0–4;
- input/dimension/pixel limits;
- unsupported formats fail closed;
- alpha-over-white compositing;
- deterministic RGB PNG output.

## 4. Derivative state / restart recovery

Dedicated append-only journal:

`<control_root>/derivatives.jsonl`

State model:

`GENERATING → QA_PENDING → QA_PASS | QA_FAIL`

Generation failure:

`FAILED_GENERATION`

A persisted `GENERATING` record can recover only when the verified F source still proves identity and the D output is byte-for-byte equal to a fresh deterministic render. Missing or mismatching output fails closed.

Versions are serialized and no-overwrite: `v001..v999`.

## 5. QA and Gate15 White archive

QA supports White Master preview, Cutout comparison, PASS / FAIL / NOTE, and failed-item reopening.

A QA decision re-checks D staging SHA256 + byte size. Archived derivatives cannot be reclassified through QA.

QA_PASS archive uses Manifest `destinations.white` with the released Gate15 ordering:

1. persisted derivative identity;
2. D staging SHA256 + size recheck;
3. Manifest `destinations.white` resolution;
4. formal `asset_root` boundary;
5. F create/no-overwrite;
6. F SHA256 + size verification;
7. exactly one idempotent SW01 Manifest history row;
8. F re-verification;
9. D staging delete last;
10. durable archive snapshot.

Same-name/different-content targets and incomplete durable identity fail closed.

## 6. Target Windows physical evidence — PASS

Physical storage semantics were validated on the target Windows workstation against runtime code head:

`1e5533492f6aeb38affe85e59e06d45b2e83863c`

Evidence bundle:

`E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\visual-console-p2\drift-curio\evidence\P4_SW01_20260827-190020`

Final markers:

- `P4_SW01_FINAL_PHYSICAL_SELF_CHECK=PASS`
- `P4_SW01_WINDOWS_GATE=PASS`

The physical Gate proved:

- real P3 archived SC01 source resolution;
- Manifest + archive-journal provenance;
- source F SHA256/size;
- standardized D SW01 output/version;
- persisted QA PASS;
- Manifest `destinations.white` routing;
- formal F White Master SHA256/size;
- exactly one matching SW01 Gate15 Manifest history row;
- D staging absent after delete-last;
- derivative/archive journal reconstruction;
- F preview endpoint hash/size;
- idempotent archive retry;
- runtime restart reconstruction and F preview.

The earlier PowerShell collection-shaping false negative was confined to the self-check client and was repaired before this final PASS; no archive/runtime invariant was weakened.

## 7. Human White Master visual evidence — PASS

The verified SC01 transparent Cutout and generated SW01 White Master were reviewed side-by-side.

Result: `PASS`.

Observed acceptance:

- same exact driftwood piece;
- silhouette and major branches aligned;
- holes/negative spaces aligned;
- no obvious added/removed geometry;
- no obvious edge corruption at review scale;
- output background visually uniform white.

## 8. Six-page Visual Console integration

After the physical storage Gate passed, SW01 was integrated into the accepted six-page console without introducing a seventh permanent navigation page.

- `/workspace` — verified SC01 archive source selection + SW01 generation;
- `/workflows` — validated local-renderer truth;
- `/jobs` — SW01 deterministic derivative task truth, separate from ComfyUI Prompt semantics;
- `/qa` — Cutout vs White comparison with PASS/FAIL/NOTE;
- `/assets` — White Master staging/formal asset cards and Gate15 archive action;
- `/system` — SW01 renderer / formal asset runtime facts.

The temporary `/sw01.html` surface remains a physical-validation utility, not a navigation page.

## 9. Registry promotion

After physical PASS, `SW01` was promoted to:

- `workflow_status=VALIDATED_LOCAL_RENDERER`;
- `executable=true` for the current DRIFT CURIO release configuration;
- `execution_engine=LOCAL_RENDERER`;
- renderer `sw01-flat-white-rgb-v1`;
- input `VERIFIED_SC01_ARCHIVE`;
- background `#FFFFFF`;
- output `RGB_PNG`;
- `generative_inference=false`.

`SD01` remains `NOT_REGISTERED / executable=false`; scene/video workflows remain disabled.

## 10. Automated validation

Release-candidate CI #199 at head `01dcb9babb877e92529a708b19aa80118fdbe9c0`: **PASS**.

Contract:

`Parse P3/P4 Windows scripts → Parse validation JavaScript → npm ci → npm test → npm run build`

Automated test result:

- total: 50;
- pass: 50;
- fail: 0.

Coverage includes all P1/P2/P3/P3.1 regressions plus SW01 provenance, deterministic pixels, unsupported PNG fail-closed, source drift, restart recovery, Gate15 conflict/idempotence, route lifecycle, and six-page release integration.

## 11. Final bounded audit

Result: `PASS / NO_P0_P1_FINDING`.

Confirmed:

- physical-tested P4 derivative/archive semantics were not modified after target-Windows PASS;
- post-physical changes are UI integration, registry truth, typings/tests/docs only;
- P3 SC01 Gate15 semantics remain unchanged;
- F no-overwrite and D delete-last remain intact;
- browser cannot submit arbitrary physical paths;
- no RAW deletion;
- no public/cloud exposure;
- no SD01, scene, or video execution;
- no safety-stash pop, hard reset, or destructive workspace cleanup.

## 12. Release decision

All P4A hard gates are closed. PR #6 is eligible for Ready → exact-head/CI/mergeability review → squash merge → post-merge main CI.

P4B begins only after P4A release and is limited initially to `SD01 Static Dark Master` visual-template/style freeze; SD01 execution remains disabled until its own Packet and Gate evidence.
