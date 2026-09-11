# Visual Console V2-B — Registries + Engine Health

Date: 2026-09-12

Status: `VISIBLE_SURFACES_IMPLEMENTED / EXACT_HEAD_CI_527_PASS / WINDOWS_BROWSER_VISUAL_GATE_NEXT / CLOUD_DISABLED / P5_UNCHANGED`

This packet is frozen at the Human Visual Gate. Runtime code for the visible V2-B surfaces is `ecb052896cbc51ea66b1dbc4f4c18f7ded93ad07` and passed CI #519. The current exact PR head before this status-only documentation update was `d448db6cb6c5b831a636b72b511fcd9c74d5b9cc` and passed CI #527. No post-runtime commit changes V2-B execution behavior.

## Goal

Turn the frozen V2 registry design into runtime truth without changing existing production workflow semantics.

V2-B is a read-only projection and health layer over existing validated P2/P3/P4 truth. It does **not** re-register, enable, mutate, or execute workflows.

## Scope

1. Model Registry seed for current local model metadata.
2. Workflow Registry V2 projection with separate fields for site enablement, runtime registration, and effective executability.
3. Engine Health projection for Visual Console core, deterministic local renderer, ComfyUI, storage roots, and cloud provider state.
4. Localhost-only read endpoints:
   - `GET /api/v2/registries/workflows?site_id=...`
   - `GET /api/v2/registries/models?site_id=...`
   - `GET /api/v2/engines/health?site_id=...`
5. V2 visible surfaces:
   - `/v2/system` — Core / Local Renderer / ComfyUI / Cloud + storage truth;
   - `/v2/models` — Model Registry;
   - `/v2/workflows` — Workflow Registry truth matrix.

## Truth rules

### Workflow truth

Existing `config/workflows/registry.json` remains authoritative for declared workflow metadata. `enabled_workflows` in the Site Profile remains authoritative for site enablement. SC01 runtime registration is authoritative only when its existing `workflow-state.json` binding exists.

`effective_executable = site_enabled AND runtime_registered/executable`

SC01 must fail closed when its binding is absent. The V2 Workflow Registry renders these as separate columns.

### Model truth

`config/models/registry.json` is metadata only. A model becomes `ACTIVE` only through an effectively executable workflow. The initial registry contains only current local RMBG-2.0 metadata. Cloud models remain absent until V2-H Provider Adapters + Cost Guard.

### Engine health

- Core API is online when the P2 process serves the endpoint.
- Deterministic local renderer is available when one or more effective `LOCAL_RENDERER` workflows exist.
- ComfyUI is probed only through the frozen loopback endpoint.
- ComfyUI offline degrades overall health only when a currently executable workflow requires ComfyUI.
- Storage health is read-only and never creates, repairs, moves, or deletes data.
- Cloud remains `DISABLED / fail_closed=true`.

## Runtime navigation rule

Only current actionable destinations consume Sidebar rows. V2-B adds ComfyUI / Local Engines, Model Registry, and Workflow Registry. Storage is shown inside `/v2/system`, avoiding another Sidebar row. Future Budget / Providers / Settings remain hidden until implemented.

## Safety / non-scope

V2-B does not change SC01/SW01/SD01 renderer semantics, enable scene/video workflows, mutate Site Profiles/Manifest/journal/F archive, call paid providers, store provider keys, alter active P5 PR #9, deploy, or expose the console publicly.

## Validation

- Backend foundation head `0ada28df9963c29ec80c49c718a0f0c4c3ab4e67`: CI #516 PASS.
- Visible runtime code head `ecb052896cbc51ea66b1dbc4f4c18f7ded93ad07`: CI #519 PASS.
- Documentation-sync parent `a910ae2f8e640901a254195a07179a78595230f4`: CI #522 PASS.
- Exact PR head at Gate preparation `d448db6cb6c5b831a636b72b511fcd9c74d5b9cc`: CI #527 PASS.

CI covered Windows physical-script parse, validation-page JavaScript parse, `npm ci`, full tests including V2-B fail-closed projection tests, and full server/web TypeScript build.

## Current Gate

`WINDOWS_LOCAL_BROWSER_VISUAL_GATE_NEXT`

Review `/v2/system`, `/v2/models`, `/v2/workflows`, Sidebar density, and ComfyUI/System-health semantics. PR #12 must remain Draft / Open / Unmerged until that Gate passes.
