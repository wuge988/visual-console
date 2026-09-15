# P2 UX Consolidation Execution Contract

Date: 2026-09-14
Status: `CODE_COMPLETE / HUMAN_VISUAL_GATE_PENDING`

## Objective

Consolidate the V2 operator experience into the canonical Visual Console daily workflow without removing backend safety boundaries.

## Operator language

- Daily operator UI is Chinese-first.
- Keep only unavoidable technical abbreviations such as SKU, QA, 3D, API, GLB and workflow codes.
- English implementation labels are not the primary operator language.

## Target navigation

HOME

PRODUCTION
- 产品件

CREATE
- 产品图
- 场景图
- 3D 模型
- 批量生成

REVIEW
- 人工视觉审核

LIBRARY
- 产品素材
- 归档
- 提示词库

SETTINGS
- 引擎
- 模型
- 预算
- 存储
- 高级设置

## Rules

- Existing V2 modules remain implementation assets.
- Provider activation, preflight, execution intent and spend audit remain backend/advanced controls.
- Engine adapters never become business truth.
- Normal operator path is:

`选择产品件 → 创建 → 审核 → 归档 / 发布`

## Implemented consolidation

1. `p2-canonical-navigation.ts` is the canonical operator navigation contract.
2. `p2-shell-consolidation.ts` overlays canonical navigation and primary toolbar entry points without deleting legacy Vue-owned navigation DOM.
3. `p2-v2-route-guard.ts` prevents V2 buttons/links from escaping to legacy `/workspace`, `/qa`, or `/assets` surfaces.
4. `p2-zh-localization.ts` provides a Chinese-first compatibility layer for legacy V2 labels that have not yet been rewritten at source.
5. `/v2/pieces` is the V2-native Product Pieces read surface.
6. `/v2/review` is the V2-native Human Visual Gate and writes decisions through the existing `/api/qa/:assetId/decision` authority.
7. `/v2/archive` is a V2-native read-only canonical Archive projection. It does not replace formal Archive write authority.
8. Provider internals remain executable only through their existing backend safety chain and are surfaced under `设置 → 高级设置` rather than as a primary daily workflow.
9. `3D 模型` has an explicit non-executable surface. It does not reuse Product Image execution and does not imply production registration.
10. Existing Job, QA, Asset, Cloud, Cost Guard, Execution Intent and spend-audit logic is preserved.

## Route compatibility matrix

| Canonical area | Operator route | Current implementation |
| --- | --- | --- |
| HOME | `/v2` | V2 dashboard |
| PRODUCTION | `/v2/pieces` | V2-native Product Pieces read surface |
| CREATE / 产品图 | `/v2/production/image` | V2 Production Composer / IMAGE |
| CREATE / 场景图 | `/v2/production/scene` | V2 Production Composer / SCENE, fail-closed until registered |
| CREATE / 3D 模型 | `/v2/production/3d` | explicit P3-B preparation surface, non-executable |
| CREATE / 批量生成 | `/v2/production/batch` | V2 Production Composer / BATCH |
| REVIEW | `/v2/review` | V2-native Human Visual Gate |
| LIBRARY / 产品素材 | `/v2/assets` | canonical read projection |
| LIBRARY / 归档 | `/v2/archive` | read-only canonical Archive projection |
| LIBRARY / 提示词库 | `/v2/prompts` | Prompt Library |
| SETTINGS / 引擎 | `/v2/system` | Engine Health |
| SETTINGS / 模型 | `/v2/models` | Model Registry |
| SETTINGS / 预算 | `/v2/cloud/budget` | Cost Guard section |
| SETTINGS / 存储 | `/v2/system/storage` | Storage Truth section |
| SETTINGS / 高级设置 | `/v2/cloud/advanced` | provider / activation / preflight / intent / audit surfaces |

## Safety invariants

- No RAW/source, Manifest, journal, D/E/F evidence or formal Archive record is rewritten by P2.
- Generation success remains separate from QA PASS and Archive truth.
- Cloud use remains explicit; no silent provider fallback is introduced.
- Cost Guard and paid-provider execution safety remain enforced underneath the simplified UX.
- Scene and 3D remain unregistered until their independent gates pass.
- 3D remains `NON_BLOCKING_ENHANCEMENT` for PDP/site release.
- V2 canonical navigation must not escape into the legacy Visual Console shell during normal operation.

## Remaining gate

Before P2 is considered visually accepted, perform a Human Visual Gate on the consolidated shell and confirm:

- sidebar hierarchy is readable and Chinese-first;
- no canonical sidebar or primary-toolbar action jumps back to the legacy Visual Console;
- Product / Scene / 3D / Batch routes show the correct surface and no route falls through to the wrong pipeline;
- `/v2/pieces`, `/v2/review`, `/v2/archive` remain inside the V2 shell;
- Settings routes keep low-level provider controls out of the daily production path;
- desktop layout has no overlap, clipped navigation, duplicated visible navigation or broken scrolling.

CI (`npm test` + `npm run build`) must PASS on the final PR head before the Human Visual Gate is requested.
