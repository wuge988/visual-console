# Visual Console V2-H — Cloud Spend Audit UI

Date: 2026-09-13

Status: `UI_IMPLEMENTED / READ_ONLY / NO_WRITE / NO_PROVIDER_CALL / CI_PENDING / WINDOWS_HUMAN_VISUAL_GATE_NEXT`

## Goal

Expose the append-only Cloud Spend Ledger foundation as a compact operator-facing audit surface inside `/v2/cloud` without granting any write or execution authority.

## Surface

New panel:

- `CLOUD SPEND AUDIT / 云端费用审计`

Placement:

- after `Provider 适配器契约`;
- before the global V2-H authority boundary.

Visible truth:

- Ledger state (`EMPTY` / `READY`);
- reservation count;
- settlement count;
- unsettled reservation count;
- per-currency reserved estimates and known actual amounts when events exist;
- recent append-only events when present;
- `CLOUD_SPEND_LEDGER_READ_ONLY` authority.

When the ledger is empty, the UI explicitly states that this is **not** a `$0 actual bill` conclusion. It means no spend events have been recorded while Provider network execution remains disabled.

## Safety

The browser performs only:

- `GET /api/v2/cloud/spend?limit=20`.

It does not expose:

- a spend-ledger write control;
- Provider execution;
- credential write;
- Cloud / Provider / Model enablement;
- Job creation/retry;
- QA or Archive mutation;
- RAW/source mutation.

The panel validates the server audit projection. Any unexpected truthy audit capability is rendered fail-closed.

## Human Visual Gate checklist

Target-Windows review must confirm:

1. panel renders immediately after Provider Adapter Contracts without shell/sidebar regression;
2. `READ ONLY` and `NO WRITE` are visible;
3. with the current empty ledger, summary shows `Ledger EMPTY`, `Reservations 0`, `Settlements 0`, `Unsettled 0`;
4. empty state says no cloud spend events are recorded and does not claim actual spend is `$0`;
5. recent events says no reservation/settlement events recorded;
6. footer authority is `CLOUD_SPEND_LEDGER_READ_ONLY`;
7. Provider Adapter panel above remains `NETWORK OFF / NOT_IMPLEMENTED`;
8. bottom global authority remains `COST_GUARD_FAIL_CLOSED`.

## Gate

`SPEND_AUDIT_UI_IMPLEMENTED / READ_ONLY / NO_WRITE / NO_PROVIDER_CALL / CI_PENDING / WINDOWS_HUMAN_VISUAL_GATE_NEXT`
