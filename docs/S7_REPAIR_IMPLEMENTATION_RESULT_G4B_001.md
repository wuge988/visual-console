# Visual Console v0.1 — S7 Repair Implementation Result G4B-001

Status: `S7_REPAIR_IMPLEMENTED / TARGET_WINDOWS_REGRESSION_REQUIRED / G4B_RERUN_PENDING`
Workflow: `JZ-v0.4 / MODE_A_STANDARD_FRONTEND`
G4A binding: `docs/G4A_REPAIR_BINDING_G4B_001.md`
Repair packet: `docs/S7_REPAIR_PACKET_G4B_001.md`
Repository: `wuge988/visual-console`
Working branch: `feat/p1-mobile-capture-runtime`

## G4A

Project owner explicitly approved on 2026-08-26:

`G4A-REPAIR通过，按 S7_REPAIR_PACKET_G4B_001 授权修复`

The binding record freezes repository/base/working branch/worktree/packet/scope/validation/permissions/owner+tool/executor before repair edits.

## Repair completed

### 1. Canonical runtime entrypoints

- canonical server is now `apps/server/src/index.ts`;
- canonical web app is now `apps/web/src/App.vue`;
- `apps/server/src/index-p1.ts` removed;
- `apps/web/src/AppP1.vue` removed;
- superseded 30-minute / naive-LAN / cross-volume-rename executable sources are no longer in the final build graph.

### 2. Trash consolidated into Core API

- standalone `apps/server/src/trash-service.ts` removed;
- localhost-only `/trash-api/assets/raw` now runs inside the canonical 4177 Core API;
- Vite `/trash-api` proxy points to 4177;
- root dev contract starts only Core API + web;
- server `start` is `node dist/index.js` and includes trash behavior;
- proven `100_Trash\<SKU>\<file>` / no-confirmation / no-overwrite / size+SHA256 / `trash-index.jsonl` behavior is preserved.

### 3. Server-enforced upload limits

- direct multipart file limit: 32 MiB;
- chunk body limit: 8 MiB;
- exact expected chunk length validation, including final chunk;
- maximum declared source file: configurable, default 5 GiB;
- maximum two active chunk uploads per Session;
- expired Sessions and abandoned chunk directories receive periodic bounded GC;
- no client-controlled Windows path is accepted.

### 4. Site discovery + adapter

- `/api/sites` discovers supported `config/sites/*.json` profiles;
- `item_adapter` is active rather than inert metadata;
- `drift_curio_sku_v1` enforces `DC-(ZY|TL|YT|XX)-(DZ|GQ|KD|SZ|YY)-NNNNN`;
- invalid DRIFT CURIO item IDs cannot create mobile Sessions or RAW directories through the canonical code path.

### 5. Filesystem hardening

- lexical allowlist remains defense-in-depth;
- existing RAW directories/assets are checked through real paths;
- symlink/reparse-style asset paths are rejected before preview/trash destructive access;
- new RAW/Trash directories are checked after creation;
- verified transfer keeps `wx` no-overwrite + size/SHA256 verification before source removal.

### 6. Deterministic dependencies / CI

- root `package-lock.json` committed;
- final CI uses `npm ci`;
- final CI order: `npm ci → npm test → npm run build`;
- CI permissions are read-only contents.

### 7. Focused automated regression tests

Repair code CI #78 passed with 10/10 focused tests. After result/status documentation commits, PR HEAD `e9b79e56b93ee91ea19f3da25954fb4398a6ba28` also passed CI #80 using the final deterministic `npm ci → npm test → npm run build` contract.

Focused tests cover:

1. frozen DRIFT CURIO SKU adapter accept/reject;
2. Karing/TUN exclusion + WLAN preference;
3. same-item Session invalidation + expiry;
4. direct/declared/chunk limits;
5. lexical path traversal rejection;
6. real-path symlink escape rejection;
7. verified transfer success + hash preservation;
8. target no-overwrite;
9. verification failure target cleanup + source preservation;
10. flat SKU trash move + audit index record.

Server TypeScript and Vue/Vite builds pass. CI install reports 0 vulnerabilities.

## Scope confirmation

No SC01/ComfyUI production submission, SQLite, public exposure, cloud relay, Trash restore/batch delete, deployment or PR merge was implemented.

## Remaining required validation

Remote repair evidence is complete, but the packet requires target-Windows regression before G4B rerun.

Required target checks on `E:\AI_PROJECTS\VISUAL_CONSOLE` after pulling the current branch:

1. Console starts normally;
2. `/api/health` reports `0.1.0-p1.4-repair`;
3. LAN still selects WLAN `192.168.3.8` on the known target machine;
4. QR mobile page opens and shows the 12-hour SKU-bound Session;
5. direct iPhone photo upload lands in F RAW and Gallery refreshes;
6. one >32 MiB MOV/video succeeds through chunk path and lands in F RAW;
7. compact `×` moves one disposable test RAW to `100_Trash\<SKU>\` with no confirmation dialog;
8. invalid SKU such as `DC-ZZ-SZ-31001` is rejected when generating a mobile Session and must not create a RAW directory.

No user RAW/Trash data should be permanently deleted for this validation.

## Next gate

After the target-Windows checks pass, rerun formal G4B against the then-current HEAD and CI. A clean G4B may proceed to independent risk-based G5.
