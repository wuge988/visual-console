# Visual Console P2 — Approved Baseline Inheritance

Date: 2026-08-26
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
Status: `G1_G2_INHERITED / S4_PREPARATION`

## Purpose

P2 is not a new product or visual direction. It is the next bounded implementation slice of the already approved Visual Console v0.1 baseline.

The owner-approved v0.1 baseline already includes:

- Chinese-first, site-neutral Visual Console shell;
- persistent Site selector;
- six top-level modules: 工作台 / 工作流 / 任务队列 / 质量审核 / 素材资产 / 系统状态;
- DRIFT CURIO as the first Site Profile, not the application identity;
- SC01 as the first workflow used to prove the production loop;
- batch submission to ComfyUI;
- queue/job-state visibility;
- prompt-correlated transparent Master capture;
- dynamic Red / Black / White / Checkerboard QA;
- Original ↔ Master comparison;
- PASS / FAIL / Retry / Note;
- asset gallery and version semantics;
- system health for ComfyUI / GPU / Registry / storage;
- no routine per-workflow BAT/PS1 operator UX.

## Approved upstream sources

Product / visual authority remains the previously approved source set in `wu-e-commerce/driftwood-commerce` branch `docs/visual-console-v0.1-design-source`:

- `docs/visual-console/S2_DESIGN_BASELINE.md`
  - status: `G2_APPROVED / G2B_APPROVED / S2_V1_6_MOBILE_CAPTURE_INCLUDED / S4_PACKET_READY`;
  - G1 approved 2026-08-24;
  - G2 visual direction approved 2026-08-24;
  - G2B Chinese-first + multi-site architecture approved;
  - v0.1 end-to-end scope explicitly contains SC01 control loop.
- `docs/visual-console/LOCAL_API_CONTRACT_V0_1.md`.
- `docs/visual-console/S4_IMPLEMENTATION_MIGRATION_PACKET.md`.

The Notion control page `Visual Console v0.1｜中文版多站点设计源与迁移冻结` also records the next bounded implementation segment as `G4B2_SC01_COMFYUI_CONTROL_LOOP`.

## P1 released baseline

Repository: `wuge988/visual-console`

Released P1 main commit:

`024da283e9f92e35c1b0460f02df0eaa4a6ad877`

P1 already proves:

- Vue 3 / TypeScript / Vite local console shell;
- Fastify local API on 4177;
- site-profile discovery and DRIFT CURIO SKU adapter;
- iPhone Private-LAN Mobile Capture;
- 12-hour Site + Item/SKU sessions;
- direct and chunked upload;
- verified D→F RAW persistence;
- RAW Gallery and video Range streaming;
- desktop recoverable Trash control;
- deterministic `npm ci → npm test → npm run build` CI.

P2 must preserve those behaviors.

## SC01 frozen technical baseline

The approved extraction baseline is:

- model: `RMBG-2.0`;
- sensitivity: `1.00`;
- process_res: `1024`;
- mask_blur: `0`;
- mask_offset: `-1`;
- invert_output: `false`;
- refine_foreground: `true`;
- background: `Alpha`.

`1536` is explicitly not the production baseline on the current RTX 3060 Ti 8GB because that route has produced OOM.

Persistent red/black/white QA derivatives are not part of the target architecture. Browser dynamic QA is authoritative.

## Workflow Registry truthfulness rule

Legacy registry semantics remain:

- `preset_status = ACTIVE` means naming/asset semantics are known;
- `workflow_status = REGISTERED` means a real tested production workflow JSON is bound.

P2 must not display the legacy static number `13` as if thirteen workflows were executable.

All known workflow codes may be listed, but executable/registered counts must be derived from runtime registry state.

## Why no new G1/G2 is required

P2 does not alter:

- application identity;
- information architecture;
- approved visual language;
- multi-site model;
- SC01 algorithm baseline;
- dynamic QA model;
- storage responsibility model.

It implements an already approved bounded slice. Therefore the next governance action is S4 packet + fresh G4A binding, not a redundant S1/S2 reset.

Any material change to those approved baselines during implementation must stop and return through Change Request / affected Gate review.
