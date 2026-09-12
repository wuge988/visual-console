# Visual Console V2-H — Cloud Escalation Foundation

Date: 2026-09-12

Status: `FOUNDATION_IMPLEMENTED / PROVIDER_CALLS_DISABLED / COST_GUARD_FAIL_CLOSED / CI_NEXT / WINDOWS_HUMAN_VISUAL_GATE_NEXT / P5_UNCHANGED`

## Goal

Establish the Cloud Escalation control plane without enabling paid generation.

V2-H begins with a deliberately non-executable foundation:

- Provider Registry truth;
- Cost Guard policy evaluation;
- read-only Budget & Providers surface;
- server-side credential-presence projection only;
- explicit audit state showing that paid Provider adapters and actual-spend tracking are not implemented.

No OpenAI, Seedance, or other paid generation request is made by this slice.

## Frozen safety model

Cloud remains an escalation path, never a silent fallback.

The first slice preserves these rules:

1. `cloud_enabled=false` by default.
2. Unknown provider/model pricing blocks execution.
3. Unconfigured per-job, per-SKU, daily, or monthly limits block execution.
4. Disabled/unregistered Provider or Model blocks execution.
5. Provider Adapter must be `READY` before a future executable path can pass the guard.
6. Credentials remain server-side and credential values are never projected to the browser.
7. A pure Cost Guard `ALLOW` result would still not itself create execution authority; a separately gated Provider Adapter and submission path are required.
8. No Local failure automatically escalates to Cloud.
9. Job / QA / Archive / RAW-source authority remains unchanged.
10. P5 PR #9 / QA01 remain separate and unchanged.

## Provider Registry

New registry:

- `config/providers/registry.json`

Initial candidate families:

- `openai-image` — image candidate family;
- `seedance-video` — video candidate family.

They are declarations only. Both start:

- `enabled=false`;
- `adapter_status=NOT_CONFIGURED`;
- `pricing_status=UNKNOWN`;
- zero declared executable models.

No current model name, price, or availability is asserted until separately verified against a current authoritative source.

Global defaults:

- `cloud_enabled=false`;
- currency=`USD`;
- `per_job=0`;
- `per_sku=0`;
- `daily=0`;
- `monthly=0`.

Zero limits mean **unconfigured / blocked**, not unlimited.

## Cost Guard

New backend module:

- `apps/server/src/v2-cloud.ts`.

`evaluateCostGuard()` returns an explicit fail-closed result with blocker codes.

Current blocker families include:

- `CLOUD_DISABLED`;
- `PROVIDER_REQUIRED`;
- `PROVIDER_NOT_REGISTERED`;
- `PROVIDER_DISABLED`;
- `PROVIDER_ADAPTER_NOT_READY`;
- `PROVIDER_PRICING_UNKNOWN`;
- `MODEL_NOT_REGISTERED`;
- `MODEL_DISABLED`;
- `MODEL_PRICING_UNKNOWN`;
- `ESTIMATED_COST_REQUIRED`;
- unconfigured/exceeded per-job limits;
- unconfigured/exceeded per-SKU limits;
- unconfigured/exceeded daily limits;
- unconfigured/exceeded monthly limits.

The function is deterministic and has no provider network side effect.

## Read-only API

New localhost-only endpoint:

- `GET /api/v2/cloud`.

It returns:

- Provider Registry projection;
- configured-provider count;
- budget limits;
- default Cost Guard result;
- `authority=COST_GUARD_FAIL_CLOSED`;
- audit truth for paid-provider calls / adapters / spend tracking.

The browser projection exposes only `credential_configured: boolean`.

It does **not** expose:

- credential values;
- API keys;
- credential environment variable names;
- a write/enable mutation;
- a provider submission endpoint.

## Visible V2-H surface

New route:

- `/v2/cloud` — `Budget & Providers`.

New frontend:

- `apps/web/src/V2CloudApp.vue`;
- `apps/web/src/v2-h-cloud.css`;
- `apps/web/src/v2-h-shell-integration.ts`.

The surface displays:

- Cloud mode;
- configured-provider count;
- Cost Guard state;
- actual-spend tracking availability;
- four budget limits;
- current default blockers;
- candidate Provider declarations;
- adapter/pricing/enabled/credential-presence truth;
- explicit execution-authority boundary.

The shared V2 System navigation receives one `Budget & Providers · LOCKED` entry.

The page is read-only. It deliberately contains no `Enable Cloud`, `Save API key`, or `Create paid job` action in the foundation slice.

## Tests

New test module:

- `apps/server/test/v2-cloud.test.ts`.

Coverage includes:

1. default registry fails closed;
2. unknown pricing blocks;
3. fully configured pure policy input can evaluate to allow;
4. per-job/per-SKU/daily/monthly thresholds independently block;
5. browser Provider projection never exposes credential values or credential environment-variable names.

Full repository CI is required before Human Visual Gate.

## Human Visual Gate target

After CI PASS, target Windows review must confirm:

1. shared System sidebar has exactly one `Budget & Providers · LOCKED` entry;
2. `/v2/cloud` fits the existing V2 shell and Global Monitor without density regression;
3. `CLOUD DISABLED`, `FAIL CLOSED`, and `READ ONLY` are visually explicit;
4. four budget limits clearly read as unconfigured rather than unlimited;
5. OpenAI Image / Seedance Video cards are visibly declarations only, with Adapter not configured and pricing unknown;
6. credential values are absent;
7. Provider calls / paid adapter / actual spend tracking remain disabled or not implemented;
8. there is no control capable of spending money or mutating Job / QA / Archive truth.

## Explicitly deferred

This slice does not implement:

- OpenAI API adapter;
- Seedance API adapter;
- provider/model price ingestion;
- model activation;
- encrypted credential management UI;
- Cloud job submission;
- actual spend ledger;
- automatic Local → Cloud fallback;
- production Cost Guard approval mutation.

Each requires a later bounded gate after current provider facts and pricing are verified.

## Branch

- base main after V2-G completion: `9245726a23d973e37d34862bd4f3feb0a95a8abc`;
- branch: `feat/v2-h-cloud-escalation-foundation`;
- PR: next;
- next hard gates: full CI then target Windows Human Visual Gate;
- Cloud provider calls remain disabled;
- P5 PR #9 / QA01 remain unchanged.

## Gate

`PROVIDER_REGISTRY_DECLARED / COST_GUARD_FAIL_CLOSED / READ_ONLY_UI_IMPLEMENTED / PAID_CALL_PATH_ABSENT / CI_NEXT / WINDOWS_HUMAN_VISUAL_GATE_NEXT / P5_UNCHANGED`
