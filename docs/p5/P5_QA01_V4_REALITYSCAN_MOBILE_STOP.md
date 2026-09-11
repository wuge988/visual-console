# P5 QA01 — RealityScan Mobile Route Terminated

Status: `REALITYSCAN_MOBILE_MANUAL_CAPTURE_TERMINATED / HIGH_MANUAL_EFFORT / LOW_OPERATIONAL_FIT / QA01_DISABLED`

## Decision

The manual RealityScan Mobile Object Mode route is terminated by user decision.

Do not resume or optimize the following workflow:

- multi-ring manual phone capture;
- 60–300 photo turntable capture;
- manual connected/unconnected image triage;
- repeated angle-gap repair photography;
- manual support/masking experiments intended to make Mobile photogrammetry production-ready.

## Reason

Although the route may improve photogrammetry input quality, its operational cost is incompatible with the project objective of low-human-effort, repeatable per-SKU automation. The capture workflow requires too much manual positioning, image-count management, connectivity review, thermal management, support control, and recapture work for a one-person catalog pipeline.

This is a workflow-fit stop-loss, not a claim that RealityScan Mobile cannot reconstruct the object.

## Frozen conclusions

1. `v3.2` foreground materialization remains terminated for low marginal return.
2. RealityScan Mobile manual capture is not an accepted replacement.
3. Do not create a Mobile B2/B3 retry loop.
4. Do not ask the user to capture dozens/hundreds of manually managed still photographs for QA01.
5. Future 3D candidates must prioritize low-human-effort input acquisition and batchability.
6. Existing RealityScan Desktop/video work in other project threads may continue independently; this decision only rejects the manual Mobile capture route as the QA01 replacement.

## Replacement selection criteria

Any next QA01 route must satisfy, before implementation:

- materially lower manual capture burden;
- repeatable input protocol suitable for many SKUs;
- preserves exact-piece identity strongly enough for one-piece-one-SKU commerce;
- credible path to photoreal Aquarium integration;
- automatable or batchable after a short physical capture step;
- explicit early stop-loss Gate before large implementation work.

## Production boundary

- QA01 remains `NOT_REGISTERED / executable=false`.
- No production Manifest/archive/F mutation.
- No deploy/merge/enable.
