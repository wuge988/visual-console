# P2 UX Consolidation Execution Contract

Date: 2026-09-14
Status: `CODE_COMPLETE / HUMAN_VISUAL_GATE_PENDING`

## Objective

Consolidate the V2 operator experience into the canonical Visual Console daily workflow without removing backend safety boundaries.

## Target navigation

HOME

PRODUCTION
- Production Pieces

CREATE
- Product Images
- Scene Images
- 3D Models
- Batch

REVIEW
- Human Visual Gate

LIBRARY
- Piece Assets
- Archive
- Prompts

SETTINGS
- Engines
- Models
- Budget
- Storage
- Advanced

## Rules

- Existing V2 modules remain implementation assets.
- Provider activation, preflight, execution intent and spend audit remain backend/advanced controls.
- Engine adapters never become business truth.
- Normal operator path is:

`Select Piece → Create → Review → Archive/Publish`

## Implemented consolidation

1. `p2-canonical-navigation.ts` is the canonical operator navigation contract.
2. `p2-shell-consolidation.ts` overlays canonical navigation and primary toolbar entry points without deleting legacy Vue-owned navigation DOM.
3. Provider internals remain executable only through their existing backend safety chain and are surfaced under `SETTINGS → Advanced` rather than as a primary daily workflow.
4. `3D Models` has an explicit non-executable surface. It does not reuse Product Image execution and does not imply production registration.
5. Formal Archive continues to use the existing authoritative `/assets` route; the V2 Piece Assets screen remains a read projection.
6. Existing Job, QA, Asset, Cloud, Cost Guard, Execution Intent and spend-audit logic is preserved.

## Route compatibility matrix

| Canonical area | Operator route | Current implementation |
| --- | --- | --- |
| HOME | `/v2` | V2 dashboard |
| PRODUCTION | `/workspace` | retained production workspace |
| CREATE / Product Images | `/v2/production/image` | V2 Production Composer / IMAGE |
| CREATE / Scene Images | `/v2/production/scene` | V2 Production Composer / SCENE, fail-closed until registered |
| CREATE / 3D Models | `/v2/production/3d` | explicit P3-B preparation surface, non-executable |
| CREATE / Batch | `/v2/production/batch` | V2 Production Composer / BATCH |
| REVIEW | `/qa` | retained Human Visual Gate |
| LIBRARY / Piece Assets | `/v2/assets` | canonical read projection |
| LIBRARY / Archive | `/assets` | retained formal archive authority |
| LIBRARY / Prompts | `/v2/prompts` | Prompt Library |
| SETTINGS / Engines | `/v2/system` | Engine Health |
| SETTINGS / Models | `/v2/models` | Model Registry |
| SETTINGS / Budget | `/v2/cloud/budget` | Cost Guard section |
| SETTINGS / Storage | `/v2/system/storage` | Storage Truth section |
| SETTINGS / Advanced | `/v2/cloud/advanced` | provider / activation / preflight / intent / audit surfaces |

## Safety invariants

- No RAW/source, Manifest, journal, D/E/F evidence or formal Archive record is rewritten by P2.
- Generation success remains separate from QA PASS and Archive truth.
- Cloud use remains explicit; no silent provider fallback is introduced.
- Cost Guard and paid-provider execution safety remain enforced underneath the simplified UX.
- Scene and 3D remain unregistered until their independent gates pass.
- 3D remains `NON_BLOCKING_ENHANCEMENT` for PDP/site release.

## Remaining gate

Before P2 is considered visually accepted, perform a Human Visual Gate on the consolidated shell and confirm:

- sidebar hierarchy is readable and not cramped;
- primary toolbar is coherent across Dashboard, Jobs, Library, Production and Cloud surfaces;
- Product / Scene / 3D / Batch routes show the correct surface and no route falls through to the wrong pipeline;
- Settings routes keep low-level provider controls out of the daily production path;
- desktop layout has no overlap, clipped navigation, duplicated visible navigation or broken scrolling.

CI (`npm test` + `npm run build`) must PASS on the final PR head before the Human Visual Gate is requested.
