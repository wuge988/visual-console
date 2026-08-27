# Visual Console P4B — SD01 Static Dark Master Style Freeze Packet

Date: 2026-08-27
Packet: `VC-P4B-SD01-STYLE-FREEZE-001`
Base: `main @ 0f4964bd0719768c1828e402b5e20aef3dfdfc46`
Branch: `feat/p4b-sd01-style-freeze`
Mode: `MODE_A_STANDARD_FRONTEND`
Status: `STYLE_DISCOVERY_COMPLETE / VISUAL_REVIEW_SURFACE_AUTHORIZED / SD01_EXECUTION_NOT_AUTHORIZED`

## 1. Purpose

P4B defines the visual contract for `SD01 = Static Dark Master` before any production renderer, QA route, Gate15 archive extension, or Registry promotion is implemented.

This is intentionally a **style-freeze slice**, not an execution slice.

`SD01` must remain:

- `workflow_status = NOT_REGISTERED`;
- `executable = false`.

until one exact dark-master visual contract is approved and a separate implementation/physical Gate closes.

## 2. Authority review

The following source-backed semantics are already established.

### Workflow / asset semantics

DRIFT CURIO Workflow Registry defines:

- `SD01 = Static Dark Master`;
- Chinese use: `网站风格黑底 / 深色主图工作流`;
- asset: `Dark Master`;
- example workflow slug: `SD01__dark-master-premium-v1.json`;
- Dark Master means `DRIFT CURIO 黑色网站视觉 / 品牌展示资产`;
- formal filename family: `{SKU}__dark__master__wf-SD01__vNNN.png`;
- same-purpose style alternatives should use a new SD code, e.g. `SD02 = Spotlight Dark`, rather than silently changing SD01 semantics.

### Brand visual direction

Current DRIFT CURIO project direction states:

- deep / charcoal background;
- controlled lighting;
- natural-form silhouette, texture and sculptural quality receive visual priority;
- light surfaces carry evidence / decision information.

The site design baseline freezes:

- gallery background: `#0E1114`;
- gallery surface: `#171B20`;
- gallery raised: `#20252B`;
- gallery border: `#2D333A`;
- `Dark Gallery Shell + Light Evidence Surfaces`.

The approved homepage direction explicitly avoids a fully black low-contrast site and avoids cinematic grading that changes wood color.

The current homepage implementation uses `#171B20` as the hero-media surface inside the `#0E1114` dark gallery shell.

## 3. What the sources do NOT freeze

No authoritative source currently specifies all of the following for a formal SD01 file:

- whether the image canvas itself should be `#171B20` or `#0E1114`;
- whether a contact shadow is allowed;
- whether a vignette is allowed;
- whether any synthetic relighting is allowed;
- shadow angle / blur / opacity;
- ground-plane interpretation;
- tonal curve or selective wood-color adjustment;
- whether the background must be perfectly flat or photographically graduated.

P4B must not silently invent these as production truth.

## 4. P4B style-review candidates

The review surface presents **source-derived, non-production candidates only**.

### Candidate A — Gallery Surface / recommended first choice

Background: `#171B20`.

Reason:

- exact canonical `gallery surface` token;
- exact current hero-media surface token;
- keeps separation from the deeper `#0E1114` page shell;
- provides enough dark contrast to evaluate black/dark wood regions without forcing color grading.

Candidate A rules:

- verified SC01 Cutout pixels are unchanged;
- no relighting;
- no subject color correction;
- no synthetic contact shadow;
- no vignette;
- no crop or resize for style evaluation;
- background is a single exact RGB value.

### Candidate B — Gallery Background / seamless-shell alternative

Background: `#0E1114`.

Reason:

- exact canonical `gallery background` token;
- strongest seamless relationship with a full dark gallery shell.

Candidate B uses the same no-relight/no-shadow/no-vignette constraints as Candidate A.

### Reference Reject — Pure Black

Background: `#000000` is shown only as a reject/reference boundary.

Reason:

- the approved brand direction explicitly avoids a fully black low-contrast site;
- it is not a canonical gallery token;
- dark subject zones can lose separation.

Pure black is not eligible to become SD01 v1 without a new design decision.

## 5. Recommended SD01 v1 direction before human visual Gate

Repository/design recommendation:

`Candidate A / #171B20 / deterministic flat composite / no synthetic relight or shadow`.

This recommendation is an **engineering/design inference from the canonical media token**, not an already-approved business rule.

Why this is the lowest-risk route:

1. reuses the exact P4A VERIFIED SC01 archive truth;
2. changes background only;
3. cannot alter Exact Piece geometry;
4. avoids a second AI/RMBG pass;
5. avoids synthetic shadow implying a false ground orientation;
6. preserves source wood color instead of cinematic grading;
7. can be deterministic and CPU-only like SW01;
8. matches the current gallery-media surface token more directly than `#0E1114`.

## 6. Human visual Gate questions

One real VERIFIED SC01 Cutout should be reviewed against A/B and the pure-black reject reference.

Human review should answer only:

1. Does Candidate A retain enough separation in the darkest wood regions?
2. Does Candidate A feel consistent with DRIFT CURIO’s dark gallery rather than like a generic black-background marketplace image?
3. Does Candidate B merge too deeply into the shell or better support the desired seamless presentation?
4. Is a flat background acceptable, or is a contact relationship visually necessary?
5. If a shadow/contact treatment is requested, can it remain truth-safe without implying a false base/orientation?

The review is about **style**, not archive/file-system semantics.

## 7. Current freeze boundary

Until the visual Gate chooses one exact contract:

- no SD01 production output is written to D staging;
- no SD01 `derivatives.jsonl` record is created;
- no Manifest `destinations.dark` archive is performed;
- no SD01 QA state is persisted;
- no Registry promotion occurs;
- no SD01 button is added to the six-page production UI.

The style preview may read a VERIFIED SC01 source through existing local-only verified preview endpoints, but it must not mutate production state.

## 8. If Candidate A is approved

The next implementation Packet should freeze approximately:

`VERIFIED_SC01_ARCHIVE → alpha composite over #171B20 → same-size opaque RGB PNG`

with renderer family proposed as:

`sd01-flat-gallery-surface-rgb-v1`

The implementation slice must independently prove:

- verified source provenance;
- exact `#171B20` background pixels outside alpha subject;
- preserved dimensions;
- deterministic pixels;
- no overwrite/versioning;
- QA;
- Manifest `destinations.dark`;
- F SHA256/size;
- idempotent Gate15 history;
- D delete-last;
- restart reconstruction;
- target-Windows physical evidence.

The renderer name above is a proposal until style Gate approval.

## 9. If Candidate A is rejected

Do **not** mutate SD01 silently.

Possible outcomes:

- Candidate B approved → SD01 uses `#0E1114`;
- a deterministic contact-shadow direction is requested → freeze its geometry/orientation semantics before implementation;
- a relit/photographic dark master is required → this materially changes technical risk and may require a separate SD route/code such as `SD02`, because source Registry explicitly reserves new SD numbers for alternate technical/style routes.

## 10. Non-scope

- production SD01 renderer;
- ComfyUI workflow registration;
- generative relighting;
- scene generation;
- video;
- SC01/SW01 changes;
- P4A archive changes;
- deployment/public exposure;
- F/D/E mutations from the style-review page;
- safety stash/branch cleanup.

## 11. Gate

Current Gate:

`P4B_STYLE_REVIEW_REQUIRED`

Repository preparation may proceed autonomously. Production implementation remains fail-closed until one exact visual style is selected from the review evidence.
