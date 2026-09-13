type SpendTotals = {
  reserved_estimate: number;
  actual_known: number;
  unsettled_reservations: number;
};

type SpendSummary = {
  event_count: number;
  reservation_count: number;
  settlement_count: number;
  unsettled_reservation_count: number;
  totals_by_currency: Record<string, SpendTotals>;
};

type SpendEvent = {
  event_id: string;
  event_type: "RESERVATION" | "SETTLEMENT";
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

type SpendAuditResponse = {
  ok: boolean;
  generated_at: string;
  authority: string;
  source: string;
  ledger_status: "EMPTY" | "READY";
  torn_tail_ignored: boolean;
  total: number;
  summary: SpendSummary;
  events: SpendEvent[];
  audit: Record<string, boolean>;
};

const API = "http://127.0.0.1:4179/api/v2/cloud/spend?limit=20";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(4)}`;
  }
}

function shortTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function render(root: HTMLElement, body: SpendAuditResponse) {
  root.replaceChildren();

  const head = el("header", "v2h-spend-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "CLOUD SPEND AUDIT"),
    el("h2", "", "云端费用审计"),
    el("p", "", "读取本机 append-only 费用审计账本。当前仅展示 reservation / settlement 真值，不提供浏览器写入，也不会触发 Provider。"),
  );
  const badges = el("div", "v2h-spend-badges");
  badges.append(el("span", "readonly", "READ ONLY"), el("span", "nowrite", "NO WRITE"));
  head.append(title, badges);
  root.append(head);

  const stats = el("div", "v2h-spend-stats");
  const statRows: Array<[string, string, string]> = [
    ["Ledger", body.ledger_status, body.ledger_status === "READY" ? "append-only events present" : "no spend events recorded"],
    ["Reservations", String(body.summary?.reservation_count ?? 0), "approved estimates"],
    ["Settlements", String(body.summary?.settlement_count ?? 0), "known actual amounts"],
    ["Unsettled", String(body.summary?.unsettled_reservation_count ?? 0), "reservation without actual"],
  ];
  for (const [label, value, note] of statRows) {
    const card = el("div", "v2h-spend-stat");
    card.append(el("span", "", label), el("b", "", value), el("small", "", note));
    stats.append(card);
  }
  root.append(stats);

  const currencies = Object.entries(body.summary?.totals_by_currency ?? {});
  const totals = el("section", "v2h-spend-totals");
  const totalsHead = el("div", "v2h-spend-section-head");
  totalsHead.append(el("span", "", "AUDITED TOTALS"), el("b", "", currencies.length ? "RECORDED" : "NO EVENTS"));
  totals.append(totalsHead);

  if (!currencies.length) {
    const empty = el("div", "v2h-spend-empty");
    empty.append(
      el("b", "", "尚无云端费用事件"),
      el("p", "", "这不是 $0 实际账单结论。当前 Provider 网络执行仍关闭，因此账本为空；未来只有通过独立执行 Gate 的服务端 Adapter 才能写入费用事件。"),
    );
    totals.append(empty);
  } else {
    const grid = el("div", "v2h-spend-currency-grid");
    for (const [currency, values] of currencies) {
      const card = el("article", "v2h-spend-currency-card");
      const cardHead = el("div", "v2h-spend-currency-head");
      cardHead.append(el("b", "", currency), el("span", "", `${values.unsettled_reservations} unsettled`));
      const facts = el("div", "v2h-spend-currency-facts");
      const reserved = el("div");
      reserved.append(el("span", "", "Reserved estimate"), el("b", "", money(values.reserved_estimate, currency)));
      const actual = el("div");
      actual.append(el("span", "", "Actual known"), el("b", "", money(values.actual_known, currency)));
      facts.append(reserved, actual);
      card.append(cardHead, facts);
      grid.append(card);
    }
    totals.append(grid);
  }
  root.append(totals);

  const recent = el("section", "v2h-spend-recent");
  const recentHead = el("div", "v2h-spend-section-head");
  recentHead.append(el("span", "", "RECENT EVENTS"), el("b", "", `${body.total ?? 0} total`));
  recent.append(recentHead);

  if (!(body.events ?? []).length) {
    recent.append(el("p", "v2h-spend-recent-empty", "No reservation or settlement events recorded."));
  } else {
    const table = el("div", "v2h-spend-table");
    const header = el("div", "v2h-spend-row header");
    for (const label of ["Time", "Piece / Job", "Provider / Model", "Phase", "Amount"]) {
      header.append(el("span", "", label));
    }
    table.append(header);
    for (const event of body.events) {
      const row = el("div", "v2h-spend-row");
      const piece = el("span");
      piece.append(el("b", "", event.item_id), el("small", "", event.job_id));
      const provider = el("span");
      provider.append(el("b", "", event.provider_key), el("small", "", event.model_key));
      row.append(
        el("span", "", shortTime(event.occurred_at)),
        piece,
        provider,
        el("span", event.event_type === "SETTLEMENT" ? "settlement" : "reservation", event.event_type),
        el("span", "amount", money(event.amount, event.currency)),
      );
      table.append(row);
    }
    recent.append(table);
  }
  root.append(recent);

  const auditSafe = body.audit && Object.values(body.audit).every((value) => value === false);
  const authority = el("footer", "v2h-spend-authority");
  authority.append(
    el("strong", "", body.authority || "CLOUD_SPEND_LEDGER_READ_ONLY"),
    el(
      "span",
      "",
      auditSafe
        ? `Source=${body.source || "LOCAL_APPEND_ONLY_AUDIT_LEDGER"}. Ledger visibility ≠ Provider execution authority; no browser write route, credential write, Job / QA / Archive / RAW-source mutation.`
        : "AUDIT BOUNDARY INVALID：返回数据包含非只读权限，必须按 fail-closed 处理。",
    ),
  );
  if (body.torn_tail_ignored) {
    authority.dataset.state = "warning";
    authority.append(el("em", "", "TORN FINAL TAIL IGNORED"));
  }
  if (!auditSafe) authority.dataset.state = "error";
  root.append(authority);
}

async function mountSpendAudit() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!boundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-spend-audit='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hSpendAudit = "1";
    root.className = "v2h-panel v2h-spend-audit";

    const adapters = document.querySelector<HTMLElement>("[data-v2h-adapter-registry='1']");
    const preflight = document.querySelector<HTMLElement>("[data-v2h-activation-preflight='1']");
    if (adapters) adapters.insertAdjacentElement("afterend", root);
    else if (preflight) preflight.insertAdjacentElement("afterend", root);
    else if (boundary.parentElement) boundary.parentElement.insertBefore(root, boundary);
  }

  try {
    const response = await fetch(API);
    const body = await response.json().catch(() => ({})) as SpendAuditResponse & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren();
    const head = el("header", "v2h-spend-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "CLOUD SPEND AUDIT"), el("h2", "", "云端费用审计"));
    head.append(title, el("span", "v2h-spend-unavailable", "UNAVAILABLE"));
    root.append(
      head,
      el("p", "v2h-spend-recent-empty", `无法读取本机 Cloud Spend Ledger：${error instanceof Error ? error.message : String(error)}。不允许离线推断实际费用。`),
    );
  }
}

export function installV2HSpendAuditUI() {
  void mountSpendAudit();
}
