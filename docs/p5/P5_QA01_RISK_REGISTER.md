# P5 QA01 Risk Register

Packet: `VC-P5-QA01-AQUARIUM-001`

## P0/P1 risks before production enablement

| Risk | Failure mode | Required control | Current state |
| --- | --- | --- | --- |
| Exact Piece identity drift | AI changes branches, holes, silhouette, texture or proportions | verified SC01 subject is deterministically composited after environment generation; full-product redraw prohibited | FROZEN |
| Source provenance drift | browser or prompt chooses an unverified subject | future runtime must resolve source server-side from archive + Manifest + current F SHA/size | FROZEN REQUIREMENT |
| Scene truth confusion | generated aquarium is treated as physical product evidence | scene is labeled possible-context visualization and cannot mutate factual SKU fields | FROZEN |
| Model/runtime ambiguity | output cannot be reproduced or audited | persist checkpoint/workflow hash, prompt, seed and runtime parameters | REQUIRED BEFORE EXECUTION |
| GPU instability | 8 GB VRAM OOM or concurrent jobs corrupt production flow | low-VRAM validation + serial GPU execution | PENDING LOCAL PROBE |
| Dependency sprawl | unnecessary custom nodes/models increase failure surface | choose lowest-complexity viable installed stack; no blind downloads | FROZEN |
| Product/background integration | subject looks pasted-on or scale/contact is implausible | isolated style Gate freezes canvas/placement; v1 forbids generated foreground occlusion | PENDING STYLE GATE |
| Archive mutation safety | output overwrites F or deletes D early | reuse Gate15 no-overwrite, hash/size, exact-one history, F reverify, D delete-last | REQUIRED BEFORE PRODUCTION |
| Realm mismatch | Four Realms use different product transforms | shared uniform scale/translation frozen once and reused across QA01/QR01/QP01/QC01 | PENDING STYLE GATE |

## Current release boundary

`QA01_DISABLED / PROBE_ONLY`

The branch may collect read-only capability evidence. It may not install models/nodes, run production inference, enable QA01, archive scene assets, or modify product facts.
