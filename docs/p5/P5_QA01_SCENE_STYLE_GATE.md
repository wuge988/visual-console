# P5 QA01 Scene Style Gate

Packet: `VC-P5-QA01-AQUARIUM-001`
Status: `NOT_STARTED / REQUIRES_CAPABILITY_PROBE`

This Gate is intentionally downstream of the target-Windows capability inventory.

## Goal

Freeze one Aquarium scene canvas that can later become the shared Four Realms placement baseline without altering the Exact Piece subject.

## Required review dimensions

The first isolated sample must be judged against the verified SC01 Cutout for:

1. exact silhouette, fine branches and holes;
2. unchanged subject proportions and recognizable orientation;
3. plausible aquarium scale;
4. plausible contact/placement without generated foreground covering the subject;
5. no obvious cutout halo or pasted-on edge failure;
6. environment style suitable for DRIFT CURIO rather than generic stock-aquarium imagery;
7. sufficient negative space for product presentation;
8. no generated text, labels, logos, people, hands, packaging or unrelated products;
9. no implication that the piece has been physically tested underwater unless separately supported by product evidence.

## v1 placement constraints

- rotation: `0` unless a later explicit style decision changes workflow version;
- perspective/non-uniform deformation: prohibited;
- product layer: verified SC01 alpha subject;
- generated foreground occlusion: prohibited;
- uniform scale + x/y translation: `PENDING_STYLE_GATE`;
- final canvas dimensions: `PENDING_STYLE_GATE`;
- the chosen transform must later be reused by QA01/QR01/QP01/QC01 unless a new version is approved.

## Pass consequence

A visual PASS freezes canvas and placement only. It does not by itself authorize batch production or F archive. Production requires a separate implementation/runtime Gate with provenance, journaling, QA, restart/retry and Gate15 semantics.
