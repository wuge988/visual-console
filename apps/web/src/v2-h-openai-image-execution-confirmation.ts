type CloudModel = { model_key: string; display_name: string; media_type?: string };
type CloudProvider = { provider_key: string; display_name: string; models?: CloudModel[] };
type CloudResponse = { ok: boolean; registry: { providers: CloudProvider[] } };

type SubmitPreflightResponse = {
  ok: boolean;
  authority: string;
  ready_for_provider_call: boolean;
  fail_closed: boolean;
  provider_key: string;
  model_key: string;
  request_model: string;
  estimated_cost: number;
  blockers: string[];
  activation_preflight: {
    activation_ready: boolean;
    credential_configured: boolean;
    budget_source: string;
    budget_persisted: boolean;
  };
  cost_guard: { allowed: boolean; currency: string; reasons: string[] };
  audit: Record<string, boolean>;
  error?: string;
};

const CLOUD_API = "http://127.0.0.1:4179/api/v2/cloud";
const PREFLIGHT_API = "http://127.0.0.1:4179/api/v2/cloud/openai-image/submit-preflight";
const ACK = "OPENAI_IMAGE_PROVIDER_CALL";
const CONFIRM_PHRASE = "EXECUTE ONE OPENAI IMAGE CALL";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(label: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const wrap = el("label", "v2h-exec-confirm-field");
  wrap.append(el("span", "", label), control);
  return wrap;
}

function input(type: string, value: string) {
  const node = document.createElement("input");
  node.type = type;
  node.value = value;
  return node;
}

function render(root: HTMLElement, cloud: CloudResponse) {
  root.replaceChildren();
  const openai = cloud.registry.providers.find((row) => row.provider_key === "openai-image");
  const models = (openai?.models ?? []).filter((row) => (row.media_type ?? "image") === "image");

  const head = el("header", "v2h-exec-confirm-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "FINAL EXECUTION CONFIRMATION"),
    el("h2", "", "真实执行前最终确认"),
    el("p", "", "建立一次性人工执行意图并重新运行服务端 submit preflight。此面板不绑定真实 submit 路由，不调用 OpenAI，也不写费用账本。"),
  );
  const badges = el("div", "v2h-exec-confirm-badges");
  badges.append(
    el("span", "manual", "MANUAL CONFIRMATION"),
    el("span", "nosubmit", "NO SUBMIT BOUND"),
  );
  head.append(title, badges);
  root.append(head);

  const form = el("section", "v2h-exec-confirm-form");
  const model = document.createElement("select");
  for (const row of models) {
    const option = document.createElement("option");
    option.value = row.model_key;
    option.textContent = row.display_name || row.model_key;
    model.append(option);
  }
  if (!models.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No OpenAI image model declared";
    model.append(option);
    model.disabled = true;
  }

  const operation = input("text", `op_exec_confirm_${Date.now()}`);
  const site = input("text", "drift-curio");
  const item = input("text", "DC-ZY-SZ-31001");
  const job = input("text", `job_exec_confirm_${Date.now()}`);
  const estimate = input("number", "0.25");
  estimate.step = "0.0001";
  estimate.min = "0";
  const skuSpend = input("number", "0");
  const dailySpend = input("number", "0");
  const monthlySpend = input("number", "0");
  for (const spend of [skuSpend, dailySpend, monthlySpend]) {
    spend.step = "0.0001";
    spend.min = "0";
  }
  const prompt = document.createElement("textarea");
  prompt.value = "Create one controlled image derivative. Final paid execution still requires a separate explicit execution gate.";
  prompt.maxLength = 32000;
  prompt.rows = 3;

  const grid = el("div", "v2h-exec-confirm-grid");
  grid.append(
    field("Model", model),
    field("Operation ID", operation),
    field("Site ID", site),
    field("Exact Piece / Item ID", item),
    field("Job ID", job),
    field("Estimated cost (USD)", estimate),
    field("Current SKU spend", skuSpend),
    field("Current daily spend", dailySpend),
    field("Current monthly spend", monthlySpend),
  );
  form.append(grid, field("Exact prompt envelope", prompt));

  const phraseWrap = el("div", "v2h-exec-confirm-phrase");
  const phraseCopy = el("div");
  phraseCopy.append(
    el("span", "", "手动输入确认短语"),
    el("code", "", CONFIRM_PHRASE),
  );
  const phrase = input("text", "");
  phrase.placeholder = CONFIRM_PHRASE;
  phrase.autocomplete = "off";
  phrase.spellcheck = false;
  phraseWrap.append(phraseCopy, phrase);
  form.append(phraseWrap);

  const consent = el("label", "v2h-exec-confirm-consent");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const consentText = el(
    "span",
    "",
    "我确认：这里只建立一次性人工执行意图并重新验证 readiness；不会发起 Provider 请求，也不会写入 RESERVATION / SETTLEMENT。",
  );
  const run = el("button", "v2h-exec-confirm-run", "验证最终执行意图");
  run.type = "button";
  run.disabled = true;
  consent.append(checkbox, consentText, run);
  form.append(consent);
  root.append(form);

  const result = el("section", "v2h-exec-confirm-result");
  result.dataset.state = "idle";
  const resultHead = el("div", "v2h-exec-confirm-result-head");
  resultHead.append(el("b", "", "SERVER-AUTHORITATIVE FINAL READINESS"), el("strong", "", "NOT ARMED"));
  const summary = el("p", "", "必须同时满足：确认短语完全匹配、人工勾选、服务端 submit preflight READY。任何一项失败都按 fail-closed 处理。" );
  const facts = el("div", "v2h-exec-confirm-facts");
  const blockers = el("div", "v2h-exec-confirm-blockers");
  result.append(resultHead, summary, facts, blockers);
  root.append(result);

  const boundary = el("footer", "v2h-exec-confirm-authority");
  boundary.append(
    el("strong", "", "EXECUTION_CONFIRMATION_PLANNER_ONLY"),
    el("span", "", "Local arm state ≠ Provider execution authority. This slice binds only to /submit-preflight; no /submit request, no Provider call, no spend write, no Job / QA / Archive / RAW-source mutation."),
  );
  root.append(boundary);

  function phraseMatches() {
    return phrase.value.trim() === CONFIRM_PHRASE;
  }

  function canRun() {
    return Boolean(model.value) && checkbox.checked && phraseMatches();
  }

  function syncRunState() {
    run.disabled = !canRun();
    if (!canRun() && result.dataset.state === "armed") {
      result.dataset.state = "idle";
      resultHead.querySelector("strong")!.textContent = "NOT ARMED";
      summary.textContent = "人工确认条件发生变化；先前本地 arm 状态已失效，必须重新验证。";
      facts.replaceChildren();
      blockers.replaceChildren(el("span", "", "LOCAL_CONFIRMATION_INVALIDATED"));
    }
  }

  phrase.addEventListener("input", syncRunState);
  checkbox.addEventListener("change", syncRunState);
  model.addEventListener("change", syncRunState);
  for (const control of [operation, site, item, job, estimate, skuSpend, dailySpend, monthlySpend, prompt]) {
    control.addEventListener("input", () => {
      if (result.dataset.state === "armed") {
        result.dataset.state = "idle";
        resultHead.querySelector("strong")!.textContent = "NOT ARMED";
        summary.textContent = "执行 envelope 已修改；先前本地 arm 状态已失效，必须重新验证。";
        facts.replaceChildren();
        blockers.replaceChildren(el("span", "", "EXECUTION_ENVELOPE_CHANGED"));
      }
    });
  }

  run.addEventListener("click", async () => {
    if (!canRun()) return;
    run.disabled = true;
    run.textContent = "验证中…";
    result.dataset.state = "checking";
    resultHead.querySelector("strong")!.textContent = "CHECKING";
    summary.textContent = "正在重新读取服务端 Registry / Runtime Policy / credential presence / paid-network gate / Cost Guard；不会调用 Provider。";
    facts.replaceChildren();
    blockers.replaceChildren();

    const body = {
      operation_id: operation.value.trim(),
      site_id: site.value.trim(),
      item_id: item.value.trim(),
      job_id: job.value.trim(),
      model_key: model.value,
      prompt: prompt.value,
      estimated_cost: Number(estimate.value),
      spend: {
        sku: Number(skuSpend.value),
        daily: Number(dailySpend.value),
        monthly: Number(monthlySpend.value),
      },
      acknowledge: ACK,
    };

    try {
      const response = await fetch(PREFLIGHT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as SubmitPreflightResponse;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP_${response.status}`);

      const auditSafe = payload.audit && Object.values(payload.audit).every((value) => value === false);
      const ready = Boolean(payload.ready_for_provider_call && auditSafe && canRun());
      result.dataset.state = ready ? "armed" : "blocked";
      resultHead.querySelector("strong")!.textContent = ready ? "ARMED LOCALLY — NO EXECUTION" : "BLOCKED";
      summary.textContent = ready
        ? "服务端 readiness 与人工确认均通过；仅建立浏览器本地 arm 状态。真实收费调用仍需独立实现/授权 Gate。"
        : `Fail-closed：${payload.blockers?.length ?? 0} 个服务端 blocker 或人工确认条件未满足。未发起 Provider 请求。`;

      const rows: Array<[string, string]> = [
        ["Planner authority", "EXECUTION_CONFIRMATION_PLANNER_ONLY"],
        ["Server preflight", payload.authority],
        ["Request model", payload.request_model],
        ["Estimated cost", `${payload.cost_guard?.currency ?? "USD"} ${Number(payload.estimated_cost ?? 0).toFixed(4)}`],
        ["Credential configured", payload.activation_preflight?.credential_configured ? "YES" : "NO"],
        ["Cost Guard", payload.cost_guard?.allowed ? "ALLOW" : "BLOCK"],
        ["Provider call", payload.audit?.provider_call ? "YES" : "NO"],
        ["Spend write", payload.audit?.spend_write ? "YES" : "NO"],
      ];
      for (const [label, value] of rows) {
        const cell = el("div");
        cell.append(el("span", "", label), el("b", "", value));
        facts.append(cell);
      }

      for (const reason of payload.blockers ?? []) blockers.append(el("span", "", reason));
      if (!(payload.blockers ?? []).length) blockers.append(el("span", "clear", "NO_SERVER_READINESS_BLOCKERS"));
      if (!auditSafe) {
        result.dataset.state = "error";
        resultHead.querySelector("strong")!.textContent = "FAIL CLOSED";
        blockers.append(el("span", "", "AUDIT_BOUNDARY_INVALID"));
      }
    } catch (error) {
      result.dataset.state = "error";
      resultHead.querySelector("strong")!.textContent = "UNAVAILABLE";
      summary.textContent = `Final readiness preflight 不可用：${error instanceof Error ? error.message : String(error)}。按 fail-closed 处理。`;
      blockers.replaceChildren(el("span", "", "FINAL_READINESS_UNAVAILABLE"));
    } finally {
      run.textContent = "验证最终执行意图";
      syncRunState();
    }
  });
}

async function mountExecutionConfirmation() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const pageBoundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!pageBoundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-execution-confirmation='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hExecutionConfirmation = "1";
    root.className = "v2h-panel v2h-exec-confirm";
    const submitPreflight = document.querySelector<HTMLElement>("[data-v2h-submit-preflight='1']");
    const adapters = document.querySelector<HTMLElement>("[data-v2h-adapter-registry='1']");
    if (submitPreflight) submitPreflight.insertAdjacentElement("afterend", root);
    else if (adapters) adapters.insertAdjacentElement("afterend", root);
    else if (pageBoundary.parentElement) pageBoundary.parentElement.insertBefore(root, pageBoundary);
  }

  try {
    const response = await fetch(CLOUD_API);
    const body = await response.json().catch(() => ({})) as CloudResponse & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren(
      el("p", "v2h-exec-confirm-unavailable", `无法加载最终执行确认：${error instanceof Error ? error.message : String(error)}。`),
    );
  }
}

export function installV2HOpenAIImageExecutionConfirmation() {
  void mountExecutionConfirmation();
}
