# V2-H Budget Policy Planner — 2026-09-13

## Scope

This bounded slice adds a browser-only planning surface to `/v2/cloud` for comparing proposed budget limits with the current authoritative Provider Registry values.

The planner reads `/api/v2/cloud`, displays current per-job / per-SKU / daily / monthly limits, and lets an operator type a local draft for comparison.

## Authority boundary

The planner is intentionally non-mutating:

- no Registry write;
- no budget persistence;
- no Cloud / Provider / model enablement;
- no Cost Guard mutation;
- no Provider call;
- no Job mutation;
- no QA / Archive / RAW/source mutation;
- no execution authority.

Refreshing `/v2/cloud` resets draft values to the current Registry projection.

## Expected Windows Human Visual Gate

1. `/v2/cloud` still shows authoritative current budgets as `$0.00 / 未配置`.
2. New `BUDGET POLICY PLANNER / 预算策略草案` panel appears after the Cost Estimator.
3. Header shows `DRAFT ONLY` and `NO WRITE`.
4. Initial draft values mirror Registry values (`0 / 0 / 0 / 0`).
5. Enter draft values `1 / 5 / 20 / 100`, click `预览草案`, and confirm `VALID DRAFT` with `4` changed fields.
6. Confirm the authoritative budget cards above remain `$0.00 / 未配置`.
7. Refresh the page and confirm the draft returns to `0 / 0 / 0 / 0`.
8. Cloud remains `DISABLED`, authority remains `COST_GUARD_FAIL_CLOSED`, and no execution controls appear.

## Gate

`BUDGET_POLICY_PLANNER_IMPLEMENTED / DRAFT_ONLY / NO_WRITE / WINDOWS_HUMAN_VISUAL_GATE_REQUIRED`
