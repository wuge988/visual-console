# Visual Console V2-B — Registries + Engine Health

Date: 2026-09-12

Status: `IMPLEMENTATION_IN_PROGRESS / READ_ONLY_REGISTRY_PROJECTION / CLOUD_DISABLED / P5_UNCHANGED`

## Goal

Turn the frozen V2 registry design into runtime truth without changing existing production workflow semantics.

V2-B is a read-only projection and health layer over existing validated P2/P3/P4 truth. It does **not** re-register, enable, mutate, or execute workflows.

## Scope

1. Model Registry seed for current local model metadata.
2. Workflow Registry V2 projection with separate fields for:
   - site enablement;
   - runtime registration;
   - effective executability.
3. Engine Health projection for:
   - Visual Console core;
   - deterministic local renderer;
   - ComfyUI;
   - storage roots;
   - cloud provider state.
4. New localhost-only read endpoints:
   - `GET /api/v2/registries/workflows?site_id=...`
   - `GET /api/v2/registries/models?site_id=...`
   - `GET /api/v2/engines/health?site_id=...`

## Truth rules

### Workflow truth

Existing `config/workflows/registry.json` remains authoritative for declared workflow metadata.

`enabled_workflows` in the Site Profile remains authoritative for site enablement.

SC01 runtime registration remains authoritative only when its existing `workflow-state.json` binding exists. V2-B must not convert Site Profile enablement into an implied SC01 registration.

Therefore:

`effective_executable = site_enabled AND runtime_registered/executable`

SC01 must fail closed when its binding is absent.

### Model truth

`config/models/registry.json` is metadata only. A model becomes `ACTIVE` only through an effectively executable workflow. Merely declaring a model does not enable generation.

The initial registry contains only current local RMBG-2.0 metadata. Cloud models are intentionally absent until V2-H Provider Adapters + Cost Guard.

### Engine health

- Core API is online when the P2 process serves the endpoint.
- Deterministic local renderer is available when one or more effective `LOCAL_RENDERER` workflows exist.
- ComfyUI health is probed only through the frozen loopback endpoint.
- ComfyUI offline degrades overall health only when a currently executable workflow requires ComfyUI.
- Storage health is read-only and never creates, repairs, moves, or deletes data.
- Cloud remains `DISABLED / fail_closed=true`.

## Safety / non-scope

V2-B does not:

- change SC01/SW01/SD01 renderer semantics;
- enable QA01/QR01/QP01/QC01/VP01/VS01;
- mutate Site Profiles;
- mutate Manifest/journal/F archive;
- call paid providers;
- store provider keys;
- alter active P5 PR #9;
- deploy or expose the console publicly.

## Validation contract

- TypeScript build passes.
- Existing full server tests remain green.
- New V2-B unit tests prove:
  - site enablement != runtime registration;
  - SC01 binding absence fails closed;
  - model activation follows effective workflow truth;
  - ComfyUI offline only degrades health when required;
  - deterministic local-renderer-only operation can remain READY without ComfyUI;
  - cloud remains disabled/fail-closed.

## Next bounded step

After CI passes, wire the read-only projections into `/v2` System / Model Registry / Workflow Registry surfaces. No Human Visual Gate is required for the backend projection itself; the first new visible V2-B screens require a bounded visual review before merge.
