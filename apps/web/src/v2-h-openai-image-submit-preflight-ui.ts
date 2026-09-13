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
  activation_preflight: { activation_ready: boolean; credential_configured: boolean; budget_source: string; budget_persisted: boolean };
  cost_guard: { allowed: boolean; currency: string; reasons: string[] };
  audit: Record<string, boolean>;
  error?: string;
};

const CLOUD_API = "http://127.0.0.1:4179/api/v2/cloud";
const PREFLIGHT_API = "http://127.0.0.1:4179/api/v2/cloud/openai-image/submit-preflight";
const ACK = "OPENAI_IMAGE_PROVIDER_CALL";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(label: string, input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const wrap = el("label", "v2h-submit-preflight-field");
  wrap.append(el("span", "", label), input);
  return wrap;
}

function input(type: string, value: string, placeholder = "") {
  const node = document.createElement("input");
  node.type = type;
  node.value = value;
  node.placeholder = placeholder;
  return node;
}

function render(root: HTMLElement, cloud: CloudResponse) {
  root.replaceChildren();
  const openai = cloud.registry.providers.find((row) => row.provider_key === "openai-image");
  const models = (openai?.models ?? []).filter((row) => (row.media_type ?? "image") === "image");

  const head = el("header", "v2h-submit-preflight-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "OPENAI IMAGE SUBMIT PREFLIGHT"),
    el("h2", "", "OpenAI 图片提交预检查"),
    el("p", "", "校验真实 submit envelope、Activation 与 Cost Guard，但不调用 Provider、不写费用账本。即使结果 READY，也不等于已执行。"),
  );
  const badges = el("div", "v2h-submit-preflight-badges");
  badges.append(el("span", "readonly", "PREFLIGHT ONLY"), el("span", "nowrite", "ZERO SPEND WRITE"));
  head.append(title, badges);
  root.append(head);

  const form = el("section", "v2h-submit-preflight-form");
  const model = document.createElement("select");
  for (const row of models) {
    const option = document.createElement("option");
    option.value = row.model_key;
    option.textContent = row.display_name || row.model_key;
    model.append(option);
  }
  if (!models.length) {
    const option = document.createElement("option");
    option.textContent = "No OpenAI image model declared";
    option.value = "";
    model.append(option);
    model.disabled = true;
  }

  const operation = input("text", `op_preflight_${Date.now()}`);
  const site = input("text", "drift-curio");
  const item = input("text", "DC-ZY-SZ-31001");
  const job = input("text", `job_preflight_${Date.now()}`);
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
  prompt.value = "Create one controlled image derivative for preflight validation only.";
  prompt.maxLength = 32000;
  prompt.rows = 3;

  const grid = el("div", "v2h-submit-preflight-grid");
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
  form.append(grid, field("Prompt envelope", prompt));

  const consent = el("label", "v2h-submit-preflight-consent");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  consent.append(checkbox, el("span", "", "我确认：仅校验未来单次 Provider 调用 envelope；本次预检查不会调用 OpenAI，也不会写费用账本。"));
  const run = el("button", "v2h-submit-preflight-run", "运行提交预检查");
  run.type = "button";
  run.disabled = true;
  consent.append(run);
  form.append(consent);
  root.append(form);

  const result = el("section", "v2h-submit-preflight-result");
  result.dataset.state = "idle";
  const resultHead = el("div", "v2h-submit-preflight-result-head");
  resultHead.append(el("b", "", "SERVER-AUTHORITATIVE SUBMIT PREFLIGHT"), el("strong", "", "NOT CHECKED"));
  const summary = el("p", "", "勾选确认后运行。服务端会重新读取 Registry / Runtime Policy / credential presence / paid-network gate；不会调用 Provider。" );
  const facts = el("div", "v2h-submit-preflight-facts");
  const blockers = el("div", "v2h-submit-preflight-blockers");
  result.append(resultHead, summary, facts, blockers);
  root.append(result);

  const authority = el("footer", "v2h-submit-preflight-authority");
  authority.append(
    el("strong", "", "OPENAI_IMAGE_SUBMIT_PREFLIGHT_ONLY"),
    el("span", "", "Preflight ≠ execution authority. No Provider call, no RESERVATION/SETTLEMENT write, no Job / QA / Archive / RAW-source mutation."),
  );
  root.append(authority);

  checkbox.addEventListener("change", () => {
    run.disabled = !checkbox.checked || !model.value;
    if (!checkbox.checked) {
      result.dataset.state = "idle";
      resultHead.querySelector("strong")!.textContent = "NOT CHECKED";
    }
  });

  run.addEventListener("click", async () => {
    if (!checkbox.checked || !model.value) return;
    run.disabled = true;
    run.textContent = "检查中…";
    result.dataset.state = "checking";
    resultHead.querySelector("strong")!.textContent = "CHECKING";
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
      const ready = payload.ready_for_provider_call && auditSafe;
      result.dataset.state = ready ? "ready" : "blocked";
      resultHead.querySelector("strong")!.textContent = ready ? "READY — NO EXECUTION" : "BLOCKED";
      summary.textContent = ready
        ? "所有 submit readiness Gate 当前通过，但本面板仍不会调用 Provider。真实执行必须进入单独的显式执行 Gate。"
        : `Fail-closed：${payload.blockers?.length ?? 0} 个 blocker。当前没有 Provider 调用或费用写入。`;

      const rows: Array<[string, string]> = [
        ["Authority", payload.authority],
        ["Request model", payload.request_model],
        ["Estimated cost", `${payload.cost_guard?.currency ?? "USD"} ${Number(payload.estimated_cost ?? 0).toFixed(4)}`],
        ["Credential configured", payload.activation_preflight?.credential_configured ? "YES" : "NO"],
        ["Budget source", payload.activation_preflight?.budget_source ?? "—"],
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
      if (!(payload.blockers ?? []).length) blockers.append(el("span", "clear", "NO_SUBMIT_READINESS_BLOCKERS"));
      if (!auditSafe) {
        result.dataset.state = "error";
        resultHead.querySelector("strong")!.textContent = "FAIL CLOSED";
        blockers.append(el("span", "", "AUDIT_BOUNDARY_INVALID"));
      }
    } catch (error) {
      result.dataset.state = "error";
      resultHead.querySelector("strong")!.textContent = "UNAVAILABLE";
      summary.textContent = `Submit preflight 不可用：${error instanceof Error ? error.message : String(error)}。按 fail-closed 处理。`;
      blockers.replaceChildren(el("span", "", "SUBMIT_PREFLIGHT_UNAVAILABLE"));
    } finally {
      run.textContent = "运行提交预检查";
      run.disabled = !checkbox.checked || !model.value;
    }
  });
}

async function mountSubmitPreflight() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!boundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-submit-preflight='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hSubmitPreflight = "1";
    root.className = "v2h-panel v2h-submit-preflight";
    const adapters = document.querySelector<HTMLElement>("[data-v2h-adapter-registry='1']");
    const activation = document.querySelector<HTMLElement>("[data-v2h-activation-preflight='1']");
    if (adapters) adapters.insertAdjacentElement("afterend", root);
    else if (activation) activation.insertAdjacentElement("afterend", root);
    else if (boundary.parentElement) boundary.parentElement.insertBefore(root, boundary);
  }

  try {
    const response = await fetch(CLOUD_API);
    const body = await response.json().catch(() => ({})) as CloudResponse & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren(el("p", "v2h-submit-preflight-unavailable", `无法加载 submit preflight：${error instanceof Error ? error.message : String(error)}。`));
  }
}

export function installV2HOpenAIImageSubmitPreflightUI() {
  void mountSubmitPreflight();
}
