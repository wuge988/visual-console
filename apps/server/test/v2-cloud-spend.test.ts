import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCloudSpendEvents,
  normalizeCloudSpendAppendInput,
  parseCloudSpendLedgerText,
  summarizeCloudSpend,
  type CloudSpendLedgerEvent,
} from "../src/v2-cloud-spend.js";

function event(
  event_type: "RESERVATION" | "SETTLEMENT",
  spend_id: string,
  amount: number,
  currency = "USD",
  occurred_at = "2026-09-13T01:00:00.000Z",
): CloudSpendLedgerEvent {
  return {
    schema_version: "1.0",
    event_id: `cse_${spend_id}_${event_type.toLowerCase()}`,
    recorded_at: occurred_at,
    event_type,
    spend_id,
    site_id: "drift-curio",
    job_id: `job-${spend_id}`,
    item_id: "DC-ZY-SZ-31001",
    provider_key: "openai-image",
    model_key: "gpt-image-2.5-sunburst",
    amount,
    currency,
    approval_source: "COST_GUARD_APPROVED",
    occurred_at,
  };
}

test("spend append normalization is exact-scope and non-negative", () => {
  const normalized = normalizeCloudSpendAppendInput({
    event_type: "reservation",
    spend_id: "spend-1",
    site_id: "drift-curio",
    job_id: "job-1",
    item_id: "DC-ZY-SZ-31001",
    provider_key: "openai-image",
    model_key: "gpt-image-2.5-sunburst",
    amount: "0.25",
    currency: "usd",
    approval_source: "COST_GUARD_APPROVED",
  }, new Date("2026-09-13T01:00:00.000Z"));

  assert.equal(normalized.event_type, "RESERVATION");
  assert.equal(normalized.amount, 0.25);
  assert.equal(normalized.currency, "USD");
  assert.equal(normalized.occurred_at, "2026-09-13T01:00:00.000Z");

  assert.throws(() => normalizeCloudSpendAppendInput({
    ...normalized,
    api_key: "secret",
  } as any), /CLOUD_SPEND_SCOPE_VIOLATION/);
  assert.throws(() => normalizeCloudSpendAppendInput({
    ...normalized,
    amount: -1,
  }), /CLOUD_SPEND_AMOUNT_INVALID/);
  assert.throws(() => normalizeCloudSpendAppendInput({
    ...normalized,
    currency: "US",
  }), /CLOUD_SPEND_CURRENCY_INVALID/);
});

test("spend ledger parser preserves valid records and ignores only a torn final tail", () => {
  const first = event("RESERVATION", "spend-1", 0.25);
  const second = event("SETTLEMENT", "spend-1", 0.22, "USD", "2026-09-13T01:02:00.000Z");
  const complete = `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`;
  const parsed = parseCloudSpendLedgerText(complete);
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.torn_tail_ignored, false);

  const torn = parseCloudSpendLedgerText(`${complete}{"schema_version":"1.0"`);
  assert.equal(torn.events.length, 2);
  assert.equal(torn.torn_tail_ignored, true);

  assert.throws(
    () => parseCloudSpendLedgerText(`${JSON.stringify(first)}\nnot-json\n${JSON.stringify(second)}\n`),
    /Unexpected token|JSON/,
  );
});

test("spend summary separates reserved estimates from known actuals", () => {
  const events = [
    event("RESERVATION", "spend-1", 0.25),
    event("SETTLEMENT", "spend-1", 0.22, "USD", "2026-09-13T01:02:00.000Z"),
    event("RESERVATION", "spend-2", 0.4, "USD", "2026-09-13T02:00:00.000Z"),
    event("RESERVATION", "spend-eur", 1.1, "EUR", "2026-09-13T03:00:00.000Z"),
  ];
  const summary = summarizeCloudSpend(events);
  assert.equal(summary.event_count, 4);
  assert.equal(summary.reservation_count, 3);
  assert.equal(summary.settlement_count, 1);
  assert.equal(summary.unsettled_reservation_count, 2);
  assert.deepEqual(summary.totals_by_currency.USD, {
    reserved_estimate: 0.65,
    actual_known: 0.22,
    unsettled_reservations: 1,
  });
  assert.deepEqual(summary.totals_by_currency.EUR, {
    reserved_estimate: 1.1,
    actual_known: 0,
    unsettled_reservations: 1,
  });
});

test("spend filtering is explicit and time-bounded", () => {
  const events = [
    event("RESERVATION", "spend-1", 0.25, "USD", "2026-09-13T01:00:00.000Z"),
    {
      ...event("RESERVATION", "spend-2", 0.4, "USD", "2026-09-13T05:00:00.000Z"),
      provider_key: "seedance-video",
      model_key: "doubao-seedance-2.0",
    },
  ];
  assert.equal(filterCloudSpendEvents(events, { provider_key: "openai-image" }).length, 1);
  assert.equal(filterCloudSpendEvents(events, {
    from: "2026-09-13T00:00:00Z",
    to: "2026-09-13T03:00:00Z",
  }).length, 1);
  assert.throws(() => filterCloudSpendEvents(events, {
    from: "2026-09-14T00:00:00Z",
    to: "2026-09-13T00:00:00Z",
  }), /CLOUD_SPEND_RANGE_INVALID/);
});
