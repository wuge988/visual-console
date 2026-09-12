# Visual Console V2-H — Cloud Escalation Foundation

Date: 2026-09-12

Status: `FOUNDATION_IMPLEMENTED / CLOUD_PAGE_VISUAL_PASS / SHARED_NAV_FIX_CI_607_PASS / BRANCH_CI_615_PASS / FINAL_WINDOWS_REGRESSION_NEXT / PROVIDER_CALLS_DISABLED / COST_GUARD_FAIL_CLOSED / PR19_DRAFT_OPEN_UNMERGED / P5_UNCHANGED`

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

## Tests and CI

New test module:

- `apps/server/test/v2-cloud.test.ts`.

Coverage includes:

1. default registry fails closed;
2. unknown pricing blocks;
3. fully configured pure policy input can evaluate to allow;
4. per-job/per-SKU/daily/monthly thresholds independently block;
5. browser Provider projection never exposes credential values or credential environment-variable names.

Initial implementation/UI head: `9b1a6af2336e1ed8a8137629a05d5c0f20c8e010` — CI #604 `PASS`.
Documentation-sync head: `4ceb6689ad9e582260573fed0bf64a06ae991b63` — CI #605 `PASS`.

The first target-Windows review passed the Cloud page itself but exposed one bounded shared-shell defect: V2App already contained a disabled future `Budget & Providers` placeholder, so the DOM integration found that hidden placeholder and did not create a visible locked entry.

Bounded fix:

- `apps/web/src/v2-h-shell-integration.ts` upgrades an existing placeholder in place;
- removes native `disabled` state/class;
- removes stale future-hint/arrow children;
- normalizes the visible label to `Budget & Providers`;
- adds exactly one `LOCKED` badge;
- keeps `/v2/cloud` active-state/navigation binding;
- normalization is idempotent to avoid MutationObserver child-list loops.

Runtime fix exact head: `373c16596f398e136471b332929953776323e2c8` — CI #607 `PASS`.
Current branch head after documentation-only synchronization: `2c8b5a22f95e4bc89c66295b1ee8f3e412146483` — CI #615 `PASS`.

CI passed:

- Windows physical self-check parsing;
- validation-page JavaScript parsing;
- `npm ci`;
- full `npm test`;
- Vue/TypeScript typecheck and full build.

## Human Visual Gate result so far

Target Windows Cloud surface is `PASS` for:

- `/v2/cloud` visual hierarchy and shell fit;
- `CLOUD DISABLED / FAIL CLOSED / READ ONLY` visibility;
- four budget limits shown as unconfigured, not unlimited;
- OpenAI Image / Seedance Video cards shown as declarations only;
- Adapter not configured / pricing unknown / provider disabled / no credentials;
- Provider calls disabled;
- paid generation adapter not implemented;
- actual-spend tracking not implemented;
- silent Cloud fallback forbidden;
- bottom authority boundary `COST_GUARD_FAIL_CLOSED`;
- no spending/mutation control.

Remaining final regression gate: target Windows must confirm the shared System sidebar now visibly exposes exactly one `Budget & Providers · LOCKED` entry and that `/v2/cloud` marks it active without a density regression.

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

## Branch / PR

- base main after V2-G completion: `9245726a23d973e37d34862bd4f3feb0a95a8abc`;
- branch: `feat/v2-h-cloud-escalation-foundation`;
- PR #19: `Draft / Open / Unmerged`;
- runtime fix: `373c16596f398e136471b332929953776323e2c8` / CI #607 `PASS`;
- current branch head: `2c8b5a22f95e4bc89c66295b1ee8f3e412146483` / CI #615 `PASS`;
- next hard gate: one target-Windows shared-nav regression screenshot set;
- Cloud provider calls remain disabled;
- P5 PR #9 / QA01 remain unchanged.

## Gate

`PROVIDER_REGISTRY_DECLARED / COST_GUARD_FAIL_CLOSED / READ_ONLY_UI_IMPLEMENTED / PAID_CALL_PATH_ABSENT / CLOUD_PAGE_VISUAL_PASS / SHARED_NAV_FIX_CI_607_PASS / BRANCH_CI_615_PASS / FINAL_WINDOWS_REGRESSION_NEXT / PR19_DRAFT_OPEN_UNMERGED / P5_UNCHANGED`
