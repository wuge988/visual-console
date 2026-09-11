# P5 QA01 v2 — Kontext D5.4 Human Visual Review

Status: `D54_RUNTIME_PASS / D54_MASK_GUARDS_PASS / D54_IDENTITY_PASS / D54_HUMAN_VISUAL_FAIL / D5X_LOCAL_INPAINT_ARCHITECTURE_CLOSED`

## Audited Windows evidence

SKU: `DC-ZY-SZ-31001`

Observed D5.4 recipe metrics:

- `union_editable_subject_ratio = 0.254058`
- `unchanged_subject_ratio = 0.745942`
- all stages cross subject boundary: `true`
- hardscape changed pixels: `145343`
- epiphyte changed pixels: `34498`
- coherence changed pixels: `41278`
- actual final changed pixels vs D5.3: `178540`
- final SHA256: `df2a00a93ed94c95d06a7c15948ecb1ba8145cd36720acbeaefcb6ac674f61a4`

## Human visual decision

**FAIL — physical integration is still not convincing.**

The final candidate remains dominated by the same product-cutout depth reading as D5.3:

1. the driftwood is still visually cleaner and more continuously foregrounded than the surrounding hardscape;
2. Stage A does not produce an unmistakable angular support stone face covering a lower wood region;
3. substrate contact is still too weak to read as genuine partial burial / seating;
4. Stage B does not produce an unmistakable attached epiphyte silhouette crossing the wood edge;
5. the very large pixel deltas are therefore not correlated with the required semantic depth events.

## Root cause

D5.4 proves that more local edit area is not the missing variable. The model is still permitted to reconstruct or softly repaint driftwood inside editable masks because exact sellable-piece RGB remains present in the reference conditioning.

The architecture therefore rewards preserving wood appearance inside the mask instead of forcing foreground objects to occupy those former wood pixels.

## Frozen decision

The D5.x family is closed for this target.

Do **not** retry with:

- larger anchors;
- higher subject-side budget;
- new seeds;
- more steps;
- different guidance / denoise;
- a fourth local coherence/repair stage.

Next architecture: `D6 Forced Foreground Occlusion Plate`, where exact sellable-piece RGB is removed from stage reference conditioning and explicit masked wood pixels must be replaced by foreground hardscape / epiphytes.

QA01 remains disabled and no production archive mutation is authorized.
