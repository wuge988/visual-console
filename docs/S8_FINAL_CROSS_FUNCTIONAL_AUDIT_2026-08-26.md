# Visual Console v0.1 — S8 Final Cross-Functional Audit

Date: 2026-08-26  
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`  
Repository: `wuge988/visual-console`  
PR: `#1`

## Executive result

`S8_FINAL_AUDIT_PASS / G6_RECOMMEND_APPROVED_FOR_MERGE_DECISION_ONLY / OWNER_G6_DECISION_REQUIRED`

No open P0/P1 product, implementation, browser/device QA or data-safety blocker remains within the approved P1 scope.

This audit does **not** authorize Merge, deployment, public exposure, SC01/ComfyUI production integration, branch cleanup or D/E/F cleanup.

## Governance chain

The audited chain is complete:

- G1/G2 design and product direction approved;
- workflow mode: `MODE_A_STANDARD_FRONTEND`;
- production implementation authorized through G4A and later superseding G4A-REPAIR;
- initial G4B identified blocking implementation findings;
- bounded S7 repair completed under the superseding binding;
- G4B rerun: PASS;
- G5 QA class: `QA-3`;
- independent target-device QA actor: human project Owner;
- G5 review recommendation: PASS;
- human Owner decision: `G5通过，进入S8最终跨职能审计`;
- G5 Gate Decision: APPROVED.

Key records:

- `docs/G4A_REPAIR_BINDING_G4B_001.md`
- `docs/S7_REPAIR_PACKET_G4B_001.md`
- `docs/S7_REPAIR_IMPLEMENTATION_RESULT_G4B_001.md`
- `docs/G4B_RERUN_RESULT_2026-08-26.md`
- `docs/G5_QA_REVIEW_2026-08-26.md`
- `docs/G5_GATE_DECISION_2026-08-26.md`

## Product / scope audit

Approved P1 product scope is coherent and complete:

- Chinese-first local Visual Console shell;
- site-neutral core with DRIFT CURIO as first Site Profile;
- current Site + SKU production context;
- iPhone same-Wi-Fi mobile capture;
- 12-hour Site + SKU upload Session;
- direct photo / Photos-files / video upload;
- >32 MiB chunk path;
- verified persistence into F RAW;
- Desktop Gallery refresh;
- desktop-only compact `×` move-to-Trash;
- flat `100_Trash\<SKU>\<file>` layout and audit index.

Explicitly not part of this release target:

- SC01/ComfyUI production execution;
- SQLite persistence;
- public/cloud mobile capture;
- multi-operator/multi-device capture lanes;
- Trash Restore UI;
- permanent delete;
- destructive cleanup of legacy fallback scripts.

Result: `PASS`.

## Architecture audit

Canonical runtime entrypoints are consolidated:

- server: `apps/server/src/index.ts`;
- web: `apps/web/src/App.vue`;
- Local API: port `4177`;
- Desktop dev UI: port `5173`;
- Trash operation is part of the canonical 4177 Core API;
- Site Profile discovery is configuration-driven;
- DRIFT CURIO SKU validation runs through `drift_curio_sku_v1`;
- D/E/F storage responsibilities remain separated.

No obsolete P1 server/web entrypoint is part of the canonical runtime.

Result: `PASS`.

## Data-safety audit

The approved runtime includes:

- server-enforced direct upload limit;
- fixed chunk size and exact chunk-length enforcement;
- declared source-size cap;
- active-upload bounds and GC;
- no-overwrite target semantics;
- D→F verified copy before source deletion;
- size + SHA256 verification;
- source preservation on verification failure;
- lexical allowlist plus realpath/symlink escape defenses;
- frozen SKU validation before directory creation;
- Trash as move, not permanent delete;
- Trash audit provenance.

Independent target Windows + iPhone evidence confirmed photo/video persistence, >32 MiB chunk flow, Trash flow and invalid-SKU isolation.

Result: `PASS`.

## Browser / mobile / operator audit

Owner-supplied independent QA confirms:

- target WLAN correctly selected instead of Karing TUN;
- QR opens on iPhone Safari;
- current SKU and Session validity are visible;
- all uploaded material is clearly bound to the displayed SKU;
- Gallery reflects completed uploads;
- compact desktop Trash control behaves as intentionally designed;
- mobile capture surface has no destructive permission;
- regenerated same-SKU QR invalidates the older Session;
- switching SKU requires a new bound Session.

Result: `PASS`.

## Build / reproducibility audit

Repository includes a committed `package-lock.json`.

CI contract:

`npm ci → npm test → npm run build`

Focused tests cover SKU adapter behavior, LAN selection, Session invalidation/expiry, upload/chunk limits, path isolation, verified transfer, no-overwrite, verification-failure containment and Trash/audit behavior.

Current-head CI must remain green before any G6 decision is accepted; the exact passing head is pinned in PR metadata after this documentation-only audit sequence completes.

Result: `PASS_WITH_EXACT_HEAD_PIN_REQUIRED`.

## Security / privacy audit

No credential or `.env` secret is required in the reviewed source tree. `.env` and logs are ignored.

The repository is public and the DRIFT CURIO Site Profile contains machine-local absolute path strings. These paths reveal workstation folder organization but do not contain credentials or RAW asset contents.

Current mobile exposure is intentionally Private-LAN only.

Residual security/privacy items remain P2 and do not block the current scope:

1. bearer upload token appears in QR URL;
2. `/api/health` exposes LAN candidate metadata;
3. public repository includes machine-local path strings;
4. public/cloud exposure is unsupported and requires a new security design.

Result: `PASS_FOR_PRIVATE_LAN_SCOPE`.

## Operations / rollback audit

Formal runbook:

`docs/OPERATIONS_AND_ROLLBACK_P1.md`

Important release semantics:

- Merge is repository canonicalization only; it is **not** a deployment;
- Merge does not mutate F/D/E assets;
- current reviewed Windows runtime can continue running until a separately authorized local cutover;
- the pre-Merge network-resilient launcher pulls the feature branch and must not be treated as a post-Merge `main` updater;
- post-Merge canonical `main` startup/cutover is documented separately;
- service restart invalidates in-memory Sessions/chunk state by design;
- code rollback must not delete or rewrite RAW/Trash/Work/Staging/Manifest roots;
- any GitHub rollback/revert requires its own one-action Release Decision under JZ-v0.4.

Result: `PASS`.

## Open severity review

### P0

None.

### P1

None.

### P2 carried forward

- QR bearer token in URL — accepted only for current Private-LAN scope;
- LAN health metadata exposure — local diagnostic debt;
- Trash move precedes audit-index append — consistency/observability debt;
- Session/chunk state is in-memory — intentional P1 limitation;
- multi-user/multi-device capture-lane policy undefined — deferred;
- no-confirmation Trash action — explicit Owner-accepted product decision;
- Site Profile absolute machine paths are committed in a public repository — move to local override before broader multi-workstation distribution;
- pre-Merge network-resilient launcher hardcodes the feature branch — not a post-Merge updater;
- Restore UI and automated retention are deferred.

These P2 items must not be silently reclassified as supported capabilities.

## Exact release target recommended for G6

S8 recommends G6 approval **only to request a separate one-action Merge Release Decision**.

Proposed action:

- repository: `wuge988/visual-console`;
- PR: `#1`;
- base branch: `main`;
- expected base before release: `0ba9959c285816fd4ec0d7b7efbccef3b849bd4c` unless GitHub reports a changed base before decision;
- head branch: `feat/p1-mobile-capture-runtime`;
- expected head: **must be pinned to the final audit-doc HEAD in PR metadata after all S8 documentation commits and current-head CI succeed**;
- merge method recommended: `squash`;
- exactly one action: Merge PR #1 into `main`;
- no deployment;
- no local workstation cutover;
- no feature-branch deletion;
- no D/E/F cleanup;
- no SC01/ComfyUI production integration.

If base/head/CI changes before the Release Decision, the exact target must be recalculated.

## S8 recommendation

`G6_RECOMMEND_APPROVED_FOR_MERGE_DECISION_ONLY`

Human Owner Gate decision is required.

G6 approval would mean only that this exact target may request a separate Release Decision. It would still **not** authorize the Merge itself.
