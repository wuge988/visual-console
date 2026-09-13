type AdapterProjection = {
  provider_key: string;
  display_name: string;
  registry_adapter_status: string;
  contract_version: string;
  implementation_status: string;
  media_types: string[];
  network_execution: boolean;
  submission_adapter: string | null;
  submit_path: string | null;
  executable: boolean;
};

type AdapterRegistryResponse = {
  ok: boolean;
  generated_at: string;
  authority: string;
  adapters: AdapterProjection[];
  audit: Record<string, boolean>;
};

const API = "http://127.0.0.1:4179/api/v2/cloud/adapters";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}

function render(root: HTMLElement, body: AdapterRegistryResponse) {
  root.replaceChildren();

  const head = el("header", "v2h-adapter-registry-head");
  const title = el("div");
  title.append(
    el("span", "v2h-kicker", "PROVIDER ADAPTER CONTRACTS"),
    el("h2", "", "Provider 适配器契约"),
    el("p", "", "读取后端唯一 Provider Adapter Contract 真值。此处只展示实现状态与网络执行边界，不提供启用、凭据写入或任务提交。"),
  );
  const badges = el("div", "v2h-adapter-registry-badges");
  badges.append(el("span", "readonly", "READ ONLY"), el("span", "networkoff", "NETWORK OFF"));
  head.append(title, badges);
  root.append(head);

  const grid = el("div", "v2h-adapter-registry-grid");
  for (const adapter of body.adapters ?? []) {
    const card = el("article", "v2h-adapter-card");
    card.dataset.executable = adapter.executable ? "yes" : "no";

    const cardHead = el("div", "v2h-adapter-card-head");
    const name = el("div");
    name.append(el("span", "", adapter.provider_key), el("b", "", adapter.display_name));
    const status = el(
      "strong",
      adapter.executable ? "ready" : "blocked",
      adapter.executable ? "EXECUTABLE" : adapter.implementation_status,
    );
    cardHead.append(name, status);

    const facts = el("div", "v2h-adapter-facts");
    const rows: Array<[string, string]> = [
      ["Contract", `v${adapter.contract_version}`],
      ["Registry adapter", adapter.registry_adapter_status],
      ["Implementation", adapter.implementation_status],
      ["Network execution", yesNo(adapter.network_execution)],
      ["Executable", yesNo(adapter.executable)],
      ["Media", adapter.media_types?.join(" / ") || "—"],
      ["Submission adapter", adapter.submission_adapter || "NOT BOUND"],
      ["Submit path", adapter.submit_path || "NOT BOUND"],
    ];
    for (const [label, value] of rows) {
      const row = el("div");
      row.append(el("span", "", label), el("b", "", value));
      facts.append(row);
    }

    const note = el(
      "p",
      "v2h-adapter-note",
      adapter.executable
        ? "Contract reports executable capability. Real execution still requires Cloud / Provider / Model / Credential / Cost Guard gates."
        : "当前 contract 不具备 Provider 网络执行权；Activation Preflight 必须继续返回 submission-adapter blocker。",
    );

    card.append(cardHead, facts, note);
    grid.append(card);
  }

  if (!(body.adapters ?? []).length) {
    grid.append(el("p", "v2h-adapter-empty", "当前没有声明 Provider Adapter Contract；按 fail-closed 处理。"));
  }
  root.append(grid);

  const auditSafe = body.audit && Object.values(body.audit).every((value) => value === false);
  const authority = el("footer", "v2h-adapter-registry-authority");
  authority.append(
    el("strong", "", body.authority || "PROVIDER_ADAPTER_REGISTRY_READ_ONLY"),
    el(
      "span",
      "",
      auditSafe
        ? "Adapter contract ≠ execution authority. 该面板不调用 Provider、不写凭据、不改 Registry / Budget / Job / QA / Archive / RAW-source truth。"
        : "AUDIT BOUNDARY INVALID：返回数据含非只读权限，必须按 fail-closed 处理。",
    ),
  );
  if (!auditSafe) authority.dataset.state = "error";
  root.append(authority);
}

async function mountAdapterRegistry() {
  if (!window.location.pathname.startsWith("/v2/cloud")) return;
  const boundary = document.querySelector<HTMLElement>(".v2h-boundary");
  if (!boundary) return;

  let root = document.querySelector<HTMLElement>("[data-v2h-adapter-registry='1']");
  if (!root) {
    root = document.createElement("section");
    root.dataset.v2hAdapterRegistry = "1";
    root.className = "v2h-panel v2h-adapter-registry";

    const preflight = document.querySelector<HTMLElement>("[data-v2h-activation-preflight='1']");
    if (preflight) preflight.insertAdjacentElement("afterend", root);
    else if (boundary.parentElement) boundary.parentElement.insertBefore(root, boundary);
  }

  try {
    const response = await fetch(API);
    const body = await response.json().catch(() => ({})) as AdapterRegistryResponse & { error?: string };
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    render(root, body);
  } catch (error) {
    root.replaceChildren();
    const head = el("header", "v2h-adapter-registry-head");
    const title = el("div");
    title.append(el("span", "v2h-kicker", "PROVIDER ADAPTER CONTRACTS"), el("h2", "", "Provider 适配器契约"));
    head.append(title, el("span", "v2h-adapter-unavailable", "UNAVAILABLE"));
    root.append(
      head,
      el("p", "v2h-adapter-empty", `无法读取本机 Provider Adapter Registry：${error instanceof Error ? error.message : String(error)}。不允许离线推断 executable。`),
    );
  }
}

export function installV2HAdapterRegistryUI() {
  void mountAdapterRegistry();
}
