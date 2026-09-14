# P2 UX Consolidation Execution Contract

Date: 2026-09-14
Status: ACTIVE

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

Select Piece → Create → Review → Archive/Publish

## Implementation order

1. Navigation model consolidation.
2. Route compatibility verification.
3. Move low-level provider surfaces under Settings/Advanced.
4. Verify Production, Jobs, Library and Review flows.
5. Run CI before merge.
