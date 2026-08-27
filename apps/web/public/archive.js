const API = "http://127.0.0.1:4179";
const SITE = "drift-curio";
const state = { jobs: [], archives: new Map(), selected: new Set(), busy: false };
const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function sku() {
  return $("sku").value.trim().toUpperCase();
}

function toast(message, bad = false) {
  const el = $("toast");
  el.hidden = false;
  el.classList.toggle("bad", bad);
  el.textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 4200);
}

async function getJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
  return body;
}

function pendingJobs() {
  return state.jobs.filter(
    (job) =>
      job.state === "QA_PASS" &&
      job.generated_asset_id &&
      !state.archives.has(job.generated_asset_id),
  );
}

function stagingUrl(job) {
  return `${API}/api/assets/generated/${encodeURIComponent(SITE)}/${encodeURIComponent(sku())}/${encodeURIComponent(job.generated_asset_id)}/content`;
}

function archivedUrl(job) {
  return `${API}/api/archive/assets/${encodeURIComponent(SITE)}/${encodeURIComponent(sku())}/${encodeURIComponent(job.generated_asset_id)}/content`;
}

function render() {
  const approved = state.jobs.filter((job) => job.state === "QA_PASS" && job.generated_asset_id);
  const pending = pendingJobs();
  $("approved").textContent = String(approved.length);
  $("pending").textContent = String(pending.length);
  $("archived").textContent = String(state.archives.size);
  $("selected").textContent = String(state.selected.size);
  $("archiveSelected").disabled = !state.selected.size || state.busy;
  $("archiveSelected").textContent = `${state.busy ? "归档中…" : "归档已选"} · ${state.selected.size}`;
  $("selectAll").checked = pending.length > 0 && pending.every((job) => state.selected.has(job.generated_asset_id));

  const cards = [...approved].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  $("grid").innerHTML = cards.length
    ? cards.map((job) => {
        const archived = state.archives.has(job.generated_asset_id);
        const checked = state.selected.has(job.generated_asset_id);
        const assetId = escapeHtml(job.generated_asset_id);
        return `<article class="card">
          ${archived ? "" : `<input class="pick" type="checkbox" data-pick="${assetId}" ${checked ? "checked" : ""} />`}
          <div class="media"><img src="${archived ? archivedUrl(job) : stagingUrl(job)}" alt="${escapeHtml(job.generated_filename)}" /></div>
          <div class="meta">
            <b>${escapeHtml(job.generated_filename)}</b>
            <small>${assetId}</small>
            <span class="state ${archived ? "archived" : ""}">${archived ? "已归档 · F 正式资产" : "通过 · 待归档"}</span>
            ${archived ? "" : `<button class="archive-one" data-archive="${assetId}">正式归档</button>`}
          </div>
        </article>`;
      }).join("")
    : `<div class="empty">当前没有 QA_PASS 的 SC01 Master。</div>`;

  document.querySelectorAll("[data-pick]").forEach((element) => {
    element.addEventListener("change", () => {
      const id = element.dataset.pick;
      if (element.checked) state.selected.add(id);
      else state.selected.delete(id);
      render();
    });
  });
  document.querySelectorAll("[data-archive]").forEach((element) => {
    element.addEventListener("click", () => archiveOne(element.dataset.archive));
  });
}

async function refresh() {
  try {
    const query = `?site_id=${encodeURIComponent(SITE)}&item_id=${encodeURIComponent(sku())}`;
    const [jobs, archives] = await Promise.all([
      getJson(`${API}/api/jobs${query}`),
      getJson(`${API}/api/archive${query}`),
    ]);
    state.jobs = jobs;
    state.archives = new Map(archives.map((archive) => [archive.asset_id, archive]));
    const valid = new Set(pendingJobs().map((job) => job.generated_asset_id));
    state.selected = new Set([...state.selected].filter((id) => valid.has(id)));
    render();
  } catch (error) {
    toast(`读取失败：${error.message}`, true);
  }
}

async function archiveOne(assetId) {
  if (!assetId || state.busy) return;
  state.busy = true;
  render();
  try {
    await getJson(
      `${API}/api/archive/${encodeURIComponent(SITE)}/${encodeURIComponent(sku())}/${encodeURIComponent(assetId)}`,
      { method: "POST" },
    );
    state.selected.delete(assetId);
    toast("正式归档完成：正式资产已校验，暂存副本已按 Gate 15 规则清理");
    await refresh();
  } catch (error) {
    toast(`归档失败：${error.message}`, true);
  } finally {
    state.busy = false;
    render();
  }
}

async function archiveBatch() {
  const assetIds = [...state.selected];
  if (!assetIds.length || state.busy) return;
  state.busy = true;
  render();
  try {
    const result = await getJson(`${API}/api/archive/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: SITE, item_id: sku(), asset_ids: assetIds }),
    });
    const failed = result.results.filter((row) => !row.ok);
    toast(
      failed.length
        ? `完成 ${assetIds.length - failed.length} 项，失败 ${failed.length} 项：${failed.map((row) => row.error).join("；")}`
        : `批量归档完成 ${assetIds.length} 项`,
      Boolean(failed.length),
    );
    state.selected.clear();
    await refresh();
  } catch (error) {
    toast(`批量归档失败：${error.message}`, true);
  } finally {
    state.busy = false;
    render();
  }
}

$("refresh").addEventListener("click", refresh);
$("sku").addEventListener("change", () => {
  state.selected.clear();
  refresh();
});
$("selectAll").addEventListener("change", (event) => {
  state.selected = event.target.checked
    ? new Set(pendingJobs().map((job) => job.generated_asset_id))
    : new Set();
  render();
});
$("archiveSelected").addEventListener("click", archiveBatch);
refresh();
