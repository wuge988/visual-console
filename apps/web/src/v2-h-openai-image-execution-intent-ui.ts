type CloudModel = { model_key: string; display_name: string; media_type?: string };
type CloudProvider = { provider_key: string; display_name: string; models?: CloudModel[] };
type CloudResponse = { ok: boolean; registry: { providers: CloudProvider[] } };

type IntentSuccess = {
  ok: true;
  authority: string;
  execution_intent_issued: true;
  provider_key: string;
  model_key: string;
  request_model: string;
  estimated_cost: number;
  execution_intent: {
    token: string;
    intent_id: string;
    operation_id: string;
    issued_at: string;
    expires_at: string;
    single_use: boolean;
  };
  audit: Record<string, boolean>;
};

type IntentFailure = {
  error?: string;
  fail_closed?: boolean;
  authority?: string;
  execution_intent_issued?: false;
  blockers?: string[];
  audit?: Record<string, boolean>;
};

const CLOUD_API = "http://127.0.0.1:4179/api/v2/cloud";
const INTENT_API = "http://127.0.0.1:4179/api/v2/cloud/openai-image/execution-intent";
const ACK = "OPENAI_IMAGE_PROVIDER_CALL";
const CONFIRM_PHRASE = "EXECUTE ONE OPENAI IMAGE CALL";

type Snapshot = {
  model: string;
  operationId: string;
  siteId: string;
  itemId: string;
  jobId: string;
  prompt: string;
  estimatedCost: string;
  skuSpend: string;
  dailySpend: string;
  monthlySpend: string;
  phrase: string;
  acknowledgement: boolean;
};

function fingerprint(snapshot: Snapshot) {
  return JSON.stringify([
    snapshot.model,
    snapshot.operationId,
    snapshot.siteId,
    snapshot.itemId,
    snapshot.jobId,
    snapshot.prompt,
    snapshot.estimatedCost,
    snapshot.skuSpend,
    snapshot.dailySpend,
    snapshot.monthlySpend,
    snapshot.phrase,
    snapshot.acknowledgement,
  ]);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function input(type: string, value: string) {
  const node = document.createElement("input");
  node.type = type;
  node.value = value;
  return node;
}

function field(label: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const wrap = el("label", "v2h-intent-field");
  wrap.append(el("span", "", label), control);
  return wrap;
}

function render(root: HTMLElement, cloud: CloudResponse) {
  root.replaceChildren();
  const openai = cloud.registry.providers.find((row) => row.provider_key === "openai-image");
  const models = (openai?.models ?? []).filter((row) => (row.media_type ?? "image") === "image");

  const head = el("header", "v2h-intent-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "ONE-TIME EXECUTION INTENT"),
    el("h2", "", "一次性执行权限 Gate"),
    el("p", "", "向本机服务端申请 60 秒、单次使用、exact-envelope 绑定的执行 intent。该面板不调用真实 /submit，不会产生 Provider 请求或费用写入。"),
  );
  const badges = el("div", "v2h-intent-badges");
  badges.append(
    el("span", "server", "SERVER AUTHORITATIVE"),
    el("span", "nosubmit", "NO SUBMIT BOUND"),
  );
  head.append(title, badges);
  root.append(head);

  const form = el("section", "v2h-intent-form");
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

  const now = Date.now();
  const operation = input("text", `op_intent_${now}`);
  const site = input("text", "drift-curio");
  const item = input("text", "DC-ZY-SZ-31001");
  const job = input("text", `job_intent_${now}`);
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
  prompt.rows = 3;
  prompt.maxLength = 32000;
  prompt.value = "Create one controlled image derivative. Execution intent issuance itself performs no provider call.";

  const grid = el("div", "v2h-intent-grid");
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

  const phraseWrap = el("div", "v2h-intent-phrase");
  const phraseInfo = el("div");
  phraseInfo.append(el("span", "", "手动输入确认短语"), el("code", "", CONFIRM_PHRASE));
  const phrase = input("text", "");
  phrase.placeholder = CONFIRM_PHRASE;
  phrase.autocomplete = "off";
  phrase.spellcheck = false;
  phraseWrap.append(phraseInfo, phrase);
  form.append(phraseWrap);

  const consent = el("label", "v2h-intent-consent");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const consentText = el(
    "span",
    "",
    "我确认：这里只申请一次性 execution intent；不会调用 OpenAI，也不会写入 RESERVATION / SETTLEMENT。",
  );
  const run = el("button", "v2h-intent-run", "请求一次性执行权限（不执行）");
  run.type = "button";
  run.disabled = true;
  consent.append(checkbox, consentText, run);
  form.append(consent);
  root.append(form);

  const result = el("section", "v2h-intent-result");
  result.dataset.state = "idle";
  const resultHead = el("div", "v2h-intent-result-head");
  const badge = el("strong", "", "NOT REQUESTED");
  resultHead.append(el("b", "", "SERVER-AUTHORITATIVE EXECUTION INTENT"), badge);
  const summary = el("p", "", "只有服务端当前 readiness 与 Cost Guard 全部通过时才会签发短时单次 intent；当前面板始终不会调用 /submit。" );
  const facts = el("div", "v2h-intent-facts");
  const blockers = el("div", "v2h-intent-blockers");
  result.append(resultHead, summary, facts, blockers);
  root.append(result);

  const boundary = el("footer", "v2h-intent-authority");
  boundary.append(
    el("strong", "", "OPENAI_IMAGE_EXECUTION_INTENT_ONLY"),
    el("span", "", "Intent issuance ≠ Provider execution. No /submit browser binding, no Provider call, no spend write. Any later execution must separately consume the exact-envelope single-use token and re-pass current server gates."),
  );
  root.append(boundary);

  let requestFingerprint: string | null = null;
  let lastServerFingerprint: string | null = null;
  let requestInvalidated = false;
  let heldToken: string | null = null;

  function snapshot(): Snapshot {
    return {
      model: model.value,
      operationId: operation.value,
      siteId: site.value,
      itemId: item.value,
      jobId: job.value,
      prompt: prompt.value,
      estimatedCost: estimate.value,
      skuSpend: skuSpend.value,
      dailySpend: dailySpend.value,
      monthlySpend: monthlySpend.value,
      phrase: phrase.value,
      acknowledgement: checkbox.checked,
    };
  }

  function currentFingerprint() {
    return fingerprint(snapshot());
  }

  function canRequest() {
    return Boolean(model.value) && checkbox.checked && phrase.value.trim() === CONFIRM_PHRASE;
  }

  function syncButton() {
    run.disabled = requestFingerprint !== null || !canRequest();
  }

  function markStale(reason: string) {
    heldToken = null;
    result.dataset.state = "stale";
    badge.textContent = "REVALIDATION REQUIRED";
    summary.textContent = "执行 envelope 或人工确认条件已变化；上一次 intent 结果不再适用于当前输入。浏览器已丢弃任何本地 token 引用。";
    facts.replaceChildren();
    blockers.replaceChildren(el("span", "", reason), el("span", "", "REVALIDATION_REQUIRED"));
  }

  function handleMutation(reason: string) {
    const current = currentFingerprint();
    const changedAfterResult = lastServerFingerprint !== null && current !== lastServerFingerprint;
    const changedDuringRequest = requestFingerprint !== null && current !== requestFingerprint;
    if (changedDuringRequest) requestInvalidated = true;
    if (changedAfterResult || changedDuringRequest || result.dataset.state === "stale") markStale(reason);
    syncButton();
  }

  phrase.addEventListener("input", () => handleMutation("CONFIRMATION_STATE_CHANGED"));
  checkbox.addEventListener("change", () => handleMutation("CONFIRMATION_STATE_CHANGED"));
  model.addEventListener("change", () => handleMutation("EXECUTION_ENVELOPE_CHANGED"));
  for (const control of [operation, site, item, job, estimate, skuSpend, dailySpend, monthlySpend, prompt]) {
    control.addEventListener("input", () => handleMutation("EXECUTION_ENVELOPE_CHANGED"));
  }

  run.addEventListener("click", async () => {
    if (!canRequest() || requestFingerprint !== null) return;
    const submitted = snapshot();
    const submittedFingerprint = fingerprint(submitted);
    requestFingerprint = submittedFingerprint;
    requestInvalidated = false;
    lastServerFingerprint = null;
    heldToken = null;
    run.disabled = true;
    run.textContent = "服务端验证中…";
    result.dataset.state = "checking";
    badge.textContent = "CHECKING";
    summary.textContent = "服务端正在重新验证当前 Registry / Activation / credential / paid-network / Cost Guard；此请求不会调用 Provider。";
    facts.replaceChildren();
    blockers.replaceChildren();

    const body = {
      operation_id: submitted.operationId.trim(),
      site_id: submitted.siteId.trim(),
      item_id: submitted.itemId.trim(),
      job_id: submitted.jobId.trim(),
      model_key: submitted.model,
      prompt: submitted.prompt,
      estimated_cost: Number(submitted.estimatedCost),
      spend: {
        sku: Number(submitted.skuSpend),
        daily: Number(submitted.dailySpend),
        monthly: Number(submitted.monthlySpend),
      },
      acknowledge: ACK,
      confirmation_phrase: CONFIRM_PHRASE,
    };

    try {
      const response = await fetch(INTENT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as IntentSuccess | IntentFailure;

      if (requestInvalidated || currentFingerprint() !== submittedFingerprint) {
        markStale("EXECUTION_ENVELOPE_CHANGED_DURING_INTENT_REQUEST");
        return;
      }
      lastServerFingerprint = submittedFingerprint;

      if (!response.ok || !(payload as IntentSuccess).ok) {
        const failure = payload as IntentFailure;
        result.dataset.state = "blocked";
        badge.textContent = "BLOCKED — NO INTENT";
        summary.textContent = `Fail-closed：服务端未签发 execution intent。${failure.error ? ` ${failure.error}` : ""}`;
        const audit = failure.audit ?? {};
        const rows: Array<[string, string]> = [
          ["Authority", failure.authority ?? "OPENAI_IMAGE_EXECUTION_INTENT_ONLY"],
          ["Intent issued", "NO"],
          ["Provider call", audit.provider_call ? "YES" : "NO"],
          ["Spend write", audit.spend_write ? "YES" : "NO"],
        ];
        for (const [label, value] of rows) {
          const cell = el("div");
          cell.append(el("span", "", label), el("b", "", value));
          facts.append(cell);
        }
        for (const reason of failure.blockers ?? []) blockers.append(el("span", "", reason));
        if (!(failure.blockers ?? []).length) blockers.append(el("span", "", failure.error ?? `HTTP_${response.status}`));
        return;
      }

      const success = payload as IntentSuccess;
      const auditSafe = success.audit && Object.values(success.audit).every((value) => value === false);
      if (!auditSafe || !success.execution_intent?.token) {
        result.dataset.state = "error";
        badge.textContent = "FAIL CLOSED";
        summary.textContent = "服务端返回的 intent audit 边界不满足零执行要求；浏览器未保留 token。";
        blockers.replaceChildren(el("span", "", "EXECUTION_INTENT_AUDIT_BOUNDARY_INVALID"));
        return;
      }

      heldToken = success.execution_intent.token;
      result.dataset.state = "issued";
      badge.textContent = "INTENT ISSUED — NO EXECUTION";
      summary.textContent = "服务端已签发一次性短时 intent；token 仅保留在当前浏览器内存，不显示在页面，也未调用 /submit。";
      const rows: Array<[string, string]> = [
        ["Authority", success.authority],
        ["Intent ID", success.execution_intent.intent_id],
        ["Operation ID", success.execution_intent.operation_id],
        ["Expires at", success.execution_intent.expires_at],
        ["Single use", success.execution_intent.single_use ? "YES" : "NO"],
        ["Provider call", success.audit.provider_call ? "YES" : "NO"],
        ["Spend write", success.audit.spend_write ? "YES" : "NO"],
        ["Submit bound", "NO"],
      ];
      for (const [label, value] of rows) {
        const cell = el("div");
        cell.append(el("span", "", label), el("b", "", value));
        facts.append(cell);
      }
      blockers.replaceChildren(el("span", "clear", "NO_PROVIDER_EXECUTION_OCCURRED"));
      window.dispatchEvent(new CustomEvent("v2h:execution-intent-issued", {
        detail: {
          token: heldToken,
          fingerprint: submittedFingerprint,
          intentId: success.execution_intent.intent_id,
          expiresAt: success.execution_intent.expires_at,
          envelope: body,
        },
      }));
    } catch (error) {
      if (requestInvalidated || currentFingerprint() !== submittedFingerprint) {
        markStale("EXECUTION_ENVELOPE_CHANGED_DURING_INTENT_REQUEST");
      } else {
        lastServerFingerprint = submittedFingerprint;
        result.dataset.state = "error";
        badge.textContent = "UNAVAILABLE";
        summary.textContent = `Execution intent 服务不可用：${error instanceof Error ? error.message : String(error)}。按 fail-closed 处理。`;
        facts.replaceChildren();
        blockers.replaceChildren(el("span", "", "EXECUTION_INTENT_UNAVAILABLE"));
      }
    } finally {
      requestFingerprint = null;
      requestInvalidated = false;
      run.textContent = "请求一次性执行权限（不执行）";
      syncButton();
    }
  });
}

async function mountIntentUI() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const pageBoundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!pageBoundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-execution-intent-ui='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hExecutionIntentUi = "1";
    root.className = "v2h-panel v2h-intent";
    const confirmation = document.querySelector<HTMLElement>("[data-v2h-execution-confirmation='1']");
    const preflight = document.querySelector<HTMLElement>("[data-v2h-submit-preflight='1']");
    if (confirmation) confirmation.insertAdjacentElement("afterend", root);
    else if (preflight) preflight.insertAdjacentElement("afterend", root);
    else if (pageBoundary.parentElement) pageBoundary.parentElement.insertBefore(root, pageBoundary);
  }

  try {
    const response = await fetch(CLOUD_API);
    const body = await response.json().catch(() => ({})) as CloudResponse & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren(el("p", "v2h-intent-unavailable", `无法加载一次性执行权限 Gate：${error instanceof Error ? error.message : String(error)}。`));
  }
}

export function installV2HOpenAIImageExecutionIntentUI() {
  void mountIntentUI();
}
