# Visual Console P4B — SD01 Dark Master Style Freeze Packet

Date: 2026-08-27
Packet: `VC-P4B-SD01-STYLE-FREEZE-001`
Base: `main @ 0f4964bd0719768c1828e402b5e20aef3dfdfc46`
Branch: `feat/p4b-sd01-style-freeze`
Mode: `MODE_A_STANDARD_FRONTEND`
Status: `STYLE_VISUAL_GATE_PASS / CANDIDATE_A_FROZEN / HANDOFF_TO_P4C`

## 1. Purpose

Freeze the visual contract for `SD01 Static Dark Master` before any production renderer, D staging mutation, QA mutation, Manifest dark archive, or Registry promotion is allowed.

This Packet is intentionally style-only. It never authorizes production execution.

## 2. Source-backed constraints

Authoritative DRIFT CURIO sources establish:

- `SD01 = Static Dark Master`;
- formal filename family `{SKU}__dark__master__wf-SD01__vNNN.png`;
- canonical dark-gallery tokens:
  - background `#0E1114`;
  - surface `#171B20`;
  - raised `#20252B`;
  - border `#2D333A`;
- site/brand direction: charcoal/dark presentation, controlled lighting, preserve natural silhouette, texture and sculptural form;
- avoid fully black low-contrast presentation and grading that changes wood color.

The source records did not independently freeze contact shadow, vignette, relight, ground plane, tonal curve, or the final formal canvas token.

## 3. Read-only visual Gate

The accepted review surface `/sd01-style.html` compared the same VERIFIED P3 SC01 F Cutout on:

- Candidate A — Gallery Surface `#171B20`;
- Candidate B — Gallery Background `#0E1114`;
- Reject reference — pure black `#000000`.

The page was read-only and performed no production mutation.

## 4. Human decision

Candidate A is approved and frozen for SD01 v1.

Frozen background: **exact `#171B20`**.

Candidate B is not selected. Pure black is rejected.

No synthetic treatment is authorized in v1.

## 5. Frozen SD01 v1 visual contract

`VERIFIED_SC01_ARCHIVE -> exact #171B20 background -> same dimensions -> opaque RGB PNG -> no resize/crop -> no relight -> no synthetic shadow -> no vignette -> no generative inference`.

Required preservation:

- exact piece identity and silhouette;
- source wood RGB under alpha compositing;
- dimensions unchanged;
- no tonal curve, color grading, denoise, sharpening, geometry, perspective or crop mutation.

## 6. Fail-closed boundary

P4B itself does not:

- implement the SD01 renderer;
- enable `SD01` in Site Profile;
- set Registry `executable=true`;
- create D Dark Master staging assets;
- write derivative or QA journal state;
- archive to `Manifest.destinations.dark`;
- change P3/P4A archive semantics.

`SD01` remains disabled until P4C automated and physical validation succeeds.

## 7. Handoff to P4C

P4C implementation may proceed autonomously on Candidate A. It must prove:

1. only VERIFIED SC01 P3 archive + matching Manifest history can source SD01;
2. exact deterministic alpha composite over `#171B20`;
3. output is opaque RGB PNG with source dimensions preserved;
4. versioned no-overwrite D staging;
5. durable derivative journal + restart reconstruction;
6. QA PASS/FAIL/NOTE;
7. approved-only Gate15 archive to `Manifest.destinations.dark`;
8. F hash/size/no-overwrite + D delete-last;
9. Manifest archive history idempotence;
10. one real Windows exact-piece visual and physical Gate before release.
