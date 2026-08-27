# P4B SD01 Style Freeze Result

Status: `STYLE_REVIEW_READY / HUMAN_VISUAL_GATE_REQUIRED / SD01_EXECUTION_DISABLED`

Packet: `VC-P4B-SD01-STYLE-FREEZE-001`

Base: `main @ 0f4964bd0719768c1828e402b5e20aef3dfdfc46`

Current review head after CI-contract convergence: `4709d9d311a714ad5b73a989fc23c6c693a9ced7`

## Source-backed facts

- `SD01 = Static Dark Master` / Dark Master.
- Formal filename family: `{SKU}__dark__master__wf-SD01__vNNN.png`.
- Canonical dark gallery tokens:
  - gallery background `#0E1114`;
  - gallery surface `#171B20`;
  - gallery raised `#20252B`;
  - gallery border `#2D333A`.
- Brand direction: charcoal/dark background + controlled lighting; prioritize natural silhouette, texture and sculptural form.
- Avoid pure-black low-contrast treatment and grading that changes wood color.

## What the sources do not freeze

The current authoritative records do not establish a formal production rule for:

- contact shadow;
- vignette;
- synthetic relighting;
- ground plane/perspective;
- tonal curve;
- whether the formal image canvas is `#171B20` or `#0E1114`.

Those choices therefore remain a human visual Gate rather than implementation assumptions.

## Read-only review surface

`/sd01-style.html` renders one verified SC01 F Cutout in three visual references:

1. Candidate A — Gallery Surface `#171B20`;
2. Candidate B — Gallery Background `#0E1114`;
3. Reject reference — pure black `#000000`.

Candidate A is the engineering recommendation because `#171B20` is the canonical gallery/media surface token. This is a recommendation, not a frozen production rule.

The page is intentionally read-only and does not call derivative, QA or archive mutation APIs.

Windows launcher:

`tools/P4B_SD01_STYLE_REVIEW.ps1`

The launcher only synchronizes the review branch, safely restarts the local Visual Console runtime and opens the read-only comparison page. It writes no production asset.

## Automated validation

Exact head `4709d9d311a714ad5b73a989fc23c6c693a9ced7` CI #205: **PASS**.

Validated contract:

- parse all P3/P4/P4B Windows scripts, including `P4B_SD01_STYLE_REVIEW.ps1`;
- parse archive/SW01/SD01 review JavaScript;
- `npm ci`;
- full tests;
- full build.

## Fail-closed state

Until the human owner freezes one exact Dark Master visual contract:

- `SD01` remains `NOT_REGISTERED`;
- `executable=false`;
- no renderer is implemented;
- no D Dark staging asset is generated;
- no derivative/QA journal mutation is enabled;
- no Manifest `destinations.dark` archive is enabled;
- no Registry promotion is allowed.

## Next Gate

Human visual selection between Candidate A and Candidate B, plus an explicit decision on whether the first SD01 production contract stays deterministic flat-composite only or authorizes any additional controlled treatment.

Recommended first production contract if A is approved:

`VERIFIED_SC01_ARCHIVE -> exact #171B20 background -> same dimensions -> opaque RGB PNG -> no resize/crop -> no relight -> no synthetic shadow -> no vignette -> no generative inference`.
