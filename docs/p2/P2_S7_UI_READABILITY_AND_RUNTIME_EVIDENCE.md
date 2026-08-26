# Visual Console P2 — S7 UI Readability Repair + Target Runtime Evidence

Date: 2026-08-26
Branch: `feat/p2-sc01-control-loop`
Packet: `VC-P2-SC01-CONTROL-LOOP-001`
Status: `TARGET_WINDOWS_SC01_SINGLE_RUN_PASS / S7_UI_READABILITY_REPAIR_IMPLEMENTED / TARGET_VISUAL_CONFIRMATION_REQUIRED`

## 1. Target Windows runtime evidence

Human Owner validated the following on the target Windows workstation:

- six URL-addressable modules navigate correctly;
- ComfyUI offline/online state is truthfully reflected;
- SC01 API-format workflow registered successfully;
- Workflow Registry truthfully reports `13 known / 1 executable`;
- SC01 state is `REGISTERED` with a bound workflow hash;
- one real RAW asset submitted through SC01;
- Queue records a real prompt id and output filename;
- output captured as `DC-ZY-SZ-31001__cutout__master__wf-SC01__v001.png`;
- dynamic QA displays the transparent Master on browser-rendered QA backgrounds;
- QA decision `PASS` persists as `QA_PASS / 通过 · 待归档`;
- Assets page shows RAW from F and SC01 Cutout from D staging;
- System page reports Core API, P2 Control, LAN, ComfyUI, GPU/VRAM, Workflow Registry and configured roots;
- F RAW remains source-of-truth and P2 does not perform Gate-15-equivalent generated-asset archive.

This validates the single-image path:

`F RAW → SC01 → ComfyUI → prompt-correlated capture → D staging v001 → dynamic QA → QA_PASS`

## 2. Archive truth

No archive button is present in P2 by design.

`QA_PASS` means `可归档 / 待归档`; it does not mean the generated Master has been copied to the F formal approved-asset library.

Gate-15-equivalent archive migration remains outside this P2 packet and requires a separately authorized implementation slice.

## 3. S7 UI readability finding

Target-user review identified a usability defect: cards and modules occupy substantial screen area while many metadata, labels and controls render at 8–11 px, making Chinese text unnecessarily difficult to read on a 1920px desktop.

This is treated as a bounded presentation repair under the still-valid P2 G4A binding. No runtime semantics, API contract, workflow parameters, job states, QA decisions, archive behavior, filesystem authority or data-safety rules are changed.

## 4. Repair implemented

Presentation-only override layer:

- `apps/web/src/readability.css`
- imported after `style.css` from `apps/web/src/main.ts`

Repair direction:

- navigation ~14–15 px;
- body/help text ~12–13 px;
- card headings ~15–16 px;
- buttons ~12–13 px;
- state/metadata ~10–11 px;
- larger QA/Assets/System metadata;
- slightly reduced chrome/card padding, gaps and minimum heights;
- reduced workspace vertical rhythm so larger text does not make the console taller overall.

## 5. Automated validation

Repair HEAD: `78dfe06734680075021c007907ca09cc79efc773`

GitHub Actions CI #109: `success`

Contract:

`npm ci → npm test → npm run build`

The repair is presentation-only and retains the existing P1/P2 automated regression suite.

## 6. Remaining P2 runtime evidence

Before requesting G4B, still complete the remaining target-runtime evidence from the approved Packet, especially:

- visually confirm the readability repair on the target 1920px desktop;
- 3-image SC01 serial batch;
- process/server restart and job/QA reconstruction;
- confirm F RAW remains untouched after those tests;
- confirm no Gate-15 archive action occurred.

No Merge, deployment or archive migration is authorized by this record.
