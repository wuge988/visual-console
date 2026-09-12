# Visual Console V2-H — Cost Guard Dry Run

Date: 2026-09-13

## Status

`IMPLEMENTED / READ_ONLY / FAIL_CLOSED / WINDOWS_HUMAN_VISUAL_GATE_NEXT`

Branch: `feat/v2-h-cost-guard-dry-run`

PR: `#23`

## Purpose

Connect the existing read-only token Cost Estimator to the authoritative server-side Cost Guard without granting any execution authority.

This slice is a planning and safety projection only. It does not enable Cloud execution.

## Runtime contract

### Endpoint

`POST /api/v2/cloud/evaluate`

The endpoint is localhost-only through the existing local-request assertion.

Accepted planning inputs are limited to:

- `provider_key`
- `model_key`
- `estimated_cost`
- optional planning spend values for SKU / daily / monthly

The client cannot supply or override the authoritative Provider Registry, Provider enablement, adapter readiness, pricing truth, Cloud switch, or budget limits. Those values are always re-read by the server before evaluating the guard.

### Response authority

`COST_GUARD_DRY_RUN_ONLY`

The response includes the existing deterministic Cost Guard verdict and reason codes plus an explicit audit projection showing no mutation/provider/budget/job write.

## UI behavior

The `/v2/cloud` Cost Estimator now includes `COST GUARD DRY RUN / 执行前门禁预演`.

For models with `pricing_status=KNOWN` and token pricing, the browser:

1. calculates the read-only estimated token cost;
2. submits only the planning inputs to the local dry-run endpoint;
3. renders `ALLOW` or `BLOCKED` plus authoritative blocker codes returned by the server.

With the current production-safe Registry, the expected result is `BLOCKED` because Cloud, Provider/model enablement, Provider Adapter, and budgets are still closed/unconfigured.

For models with unknown pricing, such as the current Seedance 2.0 entry, the UI does **not** fabricate an estimated cost and does **not** send a fake dry-run estimate. It stays `NOT EVALUATED` and surfaces `MODEL_PRICING_UNKNOWN`.

## Frozen authority boundary

This slice must never:

- enable Cloud, Provider, or model execution;
- modify Provider Registry or budget configuration;
- call OpenAI, Seedance, or any other paid Provider;
- create, submit, retry, or mutate Jobs;
- approve QA or promote Archive state;
- modify RAW/source, Manifest, journal, or provenance truth;
- introduce Local → Cloud silent fallback;
- treat a future dry-run `ALLOW` as execution authorization.

A future `ALLOW` means only that the deterministic Cost Guard found no blocker for the supplied planning inputs. Provider execution still requires separately implemented and explicitly authorized Adapter/execution gates.

## Automated verification

Implementation head before this documentation commit: `bc9b81a25c13f83c20deb2376e77f36fc07dcb8d`.

CI #624 passed on that implementation head, including:

- Windows physical self-check parser
- validation-page JavaScript parser
- `npm ci`
- full `npm test`
- full `npm run build`

Additional tests confirm:

- client-supplied Registry override fields are ignored;
- only scalar planning inputs are normalized;
- the authoritative default Registry remains fail-closed;
- expected blocker reasons include Cloud disabled, Provider/model disabled, Adapter not ready, and unconfigured budgets.

## Next hard gate

Target Windows `/v2/cloud` Human Visual Gate:

1. GPT-Image-2.5 Sunburst with non-zero token input must retain the correct estimate and show Cost Guard `BLOCKED` with authoritative blockers.
2. Doubao Seedance 2.0 must remain `PRICE UNKNOWN / NOT EVALUATED` with no guessed price.
3. No execution control, Provider call, budget mutation, or Job mutation may appear.

PR #23 remains Draft/Open/Unmerged until this gate passes.