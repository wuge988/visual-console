# V2-H Cloud Activation Preflight — 2026-09-13

## Goal

Add the next bounded V2-H safety slice after persistent local Budget Policy: a server-authoritative activation-readiness preflight for a selected Provider + Model, without adding any paid Provider call or execution authority.

## Scope

New localhost-only endpoint:

- `POST /api/v2/cloud/activation-preflight`

Accepted request fields are deliberately limited to:

- `provider_key`;
- `model_key`.

Any attempt to send authority-bearing fields such as `cloud_enabled`, Provider/model enablement, credentials, budget limits, spend values, Job state, QA state or Archive state is rejected as `CLOUD_ACTIVATION_PREFLIGHT_SCOPE_VIOLATION`.

The server re-reads authoritative Provider Registry + persisted Runtime Budget Policy and evaluates blockers including:

- Cloud disabled;
- Provider missing / disabled;
- Provider Adapter not READY;
- Provider credential missing;
- Provider pricing unknown;
- Model missing / disabled / pricing unknown;
- budget limits not configured;
- Provider submission adapter absent.

Credential projection is boolean-only. Credential environment-variable names and values are never returned.

## Current execution boundary

This slice intentionally keeps the implemented Provider Adapter set empty. Therefore even a hypothetical fully configured Registry with known pricing, positive budgets and a present credential remains blocked by:

`PROVIDER_SUBMISSION_ADAPTER_ABSENT`

The endpoint authority is:

`CLOUD_ACTIVATION_PREFLIGHT_ONLY`

Audit truth remains:

- mutation=false;
- provider_call=false;
- credential_write=false;
- registry_write=false;
- budget_write=false;
- job_write=false;
- qa_write=false;
- archive_write=false;
- source_write=false.

## Tests

Coverage proves:

1. authority-smuggling request fields are rejected;
2. the default Registry fails closed with explicit blockers;
3. a fully configured hypothetical Registry still cannot become executable without a submission adapter;
4. credential names/values are never projected;
5. the HTTP route returns `CLOUD_ACTIVATION_PREFLIGHT_ONLY` and no mutation/provider-call authority.

## Next bounded step

After CI PASS, expose this preflight as a read-only activation checklist in `/v2/cloud`. Do not add Provider/model enablement or paid submission in the same UI slice.

A real OpenAI/Seedance Provider Adapter remains a separate later gate requiring current API contract verification, exact cost accounting semantics, credential handling, explicit enablement, Job/provenance integration, actual-spend recording and a Human Gate before the first paid call.

## Gate

`ACTIVATION_PREFLIGHT_IMPLEMENTED / PROVIDER_CALLS_ABSENT / EXECUTION_STILL_LOCKED / CI_PENDING`
