# Visual Console V2-H — Provider / Model / Pricing Fact Verification

Date: 2026-09-12

Status: `READ_ONLY_FACTS / NO_PROVIDER_EXECUTION / COST_GUARD_FAIL_CLOSED`

## Purpose

Replace placeholder Cloud-provider assumptions with dated, source-backed facts while preserving the V2-H execution boundary.

This packet does **not** enable a Provider, Adapter, model, credential mutation, paid request, or Local → Cloud fallback.

## OpenAI Image

Authoritative sources checked on 2026-09-12:

- https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
- https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
- https://developers.openai.com/api/docs/models

Verified current API model families:

### GPT-Image-2.5 Sunburst

- model id: `gpt-image-2.5-sunburst`;
- dated snapshot: `gpt-image-2.5-sunburst-2026-09-08`;
- positioned by OpenAI as the most capable image generation/editing option;
- documented endpoint support includes `v1/images/generations` and image edits;
- text input: `$5.00 / 1M tokens`;
- cached text input: `$1.25 / 1M tokens`;
- image input: `$8.00 / 1M tokens`;
- cached image input: `$2.00 / 1M tokens`;
- image output: `$30.00 / 1M tokens`.

### GPT-Image-2.5 Flare

- model id: `gpt-image-2.5-flare`;
- dated snapshot: `gpt-image-2.5-flare-2026-09-08`;
- positioned by OpenAI as the faster high-quality everyday generation option;
- documented endpoint support includes `v1/images/generations`;
- same published token rates as Sunburst in the checked model page.

Decision:

- Provider pricing metadata may be marked `KNOWN` for these recorded token rates.
- Exact **job** cost is still not known before token accounting, so this does not create a Cost Guard estimated-cost adapter.
- Provider and both models remain `enabled=false`.
- Adapter remains `NOT_CONFIGURED`.

## Seedance / Volcengine

Authoritative/current official material checked on 2026-09-12:

- https://developer.volcengine.com/articles/7628567056649125942
- https://www.volcengine.com/docs/82379/2222480?lang=zh
- https://www.volcengine.com/docs/82379/2291680?lang=zh
- https://www.volcengine.com/product/doubao/

Verified facts:

- official Volcengine developer material states Seedance 2.0 API service is available;
- current Volcengine documentation includes Doubao Seedance 2.0 tutorial/prompt guidance;
- official model/product material identifies Doubao Seedance 2.0 as the current top Seedance generation family;
- official Ark examples use `ARK_API_KEY` for API authentication.

Pricing result:

- this verification pass did **not** establish one stable authoritative per-generation/API price for the exact Seedance 2.0 execution path we would use;
- official product material also contains account/experience/entitlement distinctions that must not be collapsed into a generic executable price.

Decision:

- declare `doubao-seedance-2.0` as a current candidate model;
- mark facts `PARTIAL` and availability `API_ANNOUNCED_ACCOUNT_GATED`;
- keep Provider/model pricing `UNKNOWN`;
- keep Provider/model `enabled=false`;
- keep Adapter `NOT_CONFIGURED`;
- Cost Guard must continue blocking Seedance execution.

## Registry changes

`config/providers/registry.json` schema advances to `1.1` and records:

- `facts_status`;
- `facts_verified_at`;
- public `source_urls`;
- model IDs/snapshots where verified;
- availability status;
- public pricing metadata where verified;
- explanatory notes.

Credential values and credential environment-variable names remain server-only and are never projected to the browser.

## Execution boundary

Even after this fact-verification slice:

- `cloud_enabled=false`;
- all budgets remain zero/unconfigured;
- Provider adapters remain absent;
- no paid-generation mutation endpoint exists;
- no actual-spend ledger exists;
- no automatic Local → Cloud fallback exists;
- Job / QA / Archive / RAW-source authority is unchanged;
- P5 PR #9 / QA01 is unchanged.

## Gate

`OPENAI_IMAGE_FACTS_VERIFIED / SEEDANCE_FACTS_PARTIAL / OPENAI_TOKEN_PRICING_KNOWN / SEEDANCE_PRICING_UNKNOWN / EXECUTION_DISABLED / COST_GUARD_FAIL_CLOSED`
