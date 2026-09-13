# Visual Console V2-H — Provider Adapter Registry UI

Date: 2026-09-13

Status: `IMPLEMENTED / READ_ONLY / NETWORK_OFF / CI_PENDING / WINDOWS_HUMAN_VISUAL_GATE_NEXT`

## Goal

Expose the merged Provider Adapter Contract as a read-only operator surface inside `/v2/cloud` without granting execution authority.

## Surface

New frontend modules:

- `apps/web/src/v2-h-adapter-registry-ui.ts`
- `apps/web/src/v2-h-adapter-registry-ui.css`

The panel is mounted after Cloud Activation Preflight and reads only:

- `GET /api/v2/cloud/adapters`

Visible identity:

- `PROVIDER ADAPTER CONTRACTS`
- `Provider 适配器契约`
- `READ ONLY`
- `NETWORK OFF`

## Expected current truth

`openai-image` and `seedance-video` must both display:

- implementation `NOT_IMPLEMENTED`;
- network execution `NO`;
- executable `NO`;
- submission adapter `NOT BOUND`;
- submit path `NOT BOUND`.

Their Provider Registry adapter state remains independent and currently `NOT_CONFIGURED`.

## Authority boundary

The panel authority is:

- `PROVIDER_ADAPTER_REGISTRY_READ_ONLY`

It contains no control that can:

- enable Cloud / Provider / Model;
- save credentials;
- perform a Provider network call;
- create or retry a Job;
- mutate Budget Policy;
- mutate QA / Archive / RAW-source truth.

The UI also checks the backend audit projection. Any non-false audit capability is rendered as a fail-closed boundary error rather than trusted as execution authority.

## Human Visual Gate

Target Windows must confirm:

1. the panel renders after Activation Preflight without sidebar or shell regression;
2. `READ ONLY` and `NETWORK OFF` are visible;
3. OpenAI Image shows `openai-image`, `NOT_CONFIGURED`, `NOT_IMPLEMENTED`, network `NO`, executable `NO`, submission adapter/path `NOT BOUND`;
4. Seedance Video shows the same non-executable contract truth;
5. footer authority is `PROVIDER_ADAPTER_REGISTRY_READ_ONLY`;
6. no credential value or credential environment-variable name is visible;
7. existing Activation Preflight remains present and global authority remains `COST_GUARD_FAIL_CLOSED`.

## Gate

Keep the PR Draft / Open / Unmerged until the target-Windows Human Visual Gate passes.
