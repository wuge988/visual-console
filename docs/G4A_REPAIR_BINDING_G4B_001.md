# Visual Console v0.1 — G4A Repair Binding G4B-001

Status: `APPROVED`
Decision source: project owner explicit chat authorization on 2026-08-26: `G4A-REPAIR通过，按 S7_REPAIR_PACKET_G4B_001 授权修复`
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
AI Studio Spike: `NOT_REQUIRED`

## Canonical G4A binding set

- Project: `Visual Console v0.1 / P1 bounded G4B repair`
- Repository: `wuge988/visual-console`
- Base branch: `main`
- Base commit: `0ba9959c285816fd4ec0d7b7efbccef3b849bd4c`
- Working branch: `feat/p1-mobile-capture-runtime`
- Pre-repair HEAD: `66fc00c052303be0e54657be3ac85d37b00aa0ad`
- Target runtime worktree: `E:\AI_PROJECTS\VISUAL_CONSOLE`
- Implementation Packet: `docs/S7_REPAIR_PACKET_G4B_001.md` (blob `a3e13118a1f58ad2e3eee671cb35d2449b62c023` at authorization)
- Product/Page Spec: `wu-e-commerce/driftwood-commerce:docs/visual-console/VISUAL_CONSOLE_V0_1_DESIGN_SOURCE.md` on `docs/visual-console-v0.1-design-source` (blob `aada4f79a3522865ad98c9a84a5dcb155bbeb495`)
- Design Brief: same approved Visual Console Design Source above; this repair introduces no design-scope change.
- Design Baseline: `wu-e-commerce/driftwood-commerce:docs/visual-console/S2_DESIGN_BASELINE.md` on `docs/visual-console-v0.1-design-source` (blob `96c4e5ff59d16562445605355d5c419443bb944a`)
- Interaction Spec: `NOT_REQUIRED` for `MODE_A_STANDARD_FRONTEND`; no new AI/novel interaction is introduced by this repair.
- Exact In Scope: exactly `docs/S7_REPAIR_PACKET_G4B_001.md#Exact in-scope repair`.
- Exact Non-Scope: exactly `docs/S7_REPAIR_PACKET_G4B_001.md#Exact non-scope`.
- Allowed files/modules: exactly the packet allowlist; bounded helper/test files under `apps/server/src/` or `apps/server/test/` are allowed.
- Validation plan: exactly the packet validation plan, including deterministic install, focused data-safety tests, build, current-HEAD CI, target-Windows regression and negative regression.
- Allowed actions: bounded edits/tests/lockfile/CI/evidence commits on the working branch and Draft PR updates.
- Permissions: repository write on the working branch only; local target verification may be requested; no merge/deploy/public exposure/destructive user-data tests.
- Implementation owner/tool: `ChatGPT GPT-5.6 Sol + GitHub connector`.
- Executor identity/version: `GPT-5.6 Sol`, current authorized implementation session.

## Mandatory safety boundary

This G4A does not authorize:

- PR merge;
- deployment;
- SC01/ComfyUI production integration;
- SQLite or service-restart resume;
- public/cloud exposure;
- Trash restore/batch delete;
- deletion of user RAW/Trash data for tests;
- edits outside the repair packet allowlist.

Any material change to repository, branch, worktree, packet, scope, validation, permissions, implementation owner/tool or executor invalidates this binding and requires a new G4A.
