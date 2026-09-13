type PublicModel = {
  model_key: string;
  display_name: string;
  enabled: boolean;
  pricing_status?: string;
};

type PublicProvider = {
  provider_key: string;
  display_name: string;
  enabled: boolean;
  adapter_status: string;
  credential_configured: boolean;
  models: PublicModel[];
};

type ActivationPolicyMeta = {
  source: "REGISTRY_DEFAULT" | "RUNTIME_POLICY";
  persisted: boolean;
  updated_at: string | null;
};

type CloudProjection = {
  ok: boolean;
  authority: string;
  registry: {
    cloud_enabled: boolean;
    activation_policy?: ActivationPolicyMeta;
    providers: PublicProvider[];
  };
};

type ActivationPolicyResponse = CloudProjection & {
  audit?: Record<string, boolean>;
  error?: string;
};

type DraftProvider = {
  provider_key: string;
  enabled: boolean;
  models: Array<{ model_key: string; enabled: boolean }>;
};

type DraftPolicy = {
  cloud_enabled: boolean;
  providers: DraftProvider[];
};

const CLOUD_API = "http://127.0.0.1:4179/api/v2/cloud";
const ACTIVATION_POLICY_API = `${CLOUD_API}/activation-policy`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}

function cloneCurrent(body: CloudProjection): DraftPolicy {
  return {
    cloud_enabled: Boolean(body.registry.cloud_enabled),
    providers: (body.registry.providers ?? []).map((provider) => ({
      provider_key: provider.provider_key,
      enabled: Boolean(provider.enabled),
      models: (provider.models ?? []).map((model) => ({
        model_key: model.model_key,
        enabled: Boolean(model.enabled),
      })),
    })),
  };
}

function stablePolicy(value: DraftPolicy) {
  return JSON.stringify({
    cloud_enabled: value.cloud_enabled,
    providers: [...value.providers]
      .sort((a, b) => a.provider_key.localeCompare(b.provider_key))
      .map((provider) => ({
        provider_key: provider.provider_key,
        enabled: provider.enabled,
        models: [...provider.models]
          .sort((a, b) => a.model_key.localeCompare(b.model_key))
          .map((model) => ({ model_key: model.model_key, enabled: model.enabled })),
      })),
  });
}

function render(root: HTMLElement, body: CloudProjection) {
  root.replaceChildren();
  const current = cloneCurrent(body);
  const meta = body.registry.activation_policy ?? {
    source: "REGISTRY_DEFAULT" as const,
    persisted: false,
    updated_at: null,
  };

  const header = el("header", "v2h-activation-policy-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "CLOUD ACTIVATION POLICY"),
    el("h2", "", "本机云端启用策略"),
    el(
      "p",
      "",
      "仅写入 Cloud / Provider / Model 的本机启用意图。它不会写凭据、不会修改 Provider Adapter、不会调用外部 Provider，也不会创建任务。当前 Adapter 仍未实现，因此即使策略设为启用，执行仍会被后续 Gate 阻断。",
    ),
  );
  const badges = el("div", "v2h-activation-policy-badges");
  badges.append(
    el("span", "write", "LOCAL POLICY WRITE"),
    el("span", "noexec", "NO PROVIDER CALL"),
  );
  header.append(title, badges);
  root.append(header);

  const currentBlock = el("section", "v2h-activation-policy-current");
  const currentTitle = el("div", "v2h-activation-policy-section-title");
  const sourceLabel = meta.persisted
    ? `Runtime Policy · PERSISTED${meta.updated_at ? ` · ${new Date(meta.updated_at).toLocaleString()}` : ""}`
    : "Provider Registry Default · no runtime activation policy";
  currentTitle.append(el("b", "", "当前权威启用状态"), el("span", "", sourceLabel));
  currentBlock.append(currentTitle);

  const summary = el("div", "v2h-activation-policy-summary");
  const enabledProviders = body.registry.providers.filter((provider) => provider.enabled).length;
  const enabledModels = body.registry.providers.reduce(
    (sum, provider) => sum + provider.models.filter((model) => model.enabled).length,
    0,
  );
  const summaryRows: Array<[string, string]> = [
    ["Cloud", body.registry.cloud_enabled ? "ENABLED" : "DISABLED"],
    ["Providers enabled", `${enabledProviders} / ${body.registry.providers.length}`],
    ["Models enabled", String(enabledModels)],
    ["Execution authority", "NO"],
  ];
  for (const [label, value] of summaryRows) {
    const card = el("div", "v2h-activation-policy-summary-card");
    card.append(el("span", "", label), el("strong", "", value));
    summary.append(card);
  }
  currentBlock.append(summary);
  root.append(currentBlock);

  const draftBlock = el("section", "v2h-activation-policy-draft");
  const draftTitle = el("div", "v2h-activation-policy-section-title");
  draftTitle.append(
    el("b", "", "启用策略草案"),
    el("span", "", "必须先预览，再显式确认；保存仅改变本机 activation policy"),
  );
  draftBlock.append(draftTitle);

  const cloudRow = el("label", "v2h-activation-policy-cloud-row");
  const cloudToggle = document.createElement("input");
  cloudToggle.type = "checkbox";
  cloudToggle.checked = current.cloud_enabled;
  const cloudCopy = el("div");
  cloudCopy.append(
    el("b", "", "Cloud 总开关"),
    el("span", "", "只是启用意图；Adapter / Credential / Cost Guard / Submission Gate 仍独立。"),
  );
  cloudRow.append(cloudToggle, cloudCopy);
  draftBlock.append(cloudRow);

  const providerGrid = el("div", "v2h-activation-policy-provider-grid");
  const providerRefs = new Map<string, { toggle: HTMLInputElement; models: Map<string, HTMLInputElement> }>();
  for (const provider of body.registry.providers) {
    const card = el("article", "v2h-activation-policy-provider");
    const cardHead = el("div", "v2h-activation-policy-provider-head");
    const providerLabel = el("label");
    const providerToggle = document.createElement("input");
    providerToggle.type = "checkbox";
    providerToggle.checked = Boolean(provider.enabled);
    const providerName = el("div");
    providerName.append(el("b", "", provider.display_name), el("span", "", provider.provider_key));
    providerLabel.append(providerToggle, providerName);
    const readiness = el(
      "span",
      "v2h-activation-policy-provider-state",
      provider.adapter_status === "READY" ? "ADAPTER READY" : provider.adapter_status,
    );
    cardHead.append(providerLabel, readiness);
    card.append(cardHead);

    const facts = el("div", "v2h-activation-policy-provider-facts");
    const factRows: Array<[string, string]> = [
      ["Adapter", provider.adapter_status],
      ["Credential configured", yesNo(provider.credential_configured)],
    ];
    for (const [label, value] of factRows) {
      const fact = el("div");
      fact.append(el("span", "", label), el("b", "", value));
      facts.append(fact);
    }
    card.append(facts);

    const models = el("div", "v2h-activation-policy-models");
    const modelRefs = new Map<string, HTMLInputElement>();
    for (const model of provider.models ?? []) {
      const row = el("label", "v2h-activation-policy-model-row");
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = Boolean(model.enabled);
      const copy = el("div");
      copy.append(
        el("b", "", model.display_name || model.model_key),
        el("span", "", `${model.model_key} · pricing ${model.pricing_status ?? "UNKNOWN"}`),
      );
      row.append(toggle, copy);
      models.append(row);
      modelRefs.set(model.model_key, toggle);
    }
    if (!provider.models?.length) models.append(el("p", "", "No declared models."));
    card.append(models);
    providerGrid.append(card);
    providerRefs.set(provider.provider_key, { toggle: providerToggle, models: modelRefs });
  }
  draftBlock.append(providerGrid);

  const actions = el("div", "v2h-activation-policy-actions");
  const preview = el("button", "v2h-activation-policy-preview", "预览启用策略");
  preview.type = "button";
  actions.append(preview, el("span", "", "预览不会写入策略，也不会调用 Provider。"));
  draftBlock.append(actions);

  const result = el("div", "v2h-activation-policy-result");
  result.dataset.state = "idle";
  result.append(
    el("b", "", "NOT VALIDATED"),
    el("span", "", "修改草案后先预览；未经确认不会持久化。"),
  );
  draftBlock.append(result);

  const commit = el("div", "v2h-activation-policy-commit");
  const ackLabel = el("label", "v2h-activation-policy-ack");
  const ack = document.createElement("input");
  ack.type = "checkbox";
  ackLabel.append(
    ack,
    el(
      "span",
      "",
      "我确认：仅写入本机 Cloud / Provider / Model 启用策略；不写凭据、不启用 Adapter、不调用 Provider、不创建 Job。",
    ),
  );
  const save = el("button", "v2h-activation-policy-save", "保存本机启用策略");
  save.type = "button";
  save.disabled = true;
  commit.append(ackLabel, save);
  draftBlock.append(commit);
  root.append(draftBlock);

  const authority = el("footer", "v2h-activation-policy-authority");
  authority.append(
    el("strong", "", "Activation policy ≠ Provider execution authority."),
    el(
      "span",
      "",
      `${body.authority || "COST_GUARD_FAIL_CLOSED"}. Current Provider Adapter contracts, credentials, Cost Guard and submission path remain separate required gates.`,
    ),
  );
  root.append(authority);

  let validated: DraftPolicy | null = null;
  let changedCount = 0;

  function readDraft(): DraftPolicy {
    return {
      cloud_enabled: cloudToggle.checked,
      providers: body.registry.providers.map((provider) => {
        const refs = providerRefs.get(provider.provider_key)!;
        return {
          provider_key: provider.provider_key,
          enabled: refs.toggle.checked,
          models: provider.models.map((model) => ({
            model_key: model.model_key,
            enabled: refs.models.get(model.model_key)!.checked,
          })),
        };
      }),
    };
  }

  function countChanges(draft: DraftPolicy) {
    let count = draft.cloud_enabled === current.cloud_enabled ? 0 : 1;
    for (const provider of draft.providers) {
      const currentProvider = current.providers.find((row) => row.provider_key === provider.provider_key)!;
      if (provider.enabled !== currentProvider.enabled) count += 1;
      for (const model of provider.models) {
        const currentModel = currentProvider.models.find((row) => row.model_key === model.model_key)!;
        if (model.enabled !== currentModel.enabled) count += 1;
      }
    }
    return count;
  }

  function resetValidation() {
    validated = null;
    changedCount = 0;
    save.disabled = true;
    result.dataset.state = "idle";
    result.replaceChildren(
      el("b", "", "NOT VALIDATED"),
      el("span", "", "草案已变化；请重新点击“预览启用策略”。"),
    );
  }

  cloudToggle.addEventListener("change", resetValidation);
  for (const refs of providerRefs.values()) {
    refs.toggle.addEventListener("change", resetValidation);
    for (const model of refs.models.values()) model.addEventListener("change", resetValidation);
  }

  preview.addEventListener("click", () => {
    const draft = readDraft();
    changedCount = countChanges(draft);
    validated = draft;
    result.dataset.state = "valid";

    const enabledProvidersDraft = draft.providers.filter((provider) => provider.enabled).length;
    const enabledModelsDraft = draft.providers.reduce(
      (sum, provider) => sum + provider.models.filter((model) => model.enabled).length,
      0,
    );
    const detail = changedCount === 0
      ? "草案与当前权威启用状态一致；无需重复写入。"
      : `${changedCount} 个启用字段发生变化；Cloud=${draft.cloud_enabled ? "ENABLED" : "DISABLED"}，Provider enabled=${enabledProvidersDraft}，Model enabled=${enabledModelsDraft}。尚未保存。`;
    result.replaceChildren(
      el("b", "", changedCount === 0 ? "NO CHANGE" : "VALID DRAFT"),
      el("span", "", detail),
    );
    save.disabled = changedCount === 0 || !ack.checked;
  });

  ack.addEventListener("change", () => {
    save.disabled = !validated || changedCount === 0 || !ack.checked;
  });

  save.addEventListener("click", async () => {
    if (!validated || changedCount === 0 || !ack.checked) return;
    const proposal = JSON.parse(stablePolicy(validated)) as DraftPolicy;
    save.disabled = true;
    save.textContent = "保存中…";
    try {
      const response = await fetch(ACTIVATION_POLICY_API, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acknowledge: "CLOUD_ACTIVATION_POLICY_ONLY",
          ...proposal,
        }),
      });
      const payload = await response.json().catch(() => ({})) as ActivationPolicyResponse;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP_${response.status}`);
      const safeAudit = payload.audit
        ? payload.audit.provider_call === false
          && payload.audit.credential_write === false
          && payload.audit.adapter_write === false
          && payload.audit.job_write === false
          && payload.audit.qa_write === false
          && payload.audit.archive_write === false
          && payload.audit.source_write === false
        : false;
      if (!safeAudit) throw new Error("ACTIVATION_POLICY_AUDIT_BOUNDARY_INVALID");

      validated = null;
      changedCount = 0;
      ack.checked = false;
      result.dataset.state = "valid";
      result.replaceChildren(
        el("b", "", "POLICY SAVED"),
        el("span", "", "本机启用策略已持久化。刷新页面可读取新的权威状态；Provider Adapter / Credential / Cost Guard / submission gate 仍保持独立。"),
      );
    } catch (error) {
      result.dataset.state = "invalid";
      result.replaceChildren(
        el("b", "", "SAVE BLOCKED"),
        el("span", "", `启用策略未写入：${error instanceof Error ? error.message : String(error)}`),
      );
    } finally {
      save.textContent = "保存本机启用策略";
      save.disabled = true;
    }
  });
}

async function mountActivationPolicy() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!boundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-activation-policy='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hActivationPolicy = "1";
    root.className = "v2h-panel v2h-activation-policy";
    const preflight = document.querySelector<HTMLElement>("[data-v2h-activation-preflight='1']");
    const planner = document.querySelector<HTMLElement>("[data-v2h-budget-policy-planner='1']");
    if (preflight) preflight.insertAdjacentElement("beforebegin", root);
    else if (planner) planner.insertAdjacentElement("afterend", root);
    else if (boundary.parentElement) boundary.parentElement.insertBefore(root, boundary);
  }

  try {
    const response = await fetch(CLOUD_API);
    const body = await response.json().catch(() => ({})) as CloudProjection & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren();
    const header = el("header", "v2h-activation-policy-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "CLOUD ACTIVATION POLICY"), el("h2", "", "本机云端启用策略"));
    header.append(title, el("span", "v2h-activation-policy-unavailable", "UNAVAILABLE"));
    root.append(
      header,
      el("p", "v2h-activation-policy-empty", `无法读取本机 Cloud Registry：${error instanceof Error ? error.message : String(error)}。禁止离线写入启用策略。`),
    );
  }
}

export function installV2HActivationPolicyUI() {
  void mountActivationPolicy();
}
