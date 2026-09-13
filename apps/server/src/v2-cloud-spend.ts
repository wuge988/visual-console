import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const CLOUD_SPEND_LEDGER_PATH = join(ROOT, ".visual-console-runtime", "v2-cloud-spend.jsonl");
const EVENT_TYPES = new Set(["RESERVATION", "SETTLEMENT"]);
const APPEND_FIELDS = new Set([
  "event_type",
  "spend_id",
  "site_id",
  "job_id",
  "item_id",
  "provider_key",
  "model_key",
  "amount",
  "currency",
  "approval_source",
  "occurred_at",
]);

type Dependencies = {
  assertLocalRequest: (req: any) => void;
};

export type CloudSpendEventType = "RESERVATION" | "SETTLEMENT";

export type CloudSpendAppendInput = {
  event_type?: unknown;
  spend_id?: unknown;
  site_id?: unknown;
  job_id?: unknown;
  item_id?: unknown;
  provider_key?: unknown;
  model_key?: unknown;
  amount?: unknown;
  currency?: unknown;
  approval_source?: unknown;
  occurred_at?: unknown;
  [key: string]: unknown;
};

export type NormalizedCloudSpendAppendInput = {
  event_type: CloudSpendEventType;
  spend_id: string;
  site_id: string;
  job_id: string;
  item_id: string;
  provider_key: string;
  model_key: string;
  amount: number;
  currency: string;
  approval_source: string;
  occurred_at: string;
};

export type CloudSpendLedgerEvent = NormalizedCloudSpendAppendInput & {
  schema_version: "1.0";
  event_id: string;
  recorded_at: string;
};

export type CloudSpendLedgerRead = {
  events: CloudSpendLedgerEvent[];
  torn_tail_ignored: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function requiredIdentifier(value: unknown, code: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(text)) {
    throw new Error(code);
  }
  return text;
}

function requiredText(value: unknown, code: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 200) throw new Error(code);
  return text;
}

function requiredIsoTimestamp(value: unknown, code: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error(code);
  return new Date(text).toISOString();
}

function nonNegativeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("CLOUD_SPEND_AMOUNT_INVALID");
  return amount;
}

function currencyCode(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("CLOUD_SPEND_CURRENCY_INVALID");
  return currency;
}

export function normalizeCloudSpendAppendInput(
  value: CloudSpendAppendInput | null | undefined,
  now = new Date(),
): NormalizedCloudSpendAppendInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLOUD_SPEND_EVENT_INVALID");
  }
  if (Object.keys(value).some((key) => !APPEND_FIELDS.has(key))) {
    throw new Error("CLOUD_SPEND_SCOPE_VIOLATION");
  }

  const eventType = typeof value.event_type === "string" ? value.event_type.trim().toUpperCase() : "";
  if (!EVENT_TYPES.has(eventType)) throw new Error("CLOUD_SPEND_EVENT_TYPE_INVALID");

  return {
    event_type: eventType as CloudSpendEventType,
    spend_id: requiredIdentifier(value.spend_id, "CLOUD_SPEND_ID_INVALID"),
    site_id: requiredIdentifier(value.site_id, "CLOUD_SPEND_SITE_INVALID"),
    job_id: requiredIdentifier(value.job_id, "CLOUD_SPEND_JOB_INVALID"),
    item_id: requiredIdentifier(value.item_id, "CLOUD_SPEND_ITEM_INVALID"),
    provider_key: requiredIdentifier(value.provider_key, "CLOUD_SPEND_PROVIDER_INVALID"),
    model_key: requiredIdentifier(value.model_key, "CLOUD_SPEND_MODEL_INVALID"),
    amount: nonNegativeAmount(value.amount),
    currency: currencyCode(value.currency),
    approval_source: requiredText(value.approval_source, "CLOUD_SPEND_APPROVAL_SOURCE_INVALID"),
    occurred_at: value.occurred_at == null
      ? now.toISOString()
      : requiredIsoTimestamp(value.occurred_at, "CLOUD_SPEND_OCCURRED_AT_INVALID"),
  };
}

function normalizeStoredEvent(value: unknown): CloudSpendLedgerEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CLOUD_SPEND_LEDGER_EVENT_INVALID");
  }
  const row = value as Record<string, unknown>;
  if (row.schema_version !== "1.0") throw new Error("CLOUD_SPEND_LEDGER_SCHEMA_INVALID");
  const normalized = normalizeCloudSpendAppendInput(row as CloudSpendAppendInput);
  return {
    schema_version: "1.0",
    event_id: requiredIdentifier(row.event_id, "CLOUD_SPEND_EVENT_ID_INVALID"),
    recorded_at: requiredIsoTimestamp(row.recorded_at, "CLOUD_SPEND_RECORDED_AT_INVALID"),
    ...normalized,
  };
}

export function parseCloudSpendLedgerText(text: string): CloudSpendLedgerRead {
  if (!text) return { events: [], torn_tail_ignored: false };
  const trailingNewline = text.endsWith("\n");
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events: CloudSpendLedgerEvent[] = [];
  let tornTailIgnored = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      events.push(normalizeStoredEvent(JSON.parse(line)));
    } catch (error) {
      const isLast = index === lines.length - 1;
      if (isLast && !trailingNewline) {
        tornTailIgnored = true;
        break;
      }
      throw error;
    }
  }

  return { events, torn_tail_ignored: tornTailIgnored };
}

export async function readCloudSpendLedger(): Promise<CloudSpendLedgerRead> {
  try {
    return parseCloudSpendLedgerText(await readFile(CLOUD_SPEND_LEDGER_PATH, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { events: [], torn_tail_ignored: false };
    }
    throw error;
  }
}

export async function appendCloudSpendEvent(input: CloudSpendAppendInput): Promise<CloudSpendLedgerEvent> {
  const normalized = normalizeCloudSpendAppendInput(input);
  const current = await readCloudSpendLedger();
  const sameSpend = current.events.filter((event) => event.spend_id === normalized.spend_id);
  if (sameSpend.some((event) => event.event_type === normalized.event_type)) {
    throw new Error("CLOUD_SPEND_EVENT_DUPLICATE");
  }
  if (normalized.event_type === "SETTLEMENT" && !sameSpend.some((event) => event.event_type === "RESERVATION")) {
    throw new Error("CLOUD_SPEND_SETTLEMENT_WITHOUT_RESERVATION");
  }

  const recordedAt = new Date().toISOString();
  const event: CloudSpendLedgerEvent = {
    schema_version: "1.0",
    event_id: `cse_${randomUUID()}`,
    recorded_at: recordedAt,
    ...normalized,
  };
  await mkdir(dirname(CLOUD_SPEND_LEDGER_PATH), { recursive: true });
  await appendFile(CLOUD_SPEND_LEDGER_PATH, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return event;
}

function queryTimestamp(value: unknown, code: string) {
  if (value == null || value === "") return null;
  return requiredIsoTimestamp(value, code);
}

export function filterCloudSpendEvents(
  events: CloudSpendLedgerEvent[],
  query: Record<string, unknown>,
) {
  const siteId = typeof query.site_id === "string" ? query.site_id.trim() : "";
  const itemId = typeof query.item_id === "string" ? query.item_id.trim() : "";
  const jobId = typeof query.job_id === "string" ? query.job_id.trim() : "";
  const providerKey = typeof query.provider_key === "string" ? query.provider_key.trim() : "";
  const modelKey = typeof query.model_key === "string" ? query.model_key.trim() : "";
  const from = queryTimestamp(query.from, "CLOUD_SPEND_FROM_INVALID");
  const to = queryTimestamp(query.to, "CLOUD_SPEND_TO_INVALID");
  if (from && to && from > to) throw new Error("CLOUD_SPEND_RANGE_INVALID");

  return events.filter((event) => {
    if (siteId && event.site_id !== siteId) return false;
    if (itemId && event.item_id !== itemId) return false;
    if (jobId && event.job_id !== jobId) return false;
    if (providerKey && event.provider_key !== providerKey) return false;
    if (modelKey && event.model_key !== modelKey) return false;
    if (from && event.occurred_at < from) return false;
    if (to && event.occurred_at > to) return false;
    return true;
  });
}

export function summarizeCloudSpend(events: CloudSpendLedgerEvent[]) {
  const reservations = new Map<string, CloudSpendLedgerEvent>();
  const settlements = new Map<string, CloudSpendLedgerEvent>();
  const totalsByCurrency: Record<string, {
    reserved_estimate: number;
    actual_known: number;
    unsettled_reservations: number;
  }> = {};

  for (const event of events) {
    if (event.event_type === "RESERVATION") reservations.set(event.spend_id, event);
    else settlements.set(event.spend_id, event);
  }

  const currencies = new Set(events.map((event) => event.currency));
  for (const currency of currencies) {
    const currencyReservations = [...reservations.values()].filter((event) => event.currency === currency);
    const currencySettlements = [...settlements.values()].filter((event) => event.currency === currency);
    totalsByCurrency[currency] = {
      reserved_estimate: currencyReservations.reduce((sum, event) => sum + event.amount, 0),
      actual_known: currencySettlements.reduce((sum, event) => sum + event.amount, 0),
      unsettled_reservations: currencyReservations.filter((event) => !settlements.has(event.spend_id)).length,
    };
  }

  return {
    event_count: events.length,
    reservation_count: reservations.size,
    settlement_count: settlements.size,
    unsettled_reservation_count: [...reservations.keys()].filter((spendId) => !settlements.has(spendId)).length,
    totals_by_currency: totalsByCurrency,
  };
}

export async function registerV2CloudSpendRoutes(app: FastifyInstance, deps: Dependencies) {
  app.get("/api/v2/cloud/spend", async (req, reply) => {
    try {
      deps.assertLocalRequest(req);
      const query = (req.query as Record<string, unknown>) ?? {};
      const ledger = await readCloudSpendLedger();
      const filtered = filterCloudSpendEvents(ledger.events, query)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      const rawLimit = Number(query.limit ?? 100);
      const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.trunc(rawLimit))) : 100;

      return {
        ok: true,
        generated_at: new Date().toISOString(),
        authority: "CLOUD_SPEND_LEDGER_READ_ONLY",
        source: "LOCAL_APPEND_ONLY_AUDIT_LEDGER",
        ledger_status: ledger.events.length ? "READY" : "EMPTY",
        torn_tail_ignored: ledger.torn_tail_ignored,
        total: filtered.length,
        summary: summarizeCloudSpend(filtered),
        events: filtered.slice(0, limit),
        audit: {
          mutation: false,
          provider_call: false,
          ledger_write_route: false,
          credential_write: false,
          registry_write: false,
          budget_write: false,
          job_write: false,
          qa_write: false,
          archive_write: false,
          source_write: false,
        },
      };
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
