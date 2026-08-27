type P4Archive = {
  asset_id: string;
  site_id?: string;
  item_id?: string;
  filename: string;
  archived_at: string;
  workflow_code: string;
  destination_key: string;
  result: string;
  size_bytes: number;
  sha256: string;
};

type P4Derivative = {
  derivative_id: string;
  site_id: string;
  item_id: string;
  workflow_code: "SW01";
  renderer_id: string;
  source_asset_id: string;
  source_filename: string;
  generated_asset_id: string;
  generated_filename: string;
  generated_size_bytes?: number;
  generated_sha256?: string;
  width?: number;
  height?: number;
  version: number;
  state: string;
  qa_note?: string;
  archived?: boolean;
  created_at: string;
  updated_at: string;
};

type P4Workflow = {
  code: string;
  workflow_status: string;
  executable: boolean;
  execution_engine?: string;
  frozen_runtime?: Record<string, unknown>;
};

type P4Truth = {
  archives: P4Archive[];
  derivatives: P4Derivative[];
  workflows: P4Workflow[];
};

const API = "http://127.0.0.1:4179";
const ROOT_ID = "p4-sw01-six-page-integration";
let syncing = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function context() {
  const site = (document.querySelector(".top-site-select") as HTMLSelectElement | null)?.value || "drift-curio";
  const sku = document.querySelector(".topbar .chips > span:not(.ok)")?.textContent?.trim() || "DC-ZY-SZ-31001";
  return { site, sku };
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function loadTruth(): Promise<P4Truth> {
  const { site, sku } = context();
  const query = `?site_id=${encodeURIComponent(site)}&item_id=${encodeURIComponent(sku)}`;
  const [archives, derivatives, workflows] = await Promise.all([
    api<P4Archive[]>(`/api/archive${query}`),
    api<P4Derivative[]>(`/api/derivatives${query}`),
    api<P4Workflow[]>(`/api/workflows?site_id=${encodeURIComponent(site)}`),
  ]);
  return { archives, derivatives, workflows };
}

function verifiedCutouts(truth: P4Truth) {
  return truth.archives
    .filter((row) => row.workflow_code === "SC01" && row.destination_key === "cutout" && row.result === "VERIFIED_ARCHIVE")
    .sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
}

function sw01Workflow(truth: P4Truth) {
  return truth.workflows.find((row) => row.code === "SW01");
}

function archiveUrl(assetId: string) {
  const { site, sku } = context();
  return `${API}/api/archive/assets/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(assetId)}/content`;
}

function derivativeUrl(assetId: string) {
  const { site, sku } = context();
  return `${API}/api/derivatives/assets/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(assetId)}/content`;
}

function stateLabel(row: P4Derivative) {
  if (row.archived) return "已归档 · F 正式白底 Master";
  const labels: Record<string, string> = {
    GENERATING: "生成中",
    QA_PENDING: "待审核",
    QA_PASS: "通过 · 待归档",
    QA_FAIL: "未通过",
    FAILED_GENERATION: "生成失败",
  };
  return labels[row.state] ?? row.state;
}

function notify(message: string, bad = false) {
  let toast = document.getElementById("p4-sw01-toast");
  if (!toast) {
    toast = el("div", "p4-sw01-toast");
    toast.id = "p4-sw01-toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("bad", bad);
  toast.classList.add("show");
  window.setTimeout(() => toast?.classList.remove("show"), 3200);
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function createRoot(route: string, title: string, subtitle: string) {
  const root = el("article", "p4-sw01-panel");
  root.id = ROOT_ID;
  root.dataset.route = route;
  const heading = el("div", "p4-sw01-heading");
  const copy = el("div");
  copy.append(el("em", "p4-sw01-kicker", "P4A · SW01"), el("h2", "", title), el("p", "", subtitle));
  const badge = el("span", "p4-sw01-badge", "VERIFIED LOCAL RENDERER");
  heading.append(copy, badge);
  root.append(heading);
  return root;
}

function mountAfterTitle(root: HTMLElement) {
  const title = document.querySelector(".content .page-title");
  if (!title?.parentElement) return false;
  title.insertAdjacentElement("afterend", root);
  return true;
}

async function generateSw01(sourceAssetId: string) {
  const { site, sku } = context();
  const result = await api<any>("/api/derivatives/SW01/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site_id: site, item_id: sku, source_asset_ids: [sourceAssetId] }),
  });
  const row = result?.results?.[0];
  if (!row?.ok || !row?.derivative) throw new Error(row?.error || "SW01_GENERATION_FAILED");
  return row.derivative as P4Derivative;
}

async function qaDecision(row: P4Derivative, decision: "PASS" | "FAIL" | "NOTE", note = "") {
  const { site, sku } = context();
  return api(`/api/derivatives/qa/${encodeURIComponent(row.generated_asset_id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site_id: site, item_id: sku, decision, note }),
  });
}

async function archiveDerivative(row: P4Derivative) {
  const { site, sku } = context();
  return api(`/api/derivatives/archive/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(row.generated_asset_id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

function refreshPanel() {
  document.getElementById(ROOT_ID)?.remove();
  queueMicrotask(syncIntegration);
}

function renderWorkspace(truth: P4Truth) {
  const root = createRoot(
    "/workspace",
    "SW01 白底商品主图",
    "从 P3 已验证的 SC01 正式 Cutout 生成纯白 RGB Master；不重复 RMBG，不占用 GPU。",
  );
  const workflow = sw01Workflow(truth);
  const sources = verifiedCutouts(truth);
  const pending = truth.derivatives.filter((x) => x.state === "QA_PENDING").length;
  const ready = truth.derivatives.filter((x) => x.state === "QA_PASS" && !x.archived).length;
  const archived = truth.derivatives.filter((x) => x.archived).length;

  const stats = el("div", "p4-sw01-stats");
  for (const [value, label] of [[sources.length, "正式 Cutout 源"], [pending, "白底待审核"], [ready, "通过待归档"], [archived, "F 正式白底"]] as const) {
    const item = el("div");
    item.append(el("b", "", String(value)), el("span", "", label));
    stats.append(item);
  }

  const controls = el("div", "p4-sw01-controls");
  const select = el("select", "p4-sw01-select") as HTMLSelectElement;
  for (const source of sources) {
    const option = el("option") as HTMLOptionElement;
    option.value = source.asset_id;
    option.textContent = source.filename;
    select.append(option);
  }
  const generate = el("button", "p4-sw01-primary", "生成 SW01 白底主图") as HTMLButtonElement;
  generate.disabled = !workflow?.executable || !sources.length;
  generate.addEventListener("click", async () => {
    generate.disabled = true;
    generate.textContent = "生成中…";
    try {
      const created = await generateSw01(select.value);
      notify(`SW01 已生成：${created.generated_filename}`);
      go("/qa");
    } catch (error: any) {
      notify(`SW01 生成失败：${error?.message ?? error}`, true);
      generate.disabled = false;
      generate.textContent = "生成 SW01 白底主图";
    }
  });
  const workflowText = workflow?.executable
    ? "SW01 已通过目标 Windows 物理 Gate，可正式执行"
    : "SW01 尚未提升为正式可执行状态";
  controls.append(select, generate, el("span", "p4-sw01-truth", workflowText));
  root.append(stats, controls);
  return root;
}

function renderJobs(truth: P4Truth) {
  const root = createRoot(
    "/jobs",
    "静态派生任务",
    "SW01 是确定性 CPU 本地渲染任务，与 ComfyUI Prompt 队列分开显示。",
  );
  const list = el("div", "p4-sw01-list");
  const rows = truth.derivatives.slice(0, 6);
  if (!rows.length) list.append(el("p", "p4-sw01-empty", "当前 SKU 尚无 SW01 派生任务。"));
  for (const row of rows) {
    const item = el("div", "p4-sw01-row");
    const source = el("span"); source.append(el("b", "", row.source_filename), el("small", "", ` → ${row.generated_filename}`));
    item.append(el("span", "p4-sw01-state", stateLabel(row)), source, el("span", "p4-sw01-mono", row.renderer_id), el("time", "", new Date(row.updated_at).toLocaleString()));
    list.append(item);
  }
  root.append(list);
  return root;
}

function qaCard(row: P4Derivative) {
  const card = el("div", "p4-sw01-qa-card");
  const compare = el("div", "p4-sw01-compare");
  const sourceFigure = el("figure");
  const sourceImg = el("img") as HTMLImageElement;
  sourceImg.src = archiveUrl(row.source_asset_id);
  sourceImg.alt = row.source_filename;
  sourceFigure.append(sourceImg, el("figcaption", "", "SC01 Cutout / F 正式源"));
  const whiteFigure = el("figure", "white");
  const whiteImg = el("img") as HTMLImageElement;
  whiteImg.src = derivativeUrl(row.generated_asset_id);
  whiteImg.alt = row.generated_filename;
  whiteFigure.append(whiteImg, el("figcaption", "", `SW01 White / ${stateLabel(row)}`));
  compare.append(sourceFigure, whiteFigure);

  const footer = el("div", "p4-sw01-qa-footer");
  const meta = el("div");
  meta.append(el("b", "", row.generated_filename), el("span", "", `${row.width ?? "?"}×${row.height ?? "?"} · ${row.renderer_id}`));
  const note = el("textarea", "p4-sw01-note") as HTMLTextAreaElement;
  note.placeholder = "审核备注，例如：细枝边缘有白边";
  note.value = row.qa_note ?? "";
  const actions = el("div", "p4-sw01-actions");
  const pass = el("button", "p4-sw01-primary", row.state === "QA_FAIL" ? "改为通过" : "通过") as HTMLButtonElement;
  const fail = el("button", "p4-sw01-danger", "不通过") as HTMLButtonElement;
  const save = el("button", "p4-sw01-secondary", "保存备注") as HTMLButtonElement;
  const runDecision = async (decision: "PASS" | "FAIL" | "NOTE") => {
    for (const button of [pass, fail, save]) button.disabled = true;
    try {
      await qaDecision(row, decision, note.value);
      notify(decision === "PASS" ? "SW01 审核通过，等待正式归档" : decision === "FAIL" ? "SW01 已标记未通过" : "SW01 备注已保存");
      refreshPanel();
    } catch (error: any) {
      notify(`SW01 审核失败：${error?.message ?? error}`, true);
      for (const button of [pass, fail, save]) button.disabled = false;
    }
  };
  pass.addEventListener("click", () => void runDecision("PASS"));
  fail.addEventListener("click", () => void runDecision("FAIL"));
  save.addEventListener("click", () => void runDecision("NOTE"));
  actions.append(pass, fail, save);
  footer.append(meta, note, actions);
  card.append(compare, footer);
  return card;
}

function renderQa(truth: P4Truth) {
  const root = createRoot(
    "/qa",
    "SW01 白底 Master 审核",
    "白底审核与透明 Cutout 审核共用质量审核页，但状态和操作相互独立。",
  );
  const rows = truth.derivatives.filter((row) => row.state === "QA_PENDING" || row.state === "QA_FAIL").slice(0, 4);
  if (!rows.length) root.append(el("p", "p4-sw01-empty", "当前没有待审核或未通过的 SW01 White Master。"));
  for (const row of rows) root.append(qaCard(row));
  return root;
}

function assetCard(row: P4Derivative) {
  const card = el("div", "p4-sw01-asset-card");
  const image = el("img") as HTMLImageElement;
  image.src = derivativeUrl(row.generated_asset_id);
  image.alt = row.generated_filename;
  const meta = el("div", "p4-sw01-asset-meta");
  meta.append(el("b", "", row.generated_filename), el("span", "", stateLabel(row)));
  if (row.generated_size_bytes) meta.append(el("small", "", `${Math.max(1, Math.round(row.generated_size_bytes / 1024))} KB · ${row.generated_sha256?.slice(0, 12) ?? ""}…`));
  card.append(image, meta);

  if (row.state === "QA_PASS" && !row.archived) {
    const archive = el("button", "p4-sw01-primary", "正式归档到 F") as HTMLButtonElement;
    archive.addEventListener("click", async () => {
      archive.disabled = true;
      archive.textContent = "归档中…";
      try {
        await archiveDerivative(row);
        notify("SW01 已按 Gate15 正式归档到 F");
        refreshPanel();
      } catch (error: any) {
        notify(`SW01 归档失败：${error?.message ?? error}`, true);
        archive.disabled = false;
        archive.textContent = "正式归档到 F";
      }
    });
    card.append(archive);
  } else if (row.state === "QA_PENDING" || row.state === "QA_FAIL") {
    const review = el("button", "p4-sw01-secondary", "进入白底审核");
    review.addEventListener("click", () => go("/qa"));
    card.append(review);
  }
  return card;
}

function renderAssets(truth: P4Truth) {
  const root = createRoot(
    "/assets",
    "White Master 素材",
    "SW01 staging 与 F 正式资产使用同一验证预览端点；归档后自动切换为 F truth。",
  );
  const grid = el("div", "p4-sw01-asset-grid");
  const rows = truth.derivatives.slice(0, 12);
  if (!rows.length) grid.append(el("p", "p4-sw01-empty", "当前 SKU 尚无 White Master。"));
  for (const row of rows) grid.append(assetCard(row));
  root.append(grid);
  return root;
}

function renderWorkflows(truth: P4Truth) {
  const root = createRoot(
    "/workflows",
    "SW01 已完成物理验证",
    "执行引擎为本地确定性 PNG compositor；输入限定为 VERIFIED SC01 archive，不调用 ComfyUI/GPU。",
  );
  const workflow = sw01Workflow(truth);
  const facts = el("div", "p4-sw01-facts");
  facts.append(
    el("span", "", `状态：${workflow?.workflow_status ?? "UNKNOWN"}`),
    el("span", "", `可执行：${workflow?.executable ? "YES" : "NO"}`),
    el("span", "", `引擎：${workflow?.execution_engine ?? "LOCAL_RENDERER"}`),
    el("span", "", `Renderer：${String(workflow?.frozen_runtime?.renderer ?? "sw01-flat-white-rgb-v1")}`),
  );
  root.append(facts);

  for (const card of document.querySelectorAll<HTMLElement>(".workflow-card")) {
    if (card.querySelector(".workflow-code")?.textContent?.trim() !== "SW01") continue;
    const pill = card.querySelector<HTMLElement>(".status-pill");
    if (pill && workflow?.executable) pill.textContent = "已验证 · 本地渲染 · 可执行";
  }
  return root;
}

function renderSystem(truth: P4Truth) {
  const root = createRoot(
    "/system",
    "P4 静态派生运行真值",
    "SW01 已通过真实 Windows D/E/F Gate；这里补充本地渲染器与正式资产状态。",
  );
  const workflow = sw01Workflow(truth);
  const archived = truth.derivatives.filter((row) => row.archived).length;
  const facts = el("div", "p4-sw01-facts");
  facts.append(
    el("span", "", `SW01：${workflow?.executable ? "可执行" : "不可执行"}`),
    el("span", "", `Renderer：${String(workflow?.frozen_runtime?.renderer ?? "—")}`),
    el("span", "", `F 正式 White Master：${archived}`),
    el("span", "", "GPU：不占用"),
  );
  root.append(facts);

  const executableCount = truth.workflows.filter((row) => row.executable).length;
  for (const card of document.querySelectorAll<HTMLElement>(".status-card")) {
    if (!card.querySelector("h3")?.textContent?.includes("Workflow Registry")) continue;
    for (const line of card.querySelectorAll<HTMLElement>("dl > div")) {
      if (line.querySelector("dt")?.textContent?.trim() === "可执行") {
        const value = line.querySelector<HTMLElement>("dd");
        if (value) value.textContent = String(executableCount);
      }
    }
  }
  return root;
}

async function syncIntegration() {
  if (syncing) return;
  const route = window.location.pathname;
  const supported = new Set(["/workspace", "/workflows", "/jobs", "/qa", "/assets", "/system"]);
  const existing = document.getElementById(ROOT_ID);
  if (!supported.has(route)) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.route === route) return;
  existing?.remove();
  if (!document.querySelector(".content .page-title")) return;

  syncing = true;
  try {
    const truth = await loadTruth();
    let root: HTMLElement;
    if (route === "/workspace") root = renderWorkspace(truth);
    else if (route === "/workflows") root = renderWorkflows(truth);
    else if (route === "/jobs") root = renderJobs(truth);
    else if (route === "/qa") root = renderQa(truth);
    else if (route === "/assets") root = renderAssets(truth);
    else root = renderSystem(truth);
    mountAfterTitle(root);
  } catch (error: any) {
    const root = createRoot(route, "SW01 状态暂不可用", "P4A 本地派生服务读取失败，不影响已发布的 P1/P2/P3 功能。");
    root.append(el("p", "p4-sw01-error", error?.message ?? String(error)));
    mountAfterTitle(root);
  } finally {
    syncing = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(syncIntegration));
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", syncIntegration);
window.addEventListener("load", syncIntegration);
queueMicrotask(syncIntegration);
