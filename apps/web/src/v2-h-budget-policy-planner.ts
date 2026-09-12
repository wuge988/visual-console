type BudgetLimits = {
  per_job: number;
  per_sku: number;
  daily: number;
  monthly: number;
};

type BudgetPolicyMeta = {
  source: "REGISTRY_DEFAULT" | "RUNTIME_POLICY";
  persisted: boolean;
  updated_at: string | null;
};

type CloudProjection = {
  ok: boolean;
  authority: string;
  registry: {
    cloud_enabled: boolean;
    currency: string;
    limits: BudgetLimits;
    budget_policy?: BudgetPolicyMeta;
  };
};

const CLOUD_API = "http://127.0.0.1:4179/api/v2/cloud";
const BUDGET_POLICY_API = "http://127.0.0.1:4179/api/v2/cloud/budget-policy";

const FIELDS: Array<{
  key: keyof BudgetLimits;
  label: string;
  hint: string;
}> = [
  { key: "per_job", label: "Per Job", hint: "单任务预算上限" },
  { key: "per_sku", label: "Per SKU", hint: "单 SKU 累计预算" },
  { key: "daily", label: "Daily", hint: "每日预算上限" },
  { key: "monthly", label: "Monthly", hint: "每月预算上限" },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function readDraft(input: HTMLInputElement) {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function renderPlanner(root: HTMLElement, body: CloudProjection) {
  root.replaceChildren();
  const currency = body.registry.currency || "USD";
  const current = body.registry.limits;
  const policy = body.registry.budget_policy ?? {
    source: "REGISTRY_DEFAULT" as const,
    persisted: false,
    updated_at: null,
  };

  const header = el("header", "v2h-budget-planner-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "BUDGET POLICY"),
    el("h2", "", "本机预算策略"),
    el("p", "", "先预览，再显式保存本机预算策略。预算写入不会启用 Cloud、Provider、Model，也不会产生 Provider 调用或 Job 执行权。"),
  );
  const badges = el("div", "v2h-budget-planner-badges");
  badges.append(el("span", "persist", "LOCAL POLICY WRITE"), el("span", "write", "NO EXECUTION"));
  header.append(title, badges);
  root.append(header);

  const currentBlock = el("section", "v2h-budget-current");
  const currentTitle = el("div", "v2h-budget-section-title");
  const sourceLabel = policy.persisted
    ? `来自 Runtime Policy · PERSISTED${policy.updated_at ? ` · ${new Date(policy.updated_at).toLocaleString()}` : ""}`
    : "来自 Provider Registry Default · 0 = 未配置 / 阻断";
  currentTitle.append(el("b", "", "当前权威预算"), el("span", "", sourceLabel));
  currentBlock.append(currentTitle);
  const currentGrid = el("div", "v2h-budget-current-grid");
  for (const field of FIELDS) {
    const card = el("div", "v2h-budget-current-card");
    card.append(
      el("span", "", field.label),
      el("strong", "", money(current[field.key], currency)),
      el("small", "", current[field.key] > 0 ? "CONFIGURED" : "未配置"),
    );
    currentGrid.append(card);
  }
  currentBlock.append(currentGrid);
  root.append(currentBlock);

  const draftBlock = el("section", "v2h-budget-draft");
  const draftTitle = el("div", "v2h-budget-section-title");
  draftTitle.append(el("b", "", "预算草案"), el("span", "", "预览通过后仍需显式确认，才写入本机 Runtime Policy"));
  draftBlock.append(draftTitle);

  const draftGrid = el("div", "v2h-budget-draft-grid");
  const refs = new Map<keyof BudgetLimits, HTMLInputElement>();
  for (const field of FIELDS) {
    const wrap = el("label", "v2h-budget-draft-field");
    wrap.append(el("span", "", field.label));
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.inputMode = "decimal";
    input.value = String(current[field.key]);
    input.dataset.budgetKey = field.key;
    wrap.append(input, el("small", "", field.hint));
    draftGrid.append(wrap);
    refs.set(field.key, input);
  }
  draftBlock.append(draftGrid);

  const actions = el("div", "v2h-budget-actions");
  const preview = el("button", "v2h-budget-preview", "预览草案");
  preview.type = "button";
  const note = el("span", "", "预览本身不写入任何预算。" );
  actions.append(preview, note);
  draftBlock.append(actions);

  const result = el("div", "v2h-budget-result");
  result.dataset.state = "idle";
  result.append(
    el("b", "", "NOT VALIDATED"),
    el("span", "", "修改预算后先点击“预览草案”；未经确认不会持久化。"),
  );
  draftBlock.append(result);

  const commitRow = el("div", "v2h-budget-commit");
  const ackLabel = el("label", "v2h-budget-ack");
  const ack = document.createElement("input");
  ack.type = "checkbox";
  ackLabel.append(ack, el("span", "", "我确认：只写入本机预算策略，不启用 Cloud / Provider / Model，不授予执行权。"));
  const save = el("button", "v2h-budget-save", "保存本机预算策略");
  save.type = "button";
  save.disabled = true;
  commitRow.append(ackLabel, save);
  draftBlock.append(commitRow);
  root.append(draftBlock);

  const authority = el("footer", "v2h-budget-authority");
  authority.append(
    el("strong", "", "Budget policy ≠ execution authority."),
    el("span", "", `Cloud=${body.registry.cloud_enabled ? "ENABLED" : "DISABLED"} · ${body.authority || "COST_GUARD_FAIL_CLOSED"}. Budget writes are isolated from Provider/model enablement and Job execution.`),
  );
  root.append(authority);

  let validatedProposal: BudgetLimits | null = null;
  let validatedChanges = 0;

  function resetValidation() {
    validatedProposal = null;
    validatedChanges = 0;
    save.disabled = true;
    result.dataset.state = "idle";
    result.replaceChildren(
      el("b", "", "NOT VALIDATED"),
      el("span", "", "草案已变化；请重新点击“预览草案”。"),
    );
  }

  for (const input of refs.values()) input.addEventListener("input", resetValidation);

  preview.addEventListener("click", () => {
    const proposal = {} as BudgetLimits;
    const invalid: string[] = [];
    let changes = 0;
    for (const field of FIELDS) {
      const input = refs.get(field.key)!;
      const value = readDraft(input);
      if (value == null) {
        invalid.push(field.label);
        continue;
      }
      proposal[field.key] = value;
      if (Math.abs(value - current[field.key]) > 1e-9) changes += 1;
    }

    result.replaceChildren();
    if (invalid.length) {
      validatedProposal = null;
      validatedChanges = 0;
      save.disabled = true;
      result.dataset.state = "invalid";
      result.append(
        el("b", "", "INVALID DRAFT"),
        el("span", "", `以下字段必须为 0 或非负数字：${invalid.join(" / ")}。没有任何值被保存。`),
      );
      return;
    }

    validatedProposal = proposal;
    validatedChanges = changes;
    save.disabled = changes === 0 || !ack.checked;
    result.dataset.state = "valid";
    const status = changes === 0 ? "NO CHANGE" : "VALID DRAFT";
    const detail = changes === 0
      ? "草案与当前权威预算一致；无需重复写入。"
      : `${changes} 个预算字段与当前权威值不同；尚未保存。勾选确认后才允许写入 Runtime Policy。`;
    result.append(el("b", "", status), el("span", "", detail));
  });

  ack.addEventListener("change", () => {
    save.disabled = !validatedProposal || validatedChanges === 0 || !ack.checked;
  });

  save.addEventListener("click", async () => {
    if (!validatedProposal || validatedChanges === 0 || !ack.checked) return;
    const proposal = { ...validatedProposal };
    save.disabled = true;
    save.textContent = "保存中…";
    try {
      const response = await fetch(BUDGET_POLICY_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acknowledge: "BUDGET_POLICY_ONLY",
          limits: proposal,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP_${response.status}`);

      validatedProposal = null;
      validatedChanges = 0;
      ack.checked = false;
      result.dataset.state = "valid";
      result.replaceChildren(
        el("b", "", "POLICY SAVED"),
        el("span", "", "本机预算策略已持久化。刷新页面后“当前权威预算”应保持该值；Cloud / Provider / Model 仍未启用。"),
      );
    } catch (error) {
      result.dataset.state = "invalid";
      result.replaceChildren(
        el("b", "", "SAVE BLOCKED"),
        el("span", "", `预算策略未写入：${error instanceof Error ? error.message : String(error)}`),
      );
    } finally {
      save.textContent = "保存本机预算策略";
      save.disabled = true;
    }
  });
}

async function mountPlanner() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  const estimator = document.querySelector<HTMLElement>("[data-v2h-cost-estimator='1']");
  if (!boundary && !estimator) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-budget-policy-planner='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hBudgetPolicyPlanner = "1";
    root.className = "v2h-panel v2h-budget-planner";
    if (estimator) estimator.insertAdjacentElement("afterend", root);
    else if (boundary?.parentElement) boundary.parentElement.insertBefore(root, boundary);
  }

  try {
    const response = await fetch(CLOUD_API);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    renderPlanner(root, (await response.json()) as CloudProjection);
  } catch {
    root.replaceChildren();
    const header = el("header", "v2h-budget-planner-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "BUDGET POLICY"), el("h2", "", "本机预算策略"));
    header.append(title, el("span", "v2h-budget-planner-unavailable", "UNAVAILABLE"));
    root.append(header, el("p", "v2h-budget-planner-empty", "无法读取本地预算权威状态；不允许离线写入。"));
  }
}

export function installV2HBudgetPolicyPlanner() {
  void mountPlanner();
}
