# Visual Console V2-B — Registries + Engine Health

Date: 2026-09-12

Status: `VISIBLE_SURFACES_IMPLEMENTED / CURRENT_HEAD_CI_522_PASS / WINDOWS_BROWSER_VISUAL_GATE_NEXT / CLOUD_DISABLED / P5_UNCHANGED`

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
5. New V2 visible surfaces:
   - `/v2/system` — Core / Local Renderer / ComfyUI / Cloud + storage truth;
   - `/v2/models` — Model Registry;
   - `/v2/workflows` — Workflow Registry truth matrix.

## Truth rules

### Workflow truth

Existing `config/workflows/registry.json` remains authoritative for declared workflow metadata.

`enabled_workflows` in the Site Profile remains authoritative for site enablement.

SC01 runtime registration remains authoritative only when its existing `workflow-state.json` binding exists. V2-B must not convert Site Profile enablement into an implied SC01 registration.

Therefore:

`effective_executable = site_enabled AND runtime_registered/executable`

SC01 must fail closed when its binding is absent.

The V2 Workflow Registry surface renders these as separate columns so operators can see why a workflow is blocked rather than treating one configuration flag as execution truth.

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

The V2 System surface exposes this distinction directly. ComfyUI being offline is not presented as a whole-system failure when the current effective workflow set only needs deterministic local renderers.

## Runtime navigation rule

V2-A's sidebar-density decision remains binding: only current actionable destinations consume Sidebar rows.

V2-B adds three actionable System destinations:

- ComfyUI / Local Engines → `/v2/system`;
- Model Registry → `/v2/models`;
- Workflow Registry → `/v2/workflows`.

Storage remains visible inside `/v2/system` and therefore does not consume another Sidebar row. Future Budget / Providers / Settings rows remain hidden until implemented.

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

## Validation

Backend foundation head `0ada28df9963c29ec80c49c718a0f0c4c3ab4e67` passed CI #516.

Visible-surface code head `ecb052896cbc51ea66b1dbc4f4c18f7ded93ad07` passed CI #519.

Current PR head before this documentation-only status commit was `a910ae2f8e640901a254195a07179a78595230f4`; CI #522 passed the full contract. This document update does not change runtime code.

CI contract passed:

- Windows physical-script parse;
- validation-page JavaScript parse;
- `npm ci`;
- full tests including V2-B fail-closed projection tests;
- full server/web TypeScript build.

The V2-B tests prove:

- site enablement != runtime registration;
- SC01 binding absence fails closed;
- model activation follows effective workflow truth;
- ComfyUI offline only degrades health when required;
- deterministic local-renderer-only operation can remain READY without ComfyUI;
- cloud remains disabled/fail-closed.

## Current Gate

`WINDOWS_LOCAL_BROWSER_VISUAL_GATE_NEXT`

The visible V2-B System / Model Registry / Workflow Registry screens require one bounded target-Windows browser review before PR #12 may be marked ready or merged.

No merge or release is authorized by this packet alone.
