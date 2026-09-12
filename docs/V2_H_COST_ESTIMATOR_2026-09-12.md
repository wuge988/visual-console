# V2-H Read-only Cost Estimator — 2026-09-12

## Goal

Add a deterministic planning surface under `/v2/cloud` without enabling Cloud execution.

The estimator uses only Provider Registry pricing metadata already projected by `/api/v2/cloud` and user-entered token counts. It does not contact OpenAI, Volcengine/Seedance, or any third-party pricing service.

## Scope

- new `v2-h-cost-estimator.ts` browser enhancement;
- new `v2-h-cost-estimator.css` presentation layer;
- mounted only on `/v2/cloud`;
- reads current Provider/model declarations from `http://127.0.0.1:4179/api/v2/cloud`;
- supports manual token arithmetic only when a model has `pricing_status=KNOWN` and `pricing.basis=TOKEN`;
- models with unresolved pricing remain visibly locked rather than guessed.

## Current behavior

OpenAI Image models with verified token rates expose five manual counters:

1. text input tokens;
2. cached text input tokens;
3. image input tokens;
4. cached image input tokens;
5. image output tokens.

Estimated cost is the sum of `tokens / 1,000,000 × registry rate` for each populated category.

Seedance 2.0 remains `PRICE UNKNOWN`; the estimator therefore renders `当前无法形成可信成本估算` and does not invent a number.

## Authority boundary

The estimator is informational only:

- no Provider API call;
- no credential handling;
- no budget mutation;
- no Provider/model enablement;
- no Job submission or retry;
- no QA approval;
- no Archive promotion;
- no RAW/source mutation;
- no silent Local → Cloud fallback.

The Cost Guard remains authoritative. Estimator output does not equal Cost Guard authorization and does not represent actual billed spend.

## Human Gate

After exact-head CI PASS, verify on target Windows `/v2/cloud`:

- estimator appears between Provider Registry and Authority boundary;
- OpenAI known-price model can be selected and manual token inputs update the displayed estimate;
- Seedance remains price-unknown and locked;
- `NO EXECUTION` and read-only authority copy are visible;
- existing V2-H layout, Provider facts and Sidebar density do not regress.

Gate: `READ_ONLY_ESTIMATOR_IMPLEMENTED / CI_NEXT / WINDOWS_HUMAN_VISUAL_GATE_NEXT / PROVIDER_CALLS_DISABLED / COST_GUARD_FAIL_CLOSED`.
