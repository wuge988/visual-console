# Visual Console P2 — Target Windows Runtime Evidence

Date: 2026-08-26
Status: `RUNTIME_EVIDENCE_PASS_WITH_UI_POLISH_FOLLOWUP`

## Environment / target

- Site: `drift-curio`
- Item/SKU: `DC-ZY-SZ-31001`
- Target Windows worktree: `E:\AI_PROJECTS\VISUAL_CONSOLE`
- ComfyUI: local / online
- SC01: `REGISTERED`

## Evidence confirmed by Human Owner

### Six-route + runtime truth

- 工作台 / 工作流 / 任务队列 / 质量审核 / 素材资产 / 系统状态 all navigated correctly.
- Core API / P2 Control / LAN / ComfyUI status rendered truthfully.
- SC01 registration survived restart.

### Real SC01 execution

- Real RAW sources were submitted to SC01.
- Jobs completed without a reported `FAILED_*` runtime state.
- Prompt-correlated jobs displayed distinct prompt IDs.
- Generated staging outputs reached sequential no-overwrite versions through:
  - `...__wf-SC01__v001.png`
  - `...__wf-SC01__v002.png`
  - `...__wf-SC01__v003.png`
  - `...__wf-SC01__v004.png`
- Assets page displayed 3 RAW sources + 4 SC01 transparent Masters.
- QA states included both `QA_PENDING` and `QA_PASS` so restart reconstruction could be checked against mixed state.

### Restart reconstruction

The Human Owner stopped and restarted Visual Console and reported restart recovery as normal.
After restart, the UI continued to show the persisted jobs, generated versions and mixed QA state, and SC01 remained registered.

This satisfies the P2 restart-reconstruction runtime requirement at the operator level.

## Filesystem / archive boundary

- SC01 generated Masters are visible from D staging.
- No Gate15-equivalent archive action exists in P2.
- `QA_PASS` therefore means `通过 · 待归档`, not `ARCHIVED`.
- F formal generated-asset archive remains intentionally absent until the separately gated archive slice.
- F RAW remains the source-of-truth RAW area and is not consumed by P2 SC01 execution.

## UI follow-up accepted

The Human Owner accepted the current readability level for P2 while deferring remaining small typography polish.
A second bounded UI/interaction repair was requested after runtime validation:

- QA review list should show pending-review items rather than already-passed items;
- add select-all for pending QA;
- make Fit / 100% / 200% / 400% visibly and mechanically distinct;
- tighten the Workspace recent-jobs area;
- use freed space for an actionable production dashboard.

These are presentation/review-flow repairs only and do not alter SC01, filesystem safety, archive semantics or Gate15 scope.
