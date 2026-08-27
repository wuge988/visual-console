<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

type RoutePath = "/workspace" | "/workflows" | "/jobs" | "/qa" | "/assets" | "/system";
type Site = { site_id: string; display_name: string; display_name_zh: string };
type RawAsset = {
  asset_id: string;
  filename: string;
  kind: "image" | "video" | "file";
  mime: string;
  size_bytes: number;
  modified_at: string;
  content_url: string;
};
type Workflow = {
  code: string;
  name_en: string;
  name_zh: string;
  asset_key: string;
  preset_status: string;
  workflow_status: string;
  executable: boolean;
  workflow_hash?: string;
  registered_at?: string;
  frozen_runtime?: Record<string, unknown>;
};
type Job = {
  job_id: string;
  site_id: string;
  item_id: string;
  workflow_code: string;
  source_asset_id: string;
  source_filename?: string;
  state: string;
  created_at: string;
  updated_at: string;
  prompt_id?: string;
  workflow_hash?: string;
  generated_asset_id?: string;
  generated_filename?: string;
  generated_sha256?: string;
  generated_size_bytes?: number;
  version?: number;
  qa_note?: string;
  error?: string;
};
type ArchiveRecord = {
  asset_id: string;
  filename: string;
  archived_at: string;
  size_bytes: number;
  sha256: string;
  result: "VERIFIED_ARCHIVE";
};
type Preview = { title: string; url: string; kind: "image" | "video" };

const P2_API = "http://127.0.0.1:4179";
const NAV: Array<{ path: RoutePath; label: string }> = [
  { path: "/workspace", label: "工作台" },
  { path: "/workflows", label: "工作流" },
  { path: "/jobs", label: "任务队列" },
  { path: "/qa", label: "质量审核" },
  { path: "/assets", label: "素材资产" },
  { path: "/system", label: "系统状态" },
];

function normalizeRoute(path: string): RoutePath {
  return NAV.some((item) => item.path === path) ? (path as RoutePath) : "/workspace";
}

const route = ref<RoutePath>(normalizeRoute(window.location.pathname));
const health = ref<any>(null);
const p2Online = ref(false);
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const sku = ref("DC-ZY-SZ-31001");
const mobileSession = ref<any>(null);
const rawAssets = ref<RawAsset[]>([]);
const workflows = ref<Workflow[]>([]);
const jobs = ref<Job[]>([]);
const qaItems = ref<Job[]>([]);
const archives = ref<ArchiveRecord[]>([]);
const systemStatus = ref<any>(null);
const creatingSession = ref(false);
const loadingAssets = ref(false);
const importingWorkflow = ref(false);
const runningBatch = ref(false);
const trashing = ref(new Set<string>());
const selectedRaw = ref(new Set<string>());
const selectedQa = ref(new Set<string>());
const activeQaId = ref("");
const qaView = ref<"PENDING" | "FAILED">("PENDING");
const qaBackground = ref<"red" | "black" | "white" | "checker">("checker");
const qaZoom = ref<"fit" | 1 | 2 | 4>("fit");
const qaShowOriginal = ref(false);
const qaNote = ref("");
const panX = ref(0);
const panY = ref(0);
const assetFilter = ref<"ALL" | "RAW" | "QA_PENDING" | "QA_PASS" | "QA_FAIL" | "ARCHIVED">("ALL");
const preview = ref<Preview | null>(null);
const toast = ref("");
let pollTimer: number | undefined;
let toastTimer: number | undefined;
let dragging = false;
let dragX = 0;
let dragY = 0;
let panStartX = 0;
let panStartY = 0;

const sc01 = computed(() => workflows.value.find((x) => x.code === "SC01"));
const executableWorkflowCount = computed(() => workflows.value.filter((x) => x.executable).length);
const activeQueueCount = computed(() => jobs.value.filter((x) => ["READY", "QUEUED", "RUNNING", "GENERATED"].includes(x.state)).length);
const pendingReviewItems = computed(() => qaItems.value.filter((x) => x.state === "QA_PENDING"));
const failedReviewItems = computed(() => qaItems.value.filter((x) => x.state === "QA_FAIL"));
const reviewItems = computed(() => qaView.value === "FAILED" ? failedReviewItems.value : pendingReviewItems.value);
const pendingQaCount = computed(() => pendingReviewItems.value.length);
const generatedJobs = computed(() => jobs.value.filter((x) => Boolean(x.generated_asset_id)));
const archivedAssetIds = computed(() => new Set(archives.value.map((archive) => archive.asset_id)));
const archiveReadyCount = computed(() => jobs.value.filter((x) => x.state === "QA_PASS" && !isArchivedJob(x)).length);
const failedJobCount = computed(() => jobs.value.filter((x) => x.state.startsWith("FAILED_") || x.state === "QA_FAIL").length);
const activeQa = computed(() => reviewItems.value.find((x) => x.generated_asset_id === activeQaId.value) ?? reviewItems.value[0]);
const latestJobs = computed(() => jobs.value.slice(0, 3));
const compatibleRaw = computed(() => rawAssets.value.filter(isSc01Compatible));
const selectedCompatibleCount = computed(() => [...selectedRaw.value].filter((id) => compatibleRaw.value.some((asset) => asset.asset_id === id)).length);
const assetCount = computed(() => rawAssets.value.length + generatedJobs.value.length);
const allPendingSelected = computed(() => qaView.value === "PENDING" && pendingReviewItems.value.length > 0 && pendingReviewItems.value.every((item) => item.generated_asset_id && selectedQa.value.has(item.generated_asset_id)));
const filteredRawAssets = computed(() => assetFilter.value === "ALL" || assetFilter.value === "RAW" ? rawAssets.value : []);
const filteredGenerated = computed(() => {
  if (assetFilter.value === "ALL") return generatedJobs.value;
  if (assetFilter.value === "RAW") return [];
  if (assetFilter.value === "ARCHIVED") return generatedJobs.value.filter(isArchivedJob);
  if (assetFilter.value === "QA_PASS") {
    return generatedJobs.value.filter((job) => job.state === "QA_PASS" && !isArchivedJob(job));
  }
  return generatedJobs.value.filter((job) => job.state === assetFilter.value);
});
const qaImageStyle = computed(() => {
  const translate = `translate(${panX.value}px, ${panY.value}px)`;
  if (qaZoom.value === "fit") {
    return {
      width: "auto",
      height: "auto",
      maxWidth: "100%",
      maxHeight: "100%",
      transform: translate,
      transformOrigin: "center center",
    };
  }
  return {
    width: "auto",
    height: "auto",
    maxWidth: "none",
    maxHeight: "none",
    transform: `${translate} scale(${qaZoom.value})`,
    transformOrigin: "center center",
  };
});

function readable(bytes: number | undefined) {
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function stateLabel(state: string) {
  const labels: Record<string, string> = {
    READY: "准备",
    QUEUED: "排队中",
    RUNNING: "运行中",
    GENERATED: "已生成",
    CAPTURED: "已捕获",
    QA_PENDING: "待审核",
    QA_PASS: "通过 · 待归档",
    QA_FAIL: "未通过",
    FAILED_SUBMIT: "提交失败",
    FAILED_RUNTIME: "运行失败",
    FAILED_CAPTURE: "捕获失败",
    FAILED_QA: "审核失败",
  };
  return labels[state] ?? state;
}

function isArchivedJob(job: Job) {
  return Boolean(job.generated_asset_id && archivedAssetIds.value.has(job.generated_asset_id));
}

function generatedStateLabel(job: Job) {
  return isArchivedJob(job) ? "已归档 · F 正式资产" : stateLabel(job.state);
}

function workflowStateLabel(workflow: Workflow) {
  if (workflow.executable && workflow.workflow_status === "REGISTERED") return "已注册 · 可执行";
  if (workflow.workflow_status === "REGISTERED") return "已注册 · 当前站点未启用";
  if (workflow.workflow_status === "UNREGISTERED_SOURCE_WORKFLOW") return "已有捕获证据 · 待正式绑定";
  return "待绑定";
}

function showToast(message: string) {
  toast.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = ""; }, 3200);
}

async function p2Fetch(path: string, init?: RequestInit) {
  const response = await fetch(`${P2_API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body;
}

function navigate(path: RoutePath) {
  if (route.value === path) return;
  window.history.pushState({}, "", path);
  route.value = path;
  void refreshP2();
}

function onPopState() {
  route.value = normalizeRoute(window.location.pathname);
  void refreshP2();
}

function isSc01Compatible(asset: RawAsset) {
  return asset.kind === "image" && ["image/jpeg", "image/png", "image/webp"].includes(asset.mime);
}

function toggleRaw(assetId: string) {
  const next = new Set(selectedRaw.value);
  if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
  selectedRaw.value = next;
}

function toggleQa(assetId: string) {
  if (qaView.value !== "PENDING") return;
  const next = new Set(selectedQa.value);
  if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
  selectedQa.value = next;
}

function toggleAllQa() {
  if (qaView.value !== "PENDING") return;
  if (allPendingSelected.value) {
    selectedQa.value = new Set();
    return;
  }
  selectedQa.value = new Set(pendingReviewItems.value.map((item) => item.generated_asset_id).filter((id): id is string => Boolean(id)));
}

function setQaView(view: "PENDING" | "FAILED") {
  qaView.value = view;
  selectedQa.value = new Set();
  const first = view === "FAILED" ? failedReviewItems.value[0] : pendingReviewItems.value[0];
  activeQaId.value = first?.generated_asset_id ?? "";
  qaNote.value = first?.qa_note ?? "";
  qaShowOriginal.value = false;
  qaZoom.value = "fit";
  panX.value = 0;
  panY.value = 0;
}

async function refreshRawAssets() {
  if (!sku.value) return;
  loadingAssets.value = true;
  try {
    const url = `/api/items/${encodeURIComponent(currentSite.value)}/${encodeURIComponent(sku.value)}/raw-assets`;
    const response = await fetch(url);
    rawAssets.value = response.ok ? await response.json() : [];
    const validIds = new Set(rawAssets.value.map((asset) => asset.asset_id));
    selectedRaw.value = new Set([...selectedRaw.value].filter((id) => validIds.has(id)));
  } finally {
    loadingAssets.value = false;
  }
}

async function refreshP2() {
  const query = `?site_id=${encodeURIComponent(currentSite.value)}&item_id=${encodeURIComponent(sku.value)}`;
  try {
    const [workflowData, jobData, qaData, archiveData, status] = await Promise.all([
      p2Fetch(`/api/workflows?site_id=${encodeURIComponent(currentSite.value)}`),
      p2Fetch(`/api/jobs${query}`),
      p2Fetch(`/api/qa${query}`),
      p2Fetch(`/api/archive${query}`),
      p2Fetch(`/api/system/status?site_id=${encodeURIComponent(currentSite.value)}`),
    ]);
    workflows.value = workflowData;
    jobs.value = jobData;
    qaItems.value = qaData;
    archives.value = archiveData;
    systemStatus.value = status;
    p2Online.value = true;

    const pendingIds = new Set((qaData as Job[]).filter((item) => item.state === "QA_PENDING").map((item) => item.generated_asset_id).filter(Boolean) as string[]);
    const failedIds = new Set((qaData as Job[]).filter((item) => item.state === "QA_FAIL").map((item) => item.generated_asset_id).filter(Boolean) as string[]);
    selectedQa.value = new Set([...selectedQa.value].filter((id) => pendingIds.has(id)));
    const visibleIds = qaView.value === "FAILED" ? failedIds : pendingIds;
    if (!activeQaId.value || !visibleIds.has(activeQaId.value)) {
      activeQaId.value = (qaData as Job[]).find((item) => item.state === (qaView.value === "FAILED" ? "QA_FAIL" : "QA_PENDING"))?.generated_asset_id ?? "";
    }
  } catch {
    p2Online.value = false;
  }
}

async function refreshAll() {
  health.value = await fetch("/api/health").then((r) => r.json()).catch(() => null);
  sites.value = await fetch("/api/sites").then((r) => r.json()).catch(() => []);
  await Promise.all([refreshRawAssets(), refreshP2()]);
}

async function createMobileSession() {
  creatingSession.value = true;
  try {
    const response = await fetch("/api/mobile/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: currentSite.value, item_id: sku.value, sku: sku.value }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "SESSION_FAILED");
    mobileSession.value = body;
  } catch (error: any) {
    showToast(`生成手机上传二维码失败：${error?.message ?? error}`);
  } finally {
    creatingSession.value = false;
  }
}

async function trashAsset(asset: RawAsset) {
  if (trashing.value.has(asset.asset_id)) return;
  trashing.value.add(asset.asset_id);
  trashing.value = new Set(trashing.value);
  try {
    const response = await fetch("/trash-api/assets/raw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: currentSite.value, item_id: sku.value, asset_id: asset.asset_id }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "TRASH_FAILED");
    rawAssets.value = rawAssets.value.filter((x) => x.asset_id !== asset.asset_id);
    const next = new Set(selectedRaw.value); next.delete(asset.asset_id); selectedRaw.value = next;
    showToast(`已移入回收区：${asset.filename}`);
  } catch (error: any) {
    showToast(`删除失败：${error?.message ?? error}`);
  } finally {
    trashing.value.delete(asset.asset_id);
    trashing.value = new Set(trashing.value);
  }
}

async function importSc01(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  importingWorkflow.value = true;
  try {
    if (file.size > 512 * 1024) throw new Error("JSON 超过 512 KiB 限制");
    const parsed = JSON.parse(await file.text());
    const result = await p2Fetch(`/api/workflows/SC01/register?site_id=${encodeURIComponent(currentSite.value)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed),
    });
    showToast(`SC01 已注册：${String(result.workflow_hash).slice(0, 12)}…`);
    await refreshP2();
  } catch (error: any) {
    showToast(`SC01 注册失败：${error?.message ?? error}`);
  } finally {
    importingWorkflow.value = false;
  }
}

async function runSc01() {
  if (!selectedCompatibleCount.value) return;
  runningBatch.value = true;
  try {
    const result = await p2Fetch("/api/jobs/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site_id: currentSite.value,
        item_id: sku.value,
        sku: sku.value,
        workflow_code: "SC01",
        asset_ids: [...selectedRaw.value],
      }),
    });
    selectedRaw.value = new Set();
    showToast(`已加入串行队列：${result.jobs?.length ?? 0} 个任务`);
    await refreshP2();
    navigate("/jobs");
  } catch (error: any) {
    showToast(`SC01 提交失败：${error?.message ?? error}`);
  } finally {
    runningBatch.value = false;
  }
}

function generatedUrl(job: Job) {
  if (!job.generated_asset_id) return "";
  const base = isArchivedJob(job) ? "/api/archive/assets" : "/api/assets/generated";
  return `${P2_API}${base}/${encodeURIComponent(job.site_id)}/${encodeURIComponent(job.item_id)}/${job.generated_asset_id}/content`;
}

function rawUrl(job: Job) {
  return `/api/assets/raw/${encodeURIComponent(job.site_id)}/${encodeURIComponent(job.item_id)}/${job.source_asset_id}/content`;
}

function chooseQa(item: Job) {
  activeQaId.value = item.generated_asset_id ?? "";
  qaNote.value = item.qa_note ?? "";
  qaShowOriginal.value = false;
  qaZoom.value = "fit";
  panX.value = 0;
  panY.value = 0;
}

async function qaDecision(decision: "PASS" | "FAIL" | "NOTE") {
  const item = activeQa.value;
  if (!item?.generated_asset_id) return;
  try {
    await p2Fetch(`/api/qa/${item.generated_asset_id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, note: qaNote.value }),
    });
    showToast(decision === "PASS" ? "审核通过：已移出当前审核列表，等待后续归档" : decision === "FAIL" ? "已标记不通过" : "备注已保存");
    await refreshP2();
  } catch (error: any) {
    showToast(`审核写入失败：${error?.message ?? error}`);
  }
}

async function retryJob(job: Job) {
  try {
    await p2Fetch(`/api/jobs/${job.job_id}/retry`, { method: "POST" });
    showToast("已创建新的 SC01 重试任务");
    await refreshP2();
    navigate("/jobs");
  } catch (error: any) {
    showToast(`重试失败：${error?.message ?? error}`);
  }
}

async function batchPass() {
  if (qaView.value !== "PENDING") return;
  const pendingIds = new Set(pendingReviewItems.value.map((item) => item.generated_asset_id).filter(Boolean) as string[]);
  const ids = [...selectedQa.value].filter((id) => pendingIds.has(id));
  if (!ids.length) return;
  try {
    for (const id of ids) {
      await p2Fetch(`/api/qa/${id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "PASS" }),
      });
    }
    selectedQa.value = new Set();
    showToast(`批量通过 ${ids.length} 个透明 Master`);
    await refreshP2();
  } catch (error: any) {
    showToast(`批量审核失败：${error?.message ?? error}`);
  }
}

function setZoom(value: "fit" | 1 | 2 | 4) {
  qaZoom.value = value;
  panX.value = 0;
  panY.value = 0;
}

function panStart(event: PointerEvent) {
  if (qaZoom.value === "fit") return;
  dragging = true;
  dragX = event.clientX;
  dragY = event.clientY;
  panStartX = panX.value;
  panStartY = panY.value;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function panMove(event: PointerEvent) {
  if (!dragging) return;
  panX.value = panStartX + event.clientX - dragX;
  panY.value = panStartY + event.clientY - dragY;
}

function panEnd() { dragging = false; }

function openRawPreview(asset: RawAsset) {
  if (asset.kind === "file" || /hei[cf]/i.test(asset.mime)) return;
  preview.value = { title: asset.filename, url: asset.content_url, kind: asset.kind === "video" ? "video" : "image" };
}

function openGeneratedPreview(job: Job) {
  if (!job.generated_asset_id) return;
  preview.value = { title: job.generated_filename ?? "SC01 Cutout", url: generatedUrl(job), kind: "image" };
}

watch([sku, currentSite], async () => {
  mobileSession.value = null;
  selectedRaw.value = new Set();
  selectedQa.value = new Set();
  qaView.value = "PENDING";
  await Promise.all([refreshRawAssets(), refreshP2()]);
});

watch(activeQa, (item) => {
  qaNote.value = item?.qa_note ?? "";
});

onMounted(async () => {
  if (window.location.pathname === "/" || !NAV.some((item) => item.path === window.location.pathname)) {
    window.history.replaceState({}, "", "/workspace");
    route.value = "/workspace";
  }
  window.addEventListener("popstate", onPopState);
  await refreshAll();
  pollTimer = window.setInterval(() => {
    void refreshRawAssets();
    void refreshP2();
  }, 2500);
});

onUnmounted(() => {
  window.removeEventListener("popstate", onPopState);
  if (pollTimer) window.clearInterval(pollTimer);
  if (toastTimer) window.clearTimeout(toastTimer);
});
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><strong>视觉生产控制台</strong><span>VISUAL CONSOLE</span></div>
      <nav>
        <button v-for="item in NAV" :key="item.path" :class="{ active: route === item.path }" @click="navigate(item.path)">
          <span>{{ item.label }}</span>
          <b v-if="item.path === '/workflows'">{{ executableWorkflowCount }}</b>
          <b v-else-if="item.path === '/jobs'">{{ activeQueueCount }}</b>
          <b v-else-if="item.path === '/qa'">{{ pendingQaCount }}</b>
          <b v-else-if="item.path === '/assets'">{{ assetCount }}</b>
        </button>
      </nav>
      <div class="system-card">
        <span>Core API</span><i>{{ health?.ok ? "在线" : "离线" }}</i>
        <span>P2 Control</span><i>{{ p2Online ? "在线" : "离线" }}</i>
        <span>LAN IP</span><i>{{ health?.lan_ip ?? "—" }}</i>
        <span>ComfyUI</span><i>{{ systemStatus?.comfyui?.online ? "在线" : "离线" }}</i>
      </div>
    </aside>

    <main>
      <header class="topbar">
        <b>视觉生产控制台</b>
        <div class="chips">
          <select v-model="currentSite" class="top-site-select">
            <option v-for="s in sites" :key="s.site_id" :value="s.site_id">{{ s.display_name }} / {{ s.display_name_zh }}</option>
          </select>
          <span>{{ sku }}</span>
          <span class="ok" :class="{ bad: !health?.ok }">{{ health?.ok ? "● 本地引擎就绪" : "● 本地引擎离线" }}</span>
        </div>
      </header>

      <section class="content">
        <template v-if="route === '/workspace'">
          <div class="page-title"><div><em>生产工作台 · P2</em><h1>当前 SKU 生产入口</h1><p>手机采集、RAW 选图、SC01 串行提交和生产状态集中在这里。</p></div></div>

          <div class="top-grid">
            <article class="card">
              <h3>当前生产上下文</h3>
              <label>当前 SKU / Item</label>
              <input v-model.trim="sku" />
              <div class="context-line"><span>执行工作流</span><b>{{ sc01?.executable ? 'SC01 · Static Cutout Master' : 'SC01 尚未注册' }}</b></div>
              <div class="hint">SC01 首批只接受 JPEG / PNG / WebP；HEIC/HEIF 保留为 RAW，但不会静默转换。</div>
            </article>

            <article class="card capture-card">
              <div class="capture-copy">
                <h3>手机采集</h3>
                <p>iPhone 与电脑处于同一 Wi‑Fi。二维码绑定当前 Site + SKU，默认有效 12 小时。</p>
                <button class="primary" :disabled="creatingSession" @click="createMobileSession">{{ creatingSession ? "生成中…" : "生成手机上传二维码" }}</button>
              </div>
              <div class="qr-slot">
                <template v-if="mobileSession"><img :src="mobileSession.qr_data_url" alt="手机上传二维码" /><small>12 小时有效</small></template>
                <template v-else><div class="qr-empty">QR</div><small>等待生成</small></template>
              </div>
            </article>
          </div>

          <article v-if="mobileSession" class="mobile-link"><b>手机上传地址</b><code>{{ mobileSession.mobile_url }}</code><span>{{ mobileSession.lan_interface }} · {{ mobileSession.lan_ip }} · 绑定 {{ mobileSession.item_id }}</span></article>

          <div class="section-heading"><div><h2>选择 RAW 运行 SC01</h2><p>勾选素材后按顺序串行执行，避免 8GB GPU 并发 OOM。</p></div><button class="primary" :disabled="!sc01?.executable || !selectedCompatibleCount || runningBatch" @click="runSc01">{{ runningBatch ? '提交中…' : `运行 SC01 · ${selectedCompatibleCount}` }}</button></div>
          <div v-if="rawAssets.length" class="source-strip">
            <article v-for="asset in rawAssets" :key="asset.asset_id" class="source-tile" :class="{ selected: selectedRaw.has(asset.asset_id), blocked: !isSc01Compatible(asset) }" @click="isSc01Compatible(asset) && toggleRaw(asset.asset_id)">
              <div class="media">
                <img v-if="asset.kind === 'image' && !/hei[cf]/i.test(asset.mime)" :src="asset.content_url" :alt="asset.filename" />
                <video v-else-if="asset.kind === 'video'" :src="asset.content_url" muted playsinline preload="metadata"></video>
                <div v-else class="placeholder">{{ /hei[cf]/i.test(asset.mime) ? 'HEIC' : asset.kind.toUpperCase() }}</div>
                <span class="select-dot">{{ selectedRaw.has(asset.asset_id) ? '✓' : isSc01Compatible(asset) ? '+' : '—' }}</span>
              </div>
              <b :title="asset.filename">{{ asset.filename }}</b><span>{{ isSc01Compatible(asset) ? '可运行 SC01' : 'RAW 保留 · 本轮不可执行' }}</span>
            </article>
          </div>
          <div v-else class="empty"><b>{{ loadingAssets ? '正在读取素材…' : '当前 SKU 尚无 RAW 素材' }}</b><span>可先使用手机采集。</span></div>

          <div class="workspace-lower workspace-lower-v2">
            <article class="card compact-card recent-card">
              <div class="section-heading small"><div><h3>最近任务</h3><p>最新 3 条，完整记录在任务队列。</p></div><button class="ghost" @click="navigate('/jobs')">全部任务</button></div>
              <div v-if="latestJobs.length" class="recent-jobs detailed">
                <div class="recent-jobs-head"><span>状态</span><span>来源 / Job</span><span>Prompt</span><span>输出</span><span>更新时间</span></div>
                <div v-for="job in latestJobs" :key="job.job_id" class="job-row detailed-row">
                  <span class="state" :data-state="job.state">{{ stateLabel(job.state) }}</span>
                  <span class="recent-source"><b>{{ job.source_filename ?? job.source_asset_id }}</b><small>{{ job.workflow_code }} · {{ job.job_id.slice(0, 8) }}…</small></span>
                  <span class="recent-prompt mono">{{ job.prompt_id ? job.prompt_id.slice(0, 10) + '…' : '—' }}</span>
                  <span class="recent-output" :title="job.generated_filename ?? ''">{{ job.generated_filename ?? '—' }}</span>
                  <time>{{ new Date(job.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</time>
                </div>
              </div>
              <div v-else class="mini-empty">还没有 P2 任务</div>
            </article>
            <article class="card compact-card production-dashboard"><div class="section-heading small"><div><h3>生产状态与素材</h3><p>待处理事项与当前 SKU 素材库存。</p></div></div><div class="dashboard-grid"><div><b>{{ activeQueueCount }}</b><span>队列活跃</span></div><div><b>{{ pendingQaCount }}</b><span>待审核</span></div><div><b>{{ archiveReadyCount }}</b><span>待归档</span></div><div><b>{{ failedJobCount }}</b><span>异常/未通过</span></div><div><b>{{ rawAssets.length }}</b><span>RAW 总数</span></div><div><b>{{ compatibleRaw.length }}</b><span>可执行 RAW</span></div><div><b>{{ rawAssets.length - compatibleRaw.length }}</b><span>保留 RAW</span></div><div><b>{{ generatedJobs.length }}</b><span>透明 Master</span></div></div></article>
          </div>
        </template>

        <template v-else-if="route === '/workflows'">
          <div class="page-title"><div><em>Workflow Registry</em><h1>工作流</h1><p>展示 13 个已定义 Preset；只有真实注册并通过绑定的工作流才计为可执行。</p></div><label class="primary file-button" :class="{ disabled: importingWorkflow }">{{ importingWorkflow ? '验证中…' : '导入 SC01 API Workflow JSON' }}<input type="file" accept=".json,application/json" :disabled="importingWorkflow" @change="importSc01" /></label></div>
          <div class="workflow-summary"><span><b>{{ workflows.length }}</b> 已定义</span><span><b>{{ executableWorkflowCount }}</b> 可执行</span><span><b>SC01</b> 本轮唯一允许执行</span></div>
          <div class="workflow-grid">
            <article v-for="workflow in workflows" :key="workflow.code" class="workflow-card" :class="{ executable: workflow.executable }">
              <div class="workflow-code">{{ workflow.code }}</div><div><h3>{{ workflow.name_zh }}</h3><p>{{ workflow.name_en }}</p><span class="status-pill">{{ workflowStateLabel(workflow) }}</span></div>
              <dl><div><dt>preset_status</dt><dd>{{ workflow.preset_status }}</dd></div><div><dt>workflow_status</dt><dd>{{ workflow.workflow_status }}</dd></div><div v-if="workflow.workflow_hash"><dt>hash</dt><dd>{{ workflow.workflow_hash.slice(0, 16) }}…</dd></div></dl>
              <div v-if="workflow.code === 'SC01'" class="frozen-box"><b>冻结生产参数</b><span>RMBG-2.0 · 1024 · sensitivity 1.00 · mask_offset -1 · Alpha</span></div>
            </article>
          </div>
        </template>

        <template v-else-if="route === '/jobs'">
          <div class="page-title"><div><em>Serial GPU Queue</em><h1>任务队列</h1><p>SC01 默认单任务占用 GPU；多素材按应用队列串行进入 ComfyUI。</p></div><button class="ghost" @click="refreshP2">刷新</button></div>
          <div class="queue-strip"><span><b>{{ activeQueueCount }}</b> 活跃</span><span><b>{{ pendingQaCount }}</b> 待审核</span><span><b>{{ jobs.filter(x => x.state.startsWith('FAILED_')).length }}</b> 失败</span></div>
          <div class="jobs-table"><div class="jobs-head"><span>状态</span><span>来源</span><span>Workflow</span><span>Prompt</span><span>输出</span><span>更新时间</span></div><div v-for="job in jobs" :key="job.job_id" class="jobs-line"><span><i class="state" :data-state="job.state">{{ stateLabel(job.state) }}</i></span><span><b>{{ job.source_filename ?? job.source_asset_id }}</b><small>{{ job.job_id }}</small></span><span>{{ job.workflow_code }}</span><span class="mono">{{ job.prompt_id ? job.prompt_id.slice(0, 12) + '…' : '—' }}</span><span>{{ job.generated_filename ?? '—' }}<small v-if="job.error" class="error-text">{{ job.error }}</small></span><span>{{ new Date(job.updated_at).toLocaleTimeString() }}</span></div><div v-if="!jobs.length" class="empty table-empty"><b>暂无任务</b><span>从工作台选择 RAW 后运行 SC01。</span></div></div>
        </template>

        <template v-else-if="route === '/qa'">
          <div class="page-title"><div><em>Dynamic Alpha QA</em><h1>质量审核</h1><p>待审核与“未通过”记录分开查看；未通过资产可重新打开、补充备注、改判通过或创建新的 SC01 重试。</p></div><button v-if="qaView === 'PENDING'" class="primary" :disabled="!selectedQa.size" @click="batchPass">批量通过 · {{ selectedQa.size }}</button></div>
          <div class="filter-strip"><button :class="{ active: qaView === 'PENDING' }" @click="setQaView('PENDING')">待审核 · {{ pendingReviewItems.length }}</button><button :class="{ active: qaView === 'FAILED' }" @click="setQaView('FAILED')">未通过 · {{ failedReviewItems.length }}</button></div>
          <div v-if="reviewItems.length" class="qa-layout">
            <aside class="qa-list">
              <div class="qa-list-head"><label v-if="qaView === 'PENDING'"><input type="checkbox" :checked="allPendingSelected" @change="toggleAllQa" /> 全选待审核</label><label v-else>未通过记录</label><span>{{ reviewItems.length }} 项</span></div>
              <button v-for="item in reviewItems" :key="item.generated_asset_id" :class="{ active: activeQa?.generated_asset_id === item.generated_asset_id }" @click="chooseQa(item)"><input v-if="qaView === 'PENDING'" type="checkbox" :checked="selectedQa.has(item.generated_asset_id!)" @click.stop="toggleQa(item.generated_asset_id!)" /><img :src="generatedUrl(item)" /><span><b>{{ item.generated_filename }}</b><small>{{ stateLabel(item.state) }}</small></span></button>
            </aside>
            <div class="qa-main">
              <div class="qa-toolbar"><div class="seg"><button v-for="mode in ['red','black','white','checker']" :key="mode" :class="{ active: qaBackground === mode }" @click="qaBackground = mode as any">{{ mode === 'red' ? '红' : mode === 'black' ? '黑' : mode === 'white' ? '白' : '棋盘格' }}</button></div><div class="seg"><button :class="{ active: qaZoom === 'fit' }" @click="setZoom('fit')">适应窗口</button><button v-for="z in [1,2,4]" :key="z" :class="{ active: qaZoom === z }" @click="setZoom(z as 1|2|4)">{{ z * 100 }}%</button></div><button class="ghost" @click="qaShowOriginal = !qaShowOriginal">{{ qaShowOriginal ? '显示 Master' : '原图 ↔ Master' }}</button></div>
              <div class="qa-stage" :class="[qaBackground, { zoomed: qaZoom !== 'fit' }]" @pointerdown="panStart" @pointermove="panMove" @pointerup="panEnd" @pointercancel="panEnd">
                <img v-if="activeQa" :src="qaShowOriginal ? rawUrl(activeQa) : generatedUrl(activeQa)" :style="qaImageStyle" draggable="false" />
              </div>
              <div class="qa-info"><div><b>{{ activeQa?.generated_filename }}</b><span>{{ activeQa ? stateLabel(activeQa.state) : '' }}</span></div><div class="qa-actions"><button class="pass" @click="qaDecision('PASS')">{{ qaView === 'FAILED' ? '改为通过' : '通过' }}</button><button class="fail" @click="qaDecision('FAIL')">不通过</button><button class="ghost" :disabled="!activeQa" @click="activeQa && retryJob(activeQa)">重试</button></div></div>
              <div class="note-row"><textarea v-model="qaNote" placeholder="审核备注，例如：右侧细枝有轻微白边"></textarea><button class="ghost" @click="qaDecision('NOTE')">保存备注</button></div>
            </div>
          </div>
          <div v-else class="empty"><b>{{ qaView === 'FAILED' ? '当前没有未通过的透明 Master' : '当前没有待审核的透明 Master' }}</b><span>{{ qaView === 'FAILED' ? '未通过资产会保留在素材资产的“未通过”筛选中。' : '已通过项目已移到素材资产的“通过 · 待归档”筛选中。' }}</span></div>
        </template>

        <template v-else-if="route === '/assets'">
          <div class="page-title"><div><em>Visual Asset Library</em><h1>素材资产</h1><p>RAW 来自 F；未归档 SC01 Cutout 来自 D staging；Gate 15 归档完成后从 F 正式资产读取。</p></div></div>
          <div class="filter-strip"><button v-for="f in ['ALL','RAW','QA_PENDING','QA_PASS','QA_FAIL','ARCHIVED']" :key="f" :class="{ active: assetFilter === f }" @click="assetFilter = f as any">{{ f === 'ALL' ? '全部' : f === 'RAW' ? 'RAW' : f === 'ARCHIVED' ? '已归档' : stateLabel(f) }}</button></div>
          <div class="asset-grid visual-grid">
            <article v-for="asset in filteredRawAssets" :key="asset.asset_id" class="asset-tile" @click="openRawPreview(asset)"><div class="media"><img v-if="asset.kind === 'image' && !/hei[cf]/i.test(asset.mime)" :src="asset.content_url" /><video v-else-if="asset.kind === 'video'" :src="asset.content_url" muted preload="metadata"></video><div v-else class="placeholder">{{ /hei[cf]/i.test(asset.mime) ? 'HEIC' : 'FILE' }}</div><span class="kind">RAW</span><button class="trash-btn" :disabled="trashing.has(asset.asset_id)" @click.stop="trashAsset(asset)">{{ trashing.has(asset.asset_id) ? '…' : '×' }}</button></div><div class="meta"><b>{{ asset.filename }}</b><span>{{ readable(asset.size_bytes) }}</span></div></article>
            <article v-for="job in filteredGenerated" :key="job.generated_asset_id" class="asset-tile generated" @click="openGeneratedPreview(job)"><div class="media checker"><img :src="generatedUrl(job)" /><span class="kind">SC01 · v{{ String(job.version ?? 0).padStart(3,'0') }}</span></div><div class="meta"><b>{{ job.generated_filename }}</b><span>{{ generatedStateLabel(job) }} · {{ readable(job.generated_size_bytes) }}</span></div></article>
          </div>
          <div v-if="!filteredRawAssets.length && !filteredGenerated.length" class="empty"><b>当前筛选没有素材</b><span>切换顶部筛选条件查看其他状态。</span></div>
        </template>

        <template v-else-if="route === '/system'">
          <div class="page-title"><div><em>Runtime Truth</em><h1>系统状态</h1><p>这里只展示真实本地运行状态，不负责启动或关闭 ComfyUI。</p></div><button class="ghost" @click="refreshAll">刷新状态</button></div>
          <div class="status-grid">
            <article class="card status-card"><h3>Visual Console</h3><dl><div><dt>Core API</dt><dd :class="health?.ok ? 'good' : 'bad-text'">{{ health?.ok ? '在线' : '离线' }}</dd></div><div><dt>P2 Control</dt><dd :class="p2Online ? 'good' : 'bad-text'">{{ p2Online ? '在线 · 127.0.0.1:4179' : '离线' }}</dd></div><div><dt>LAN</dt><dd>{{ health?.lan_interface ?? '—' }} · {{ health?.lan_ip ?? '—' }}</dd></div></dl></article>
            <article class="card status-card"><h3>ComfyUI</h3><dl><div><dt>状态</dt><dd :class="systemStatus?.comfyui?.online ? 'good' : 'bad-text'">{{ systemStatus?.comfyui?.online ? '在线' : '离线' }}</dd></div><div><dt>Native Queue</dt><dd>{{ systemStatus?.comfyui?.queue_running ?? 0 }} running / {{ systemStatus?.comfyui?.queue_pending ?? 0 }} pending</dd></div><div v-for="device in systemStatus?.comfyui?.devices ?? []" :key="device.name"><dt>{{ device.name }}</dt><dd>{{ readable(device.vram_free) }} free / {{ readable(device.vram_total) }}</dd></div></dl></article>
            <article class="card status-card"><h3>Workflow Registry</h3><dl><div><dt>已定义</dt><dd>{{ systemStatus?.workflow_registry?.known ?? workflows.length }}</dd></div><div><dt>可执行</dt><dd>{{ systemStatus?.workflow_registry?.executable ?? executableWorkflowCount }}</dd></div><div><dt>SC01</dt><dd>{{ systemStatus?.workflow_registry?.sc01?.status ?? 'NOT_REGISTERED' }}</dd></div><div v-if="systemStatus?.workflow_registry?.sc01?.workflow_hash"><dt>Hash</dt><dd class="mono">{{ systemStatus.workflow_registry.sc01.workflow_hash.slice(0,16) }}…</dd></div></dl></article>
          </div>
          <div class="root-list"><article v-for="(root, key) in systemStatus?.roots ?? {}" :key="key"><div><b>{{ key }}</b><span>{{ root.path }}</span></div><i :class="root.reachable ? 'good' : 'bad-text'">{{ root.reachable ? '可访问' : '不可访问' }}</i><small v-if="root.total_bytes">{{ readable(root.free_bytes) }} free / {{ readable(root.total_bytes) }}</small></article></div>
        </template>
      </section>
    </main>

    <nav class="mobile-nav"><button v-for="item in NAV" :key="item.path" :class="{ active: route === item.path }" @click="navigate(item.path)">{{ item.label }}</button></nav>
    <div v-if="toast" class="toast">{{ toast }}</div>
    <div v-if="preview" class="preview-modal" @click.self="preview = null"><div class="preview-panel"><button class="preview-close" @click="preview = null">×</button><b>{{ preview.title }}</b><img v-if="preview.kind === 'image'" :src="preview.url" /><video v-else :src="preview.url" controls autoplay></video></div></div>
  </div>
</template>
