type Sd01Archive = {
  asset_id: string;
  site_id?: string;
  item_id?: string;
  filename: string;
  archived_at: string;
  workflow_code: string;
  destination_key: string;
  result: string;
};

type Sd01Derivative = {
  derivative_id: string;
  site_id: string;
  item_id: string;
  workflow_code: "SD01";
  renderer_id: string;
  background_hex: string;
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

type Sd01Workflow = {
  code: string;
  workflow_status: string;
  executable: boolean;
  execution_engine?: string;
  frozen_runtime?: Record<string, unknown>;
};

type Sd01Truth = {
  archives: Sd01Archive[];
  derivatives: Sd01Derivative[];
  workflows: Sd01Workflow[];
};

const SD01_API = "http://127.0.0.1:4179";
const SD01_ROOT_ID = "p4-sd01-six-page-integration";
let sd01Syncing = false;

function sdEl<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sdContext() {
  const site = (document.querySelector(".top-site-select") as HTMLSelectElement | null)?.value || "drift-curio";
  const sku = document.querySelector(".topbar .chips > span:not(.ok)")?.textContent?.trim() || "DC-ZY-SZ-31001";
  return { site, sku };
}

async function sdApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SD01_API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function loadSd01Truth(): Promise<Sd01Truth> {
  const { site, sku } = sdContext();
  const query = `?site_id=${encodeURIComponent(site)}&item_id=${encodeURIComponent(sku)}`;
  const [archives, derivatives, workflows] = await Promise.all([
    sdApi<Sd01Archive[]>(`/api/archive${query}`),
    sdApi<Sd01Derivative[]>(`/api/dark-derivatives${query}`),
    sdApi<Sd01Workflow[]>(`/api/workflows?site_id=${encodeURIComponent(site)}`),
  ]);
  return { archives, derivatives, workflows };
}

function sdVerifiedCutouts(truth: Sd01Truth) {
  return truth.archives
    .filter((row) => row.workflow_code === "SC01" && row.destination_key === "cutout" && row.result === "VERIFIED_ARCHIVE")
    .sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
}

function sdWorkflow(truth: Sd01Truth) {
  return truth.workflows.find((row) => row.code === "SD01");
}

function sdArchiveUrl(assetId: string) {
  const { site, sku } = sdContext();
  return `${SD01_API}/api/archive/assets/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(assetId)}/content`;
}

function sdDerivativeUrl(assetId: string) {
  const { site, sku } = sdContext();
  return `${SD01_API}/api/dark-derivatives/assets/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(assetId)}/content`;
}

function sdStateLabel(row: Sd01Derivative) {
  if (row.archived) return "已归档 · F 正式深色 Master";
  const labels: Record<string, string> = {
    GENERATING: "生成中",
    QA_PENDING: "待审核",
    QA_PASS: "通过 · 待归档",
    QA_FAIL: "未通过",
    FAILED_GENERATION: "生成失败",
  };
  return labels[row.state] ?? row.state;
}

function sdNotify(message: string, bad = false) {
  let toast = document.getElementById("p4-sd01-toast");
  if (!toast) {
    toast = sdEl("div", "p4-sw01-toast p4-sd01-toast");
    toast.id = "p4-sd01-toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("bad", bad);
  toast.classList.add("show");
  window.setTimeout(() => toast?.classList.remove("show"), 3200);
}

function sdGo(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function createSdRoot(route: string, title: string, subtitle: string) {
  const root = sdEl("article", "p4-sw01-panel p4-sd01-panel");
  root.id = SD01_ROOT_ID;
  root.dataset.route = route;
  const heading = sdEl("div", "p4-sw01-heading");
  const copy = sdEl("div");
  copy.append(
    sdEl("em", "p4-sw01-kicker", "P4C · SD01"),
    sdEl("h2", "", title),
    sdEl("p", "", subtitle),
  );
  const badge = sdEl("span", "p4-sw01-badge p4-sd01-badge", "VALIDATED · #171B20");
  heading.append(copy, badge);
  root.append(heading);
  return root;
}

function mountSdRoot(root: HTMLElement) {
  const title = document.querySelector(".content .page-title");
  if (!title?.parentElement) return false;
  const sw01 = document.getElementById("p4-sw01-six-page-integration");
  if (sw01?.parentElement === title.parentElement) sw01.insertAdjacentElement("afterend", root);
  else title.insertAdjacentElement("afterend", root);
  return true;
}

async function generateSd01(sourceAssetId: string) {
  const { site, sku } = sdContext();
  const result = await sdApi<any>("/api/dark-derivatives/SD01/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site_id: site, item_id: sku, source_asset_ids: [sourceAssetId] }),
  });
  const row = result?.results?.[0];
  if (!row?.ok || !row?.derivative) throw new Error(row?.error || "SD01_GENERATION_FAILED");
  return row.derivative as Sd01Derivative;
}

async function sdQaDecision(row: Sd01Derivative, decision: "PASS" | "FAIL" | "NOTE", note = "") {
  const { site, sku } = sdContext();
  return sdApi(`/api/dark-derivatives/qa/${encodeURIComponent(row.generated_asset_id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site_id: site, item_id: sku, decision, note }),
  });
}

async function archiveSd01(row: Sd01Derivative) {
  const { site, sku } = sdContext();
  return sdApi(`/api/dark-derivatives/archive/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(row.generated_asset_id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

function refreshSd01Panel() {
  document.getElementById(SD01_ROOT_ID)?.remove();
  queueMicrotask(syncSd01Integration);
}

function renderSdWorkspace(truth: Sd01Truth) {
  const root = createSdRoot(
    "/workspace",
    "SD01 深色商品主图",
    "从 VERIFIED SC01 Cutout 确定性合成冻结 Gallery Surface #171B20；不重打光、不加阴影、不占用 GPU。",
  );
  const workflow = sdWorkflow(truth);
  const sources = sdVerifiedCutouts(truth);
  const pending = truth.derivatives.filter((x) => x.state === "QA_PENDING").length;
  const ready = truth.derivatives.filter((x) => x.state === "QA_PASS" && !x.archived).length;
  const archived = truth.derivatives.filter((x) => x.archived).length;
  const stats = sdEl("div", "p4-sw01-stats");
  for (const [value, label] of [[sources.length, "正式 Cutout 源"], [pending, "深色待审核"], [ready, "通过待归档"], [archived, "F 正式深色"]] as const) {
    const item = sdEl("div");
    item.append(sdEl("b", "", String(value)), sdEl("span", "", label));
    stats.append(item);
  }
  const controls = sdEl("div", "p4-sw01-controls");
  const select = sdEl("select", "p4-sw01-select") as HTMLSelectElement;
  for (const source of sources) {
    const option = sdEl("option") as HTMLOptionElement;
    option.value = source.asset_id;
    option.textContent = source.filename;
    select.append(option);
  }
  const generate = sdEl("button", "p4-sw01-primary p4-sd01-primary", "生成 SD01 深色主图") as HTMLButtonElement;
  generate.disabled = !workflow?.executable || !sources.length;
  generate.addEventListener("click", async () => {
    generate.disabled = true;
    generate.textContent = "生成中…";
    try {
      const created = await generateSd01(select.value);
      sdNotify(`SD01 已生成：${created.generated_filename}`);
      sdGo("/qa");
    } catch (error: any) {
      sdNotify(`SD01 生成失败：${error?.message ?? error}`, true);
      generate.disabled = false;
      generate.textContent = "生成 SD01 深色主图";
    }
  });
  controls.append(
    select,
    generate,
    sdEl("span", "p4-sw01-truth", workflow?.executable ? "SD01 已通过真实 Windows Gate，可正式执行" : "SD01 尚未提升为正式可执行状态"),
  );
  root.append(stats, controls);
  return root;
}

function renderSdJobs(truth: Sd01Truth) {
  const root = createSdRoot("/jobs", "SD01 静态派生任务", "确定性 CPU 本地渲染，与 ComfyUI Prompt 队列分离。\n");
  const list = sdEl("div", "p4-sw01-list");
  const rows = truth.derivatives.slice(0, 6);
  if (!rows.length) list.append(sdEl("p", "p4-sw01-empty", "当前 SKU 尚无 SD01 派生任务。"));
  for (const row of rows) {
    const item = sdEl("div", "p4-sw01-row");
    const source = sdEl("span");
    source.append(sdEl("b", "", row.source_filename), sdEl("small", "", ` → ${row.generated_filename}`));
    item.append(sdEl("span", "p4-sw01-state", sdStateLabel(row)), source, sdEl("span", "p4-sw01-mono", row.renderer_id), sdEl("time", "", new Date(row.updated_at).toLocaleString()));
    list.append(item);
  }
  root.append(list);
  return root;
}

function sdQaCard(row: Sd01Derivative) {
  const card = sdEl("div", "p4-sw01-qa-card p4-sd01-qa-card");
  const compare = sdEl("div", "p4-sw01-compare");
  const sourceFigure = sdEl("figure");
  const sourceImg = sdEl("img") as HTMLImageElement;
  sourceImg.src = sdArchiveUrl(row.source_asset_id);
  sourceImg.alt = row.source_filename;
  sourceFigure.append(sourceImg, sdEl("figcaption", "", "SC01 Cutout / F 正式源"));
  const darkFigure = sdEl("figure", "p4-sd01-dark");
  const darkImg = sdEl("img") as HTMLImageElement;
  darkImg.src = sdDerivativeUrl(row.generated_asset_id);
  darkImg.alt = row.generated_filename;
  darkFigure.append(darkImg, sdEl("figcaption", "", `SD01 Dark #171B20 / ${sdStateLabel(row)}`));
  compare.append(sourceFigure, darkFigure);

  const footer = sdEl("div", "p4-sw01-qa-footer");
  const meta = sdEl("div");
  meta.append(sdEl("b", "", row.generated_filename), sdEl("span", "", `${row.width ?? "?"}×${row.height ?? "?"} · ${row.renderer_id}`));
  const note = sdEl("textarea", "p4-sw01-note") as HTMLTextAreaElement;
  note.placeholder = "审核备注，例如：暗部层次正常，Exact Piece 一致";
  note.value = row.qa_note ?? "";
  const actions = sdEl("div", "p4-sw01-actions");
  const pass = sdEl("button", "p4-sw01-primary p4-sd01-primary", row.state === "QA_FAIL" ? "改为通过" : "通过") as HTMLButtonElement;
  const fail = sdEl("button", "p4-sw01-danger", "不通过") as HTMLButtonElement;
  const save = sdEl("button", "p4-sw01-secondary", "保存备注") as HTMLButtonElement;
  const decide = async (decision: "PASS" | "FAIL" | "NOTE") => {
    for (const button of [pass, fail, save]) button.disabled = true;
    try {
      await sdQaDecision(row, decision, note.value);
      sdNotify(decision === "PASS" ? "SD01 审核通过，等待正式归档" : decision === "FAIL" ? "SD01 已标记未通过" : "SD01 备注已保存");
      refreshSd01Panel();
    } catch (error: any) {
      sdNotify(`SD01 审核失败：${error?.message ?? error}`, true);
      for (const button of [pass, fail, save]) button.disabled = false;
    }
  };
  pass.addEventListener("click", () => void decide("PASS"));
  fail.addEventListener("click", () => void decide("FAIL"));
  save.addEventListener("click", () => void decide("NOTE"));
  actions.append(pass, fail, save);
  footer.append(meta, note, actions);
  card.append(compare, footer);
  return card;
}

function renderSdQa(truth: Sd01Truth) {
  const root = createSdRoot("/qa", "SD01 深色 Master 审核", "Exact Piece、木材颜色与 #171B20 冻结背景在这里独立审核。\n");
  const rows = truth.derivatives.filter((row) => row.state === "QA_PENDING" || row.state === "QA_FAIL").slice(0, 4);
  if (!rows.length) root.append(sdEl("p", "p4-sw01-empty", "当前没有待审核或未通过的 SD01 Dark Master。"));
  for (const row of rows) root.append(sdQaCard(row));
  return root;
}

function sdAssetCard(row: Sd01Derivative) {
  const card = sdEl("div", "p4-sw01-asset-card p4-sd01-asset-card");
  const image = sdEl("img") as HTMLImageElement;
  image.src = sdDerivativeUrl(row.generated_asset_id);
  image.alt = row.generated_filename;
  const meta = sdEl("div", "p4-sw01-asset-meta");
  meta.append(sdEl("b", "", row.generated_filename), sdEl("span", "", sdStateLabel(row)));
  if (row.generated_size_bytes) meta.append(sdEl("small", "", `${Math.max(1, Math.round(row.generated_size_bytes / 1024))} KB · ${row.generated_sha256?.slice(0, 12) ?? ""}…`));
  card.append(image, meta);
  if (row.state === "QA_PASS" && !row.archived) {
    const archive = sdEl("button", "p4-sw01-primary p4-sd01-primary", "正式归档到 F") as HTMLButtonElement;
    archive.addEventListener("click", async () => {
      archive.disabled = true;
      archive.textContent = "归档中…";
      try {
        await archiveSd01(row);
        sdNotify("SD01 已按 Gate15 正式归档到 F");
        refreshSd01Panel();
      } catch (error: any) {
        sdNotify(`SD01 归档失败：${error?.message ?? error}`, true);
        archive.disabled = false;
        archive.textContent = "正式归档到 F";
      }
    });
    card.append(archive);
  } else if (row.state === "QA_PENDING" || row.state === "QA_FAIL") {
    const review = sdEl("button", "p4-sw01-secondary", "进入深色审核");
    review.addEventListener("click", () => sdGo("/qa"));
    card.append(review);
  }
  return card;
}

function renderSdAssets(truth: Sd01Truth) {
  const root = createSdRoot("/assets", "Dark Master 素材", "D staging 与 F 正式深色资产使用同一验证预览端点；归档后读取 F truth。\n");
  const grid = sdEl("div", "p4-sw01-asset-grid");
  const rows = truth.derivatives.slice(0, 12);
  if (!rows.length) grid.append(sdEl("p", "p4-sw01-empty", "当前 SKU 尚无 Dark Master。"));
  for (const row of rows) grid.append(sdAssetCard(row));
  root.append(grid);
  return root;
}

function renderSdWorkflows(truth: Sd01Truth) {
  const root = createSdRoot("/workflows", "SD01 已完成真实物理验证", "本地确定性 PNG compositor；输入仅允许 VERIFIED SC01 archive。\n");
  const workflow = sdWorkflow(truth);
  const facts = sdEl("div", "p4-sw01-facts");
  facts.append(
    sdEl("span", "", `状态：${workflow?.workflow_status ?? "UNKNOWN"}`),
    sdEl("span", "", `可执行：${workflow?.executable ? "YES" : "NO"}`),
    sdEl("span", "", `背景：${String(workflow?.frozen_runtime?.background ?? "#171B20")}`),
    sdEl("span", "", `Renderer：${String(workflow?.frozen_runtime?.renderer ?? "sd01-flat-gallery-surface-rgb-v1")}`),
  );
  root.append(facts);
  for (const card of document.querySelectorAll<HTMLElement>(".workflow-card")) {
    if (card.querySelector(".workflow-code")?.textContent?.trim() !== "SD01") continue;
    const pill = card.querySelector<HTMLElement>(".status-pill");
    if (pill && workflow?.executable) pill.textContent = "已验证 · #171B20 · 可执行";
  }
  return root;
}

function renderSdSystem(truth: Sd01Truth) {
  const root = createSdRoot("/system", "SD01 静态派生运行真值", "已通过真实 Windows D/E/F + Manifest + 幂等 + 重启恢复 Gate。\n");
  const workflow = sdWorkflow(truth);
  const archived = truth.derivatives.filter((row) => row.archived).length;
  const facts = sdEl("div", "p4-sw01-facts");
  facts.append(
    sdEl("span", "", `SD01：${workflow?.executable ? "可执行" : "不可执行"}`),
    sdEl("span", "", `Renderer：${String(workflow?.frozen_runtime?.renderer ?? "—")}`),
    sdEl("span", "", `背景：${String(workflow?.frozen_runtime?.background ?? "—")}`),
    sdEl("span", "", `F 正式 Dark Master：${archived}`),
    sdEl("span", "", "GPU：不占用"),
  );
  root.append(facts);
  return root;
}

async function syncSd01Integration() {
  if (sd01Syncing) return;
  const route = window.location.pathname;
  const supported = new Set(["/workspace", "/workflows", "/jobs", "/qa", "/assets", "/system"]);
  const existing = document.getElementById(SD01_ROOT_ID);
  if (!supported.has(route)) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.route === route) return;
  existing?.remove();
  if (!document.querySelector(".content .page-title")) return;
  sd01Syncing = true;
  try {
    const truth = await loadSd01Truth();
    let root: HTMLElement;
    if (route === "/workspace") root = renderSdWorkspace(truth);
    else if (route === "/workflows") root = renderSdWorkflows(truth);
    else if (route === "/jobs") root = renderSdJobs(truth);
    else if (route === "/qa") root = renderSdQa(truth);
    else if (route === "/assets") root = renderSdAssets(truth);
    else root = renderSdSystem(truth);
    mountSdRoot(root);
  } catch (error: any) {
    const root = createSdRoot(route, "SD01 状态暂不可用", "本地深色派生服务读取失败，不影响已发布的其他生产链路。\n");
    root.append(sdEl("p", "p4-sw01-error", error?.message ?? String(error)));
    mountSdRoot(root);
  } finally {
    sd01Syncing = false;
  }
}

const sd01Observer = new MutationObserver(() => queueMicrotask(syncSd01Integration));
sd01Observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", syncSd01Integration);
window.addEventListener("load", syncSd01Integration);
queueMicrotask(syncSd01Integration);
