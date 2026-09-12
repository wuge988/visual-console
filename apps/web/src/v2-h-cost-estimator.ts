type PublicPricing = {
  basis?: string;
  currency?: string;
  text_input_per_million?: number;
  text_cached_input_per_million?: number;
  image_input_per_million?: number;
  image_cached_input_per_million?: number;
  image_output_per_million?: number;
};

type PublicModel = {
  model_key: string;
  display_name: string;
  pricing_status: string;
  pricing?: PublicPricing | null;
};

type PublicProvider = {
  provider_key: string;
  display_name: string;
  adapter_status: string;
  enabled: boolean;
  models?: PublicModel[];
};

type CloudProjection = {
  ok: boolean;
  authority: string;
  registry: {
    cloud_enabled: boolean;
    providers: PublicProvider[];
  };
};

type CostGuardDryRun = {
  ok: boolean;
  authority: string;
  guard: {
    allowed: boolean;
    fail_closed: boolean;
    currency: string;
    estimated_cost: number | null;
    reasons: string[];
  };
  audit?: {
    mutation?: boolean;
    provider_call?: boolean;
    budget_write?: boolean;
    job_write?: boolean;
  };
};

type TokenCounts = {
  text_input: number;
  text_cached_input: number;
  image_input: number;
  image_cached_input: number;
  image_output: number;
};

type EstimatorModel = PublicModel & {
  provider_key: string;
  provider_name: string;
  provider_enabled: boolean;
  adapter_status: string;
};

const API = "http://127.0.0.1:4179/api/v2/cloud";
const GUARD_API = `${API}/evaluate`;
const ZERO_COUNTS: TokenCounts = {
  text_input: 0,
  text_cached_input: 0,
  image_input: 0,
  image_cached_input: 0,
  image_output: 0,
};

const INPUTS: Array<{
  key: keyof TokenCounts;
  label: string;
  hint: string;
  priceKey: keyof PublicPricing;
}> = [
  { key: "text_input", label: "Text input", hint: "uncached tokens", priceKey: "text_input_per_million" },
  { key: "text_cached_input", label: "Cached text", hint: "cached input tokens", priceKey: "text_cached_input_per_million" },
  { key: "image_input", label: "Image input", hint: "uncached image tokens", priceKey: "image_input_per_million" },
  { key: "image_cached_input", label: "Cached image", hint: "cached image tokens", priceKey: "image_cached_input_per_million" },
  { key: "image_output", label: "Image output", hint: "generated image tokens", priceKey: "image_output_per_million" },
];

export function estimateTokenCost(pricing: PublicPricing, counts: TokenCounts) {
  const components = INPUTS.map(({ key, priceKey }) => {
    const tokens = Math.max(0, Number(counts[key]) || 0);
    const rate = Number(pricing[priceKey]);
    const cost = Number.isFinite(rate) ? (tokens / 1_000_000) * rate : 0;
    return { key, tokens, rate: Number.isFinite(rate) ? rate : null, cost };
  });
  return {
    currency: pricing.currency ?? "USD",
    total: components.reduce((sum, row) => sum + row.cost, 0),
    components,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function flattenModels(body: CloudProjection): EstimatorModel[] {
  return (body.registry?.providers ?? []).flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      ...model,
      provider_key: provider.provider_key,
      provider_name: provider.display_name,
      provider_enabled: provider.enabled,
      adapter_status: provider.adapter_status,
    })),
  );
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: value < 0.01 ? 6 : 4,
    maximumFractionDigits: value < 0.01 ? 6 : 4,
  }).format(value || 0);
}

function rateText(rate: unknown) {
  const value = Number(rate);
  return Number.isFinite(value) ? `$${value.toFixed(2)} / 1M` : "—";
}

function readCount(input: HTMLInputElement) {
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    CLOUD_DISABLED: "Cloud 总开关关闭",
    PROVIDER_REQUIRED: "未选择 Provider",
    PROVIDER_NOT_REGISTERED: "Provider 未注册",
    PROVIDER_DISABLED: "Provider 未启用",
    PROVIDER_ADAPTER_NOT_READY: "Provider Adapter 未就绪",
    PROVIDER_PRICING_UNKNOWN: "Provider 价格未知",
    MODEL_NOT_REGISTERED: "Model 未注册",
    MODEL_DISABLED: "Model 未启用",
    MODEL_PRICING_UNKNOWN: "Model 价格未知",
    ESTIMATED_COST_REQUIRED: "缺少可信 estimated cost",
    PER_JOB_LIMIT_NOT_CONFIGURED: "Per Job 预算未配置",
    PER_JOB_LIMIT_EXCEEDED: "超过 Per Job 预算",
    PER_SKU_LIMIT_NOT_CONFIGURED: "Per SKU 预算未配置",
    PER_SKU_LIMIT_EXCEEDED: "超过 Per SKU 预算",
    DAILY_LIMIT_NOT_CONFIGURED: "Daily 预算未配置",
    DAILY_LIMIT_EXCEEDED: "超过 Daily 预算",
    MONTHLY_LIMIT_NOT_CONFIGURED: "Monthly 预算未配置",
    MONTHLY_LIMIT_EXCEEDED: "超过 Monthly 预算",
  };
  return labels[reason] ?? reason;
}

function renderGuardShell() {
  const panel = el("section", "v2h-guard-dry-run");
  panel.dataset.state = "idle";
  const head = el("div", "v2h-guard-dry-run-head");
  const title = el("div");
  title.append(el("span", "", "COST GUARD DRY RUN"), el("b", "", "执行前门禁预演"));
  const badge = el("strong", "", "AWAITING ESTIMATE");
  head.append(title, badge);
  const summary = el("p", "", "输入非零 Token 后，只读调用本地 Cost Guard 进行预演；不会创建任务或调用 Provider。" );
  const reasons = el("div", "v2h-guard-reasons");
  panel.append(head, summary, reasons);
  return { panel, badge, summary, reasons };
}

function renderEstimator(root: HTMLElement, body: CloudProjection) {
  const models = flattenModels(body);
  root.replaceChildren();

  const header = el("header", "v2h-estimator-head");
  const titleWrap = el("div");
  titleWrap.append(
    el("span", "v2h-kicker", "READ-ONLY COST ESTIMATOR"),
    el("h2", "", "手动 Token 成本试算"),
    el("p", "", "只根据 Registry 中已验证的公开费率与手动 Token 数量做数学估算；不是实际账单，也不授予 Provider 执行权。"),
  );
  const badge = el("span", "v2h-estimator-badge", "NO EXECUTION");
  header.append(titleWrap, badge);
  root.append(header);

  const control = el("div", "v2h-estimator-control");
  const modelField = el("label", "v2h-estimator-model-field");
  modelField.append(el("span", "", "Provider / Model"));
  const select = el("select") as HTMLSelectElement;
  for (const model of models) {
    const option = document.createElement("option");
    option.value = `${model.provider_key}::${model.model_key}`;
    option.textContent = `${model.provider_name} · ${model.display_name}`;
    select.append(option);
  }
  if (!models.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No declared model";
    select.append(option);
    select.disabled = true;
  }
  modelField.append(select);

  const status = el("div", "v2h-estimator-status");
  control.append(modelField, status);
  root.append(control);

  const bodyArea = el("div", "v2h-estimator-body");
  root.append(bodyArea);

  const note = el("div", "v2h-estimator-authority");
  note.innerHTML = `<strong>Authority stays read-only.</strong><span>Cloud=${body.registry.cloud_enabled ? "ENABLED" : "DISABLED"} · ${body.authority || "COST_GUARD_FAIL_CLOSED"}. Estimator output never changes budgets, Provider enablement, Job queue, QA, Archive or RAW/source truth.</span>`;
  root.append(note);

  let guardRequestId = 0;

  function selectedModel() {
    const [providerKey, modelKey] = select.value.split("::");
    return models.find((model) => model.provider_key === providerKey && model.model_key === modelKey) ?? null;
  }

  function paint() {
    const model = selectedModel();
    bodyArea.replaceChildren();
    status.replaceChildren();
    guardRequestId += 1;
    if (!model) {
      status.append(el("span", "unknown", "NO MODEL"));
      bodyArea.append(el("p", "v2h-estimator-empty", "Provider Registry 当前没有可试算的模型声明。"));
      return;
    }

    const known = model.pricing_status === "KNOWN" && model.pricing?.basis === "TOKEN";
    const state = el("span", known ? "known" : "unknown", known ? "PRICE KNOWN" : "PRICE UNKNOWN");
    const execution = el("small", "", `${model.provider_enabled ? "Provider enabled" : "Provider disabled"} · adapter ${model.adapter_status}`);
    status.append(state, execution);

    if (!known || !model.pricing) {
      const locked = el("div", "v2h-estimator-locked");
      locked.append(
        el("b", "", "当前无法形成可信成本估算"),
        el("p", "", "该模型没有完整、已验证的 Token 费率。保持 pricing UNKNOWN；不猜价格，不用第三方报价替代官方执行价格。"),
      );
      const guard = renderGuardShell();
      guard.panel.dataset.state = "blocked";
      guard.badge.textContent = "NOT EVALUATED";
      guard.summary.textContent = "没有可信 estimated cost，因此不向 Cost Guard 伪造输入；模型继续保持 execution blocked。";
      guard.reasons.append(el("span", "", "MODEL_PRICING_UNKNOWN · Model 价格未知"));
      bodyArea.append(locked, guard.panel);
      return;
    }

    const inputs = el("div", "v2h-estimator-input-grid");
    const refs = new Map<keyof TokenCounts, HTMLInputElement>();
    for (const config of INPUTS) {
      const field = el("label", "v2h-estimator-input");
      const top = el("div");
      top.append(el("span", "", config.label), el("b", "", rateText(model.pricing[config.priceKey])));
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = "0";
      input.dataset.tokenKey = config.key;
      const hint = el("small", "", config.hint);
      field.append(top, input, hint);
      inputs.append(field);
      refs.set(config.key, input);
    }

    const result = el("div", "v2h-estimator-result");
    const resultLabel = el("span", "", "Estimated token cost");
    const resultValue = el("strong", "", money(0, model.pricing.currency ?? "USD"));
    const resultDetail = el("small", "", "手动 Token 数量均为 0；尚未形成有意义的任务成本估算。" );
    result.append(resultLabel, resultValue, resultDetail);

    const guard = renderGuardShell();

    const runGuard = async (estimatedCost: number, totalTokens: number) => {
      const requestId = ++guardRequestId;
      guard.reasons.replaceChildren();
      if (totalTokens <= 0) {
        guard.panel.dataset.state = "idle";
        guard.badge.textContent = "AWAITING ESTIMATE";
        guard.summary.textContent = "输入非零 Token 后，只读调用本地 Cost Guard 进行预演；不会创建任务或调用 Provider。";
        return;
      }
      guard.panel.dataset.state = "checking";
      guard.badge.textContent = "CHECKING";
      guard.summary.textContent = "正在使用服务端 Registry / Budget 真值进行只读门禁预演…";
      try {
        const response = await fetch(GUARD_API, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider_key: model.provider_key,
            model_key: model.model_key,
            estimated_cost: estimatedCost,
            spend: { sku: 0, daily: 0, monthly: 0 },
          }),
        });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const payload = await response.json() as CostGuardDryRun;
        if (requestId !== guardRequestId) return;
        guard.panel.dataset.state = payload.guard.allowed ? "allowed" : "blocked";
        guard.badge.textContent = payload.guard.allowed ? "ALLOW" : "BLOCKED";
        guard.summary.textContent = payload.guard.allowed
          ? "当前只读门禁预演没有发现 blocker；这仍不授予执行权，真实 Provider Adapter/授权链路必须另行开放。"
          : `Cost Guard fail-closed：${payload.guard.reasons.length} 个 blocker。该结果只做预演，不会创建或提交任务。`;
        guard.reasons.replaceChildren();
        for (const reason of payload.guard.reasons) {
          guard.reasons.append(el("span", "", `${reason} · ${reasonLabel(reason)}`));
        }
        if (!payload.guard.reasons.length) guard.reasons.append(el("span", "", "NO_BLOCKER_FROM_COST_GUARD"));
      } catch {
        if (requestId !== guardRequestId) return;
        guard.panel.dataset.state = "error";
        guard.badge.textContent = "UNAVAILABLE";
        guard.summary.textContent = "本地 Cost Guard dry-run API 不可用；按 fail-closed 处理，不推断 ALLOW。";
        guard.reasons.replaceChildren(el("span", "", "COST_GUARD_DRY_RUN_UNAVAILABLE"));
      }
    };

    const update = () => {
      const counts = { ...ZERO_COUNTS };
      for (const [key, input] of refs.entries()) counts[key] = readCount(input);
      const estimate = estimateTokenCost(model.pricing!, counts);
      const totalTokens = Object.values(counts).reduce((sum, value) => sum + value, 0);
      resultValue.textContent = money(estimate.total, estimate.currency);
      resultDetail.textContent = totalTokens > 0
        ? `${totalTokens.toLocaleString()} manually entered tokens · estimate only · actual usage may differ.`
        : "手动 Token 数量均为 0；尚未形成有意义的任务成本估算。";
      void runGuard(estimate.total, totalTokens);
    };
    for (const input of refs.values()) input.addEventListener("input", update);

    bodyArea.append(inputs, result, guard.panel);
    update();
  }

  select.addEventListener("change", paint);
  paint();
}

async function mountEstimator() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const providers = document.querySelector<HTMLElement>(".v2h-providers");
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!providers) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-cost-estimator='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hCostEstimator = "1";
    root.className = "v2h-panel v2h-estimator";
    if (boundary?.parentElement) boundary.parentElement.insertBefore(root, boundary);
    else providers.insertAdjacentElement("afterend", root);
  }

  try {
    const response = await fetch(API);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    renderEstimator(root, (await response.json()) as CloudProjection);
  } catch {
    root.replaceChildren();
    const header = el("header", "v2h-estimator-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "READ-ONLY COST ESTIMATOR"), el("h2", "", "手动 Token 成本试算"));
    header.append(title, el("span", "v2h-estimator-badge", "UNAVAILABLE"));
    root.append(header, el("p", "v2h-estimator-empty", "无法读取本地 Provider Registry；不进行离线猜价。"));
  }
}

export function installV2HCostEstimator() {
  void mountEstimator();
}
