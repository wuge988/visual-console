# P3-B SAM3.1 — 30-frame visual evidence review (2026-10-02)

## Scope, authority and status

- Exact Piece: `DC-ZY-SZ-31001`; P3-B `P3B-M3D01-DC-ZY-SZ-31001`.
- Input: **one** successful, immutable-local-Git-object-verified SAM3.1 evaluation from `20261002-224710-sam31-30frame-evaluation-object-verified`. Source commit `82006dfd0eb5bdbd53b3acc9b9f1a5cc9eaf0a23`.
- This document records an **AI-assisted contact-sheet visual pre-review, not a human sign-off**.
- `AUTO_MASK_QA=PASS`; `CONTACT_SHEET_VISUAL_PRE_REVIEW=PASS`; `HUMAN_VISUAL_GATE=PENDING_EXPLICIT_HUMAN_CONFIRMATION`.
- `RECONSTRUCTION=BLOCKED_UNTIL_HUMAN_GATE_PASS`; no 3D job, production registration, archive, or PDP changes are authorized by this record.

## Immutable supplied evidence

SHA-256 values of exact four uploaded artifacts reviewed in the conversation; local original file names below do not need to be changed.

| Evidence | SHA-256 |
|---|---|
| `evaluation_manifest.json` | `989e737bb02dc73f1cb36a7000f00d202c588dd6c3b4991118ec44a58552b85d` |
| `sam31_mask_contact_sheet.jpg` | `dd9d0e93006fee305e687045362958ba9f8a4cb4b8d17264df5157ed01688c16` |
| `sam31_masked_contact_sheet.jpg` | `af51314377a5a350491509f823b564e414b485c63906f7f2576a2025105f7209` |
| `sam31_delta_contact_sheet.jpg` | `a5769f561103c62e858b55d7d90bd51ca705c885de097d377450256d5d918b9c` |

The manifest reports `30/30` accepted binary masks, `0` automatic rejects, target object id `0` for all 30 frames, `median_adjacent_mask_iou=0.697315011358135` across 29 valid nonempty pairs, source frames unchanged, forward-only propagation and uncached-frame compatibility applied where necessary. Its `reference_iou` compares against **previously human-rejected support-V3 masks**, not independent ground truth.

## Visual pre-review observations

- In the full three 5x6 contact sheets, driftwood remains the dominant isolated subject across the turntable rotation; no large missing section, full white support rod, abrupt blank mask, or identity switch is apparent at contact-sheet resolution.
- At support foot locations, the delta images show green additions and magenta removals relative to V3. This is consistent with correction but **not by itself proof** that every pixel represents wood. Inspect 10–14 and 20–24 carefully at native pixel resolution if reconstruction artifacts appear.
- Around frames 17–19, perspective transition changes area/shape but appears structurally continuous at contact-sheet resolution; scrutinize these native frames if there are geometry holes or floating fragments downstream.
- 1500x1440 contact sheets (5 columns × 6 rows) are scaled-down evidence; they cannot conclusively exclude tiny support-end remnants, clipped fine tips, subpixel halos or hidden capture occlusion.

## Release boundaries

1. Do **not** mark `HUMAN_VISUAL_GATE=PASS` until an authorized person explicitly signs off the identified exact evidence package.
2. Upon explicit confirmation, an **isolated evaluation-only 3D reconstruction pilot** may be authorized as a separately bounded action; first inspect actual installed engine and source/mask compatibility. The current Visual Console 3D UI is a planned pipeline scaffold, not proof that a production reconstruction adapter already exists.
3. Even if the pilot reconstructs successfully, independently inspect wood silhouette, branch topology, holes, support phantom geometry, texturing, physical scale, desktop/mobile viewer performance and provenance before Asset Registry, Archive or PDP enablement.
4. PDP remains fully functional without 3D. Preserve legacy V3 masks and every preceding experiment as evidence; no more SAM2 retries and no blind second full SAM3.1 run.
