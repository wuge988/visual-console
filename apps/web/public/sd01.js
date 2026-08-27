const API = "http://127.0.0.1:4179";
const siteInput = document.querySelector("#site");
const skuInput = document.querySelector("#sku");
const sourcesEl = document.querySelector("#sources");
const sourcePreview = document.querySelector("#sourcePreview");
const darkPreview = document.querySelector("#darkPreview");
const generateButton = document.querySelector("#generate");
const passArchiveButton = document.querySelector("#passArchive");
const failButton = document.querySelector("#fail");
const saveNoteButton = document.querySelector("#saveNote");
const noteInput = document.querySelector("#note");
const statusEl = document.querySelector("#status");

let sources = [];
let selectedSource = null;
let currentDerivative = null;

function log(message) {
  const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  statusEl.textContent += `\n[${stamp}] ${message}`;
  statusEl.scrollTop = statusEl.scrollHeight;
}

async function json(path, init) {
  const response = await fetch(`${API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body;
}

function esc(value) {
  return encodeURIComponent(String(value));
}

function sourceUrl(source) {
  return `${API}/api/archive/assets/${esc(source.site_id)}/${esc(source.item_id)}/${esc(source.asset_id)}/content`;
}

function darkUrl(derivative) {
  return `${API}/api/dark-derivatives/assets/${esc(derivative.site_id)}/${esc(derivative.item_id)}/${esc(derivative.generated_asset_id)}/content`;
}

function selectSource(source) {
  selectedSource = source;
  currentDerivative = null;
  sourcePreview.src = sourceUrl(source);
  darkPreview.removeAttribute("src");
  generateButton.disabled = false;
  passArchiveButton.disabled = true;
  failButton.disabled = true;
  saveNoteButton.disabled = true;
  renderSources();
  log(`已选择 ${source.filename}`);
}

function renderSources() {
  sourcesEl.replaceChildren();
  for (const source of sources) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `source${selectedSource?.asset_id === source.asset_id ? " active" : ""}`;
    const image = document.createElement("img");
    image.src = sourceUrl(source);
    image.alt = source.filename;
    const title = document.createElement("b");
    title.textContent = source.filename;
    const meta = document.createElement("small");
    meta.textContent = `F VERIFIED · ${source.archived_at || ""}`;
    button.append(image, title, meta);
    button.addEventListener("click", () => selectSource(source));
    sourcesEl.append(button);
  }
}

async function refreshSources() {
  const site = siteInput.value.trim();
  const sku = skuInput.value.trim();
  if (!site || !sku) return;
  log("读取 VERIFIED SC01 Cutout…");
  const rows = await json(`/api/archive?site_id=${esc(site)}&item_id=${esc(sku)}`);
  sources = rows
    .filter((row) => row.workflow_code === "SC01" && row.destination_key === "cutout" && row.result === "VERIFIED_ARCHIVE")
    .sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
  if (!sources.length) throw new Error("当前 SKU 没有 VERIFIED SC01 Cutout");
  selectSource(sources[0]);
  log(`已读取 ${sources.length} 个 VERIFIED Cutout，默认选择最新正式源。`);
}

async function generate() {
  if (!selectedSource) return;
  generateButton.disabled = true;
  log("正在从 VERIFIED SC01 F 正式源生成 SD01…");
  try {
    const result = await json("/api/dark-derivatives/SD01/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site_id: siteInput.value.trim(),
        item_id: skuInput.value.trim(),
        source_asset_ids: [selectedSource.asset_id],
      }),
    });
    const row = result.results?.[0];
    if (!row?.ok || !row.derivative) throw new Error(row?.error || "SD01_GENERATION_FAILED");
    currentDerivative = row.derivative;
    darkPreview.src = `${darkUrl(currentDerivative)}?t=${Date.now()}`;
    noteInput.value = "";
    passArchiveButton.disabled = false;
    failButton.disabled = false;
    saveNoteButton.disabled = false;
    log(`生成完成：${currentDerivative.generated_filename} · ${currentDerivative.width}×${currentDerivative.height} · #171B20`);
    log("请确认 Exact Piece、轮廓/孔洞/细枝、木材颜色与冻结样式均正常。正确后再通过并归档。");
  } finally {
    generateButton.disabled = false;
  }
}

async function decide(decision) {
  if (!currentDerivative) return null;
  const derivative = await json(`/api/dark-derivatives/qa/${esc(currentDerivative.generated_asset_id)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      site_id: currentDerivative.site_id,
      item_id: currentDerivative.item_id,
      decision,
      note: noteInput.value,
    }),
  });
  currentDerivative = derivative.derivative;
  return derivative;
}

async function passAndArchive() {
  if (!currentDerivative) return;
  passArchiveButton.disabled = true;
  failButton.disabled = true;
  saveNoteButton.disabled = true;
  try {
    await decide("PASS");
    log("QA 已通过，开始 Gate15 destinations.dark 正式归档…");
    const path = `/api/dark-derivatives/archive/${esc(currentDerivative.site_id)}/${esc(currentDerivative.item_id)}/${esc(currentDerivative.generated_asset_id)}`;
    const first = await json(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    log(`正式归档完成：${first.archive.filename} · F verified · D staging delete-last`);
    const retry = await json(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (retry.archive?.asset_id !== currentDerivative.generated_asset_id) throw new Error("SD01_IDEMPOTENT_RETRY_IDENTITY_MISMATCH");
    log("Gate15 幂等重试 PASS：未新增 Manifest 重复历史，正式资产 identity 保持一致。");
  } catch (error) {
    passArchiveButton.disabled = false;
    failButton.disabled = false;
    saveNoteButton.disabled = false;
    throw error;
  }
}

async function fail() {
  await decide("FAIL");
  log("已标记不通过；D staging 保留用于诊断，不会写入 F。");
}

async function saveNote() {
  await decide("NOTE");
  log("审核备注已保存。");
}

document.querySelector("#refresh").addEventListener("click", () => refreshSources().catch((error) => log(`错误：${error.message}`)));
generateButton.addEventListener("click", () => generate().catch((error) => log(`错误：${error.message}`)));
passArchiveButton.addEventListener("click", () => passAndArchive().catch((error) => log(`错误：${error.message}`)));
failButton.addEventListener("click", () => fail().catch((error) => log(`错误：${error.message}`)));
saveNoteButton.addEventListener("click", () => saveNote().catch((error) => log(`错误：${error.message}`)));

refreshSources().catch((error) => log(`错误：${error.message}`));
