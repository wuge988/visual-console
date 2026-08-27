(() => {
  "use strict";

  const API = "http://127.0.0.1:4179";
  const els = {
    site: document.querySelector("#site"),
    sku: document.querySelector("#sku"),
    refresh: document.querySelector("#refresh"),
    sources: document.querySelector("#sources"),
    generate: document.querySelector("#generate"),
    sourcePreview: document.querySelector("#sourcePreview"),
    whitePreview: document.querySelector("#whitePreview"),
    note: document.querySelector("#note"),
    passArchive: document.querySelector("#passArchive"),
    fail: document.querySelector("#fail"),
    saveNote: document.querySelector("#saveNote"),
    status: document.querySelector("#status"),
  };

  let sources = [];
  let selectedSource = null;
  let currentDerivative = null;

  function appendStatus(message, kind = "") {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    if (kind) line.className = kind;
    line.textContent = `[${time}] ${message}`;
    els.status.append(line);
    els.status.scrollTop = els.status.scrollHeight;
  }

  function clearStatus(message) {
    els.status.textContent = "";
    appendStatus(message);
  }

  async function api(path, init) {
    const response = await fetch(`${API}${path}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
    return body;
  }

  function context() {
    const site = String(els.site.value || "").trim();
    const sku = String(els.sku.value || "").trim();
    if (!site || !sku) throw new Error("Site 和 SKU 不能为空");
    return { site, sku };
  }

  function archivePreviewUrl(source) {
    const { site, sku } = context();
    return `${API}/api/archive/assets/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(source.asset_id)}/content`;
  }

  function derivativePreviewUrl(derivative) {
    const { site, sku } = context();
    return `${API}/api/derivatives/assets/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(derivative.generated_asset_id)}/content?ts=${Date.now()}`;
  }

  function resetDerivative() {
    currentDerivative = null;
    els.whitePreview.removeAttribute("src");
    els.note.value = "";
    els.passArchive.disabled = true;
    els.fail.disabled = true;
    els.saveNote.disabled = true;
  }

  function chooseSource(source) {
    selectedSource = source;
    resetDerivative();
    els.sourcePreview.src = archivePreviewUrl(source);
    els.generate.disabled = false;
    renderSources();
    appendStatus(`已选择 ${source.filename}`, "ok");
  }

  function renderSources() {
    els.sources.textContent = "";
    if (!sources.length) {
      const empty = document.createElement("p");
      empty.textContent = "没有找到 P3 VERIFIED_ARCHIVE 的 SC01 Cutout。";
      els.sources.append(empty);
      els.generate.disabled = true;
      return;
    }
    for (const source of sources) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `source${selectedSource?.asset_id === source.asset_id ? " active" : ""}`;
      const img = document.createElement("img");
      img.src = archivePreviewUrl(source);
      img.alt = source.filename;
      const name = document.createElement("b");
      name.textContent = source.filename;
      const meta = document.createElement("small");
      meta.textContent = `${Math.round(Number(source.size_bytes || 0) / 1024)} KB · ${String(source.sha256 || "").slice(0, 10)}…`;
      button.append(img, name, meta);
      button.addEventListener("click", () => chooseSource(source));
      els.sources.append(button);
    }
  }

  async function refreshSources() {
    const { site, sku } = context();
    selectedSource = null;
    resetDerivative();
    els.sourcePreview.removeAttribute("src");
    els.generate.disabled = true;
    clearStatus("读取 P3 正式归档记录…");
    const records = await api(`/api/archive?site_id=${encodeURIComponent(site)}&item_id=${encodeURIComponent(sku)}`);
    sources = records.filter(
      (row) => row.workflow_code === "SC01" && row.destination_key === "cutout" && row.result === "VERIFIED_ARCHIVE",
    );
    sources.sort((a, b) => String(b.archived_at || "").localeCompare(String(a.archived_at || "")));
    renderSources();
    appendStatus(`找到 ${sources.length} 个可作为 SW01 正式源的 Cutout。`, sources.length ? "ok" : "warn");
  }

  async function generate() {
    if (!selectedSource) return;
    const { site, sku } = context();
    els.generate.disabled = true;
    resetDerivative();
    appendStatus("正在从 VERIFIED SC01 Cutout 生成 SW01…");
    try {
      const result = await api("/api/derivatives/SW01/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_id: site, item_id: sku, source_asset_ids: [selectedSource.asset_id] }),
      });
      const row = result?.results?.[0];
      if (!row?.ok || !row?.derivative) throw new Error(row?.error || "SW01_GENERATION_FAILED");
      currentDerivative = row.derivative;
      els.whitePreview.src = derivativePreviewUrl(currentDerivative);
      els.passArchive.disabled = false;
      els.fail.disabled = false;
      els.saveNote.disabled = false;
      appendStatus(
        `生成完成：${currentDerivative.generated_filename} · ${currentDerivative.width}×${currentDerivative.height} · ${String(currentDerivative.generated_sha256 || "").slice(0, 12)}…`,
        "ok",
      );
      appendStatus("请人工比较左侧透明 Master 与右侧白底图；确认形态/边缘无异常后再通过归档。", "warn");
    } finally {
      els.generate.disabled = !selectedSource;
    }
  }

  async function qaDecision(decision) {
    if (!currentDerivative) throw new Error("尚未生成 SW01");
    const { site, sku } = context();
    const result = await api(`/api/derivatives/qa/${encodeURIComponent(currentDerivative.generated_asset_id)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: site, item_id: sku, decision, note: String(els.note.value || "") }),
    });
    currentDerivative = result.derivative;
    return result.derivative;
  }

  async function passAndArchive() {
    if (!currentDerivative) return;
    const { site, sku } = context();
    els.passArchive.disabled = true;
    els.fail.disabled = true;
    els.saveNote.disabled = true;
    try {
      if (currentDerivative.state !== "QA_PASS") {
        await qaDecision("PASS");
        appendStatus("QA 已通过，开始 Gate15 白底正式归档…", "ok");
      }
      const result = await api(
        `/api/derivatives/archive/${encodeURIComponent(site)}/${encodeURIComponent(sku)}/${encodeURIComponent(currentDerivative.generated_asset_id)}`,
        { method: "POST" },
      );
      appendStatus(
        `正式归档完成：${result.archive.filename} · F verified · D staging delete-last`,
        "ok",
      );
      currentDerivative = { ...currentDerivative, archived: true, state: "QA_PASS" };
      els.whitePreview.src = derivativePreviewUrl(currentDerivative);
      els.passArchive.disabled = false;
      els.passArchive.textContent = "再次验证幂等归档";
      els.fail.disabled = true;
      els.saveNote.disabled = true;
    } catch (error) {
      appendStatus(`通过/归档失败：${error.message || error}`, "bad");
      els.passArchive.disabled = false;
      els.fail.disabled = false;
      els.saveNote.disabled = false;
      throw error;
    }
  }

  async function fail() {
    if (!currentDerivative) return;
    await qaDecision("FAIL");
    appendStatus("已标记 SW01 未通过；D staging 保留，不进入 F。", "warn");
  }

  async function saveNote() {
    if (!currentDerivative) return;
    await qaDecision("NOTE");
    appendStatus("审核备注已保存。", "ok");
  }

  async function safeRun(operation) {
    try {
      await operation();
    } catch (error) {
      appendStatus(`错误：${error.message || error}`, "bad");
    }
  }

  els.refresh.addEventListener("click", () => safeRun(refreshSources));
  els.generate.addEventListener("click", () => safeRun(generate));
  els.passArchive.addEventListener("click", () => safeRun(passAndArchive));
  els.fail.addEventListener("click", () => safeRun(fail));
  els.saveNote.addEventListener("click", () => safeRun(saveNote));
  els.site.addEventListener("change", () => safeRun(refreshSources));
  els.sku.addEventListener("change", () => safeRun(refreshSources));

  safeRun(refreshSources);
})();
