# Visual Console V2-H — Provider Adapter Contract

Date: 2026-09-13

Status: `IMPLEMENTED / BACKEND_ONLY / PROVIDER_CALLS_ABSENT / EXECUTION_STILL_LOCKED / CI_PENDING`

## Goal

Introduce one authoritative provider-adapter contract layer without implementing any paid network execution.

This slice moves provider execution readiness out of a hard-coded empty set and into an explicit adapter registry that can be inspected and tested.

## Contract

New module:

- `apps/server/src/v2-cloud-adapters.ts`

Declared provider families:

- `openai-image`
- `seedance-video`

Both currently remain:

- `implementation_status=NOT_IMPLEMENTED`
- `network_execution=false`
- `submission_adapter=null`
- `submit_path=null`
- `executable=false`

`hasExecutableProviderAdapter()` is the single backend predicate used by Cloud Activation Preflight for the `PROVIDER_SUBMISSION_ADAPTER_ABSENT` blocker.

## Read-only API

New localhost-only endpoint:

- `GET /api/v2/cloud/adapters`

Authority:

- `PROVIDER_ADAPTER_REGISTRY_READ_ONLY`

The endpoint projects only non-secret capability metadata. It does not expose credential names or values and performs no writes or provider calls.

## Safety boundary

This slice does **not**:

- enable Cloud;
- enable a Provider;
- enable a Model;
- implement OpenAI or Seedance network calls;
- write credentials;
- write Provider Registry state;
- create or retry a Job;
- mutate QA, Archive or RAW/source truth.

A Provider cannot become executable unless a later separately gated slice deliberately changes its contract to `READY`, enables network execution, binds a submission adapter/path, and passes the existing activation/cost gates.

## Verification

Tests cover:

1. both declared adapters remain explicitly non-executable;
2. unknown providers have no executable adapter contract;
3. browser-safe projection contains no credential environment names;
4. existing activation-preflight tests continue to require `PROVIDER_SUBMISSION_ADAPTER_ABSENT` when no executable adapter exists.

## Gate

Backend-only slice. If CI is green, no Human Visual Gate is required.
