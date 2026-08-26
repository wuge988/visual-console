# Visual Console P2 — G4A Binding Record

Date prepared: 2026-08-26
Gate: `G4A`
Decision: `APPROVED`
Approved by Human Owner: 2026-08-26
Approval phrase: `G4A-P2通过，按 VC-P2-SC01-CONTROL-LOOP-001 和 P2_G4A_BINDING 授权实施`
Packet: `VC-P2-SC01-CONTROL-LOOP-001`

This record contains the complete JZ-v0.4 `G4A_BINDING_SET`. Production edits are authorized only while every binding below remains materially unchanged.

## G4A_BINDING_SET

### project
`Visual Console v0.1 / P2 SC01 Control Loop`

### repository
`wuge988/visual-console`

### base_branch
`main`

### base_commit
`024da283e9f92e35c1b0460f02df0eaa4a6ad877`

### working_branch
`feat/p2-sc01-control-loop`

Pre-implementation planning HEAD at time of preparation:

`f97b722ac9aac91e9a3e4e31943a22e0b9d3a7d8`

The subsequent planning-only commits that added this binding record and opened Draft PR #2 do not change any canonical G4A field or production scope.

### worktree
Expected target Windows runtime worktree:

`E:\AI_PROJECTS\VISUAL_CONSOLE`

Production source edits are performed against the bound GitHub branch. Target-Windows runtime validation is performed only after the implementation commits and CI are ready.

### implementation_packet
`docs/p2/P2_IMPLEMENTATION_PACKET.md` on `feat/p2-sc01-control-loop`

Packet ID: `VC-P2-SC01-CONTROL-LOOP-001`

### product_page_spec
Inherited approved Visual Console v0.1 product scope, frozen in:

`wu-e-commerce/driftwood-commerce@docs/visual-console-v0.1-design-source:docs/visual-console/S2_DESIGN_BASELINE.md`

P2 inheritance proof:

`docs/p2/P2_BASELINE_INHERITANCE.md`

### design_brief
Inherited approved Visual Console Chinese-first, dark-console, visual-production control-surface direction recorded by the same approved S2 source and Notion `Visual Console v0.1｜中文版多站点设计源与迁移冻结`.

No new visual direction is authorized by P2.

### design_baseline
`wu-e-commerce/driftwood-commerce@docs/visual-console-v0.1-design-source:docs/visual-console/S2_DESIGN_BASELINE.md`

Status in source: `G2_APPROVED / G2B_APPROVED / S2_V1_6_MOBILE_CAPTURE_INCLUDED / S4_PACKET_READY`.

### interaction_spec
`NOT_REQUIRED_AS_SEPARATE_S3_ARTIFACT`

Reason: Mode is `MODE_A_STANDARD_FRONTEND`; S3 AI Studio Spike is `NOT_REQUIRED`. The approved route, queue, dynamic QA and asset interactions are already bound in the approved S2 Design Baseline and this exact Implementation Packet.

### in_scope
Exactly the implementation described in Sections 3 and 6 of `docs/p2/P2_IMPLEMENTATION_PACKET.md`, including:

- six real application routes;
- truthful Workflow Library;
- bounded SC01 API-workflow import/registration;
- localhost ComfyUI health/queue/prompt/history client;
- serial SC01 batch queue;
- safe D/ComfyUI input preparation from registered RAW asset IDs;
- prompt-correlated transparent Master capture;
- staging no-overwrite versioning;
- persistent local job/control journal;
- dynamic QA and QA decisions;
- meaningful Assets/System pages;
- Workspace integration while preserving P1 Mobile Capture.

### non_scope
Exactly Section 4 of `docs/p2/P2_IMPLEMENTATION_PACKET.md`, including:

- no Gate-15 archive migration;
- no F approved-asset archive move;
- no staging deletion after archive;
- no permanent delete / Restore UI / generated-asset Trash;
- no execution of workflows other than SC01;
- no SC01 parameter experimentation or 1536;
- no HEIC/HEIF auto-normalizer;
- no WAN/generative video;
- no public/cloud exposure;
- no auth/multi-user/multi-GPU;
- no arbitrary shell/path APIs;
- no legacy-script cleanup;
- no merge;
- no deployment.

### allowed_files_modules
Only:

- `apps/web/src/**`
- `apps/web/package.json`
- `apps/server/src/**`
- `apps/server/test/**`
- `apps/server/package.json`
- `config/workflows/**`
- `config/sites/drift-curio.json` for additive P2 binding fields only
- root `package.json`
- root `package-lock.json`
- `.github/workflows/ci.yml`
- `docs/p2/**`
- `README.md` and implementation/status docs only when required to keep operator/governance truth accurate

Any production edit outside these paths requires a superseding G4A.

### validation_plan
Automated and target-Windows validation are exactly Section 7 of `docs/p2/P2_IMPLEMENTATION_PACKET.md`.

Required CI contract:

`npm ci → npm test → npm run build`

Required human runtime evidence includes six-route navigation, real SC01 API JSON registration, single-image execution, serial 3-image batch, prompt-correlated output/versioning, dynamic QA/decisions, restart reconstruction, P1 regression, and explicit no-archive verification.

Recommended QA class after G4B: `QA-3`.

### allowed_actions
After approval only:

- edit/create files strictly inside `allowed_files_modules`;
- commit and push implementation commits to `feat/p2-sc01-control-loop`;
- add deterministic tests;
- inspect current branch/source and GitHub Actions;
- open/update one Draft PR from the bound working branch to `main`;
- prepare `docs/p2/P2_IMPLEMENTATION_RESULT.md`;
- make bounded S5 edits necessary to satisfy the packet and validation plan.

### permissions
After approval:

- GitHub repository read/write only for the bound branch and allowed paths;
- GitHub Actions read access and normal CI triggered by pushes;
- no Merge permission under this G4A;
- no deployment permission;
- no branch deletion;
- no production/public infrastructure mutation;
- no direct destructive mutation of D/E/F user assets;
- no Gate-15 archive action;
- no remote ComfyUI exposure;
- target Windows runtime tests require the human Owner to run/pull the candidate build and provide evidence.

### implementation_owner_tool
`GPT-5.6 Sol + connected GitHub connector`

This is the sole production-code implementation owner for this G4A. It is an approved alternate unique implementer under JZ-v0.4; Antigravity/Codex/other Agents may not concurrently edit the same production scope without a superseding G4A.

### executor_identity_version
`GPT-5.6 Sol / Visual Console P2 implementation session / 2026-08-26`

## Approval semantics

Decision is `APPROVED` for the exact binding above.

Any material change to any field above invalidates the authorization and requires a superseding G4A.
