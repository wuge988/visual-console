# V2-H Budget Policy Persistence — 2026-09-13

## Scope

This bounded slice upgrades the V2-H budget planner from browser-only draft preview to an explicit localhost budget-policy write path while keeping execution authority isolated.

- Runtime policy file: `.visual-console-runtime/v2-budget-policy.json`.
- Source Provider Registry remains unchanged and stays the provider/model/cloud declaration source.
- `PUT /api/v2/cloud/budget-policy` is localhost-only and accepts only:
  - `acknowledge: "BUDGET_POLICY_ONLY"`;
  - exact `per_job / per_sku / daily / monthly` non-negative limits.
- Extra authority fields such as `cloud_enabled` are rejected as `BUDGET_POLICY_SCOPE_VIOLATION`.
- `/api/v2/cloud` overlays a valid persisted runtime budget policy onto the base Registry limits and exposes the policy source/updated timestamp.
- `/v2/cloud` requires preview + explicit acknowledgement before the save button is enabled.

## Authority boundary

Persisting budget limits does **not**:

- enable Cloud;
- enable a Provider or model;
- configure a Provider adapter or credential;
- call OpenAI, Seedance or any other Provider;
- create, submit or retry a Job;
- change QA, Archive or RAW/source truth;
- grant execution authority.

The Cost Guard remains fail-closed for all independent blockers. A configured budget only removes budget-not-configured blockers when the other prerequisites remain blocked.

## CI expectations

CI must pass parser checks, `npm ci`, the complete test suite and the complete build. Unit coverage must prove:

1. exact budget-field validation;
2. explicit acknowledgement requirement;
3. rejection of authority-smuggling fields;
4. budget overlay changes limits only;
5. Cloud / Provider / adapter / model execution state stays blocked after policy application;
6. localhost V2 CORS permits the explicit budget-policy `PUT` preflight path.

## Windows Human Visual Gate

After CI PASS, use the exact reviewed branch head and open `/v2/cloud`.

1. Confirm `LOCAL POLICY WRITE` and `NO EXECUTION` are visible.
2. Enter `Per Job=1`, `Per SKU=5`, `Daily=20`, `Monthly=100`.
3. Preview and confirm `VALID DRAFT / 4 differences`.
4. Confirm Save remains disabled until the explicit acknowledgement checkbox is selected.
5. Select acknowledgement and save.
6. Confirm `POLICY SAVED` appears without any Provider or Job execution.
7. Refresh the page.
8. Confirm current authoritative budget now remains `$1 / $5 / $20 / $100` and source reports persisted Runtime Policy.
9. Confirm Cloud remains `DISABLED`, Provider/model remain disabled/not configured, and authority remains `COST_GUARD_FAIL_CLOSED`.

## First Windows Gate observation

The first Windows pass proved steps 1–4: the `1 / 5 / 20 / 100` proposal rendered `VALID DRAFT`, and Save stayed disabled until acknowledgement. After acknowledgement the write attempt showed `SAVE BLOCKED / Failed to fetch`.

Root cause was a browser preflight boundary, not budget-policy logic: the local P2 Fastify CORS allow-list exposed `GET / POST / OPTIONS` but omitted `PUT`. The browser therefore blocked `PUT /api/v2/cloud/budget-policy` before the handler could run.

The bounded fix adds only `PUT` to the localhost V2 CORS methods and adds a regression test that guards this preflight capability. No Provider, Cloud, Job, QA, Archive, RAW/source or credential authority was changed.

## Current verification

- implementation fix validated at `19296dd4c74bf7cb656a93863a702dffb2439765` with CI #634 PASS;
- current branch head `3432c6a58e829f50b615fdc4a481e706f39714d0` with CI #638 PASS;
- initial Human Visual Gate partial PASS for preview/ack gating;
- save/persistence portion must be re-run on the fixed current head.

## Gate

`BUDGET_POLICY_PERSISTENCE_CORS_FIXED / CI_638_PASS / LOCAL_RUNTIME_ONLY / EXECUTION_STILL_LOCKED / WINDOWS_PERSISTENCE_RETEST_NEXT`
