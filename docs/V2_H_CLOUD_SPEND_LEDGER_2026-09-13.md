# Visual Console V2-H — Cloud Spend Ledger Foundation

Date: 2026-09-13

Status: `BACKEND_FOUNDATION / APPEND_ONLY / READ_ONLY_ROUTE / NO_PROVIDER_CALL / NO_BROWSER_WRITE / CI_PENDING`

## Goal

Add the audit substrate required before any paid cloud Provider can be approved for execution.

This slice does **not** enable Cloud, Provider, Model, credentials, submission adapters, jobs, QA, Archive, or RAW/source mutation. It also does not make any external Provider request.

## Ledger semantics

Runtime file:

- `.visual-console-runtime/v2-cloud-spend.jsonl`

The ledger is append-only and uses two event types per logical paid attempt:

1. `RESERVATION` — records the Cost Guard-approved estimated amount before a future paid request;
2. `SETTLEMENT` — records the known actual amount after a future Provider response/billing result.

Each event records:

- logical `spend_id`;
- Site / Job / Exact Piece identifiers;
- Provider / Model keys;
- amount + currency;
- approval source;
- event and recording timestamps.

A settlement requires an existing reservation and duplicate event phases for the same `spend_id` are rejected.

## Browser authority

New localhost-only route:

- `GET /api/v2/cloud/spend`

Authority:

- `CLOUD_SPEND_LEDGER_READ_ONLY`

The route can filter by Site, Exact Piece, Job, Provider, Model, and time range. It returns:

- read-only event projection;
- reservation / settlement counts;
- unsettled reservation count;
- per-currency reserved estimate and known actual totals;
- torn-tail recovery state.

There is deliberately **no HTTP write route**. Future Provider adapters may call the server-internal append function only after their own separately gated Cost Guard / execution authorization path exists.

## Safety properties

- local-only API boundary remains enforced;
- ledger file path is not exposed to the browser;
- no credential values or credential environment names are stored in the ledger;
- append input is exact-scope validated;
- negative amounts and invalid currencies are rejected;
- malformed interior ledger records fail closed;
- only an incomplete final JSONL tail may be ignored after a crash;
- Cloud remains disabled;
- Provider adapters remain `NOT_IMPLEMENTED` and network execution remains off;
- no automatic Local → Cloud fallback;
- P5 / QA01 truth is unchanged.

## Gate

Backend-only safety slice. No new visual operator surface is introduced, so Human Visual Gate is not required if CI passes.

`SPEND_LEDGER_FOUNDATION_IMPLEMENTED / NO_BROWSER_WRITE / NO_PROVIDER_CALL / EXECUTION_STILL_LOCKED / CI_PENDING`
