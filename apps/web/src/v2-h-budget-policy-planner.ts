type BudgetLimits = {
  per_job: number;
  per_sku: number;
  daily: number;
  monthly: number;
};

type CloudProjection = {
  ok: boolean;
  authority: string;
  registry: {
    cloud_enabled: boolean;
    currency: string;
    limits: BudgetLimits;
  };
};

const API = "http://127.0.0.1:4179/api/v2/cloud";

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

  const header = el("header", "v2h-budget-planner-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "BUDGET POLICY PLANNER"),
    el("h2", "", "预算策略草案"),
    el("p", "", "只在浏览器中预览预算配置差异；不会保存 Registry，不会改变 Cost Guard，也不会获得任何 Cloud 执行权。"),
  );
  const badges = el("div", "v2h-budget-planner-badges");
  badges.append(el("span", "draft", "DRAFT ONLY"), el("span", "write", "NO WRITE"));
  header.append(title, badges);
  root.append(header);

  const currentBlock = el("section", "v2h-budget-current");
  const currentTitle = el("div", "v2h-budget-section-title");
  currentTitle.append(el("b", "", "当前权威预算"), el("span", "", "来自 Provider Registry · 0 = 未配置 / 阻断"));
  currentBlock.append(currentTitle);
  const currentGrid = el("div", "v2h-budget-current-grid");
  for (const field of FIELDS) {
    const card = el("div", "v2h-budget-current-card");
    card.append(el("span", "", field.label), el("strong", "", money(current[field.key], currency)), el("small", "", current[field.key] > 0 ? "CONFIGURED" : "未配置"));
    currentGrid.append(card);
  }
  currentBlock.append(currentGrid);
  root.append(currentBlock);

  const draftBlock = el("section", "v2h-budget-draft");
  const draftTitle = el("div", "v2h-budget-section-title");
  draftTitle.append(el("b", "", "草案预算"), el("span", "", "仅用于规划；刷新页面即回到权威 Registry 值"));
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
  const note = el("span", "", "不会提交预算，不会调用 Provider。" );
  actions.append(preview, note);
  draftBlock.append(actions);

  const result = el("div", "v2h-budget-result");
  result.dataset.state = "idle";
  result.append(
    el("b", "", "NOT VALIDATED"),
    el("span", "", "输入预算草案后点击“预览草案”；当前不会产生任何持久化变更。"),
  );
  draftBlock.append(result);
  root.append(draftBlock);

  const authority = el("footer", "v2h-budget-authority");
  authority.append(
    el("strong", "", "Budget planning ≠ execution authority."),
    el("span", "", `Cloud=${body.registry.cloud_enabled ? "ENABLED" : "DISABLED"} · ${body.authority || "COST_GUARD_FAIL_CLOSED"}. Draft values are never sent to Provider Registry or Cost Guard.`),
  );
  root.append(authority);

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
      result.dataset.state = "invalid";
      result.append(
        el("b", "", "INVALID DRAFT"),
        el("span", "", `以下字段必须为 0 或非负数字：${invalid.join(" / ")}。没有任何值被保存。`),
      );
      return;
    }

    result.dataset.state = "valid";
    const status = changes === 0 ? "NO CHANGE" : "VALID DRAFT";
    const detail = changes === 0
      ? "草案与当前权威预算一致；0 仍代表预算未配置，因此 Cost Guard 继续 fail closed。"
      : `${changes} 个预算字段与 Registry 不同；这是未保存的规划草案，不会改变当前 $0 权威预算或执行边界。`;
    result.append(el("b", "", status), el("span", "", detail));
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
    const response = await fetch(API);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    renderPlanner(root, (await response.json()) as CloudProjection);
  } catch {
    root.replaceChildren();
    const header = el("header", "v2h-budget-planner-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "BUDGET POLICY PLANNER"), el("h2", "", "预算策略草案"));
    header.append(title, el("span", "v2h-budget-planner-unavailable", "UNAVAILABLE"));
    root.append(header, el("p", "v2h-budget-planner-empty", "无法读取本地 Provider Registry；不创建离线预算草案。"));
  }
}

export function installV2HBudgetPolicyPlanner() {
  void mountPlanner();
}
