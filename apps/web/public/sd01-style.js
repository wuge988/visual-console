const API = "http://127.0.0.1:4179";
const siteId = "drift-curio";

const $ = (id) => document.getElementById(id);
const skuInput = $("sku");
const sourceSelect = $("source");
const status = $("status");
const sourceMeta = $("sourceMeta");
const reload = $("reload");

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

async function fetchJson(path) {
  const response = await fetch(`${API}${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body;
}

function imageUrl(sku, assetId) {
  return `${API}/api/archive/assets/${encodeURIComponent(siteId)}/${encodeURIComponent(sku)}/${encodeURIComponent(assetId)}/content`;
}

function renderSource(option) {
  if (!option) {
    document.querySelectorAll(".piece").forEach((img) => img.removeAttribute("src"));
    sourceMeta.textContent = "没有 VERIFIED SC01 Cutout 可用于风格审阅。";
    return;
  }
  const sku = skuInput.value.trim();
  const url = imageUrl(sku, option.asset_id);
  document.querySelectorAll(".piece").forEach((img) => {
    img.src = url;
    img.alt = `${option.filename} · VERIFIED SC01 Cutout`; 
  });
  sourceMeta.textContent = `${option.filename} · ${option.sha256.slice(0, 12)}… · ${Math.max(1, Math.round(option.size_bytes / 1024))} KB · archived ${option.archived_at}`;
}

async function loadSources() {
  const sku = skuInput.value.trim();
  if (!sku) return;
  reload.disabled = true;
  setStatus("正在读取 VERIFIED SC01 archive…");
  try {
    const rows = await fetchJson(`/api/archive?site_id=${encodeURIComponent(siteId)}&item_id=${encodeURIComponent(sku)}`);
    const sources = rows
      .filter((row) => row.workflow_code === "SC01" && row.destination_key === "cutout" && row.result === "VERIFIED_ARCHIVE")
      .sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));

    sourceSelect.innerHTML = "";
    for (const source of sources) {
      const option = document.createElement("option");
      option.value = source.asset_id;
      option.textContent = source.filename;
      option.dataset.record = JSON.stringify(source);
      sourceSelect.append(option);
    }

    if (!sources.length) {
      setStatus("没有 VERIFIED SC01 Cutout", "bad");
      renderSource(null);
      return;
    }

    setStatus(`已读取 ${sources.length} 个 VERIFIED Cutout · 只读`, "good");
    renderSource(sources[0]);
  } catch (error) {
    setStatus(`读取失败：${error?.message || error}`, "bad");
    sourceSelect.innerHTML = "";
    renderSource(null);
  } finally {
    reload.disabled = false;
  }
}

sourceSelect.addEventListener("change", () => {
  const selected = sourceSelect.selectedOptions[0];
  if (!selected?.dataset.record) return;
  renderSource(JSON.parse(selected.dataset.record));
});

reload.addEventListener("click", loadSources);
skuInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void loadSources();
});

void loadSources();
