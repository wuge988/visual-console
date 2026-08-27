# Visual Console P2 — S8 Final Audit

Date: 2026-08-27
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Packet: `VC-P2-SC01-CONTROL-LOOP-001`
Stage: `S8_FINAL_AUDIT`
Status: `S8_FINAL_AUDIT_COMPLETE / G6_PASS_RECOMMENDED / HUMAN_G6_DECISION_REQUIRED`

## 1. Audit target

Repository: `wuge988/visual-console`

Base:

`main @ 024da283e9f92e35c1b0460f02df0eaa4a6ad877`

Working branch:

`feat/p2-sc01-control-loop`

Draft PR:

`#2 — P2: SC01 control loop and six-route console`

PR state at S8 audit start:

- Open;
- Draft;
- Unmerged;
- Mergeable;
- no deployment action executed.

Accepted production/UI review HEAD:

`133c4fdca4dc40c60a2bc33b6cfac773132eb1dd`

Accepted production/UI CI:

GitHub Actions `#116` — success.

Final bounded repair code HEAD:

`c6962cf3e5d8efe4155a3ba33945646702ccf20e`

Authoritative repair CI:

GitHub Actions `#125` — `npm ci → npm test → npm run build` all success.

Pre-S8 documentation successor HEAD:

`27afd3225af7f3d8a7b571bceb7620ac93ed804d`

Pre-S8 documentation-successor CI:

GitHub Actions `#129` — `npm ci → npm test → npm run build` all success.

A direct compare from `c6962cf...` to `27afd322...` shows only `docs/p2/**` evidence/status changes and no later production/test code drift.

## 2. Governance chain audit — PASS

The exact JZ-v0.4 gate chain is present and internally consistent:

1. G4A approved with exact binding: `G4A-P2通过，按 VC-P2-SC01-CONTROL-LOOP-001 和 P2_G4A_BINDING 授权实施`.
2. G4B implementation review approved: `G4B-P2通过，进入G5 QA-3独立验证`.
3. Initial G5 requested bounded repair for exactly `G5-P1-01` and `G5-P1-02`.
4. Human Owner explicitly authorized only those two S7 repairs.
5. Bounded G4B repair review approved: `G4B-P2修复复核通过，进入G5 focused QA-3复检`.
6. Focused QA-3 closed both findings and recommended G5 PASS.
7. Human Owner approved G5: `G5-P2通过，进入S8最终审计`.

No broad authorization was substituted for any hard Gate in the final evidence chain.

## 3. G4A binding integrity — PASS

The material G4A binding remains unchanged:

- project: `Visual Console v0.1 / P2 SC01 Control Loop`;
- repository/base/working branch unchanged;
- Packet unchanged: `VC-P2-SC01-CONTROL-LOOP-001`;
- Mode unchanged: `MODE_A_STANDARD_FRONTEND`;
- implementation owner remains `GPT-5.6 Sol + connected GitHub connector`;
- no superseding G4A was required.

PR #2 currently changes 26 files. Every changed file falls within the G4A `allowed_files_modules`:

- `apps/web/src/**`;
- `apps/server/src/**`;
- `apps/server/test/**`;
- `apps/server/package.json`;
- `config/workflows/**`;
- additive `config/sites/drift-curio.json` P2 fields;
- root `package.json`;
- `docs/p2/**`.

No production file outside the authorized path set is present in the PR.

## 4. Functional scope audit — PASS

The P2 implementation remains bounded to the approved slice:

- six URL-addressable application modules;
- truthful Workflow Registry;
- localhost-only SC01 API-workflow registration;
- loopback-only ComfyUI control client;
- serial SC01 Queue;
- prompt_id-correlated output capture;
- D staging no-overwrite `vNNN` assets;
- persistent E/control Job/QA journal;
- dynamic QA and decisions;
- RAW + Cutout staging Assets;
- System health;
- P1 Mobile Capture compatibility.

The site profile enables only `SC01`. Registry entries for the other 12 known workflow codes remain non-executable/unregistered.

## 5. Security and data-boundary audit — PASS

Repository inspection and accepted QA evidence confirm:

- P2 control service listens on `127.0.0.1:4179`;
- admin/mutating P2 endpoints require local request origin;
- ComfyUI URL is constrained to loopback;
- browser clients cannot provide arbitrary filesystem paths or arbitrary ComfyUI hosts;
- RAW assets are resolved through `site_id + item_id + asset_id`;
- F RAW input preparation is verified-copy/no-delete;
- output capture is tied to prompt history for the exact `prompt_id`;
- output/root traversal checks remain in place;
- staging capture is versioned/no-overwrite;
- generated staging content is not promoted to F formal archive in P2.

## 6. G5 findings audit — CLOSED

### G5-P1-01 — CLOSED / PASS

The final validator requires:

- exactly one supported RMBG node;
- supported production class representation;
- exact `RMBG-2.0`;
- frozen sensitivity/process/mask/boolean signature;
- accepted Alpha semantics without confusing `background_color`.

Negative tests fail closed on unsupported lookalike class, model drift, and process-resolution drift.

### G5-P1-02 — CLOSED / PASS

The final journal recovery path:

- promotes a complete persisted `CAPTURED` snapshot to `QA_PENDING`;
- persists recovered state back to an intact journal;
- uses the existing torn-tail rewrite path when needed;
- fails closed as `FAILED_CAPTURE / CAPTURED_RECOVERY_METADATA_INCOMPLETE` when required metadata is absent;
- does not enqueue recovered `CAPTURED`, so it does not rerun ComfyUI or allocate another staging version.

Final tests cover persisted recovery and retained filename/version.

## 7. Target-Windows / real-ComfyUI evidence audit — PASS

Accepted Human Owner evidence covers:

- six modules/navigation;
- 4177/4179/5173 startup;
- ComfyUI offline/online truth;
- real SC01 API-format workflow registration;
- one real RAW → `v001`;
- real prompt_id display/correlation;
- dynamic QA;
- three-image serial batch → `v002/v003/v004` without overwrite/OOM;
- restart reconstruction of registration/jobs/assets/QA;
- F RAW preservation;
- explicit absence of Gate-15 archive;
- accepted/frozen final Workspace structure.

P1 destructive/mobile paths that were not needlessly re-executed during P2 are explicitly identified as inherited released evidence plus current regression coverage rather than falsely relabeled as new manual tests.

## 8. Explicit non-scope audit — PASS

S8 found no implementation or execution of the following P2 non-scope items:

- Gate-15-equivalent archive migration;
- F approved generated-asset move;
- staging deletion after archive;
- generated-asset Trash/Restore;
- non-SC01 execution;
- SC01 1536 retuning/model experimentation;
- HEIC/HEIF auto-normalization;
- WAN/generative video execution;
- public/cloud ComfyUI exposure;
- auth/multi-user/multi-GPU expansion;
- arbitrary shell/path API;
- destructive legacy cleanup;
- Merge;
- Deployment.

## 9. Residual non-blocking items

The following remain explicitly deferred and do not block P2 G6:

- minor typography/spacing polish already accepted as deferred;
- generated ComfyUI input-derivative garbage collection;
- optional future consolidation of the loopback P2 control service from 4179 into 4177;
- archive/approved-asset lifecycle, which belongs to the separate Gate-15-equivalent slice;
- SC01 multi-output support beyond the current fail-closed single-PNG contract.

## 10. S8 conclusion

No unresolved P1/P0 blocker, scope escape, evidence contradiction, unauthorized destructive operation, production-code drift after the final green repair HEAD, or unauthorized Merge/Deployment action was found.

S8 recommendation:

`G6_PASS_RECOMMENDED / HUMAN_G6_DECISION_REQUIRED`

## 11. G6 boundary

G6 is the final audit Gate for this P2 implementation slice. If the Human Owner approves G6, P2 may proceed to S9 Release Decision preparation.

G6 approval by itself does **not** authorize Merge, Deployment, rollback, branch deletion, Gate-15 archive migration, or any destructive D/E/F action.

Any Merge or Deployment must be separately authorized by a one-time, exact Release Decision bound to the then-current PR/head and requested action.
