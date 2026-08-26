# Visual Console v0.1 — P1 Operations and Rollback

Date: 2026-08-26  
Scope: single-operator, target Windows workstation, Private LAN only.

## Operational boundary

P1 is a local runtime. It is **not** a cloud deployment.

Supported current operating model:

- one Windows workstation;
- one operator;
- iPhone on the same trusted Wi-Fi;
- Local API on port `4177`;
- Desktop UI on port `5173`;
- no public tunnel / reverse proxy / cloud relay;
- RAW and Trash live outside the Git repository on the configured D/E/F storage roots.

## Data roots

DRIFT CURIO current Site Profile:

- RAW: `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\01_RAW`
- Trash: `F:\1独立站\DRIFT CURIO\DRIFT_CURIO_VISUAL_PIPELINE\100_Trash`
- Work: `D:\AI\WORK\current_sku`
- Staging: `D:\AI\OUTPUT_STAGING`
- Manifest: `E:\AI_PROJECTS\DRIFT_CURIO_VISUAL\manifests`

Code rollback must never delete or rewrite these data roots.

## Start / stop before Merge

The reviewed runtime currently operates from:

- repository: `E:\AI_PROJECTS\VISUAL_CONSOLE`
- branch: `feat/p1-mobile-capture-runtime`

The in-repository network-resilient launcher:

`tools\START_VISUAL_CONSOLE_P1_V4.cmd`

is a **pre-Merge development launcher** because its PowerShell script intentionally pulls `feat/p1-mobile-capture-runtime`.

It must not be treated as a post-Merge `main` updater.

Stop runtime with `Ctrl+C` in the running terminal.

Health check:

`http://localhost:4177/api/health`

Desktop:

`http://localhost:5173`

## Post-Merge canonical source

A Merge Release Decision, if later approved, changes only the canonical repository history:

`PR #1 → main`

It does not automatically switch the running Windows workstation to `main` and does not deploy anything.

After Merge, a later explicitly authorized local cutover may use:

```powershell
cd E:\AI_PROJECTS\VISUAL_CONSOLE
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm test
npm run build
npm run dev
```

If the official npm registry is temporarily unreachable, the deterministic install may use the mirror for that command only:

```powershell
npm ci --registry=https://registry.npmmirror.com/
```

Do not change global npm registry configuration for this fallback.

## Private-LAN requirement

Windows firewall access should remain limited to Private networks.

Do not expose `4177` or the mobile QR entry through:

- public port forwarding;
- public reverse proxy;
- Cloudflare Tunnel;
- Tailscale Funnel;
- other public relay/tunnel mechanisms.

Public exposure requires a new security design and new approval because the current QR URL contains a bearer upload token.

## Runtime recovery

### Service restart

A service restart intentionally invalidates in-memory mobile Sessions and active chunk state.

Recovery:

1. restart Visual Console;
2. generate a new QR for the current SKU;
3. retry the interrupted upload.

Already verified files in F RAW or `100_Trash` must not be removed during recovery.

### Failed upload

For a failed D→F transfer, the verified-transfer logic preserves the source until target size/hash checks succeed.

Do not manually delete D temporary files while diagnosing an active failure.

### Accidental desktop Trash action

P1 does not permanently delete the asset. The file is moved to:

`100_Trash\<SKU>\<file>`

and provenance is appended to:

`100_Trash\trash-index.jsonl`

P1 does not yet provide a Restore UI. Manual restore must be deliberate and preserve filename/provenance.

## Merge rollback

JZ-v0.4 requires rollback to use its own one-action Release Decision. G6 approval by itself does not authorize rollback.

Because P1 has not been cloud-deployed, merging PR #1 does not mutate F/D/E assets or the currently running workstation.

If a later Merge must be undone:

- request a separate rollback/revert Release Decision;
- revert the exact Merge/squash commit on `main`;
- do not delete the reviewed feature branch until the release has remained stable;
- do not touch RAW, Trash, Work, Staging or Manifest data as part of code rollback.

For this initial release, the pre-Merge `main` base is:

`0ba9959c285816fd4ec0d7b7efbccef3b849bd4c`

That base does not represent a prior deployed Visual Console runtime, so emergency operational fallback is to **stop the runtime**, not to treat the old `main` commit as a functional application version.

## Deferred operational capabilities

Not required for P1:

- persistent upload Session/chunk resume;
- multi-operator capture lanes;
- Trash Restore UI;
- automated retention cleanup;
- cloud/public access;
- SC01/ComfyUI production execution.
