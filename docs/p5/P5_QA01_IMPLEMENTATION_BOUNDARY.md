# P5 QA01 Implementation Boundary

Packet: `VC-P5-QA01-AQUARIUM-001`

## Authorized now

- repository/document review;
- read-only target-machine capability inventory;
- isolated style/runtime planning based on actual installed capabilities;
- CI/tests that enforce QA01 disabled state.

## Not authorized by the current slice

- enabling QA01 in Registry or Site Profile;
- model or custom-node installation;
- production or batch inference;
- final scene QA mutation in the production journal;
- `Manifest.destinations.aquarium` mutation;
- F scene archive;
- product-body generative redraw;
- changes to SC01/SW01/SD01 released semantics;
- scene/video work outside QA01.

## Promotion sequence

`READ_ONLY_PROBE → CAPABILITY_DECISION → ISOLATED_SAMPLE → HUMAN_STYLE_GATE → RUNTIME_IMPLEMENTATION → TARGET_WINDOWS_PRODUCTION_GATE → RELEASE`

Every transition remains fail-closed. A later Gate must explicitly promote the next state; no step inherits authorization merely because the previous step passed.
