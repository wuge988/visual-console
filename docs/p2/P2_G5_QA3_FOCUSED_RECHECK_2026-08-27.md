# Visual Console P2 — G5 QA-3 Focused Re-check

Date: 2026-08-27
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Packet: `VC-P2-SC01-CONTROL-LOOP-001`
Human repair-review approval: `G4B-P2修复复核通过，进入G5 focused QA-3复检`
Status: `G5_FOCUSED_RECHECK_COMPLETE / G5_PASS_RECOMMENDED / HUMAN_G5_DECISION_REQUIRED`

## Focused scope

This re-check is intentionally limited to the two blocking findings returned from the first G5 QA-3 review:

- `G5-P1-01` — SC01 model/class guardrail;
- `G5-P1-02` — persisted `CAPTURED` restart recovery.

No UI, archive, non-SC01 workflow, deployment, merge, or unrelated P2 behavior is re-opened by this focused review.

## Audited repair target

- pre-repair audit head: `b7ece3335b3eb418209651ed7187141ef0fd239b`
- final repair code head: `c6962cf3e5d8efe4155a3ba33945646702ccf20e`
- authoritative final repair CI: GitHub Actions `#125` — success
- after `c6962cf...`, branch changes before this record are documentation-only; no later production/test code drift was found.

The repair diff is confined to:

- `apps/server/src/p2-runtime.ts`
- `apps/server/test/p2-runtime.test.ts`
- repair/evidence documentation.

## G5-P1-01 focused result — PASS / finding closed

The repaired validator now:

1. requires exactly one supported RMBG node;
2. accepts only the known production class representations `RMBG` and `Remove Background (RMBG)`;
3. requires exact `inputs.model === "RMBG-2.0"`;
4. still requires the frozen sensitivity/process/mask/boolean signature;
5. preserves the accepted `background = Alpha` behavior without confusing the independent `background_color` metadata field.

Focused regression coverage confirms:

- the production-compatible class representations pass;
- an unrelated lookalike class fails closed;
- model drift such as `RMBG-1.4` fails closed;
- 1536/process drift still fails;
- the previously validated Alpha + `background_color` case remains accepted.

The Human Owner's previously supplied real SC01 API workflow evidence used a supported RMBG representation and exact `RMBG-2.0`, so this hardening does not contradict the already validated production binding.

Decision for finding: `G5-P1-01 CLOSED`.

## G5-P1-02 focused result — PASS / finding closed

The repaired restart path now separates parsing from recovery and handles the `CAPTURED` crash window deterministically:

1. `readJournal()` reconstructs the latest persisted job snapshots;
2. a `CAPTURED` snapshot is checked for deterministic generated metadata including versioned filename, generated asset ID, SHA256 shape, size, path and version;
3. complete metadata is promoted directly to `QA_PENDING`;
4. incomplete metadata fails closed as `FAILED_CAPTURE / CAPTURED_RECOVERY_METADATA_INCOMPLETE`;
5. with an intact journal, the recovered state is appended back to `jobs.jsonl`;
6. with a torn tail, the recovered in-memory snapshots are handed to the existing journal-repair rewrite path;
7. recovered jobs are not put back into the execution queue, so recovery does not call ComfyUI, recapture output, or allocate a new `vNNN`.

Focused regression coverage writes real temporary journal files, invokes `readJournal()`, verifies both recovered states, rereads the persisted journal, and confirms the existing generated filename/version are retained.

Decision for finding: `G5-P1-02 CLOSED`.

## Automated evidence

Final repair code head `c6962cf3e5d8efe4155a3ba33945646702ccf20e` passed GitHub Actions CI `#125`:

- `npm ci` — success
- `npm test` — success
- `npm run build` — success

The focused review found no subsequent production-code changes after that CI-tested repair head.

## Independence boundary

The implementation owner remains `GPT-5.6 Sol + connected GitHub connector`. Implementation-session reasoning is not treated as independent human QA. The focused recommendation is grounded in deterministic GitHub Actions, exact repository diff/test evidence, and the Human Owner's previously supplied target-Windows + real-ComfyUI evidence for the actual SC01 workflow and runtime.

Final G5 approval remains a Human Owner Gate decision.

## Residual non-blocking P2 boundaries

Unchanged and intentionally outside this focused re-check:

- Gate-15-equivalent archive is absent;
- generated staging assets are not moved to F approved roots;
- no staging deletion after archive exists;
- generated-asset Trash/Restore is absent;
- only SC01 executes;
- no 1536 retuning, HEIC normalizer, WAN/video execution, public ComfyUI, deployment, or merge is authorized.

## Recommendation

`G5_PASS_RECOMMENDED / HUMAN_G5_DECISION_REQUIRED`

Both original blocking findings are closed by bounded repair and focused evidence. If the Human Owner approves G5, the project may proceed to the next JZ-v0.4 stage while still stopping before any Merge/Deployment Release Decision and before the separate Gate-15-equivalent archive slice.