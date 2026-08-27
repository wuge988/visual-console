# Visual Console P3.1 — Maintenance Convergence Audit

Date: 2026-08-27
Base: `main @ 9aebb17e626117c2f561b26295ffb4a6412d9a48`
Branch: `chore/p3-1-maintenance-truth`
Scope: post-P3 truth/UI maintenance only; no new Workflow execution.

## Findings

### P3.1-F1 — system version truth drift

`p2-server.ts /health` reports `0.3.0-p3`, while `/api/system/status` still returned the old literal `0.2.0-p2`.

Impact: the System page could show stale runtime truth after P3 release, which weakens operator confidence and makes later incident evidence ambiguous.

Repair:
- `/api/system/status.version` aligned to `0.3.0-p3`;
- added regression coverage that checks the health/system literals remain aligned and rejects the old P2 value.

### P3.1-F2 — QA_FAIL was persisted and queryable but not reopenable in the QA UI

Backend truth already includes `QA_FAIL` in `/api/qa`, and the decision endpoint can persist a later PASS/FAIL/NOTE decision. The Vue QA page, however, reduced the entire QA dataset to `QA_PENDING`, so a failed Master disappeared from the review workspace and could only be passively previewed from Assets.

Impact: an operator could not reopen an intentionally failed cutout to inspect at red/black/white/checker backgrounds, edit its note, reverse the decision, or launch a retry from the QA workspace.

Repair:
- QA page now has explicit `待审核` and `未通过` views;
- pending view retains selection + batch-pass behavior;
- failed view is deliberately non-batch and allows individual reopen, note edit, reclassification to PASS, keeping FAIL, or creating a new SC01 retry;
- pending sidebar badge remains pending-only;
- Site/SKU change resets QA view to pending;
- polling preserves the currently visible pending/failed selection rather than forcing QA_PENDING.

### P3.1-F3 — repository status document was stale

`docs/IMPLEMENTATION_STATUS.md` still described the P1 feature branch and pre-release G6 state even though P1/P2/P3 are already released.

Repair:
- rewrote the status document to the current P3 released main baseline;
- recorded the current maintenance slice and the next P4 order.

## Scope explicitly not changed

- no SC01 inference parameter changes;
- no new ComfyUI Workflow registration;
- no SW01/SD01 execution;
- no Gate15 semantic changes;
- no D/E/F destructive action;
- no branch deletion;
- no deployment/public exposure;
- no `control_root` rename;
- no 4179 → 4177 service consolidation;
- no generated staging Trash/Restore or derivative GC.

## Next slice recommendation

After this maintenance PR is green and merged, prepare P4 as a separate Packet with the following order:

1. `SW01` — Static White Master;
2. `SD01` — Static Dark Master;
3. scene workflows later;
4. video workflows last.

P4 should consume verified P3 SC01 archive truth, not arbitrary RAW/browser paths, and should preserve versioned no-overwrite outputs plus SHA256/size evidence.
