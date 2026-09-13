type PublicModel = {
  model_key: string;
  display_name: string;
  pricing_status?: string;
  enabled?: boolean;
};

type PublicProvider = {
  provider_key: string;
  display_name: string;
  adapter_status: string;
  enabled: boolean;
  credential_configured: boolean;
  models?: PublicModel[];
};

type CloudProjection = {
  ok: boolean;
  authority: string;
  registry: {
    cloud_enabled: boolean;
    budget_policy?: {
      source?: string;
      persisted?: boolean;
      updated_at?: string | null;
    };
    providers: PublicProvider[];
  };
};

type ActivationPreflightResponse = {
  ok: boolean;
  authority: string;
  generated_at: string;
  preflight: {
    activation_ready: boolean;
    fail_closed: boolean;
    provider_key: string | null;
    model_key: string | null;
    credential_configured: boolean;
    budget_source: string;
    budget_persisted: boolean;
    blockers: string[];
  };
  audit: {
    mutation: boolean;
    provider_call: boolean;
    credential_write: boolean;
    registry_write: boolean;
    budget_write: boolean;
    job_write: boolean;
    qa_write: boolean;
    archive_write: boolean;
    source_write: boolean;
  };
};

type Candidate = {
  provider_key: string;
  provider_name: string;
  provider_enabled: boolean;
  adapter_status: string;
  model_key: string;
  model_name: string;
  model_enabled: boolean;
  pricing_status: string;
};

const CLOUD_API = "http://127.0.0.1:4179/api/v2/cloud";
const PREFLIGHT_API = `${CLOUD_API}/activation-preflight`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function candidates(body: CloudProjection): Candidate[] {
  return (body.registry.providers ?? []).flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      provider_key: provider.provider_key,
      provider_name: provider.display_name,
      provider_enabled: Boolean(provider.enabled),
      adapter_status: provider.adapter_status,
      model_key: model.model_key,
      model_name: model.display_name || model.model_key,
      model_enabled: Boolean(model.enabled),
      pricing_status: model.pricing_status ?? "UNKNOWN",
    })),
  );
}

function blockerLabel(reason: string) {
  const labels: Record<string, string> = {
    CLOUD_DISABLED: "Cloud 总开关关闭",
    PROVIDER_REQUIRED: "未选择 Provider",
    PROVIDER_NOT_REGISTERED: "Provider 未注册",
    PROVIDER_DISABLED: "Provider 未启用",
    PROVIDER_ADAPTER_NOT_READY: "Provider Adapter 未就绪",
    PROVIDER_CREDENTIAL_MISSING: "Provider 凭据未配置",
    PROVIDER_PRICING_UNKNOWN: "Provider 价格未知",
    PROVIDER_SUBMISSION_ADAPTER_ABSENT: "Provider 提交 Adapter 尚未实现",
    MODEL_REQUIRED: "未选择 Model",
    MODEL_NOT_REGISTERED: "Model 未注册",
    MODEL_DISABLED: "Model 未启用",
    MODEL_PRICING_UNKNOWN: "Model 价格未知",
    PER_JOB_LIMIT_NOT_CONFIGURED: "Per Job 预算未配置",
    PER_SKU_LIMIT_NOT_CONFIGURED: "Per SKU 预算未配置",
    DAILY_LIMIT_NOT_CONFIGURED: "Daily 预算未配置",
    MONTHLY_LIMIT_NOT_CONFIGURED: "Monthly 预算未配置",
  };
  return labels[reason] ?? reason;
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}

function render(root: HTMLElement, body: CloudProjection) {
  root.replaceChildren();
  const rows = candidates(body);

  const header = el("header", "v2h-activation-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "CLOUD ACTIVATION PREFLIGHT"),
    el("h2", "", "云端启用前检查"),
    el("p", "", "只读取服务端 Provider Registry、Runtime Budget Policy 与凭据存在性，输出启用阻断项；不写配置、不调用 Provider、不创建任务。"),
  );
  const badges = el("div", "v2h-activation-badges");
  badges.append(el("span", "readonly", "READ ONLY"), el("span", "noexec", "NO EXECUTION"));
  header.append(title, badges);
  root.append(header);

  const controls = el("section", "v2h-activation-controls");
  const modelField = el("label", "v2h-activation-model");
  modelField.append(el("span", "", "Provider / Model"));
  const select = document.createElement("select");
  for (const row of rows) {
    const option = document.createElement("option");
    option.value = `${row.provider_key}::${row.model_key}`;
    option.textContent = `${row.provider_name} · ${row.model_name}`;
    select.append(option);
  }
  if (!rows.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No declared model";
    select.append(option);
    select.disabled = true;
  }
  modelField.append(select);

  const run = el("button", "v2h-activation-run", "运行预检查");
  run.type = "button";
  run.disabled = !rows.length;
  controls.append(modelField, run);
  root.append(controls);

  const candidateFacts = el("div", "v2h-activation-candidate-facts");
  root.append(candidateFacts);

  const result = el("section", "v2h-activation-result");
  result.dataset.state = "idle";
  const resultHead = el("div", "v2h-activation-result-head");
  const resultTitle = el("div");
  resultTitle.append(el("span", "", "SERVER-AUTHORITATIVE PREFLIGHT"), el("b", "", "尚未运行"));
  const resultBadge = el("strong", "", "NOT CHECKED");
  resultHead.append(resultTitle, resultBadge);
  const summary = el("p", "", "选择 Provider / Model 后运行预检查。请求只包含两个标识符；所有权限、预算、凭据与 Registry 真值均由本机服务端重新读取。" );
  const factGrid = el("div", "v2h-activation-fact-grid");
  const blockers = el("div", "v2h-activation-blockers");
  result.append(resultHead, summary, factGrid, blockers);
  root.append(result);

  const authority = el("footer", "v2h-activation-authority");
  authority.append(
    el("strong", "", "Preflight ≠ activation authority."),
    el("span", "", `Cloud=${body.registry.cloud_enabled ? "ENABLED" : "DISABLED"} · ${body.authority || "COST_GUARD_FAIL_CLOSED"}. This panel cannot enable Cloud/Provider/Model, save credentials, call a Provider, create a Job, or change QA / Archive / RAW-source truth.`),
  );
  root.append(authority);

  function selected() {
    const [providerKey, modelKey] = select.value.split("::");
    return rows.find((row) => row.provider_key === providerKey && row.model_key === modelKey) ?? null;
  }

  function paintCandidate() {
    const row = selected();
    candidateFacts.replaceChildren();
    if (!row) {
      candidateFacts.append(el("span", "", "当前 Provider Registry 没有声明可检查的模型。"));
      return;
    }
    const facts = [
      ["Provider", row.provider_name],
      ["Provider enabled", yesNo(row.provider_enabled)],
      ["Adapter", row.adapter_status],
      ["Model enabled", yesNo(row.model_enabled)],
      ["Pricing", row.pricing_status],
    ];
    for (const [label, value] of facts) {
      const item = el("div");
      item.append(el("span", "", label), el("b", "", value));
      candidateFacts.append(item);
    }
  }

  function reset() {
    result.dataset.state = "idle";
    resultTitle.querySelector("b")!.textContent = "尚未运行";
    resultBadge.textContent = "NOT CHECKED";
    summary.textContent = "选择 Provider / Model 后运行预检查。请求只包含两个标识符；所有权限、预算、凭据与 Registry 真值均由本机服务端重新读取。";
    factGrid.replaceChildren();
    blockers.replaceChildren();
    run.disabled = !selected();
  }

  select.addEventListener("change", () => {
    paintCandidate();
    reset();
  });

  run.addEventListener("click", async () => {
    const row = selected();
    if (!row) return;
    run.disabled = true;
    run.textContent = "检查中…";
    result.dataset.state = "checking";
    resultBadge.textContent = "CHECKING";
    resultTitle.querySelector("b")!.textContent = `${row.provider_name} · ${row.model_name}`;
    summary.textContent = "正在读取服务端权威真值并计算 activation blockers；不会调用外部 Provider。";
    factGrid.replaceChildren();
    blockers.replaceChildren();

    try {
      const response = await fetch(PREFLIGHT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider_key: row.provider_key,
          model_key: row.model_key,
        }),
      });
      const payload = await response.json().catch(() => ({})) as ActivationPreflightResponse & { error?: string };
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP_${response.status}`);

      const preflight = payload.preflight;
      result.dataset.state = preflight.activation_ready ? "ready" : "blocked";
      resultBadge.textContent = preflight.activation_ready ? "READY" : "BLOCKED";
      summary.textContent = preflight.activation_ready
        ? "当前预检查未发现 blocker；这仍只是 readiness 结果，不授予 Provider 调用或任务提交权。"
        : `Fail-closed：${preflight.blockers.length} 个 blocker。必须逐项通过独立 Gate，禁止绕过或自动启用。`;

      const facts = [
        ["Authority", payload.authority],
        ["Credential configured", yesNo(preflight.credential_configured)],
        ["Budget source", preflight.budget_source],
        ["Budget persisted", yesNo(preflight.budget_persisted)],
      ];
      for (const [label, value] of facts) {
        const item = el("div");
        item.append(el("span", "", label), el("b", "", value));
        factGrid.append(item);
      }

      if (preflight.blockers.length) {
        for (const reason of preflight.blockers) {
          const chip = el("span", "", `${reason} · ${blockerLabel(reason)}`);
          blockers.append(chip);
        }
      } else {
        blockers.append(el("span", "clear", "NO_ACTIVATION_BLOCKERS"));
      }

      const auditSafe = payload.audit
        && Object.values(payload.audit).every((value) => value === false);
      if (!auditSafe) {
        result.dataset.state = "error";
        resultBadge.textContent = "FAIL CLOSED";
        blockers.append(el("span", "", "AUDIT_BOUNDARY_INVALID · 返回值包含非只读权限，已按 fail-closed 处理"));
      }
    } catch (error) {
      result.dataset.state = "error";
      resultBadge.textContent = "UNAVAILABLE";
      summary.textContent = `本机 activation preflight 不可用：${error instanceof Error ? error.message : String(error)}。按 fail-closed 处理，不推断 READY。`;
      blockers.replaceChildren(el("span", "", "ACTIVATION_PREFLIGHT_UNAVAILABLE"));
    } finally {
      run.textContent = "运行预检查";
      run.disabled = !selected();
    }
  });

  paintCandidate();
}

async function mountActivationPreflight() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!boundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-activation-preflight='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hActivationPreflight = "1";
    root.className = "v2h-panel v2h-activation-preflight";

    const planner = document.querySelector<HTMLElement>("[data-v2h-budget-policy-planner='1']");
    const estimator = document.querySelector<HTMLElement>("[data-v2h-cost-estimator='1']");
    if (planner) planner.insertAdjacentElement("afterend", root);
    else if (estimator) estimator.insertAdjacentElement("afterend", root);
    else if (boundary.parentElement) boundary.parentElement.insertBefore(root, boundary);
  }

  try {
    const response = await fetch(CLOUD_API);
    const body = await response.json().catch(() => ({})) as CloudProjection & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren();
    const head = el("header", "v2h-activation-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "CLOUD ACTIVATION PREFLIGHT"), el("h2", "", "云端启用前检查"));
    head.append(title, el("span", "v2h-activation-unavailable", "UNAVAILABLE"));
    root.append(
      head,
      el("p", "v2h-activation-empty", `无法读取本机 Cloud Registry：${error instanceof Error ? error.message : String(error)}。不允许离线推断 readiness。`),
    );
  }
}

export function installV2HActivationPreflight() {
  void mountActivationPreflight();
}
