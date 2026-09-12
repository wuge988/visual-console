<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type Summary = {
  ok: boolean;
  day_key: string;
  generation: { queued: number; running: number; completed: number; failed: number };
  qa: { pending: number; passed: number; rejected: number };
  archive: { ready: number; staging?: number; archived: number };
  system: { comfyui: "ONLINE" | "OFFLINE"; worker: "BUSY" | "IDLE"; queue_depth: number };
  cloud_cost: { enabled: boolean; currency: string; today: number; month: number };
};
type EngineHealth = {
  overall: "READY" | "DEGRADED";
  engines: { comfyui: { status: "ONLINE" | "OFFLINE" } };
};
type CanvasFamily = "INPUT" | "CONTEXT" | "PROMPT" | "EXECUTION" | "REVIEW" | "OUTPUT";
type CanvasNodeKind =
  | "EXACT_PIECE" | "SOURCE_PHOTOS" | "CUTOUT" | "REFERENCE"
  | "MANIFEST" | "MEASUREMENTS" | "MATERIAL_BOARD"
  | "PROMPT_TEMPLATE" | "PROMPT_DRAFT"
  | "WORKFLOW" | "MODEL" | "GENERATE" | "BATCH"
  | "COMPARE" | "AUTOMATED_QA" | "HUMAN_GATE"
  | "EVIDENCE" | "ARCHIVE_CANDIDATE";
type CanvasNode = {
  id: string;
  family: CanvasFamily;
  kind: CanvasNodeKind;
  label: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean | null>;
};
type CanvasEdge = { id: string; source: string; target: string };
type CanvasGraph = {
  schema_version: "1.0";
  title: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
};
type CanvasWorkflow = CanvasGraph & {
  workflow_id: string;
  site_id: string;
  status: "DRAFT";
  authority: "CANVAS_DRAFT_ONLY";
  production_executable: false;
  current_version: number;
  created_at: string;
  updated_at: string;
};
type CanvasListResponse = { ok: boolean; workflows: CanvasWorkflow[] };

type PaletteEntry = {
  family: CanvasFamily;
  kind: CanvasNodeKind;
  label: string;
  description: string;
};

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const summary = ref<Summary | null>(null);
const engineHealth = ref<EngineHealth | null>(null);
const workflows = ref<CanvasWorkflow[]>([]);
const workflowId = ref("");
const graph = ref<CanvasGraph>(emptyGraph());
const selectedNodeId = ref("");
const connectSourceId = ref("");
const saving = ref(false);
const saveState = ref<"IDLE" | "DIRTY" | "SAVING" | "SAVED" | "ERROR">("IDLE");
const message = ref("");
const previewMode = ref(false);
const paletteFamily = ref<CanvasFamily | "ALL">("ALL");
const history = ref<string[]>([]);
const future = ref<string[]>([]);
const loadingGraph = ref(false);
let saveTimer: number | undefined;
let pollTimer: number | undefined;
let dragState: { nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null = null;
let panState: { startX: number; startY: number; viewX: number; viewY: number } | null = null;

const palette: PaletteEntry[] = [
  { family: "INPUT", kind: "EXACT_PIECE", label: "Exact Piece", description: "真实 SKU / 身份上游真值" },
  { family: "INPUT", kind: "SOURCE_PHOTOS", label: "Source Photos", description: "RAW source / immutable" },
  { family: "INPUT", kind: "CUTOUT", label: "Verified Cutout", description: "已验证透明底输入" },
  { family: "INPUT", kind: "REFERENCE", label: "Reference", description: "仅作视觉参考" },
  { family: "CONTEXT", kind: "MANIFEST", label: "Manifest", description: "读取正式 provenance" },
  { family: "CONTEXT", kind: "MEASUREMENTS", label: "Measurements", description: "尺寸与比例上下文" },
  { family: "CONTEXT", kind: "MATERIAL_BOARD", label: "Material Board", description: "材质 / 真实感约束" },
  { family: "PROMPT", kind: "PROMPT_TEMPLATE", label: "Prompt Template", description: "Registry 版本化模板" },
  { family: "PROMPT", kind: "PROMPT_DRAFT", label: "Prompt Draft", description: "未批准 Prompt 草稿" },
  { family: "EXECUTION", kind: "WORKFLOW", label: "Workflow", description: "Registry workflow capability" },
  { family: "EXECUTION", kind: "MODEL", label: "Model", description: "Registry model capability" },
  { family: "EXECUTION", kind: "GENERATE", label: "Generate", description: "生成意图；不自动执行" },
  { family: "EXECUTION", kind: "BATCH", label: "Batch", description: "批量生成意图" },
  { family: "REVIEW", kind: "COMPARE", label: "Compare", description: "候选输出对比" },
  { family: "REVIEW", kind: "AUTOMATED_QA", label: "Automated QA", description: "自动质量检查" },
  { family: "REVIEW", kind: "HUMAN_GATE", label: "Human Gate", description: "人工视觉审核，不可自批" },
  { family: "OUTPUT", kind: "EVIDENCE", label: "Evidence", description: "正式证据候选" },
  { family: "OUTPUT", kind: "ARCHIVE_CANDIDATE", label: "Archive Candidate", description: "归档候选，不等于归档" },
];

const familyOrder: Array<CanvasFamily | "ALL"> = ["ALL", "INPUT", "CONTEXT", "PROMPT", "EXECUTION", "REVIEW", "OUTPUT"];
const filteredPalette = computed(() => palette.filter((entry) => paletteFamily.value === "ALL" || entry.family === paletteFamily.value));
const selectedNode = computed(() => graph.value.nodes.find((node) => node.id === selectedNodeId.value) ?? null);
const comfyOnline = computed(() => engineHealth.value?.engines.comfyui.status === "ONLINE");
const worldStyle = computed(() => ({ transform: `translate(${graph.value.viewport.x}px, ${graph.value.viewport.y}px) scale(${graph.value.viewport.zoom})` }));
const canUndo = computed(() => history.value.length > 0);
const canRedo = computed(() => future.value.length > 0);
const hasWorkflow = computed(() => Boolean(workflowId.value));

function emptyGraph(): CanvasGraph {
  return { schema_version: "1.0", title: "Untitled Workflow", nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

function starterGraph(title: string): CanvasGraph {
  return {
    schema_version: "1.0",
    title,
    nodes: [
      node("piece", "INPUT", "EXACT_PIECE", "Exact Piece", 100, 180),
      node("source", "INPUT", "SOURCE_PHOTOS", "Source Photos", 100, 330),
      node("prompt", "PROMPT", "PROMPT_TEMPLATE", "Prompt Template", 390, 180),
      node("workflow", "EXECUTION", "WORKFLOW", "Workflow", 680, 180),
      node("generate", "EXECUTION", "GENERATE", "Generate", 970, 180),
      node("gate", "REVIEW", "HUMAN_GATE", "Human Gate", 1260, 180),
      node("archive", "OUTPUT", "ARCHIVE_CANDIDATE", "Archive Candidate", 1550, 180),
    ],
    edges: [
      edge("e_piece_prompt", "piece", "prompt"),
      edge("e_source_prompt", "source", "prompt"),
      edge("e_prompt_workflow", "prompt", "workflow"),
      edge("e_workflow_generate", "workflow", "generate"),
      edge("e_generate_gate", "generate", "gate"),
      edge("e_gate_archive", "gate", "archive"),
    ],
    viewport: { x: 40, y: 70, zoom: 0.82 },
  };
}

function node(id: string, family: CanvasFamily, kind: CanvasNodeKind, label: string, x: number, y: number): CanvasNode {
  return { id, family, kind, label, x, y, config: {} };
}
function edge(id: string, source: string, target: string): CanvasEdge { return { id, source, target }; }

function go(path: string) { window.location.assign(path); }

async function p2Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${P2_API}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

async function loadSites() {
  sites.value = await fetch("/api/sites").then((response) => response.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) currentSite.value = sites.value[0].site_id;
}

async function refreshShell() {
  const site = encodeURIComponent(currentSite.value);
  const [summaryData, healthData] = await Promise.all([
    p2Fetch<Summary>(`/api/v2/summary?site_id=${site}`),
    p2Fetch<EngineHealth>(`/api/v2/engines/health?site_id=${site}`),
  ]);
  summary.value = summaryData;
  engineHealth.value = healthData;
}

async function loadLibrary(selectId?: string) {
  const response = await p2Fetch<CanvasListResponse>(`/api/v2/canvas/workflows?site_id=${encodeURIComponent(currentSite.value)}`);
  workflows.value = response.workflows;
  const nextId = selectId || workflowId.value;
  if (nextId && workflows.value.some((row) => row.workflow_id === nextId)) await openWorkflow(nextId);
  else if (!workflows.value.length) resetEphemeral();
}

function resetEphemeral() {
  loadingGraph.value = true;
  workflowId.value = "";
  graph.value = emptyGraph();
  selectedNodeId.value = "";
  connectSourceId.value = "";
  history.value = [];
  future.value = [];
  saveState.value = "IDLE";
  message.value = "";
  void nextTick(() => { loadingGraph.value = false; });
}

async function openWorkflow(id: string) {
  loadingGraph.value = true;
  try {
    const response = await p2Fetch<{ ok: boolean; workflow: CanvasWorkflow }>(`/api/v2/canvas/workflows/${encodeURIComponent(id)}?site_id=${encodeURIComponent(currentSite.value)}`);
    workflowId.value = response.workflow.workflow_id;
    graph.value = {
      schema_version: "1.0",
      title: response.workflow.title,
      nodes: response.workflow.nodes,
      edges: response.workflow.edges,
      viewport: response.workflow.viewport,
    };
    selectedNodeId.value = "";
    connectSourceId.value = "";
    history.value = [];
    future.value = [];
    saveState.value = "SAVED";
    message.value = "";
  } finally {
    await nextTick();
    loadingGraph.value = false;
  }
}

async function createWorkflow() {
  const title = `Canvas Workflow ${workflows.value.length + 1}`;
  const response = await p2Fetch<{ ok: boolean; workflow: CanvasWorkflow }>("/api/v2/canvas/workflows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site_id: currentSite.value, title }),
  });
  workflowId.value = response.workflow.workflow_id;
  graph.value = starterGraph(title);
  history.value = [];
  future.value = [];
  selectedNodeId.value = "workflow";
  await saveDraft(true);
  await loadLibrary(response.workflow.workflow_id);
  message.value = "已创建本地 Canvas Draft。它不会注册生产 Workflow，也不会执行生成。";
}

function snapshot() { return JSON.stringify(graph.value); }
function pushHistory() {
  history.value = [...history.value.slice(-49), snapshot()];
  future.value = [];
}

function undo() {
  if (!history.value.length) return;
  future.value = [...future.value, snapshot()];
  const previous = history.value.at(-1)!;
  history.value = history.value.slice(0, -1);
  graph.value = JSON.parse(previous);
  selectedNodeId.value = "";
}

function redo() {
  if (!future.value.length) return;
  history.value = [...history.value, snapshot()];
  const next = future.value.at(-1)!;
  future.value = future.value.slice(0, -1);
  graph.value = JSON.parse(next);
  selectedNodeId.value = "";
}

function addNode(entry: PaletteEntry) {
  if (!hasWorkflow.value || previewMode.value) return;
  pushHistory();
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const newNode = node(`node_${suffix}`, entry.family, entry.kind, entry.label, 260 + graph.value.nodes.length * 28, 220 + graph.value.nodes.length * 22);
  graph.value = { ...graph.value, nodes: [...graph.value.nodes, newNode] };
  selectedNodeId.value = newNode.id;
}

function removeSelectedNode() {
  const id = selectedNodeId.value;
  if (!id || previewMode.value) return;
  pushHistory();
  graph.value = {
    ...graph.value,
    nodes: graph.value.nodes.filter((row) => row.id !== id),
    edges: graph.value.edges.filter((row) => row.source !== id && row.target !== id),
  };
  selectedNodeId.value = "";
  if (connectSourceId.value === id) connectSourceId.value = "";
}

function updateSelectedLabel(value: string) {
  const id = selectedNodeId.value;
  if (!id || previewMode.value) return;
  graph.value = { ...graph.value, nodes: graph.value.nodes.map((row) => row.id === id ? { ...row, label: value.slice(0, 120) } : row) };
}

function updateSelectedNote(value: string) {
  const id = selectedNodeId.value;
  if (!id || previewMode.value) return;
  graph.value = { ...graph.value, nodes: graph.value.nodes.map((row) => row.id === id ? { ...row, config: { ...row.config, note: value.slice(0, 2000) } } : row) };
}

function startNodeDrag(event: PointerEvent, nodeId: string) {
  if (previewMode.value) return;
  const target = graph.value.nodes.find((row) => row.id === nodeId);
  if (!target) return;
  pushHistory();
  dragState = { nodeId, startX: event.clientX, startY: event.clientY, nodeX: target.x, nodeY: target.y };
  selectedNodeId.value = nodeId;
  event.stopPropagation();
}

function startPan(event: PointerEvent) {
  if ((event.target as HTMLElement).closest(".v2f-node")) return;
  panState = { startX: event.clientX, startY: event.clientY, viewX: graph.value.viewport.x, viewY: graph.value.viewport.y };
  selectedNodeId.value = "";
}

function onPointerMove(event: PointerEvent) {
  if (dragState) {
    const zoom = graph.value.viewport.zoom;
    const dx = (event.clientX - dragState.startX) / zoom;
    const dy = (event.clientY - dragState.startY) / zoom;
    graph.value = {
      ...graph.value,
      nodes: graph.value.nodes.map((row) => row.id === dragState!.nodeId ? { ...row, x: dragState!.nodeX + dx, y: dragState!.nodeY + dy } : row),
    };
  } else if (panState) {
    graph.value = {
      ...graph.value,
      viewport: { ...graph.value.viewport, x: panState.viewX + event.clientX - panState.startX, y: panState.viewY + event.clientY - panState.startY },
    };
  }
}

function onPointerUp() {
  dragState = null;
  panState = null;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const next = Math.min(2.5, Math.max(0.25, graph.value.viewport.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
  graph.value = { ...graph.value, viewport: { ...graph.value.viewport, zoom: Number(next.toFixed(3)) } };
}

function fitCanvas() {
  graph.value = { ...graph.value, viewport: { x: 40, y: 70, zoom: graph.value.nodes.length > 6 ? 0.78 : 0.9 } };
}

function beginConnect(event: MouseEvent, sourceId: string) {
  if (previewMode.value) return;
  event.stopPropagation();
  connectSourceId.value = connectSourceId.value === sourceId ? "" : sourceId;
}

function finishConnect(event: MouseEvent, targetId: string) {
  if (previewMode.value || !connectSourceId.value || connectSourceId.value === targetId) return;
  event.stopPropagation();
  const source = connectSourceId.value;
  const exists = graph.value.edges.some((row) => row.source === source && row.target === targetId);
  if (!exists) {
    pushHistory();
    const id = `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    graph.value = { ...graph.value, edges: [...graph.value.edges, edge(id, source, targetId)] };
  }
  connectSourceId.value = "";
}

function nodeById(id: string) { return graph.value.nodes.find((row) => row.id === id); }
function edgePath(row: CanvasEdge) {
  const source = nodeById(row.source);
  const target = nodeById(row.target);
  if (!source || !target) return "";
  const x1 = source.x + 200;
  const y1 = source.y + 46;
  const x2 = target.x;
  const y2 = target.y + 46;
  const control = Math.max(70, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}`;
}

function scheduleAutosave() {
  if (!hasWorkflow.value || loadingGraph.value || previewMode.value) return;
  saveState.value = "DIRTY";
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveDraft(false), 900);
}

async function saveDraft(silent = false) {
  if (!hasWorkflow.value || saving.value) return;
  saving.value = true;
  saveState.value = "SAVING";
  try {
    const response = await p2Fetch<{ ok: boolean; workflow: CanvasWorkflow }>(`/api/v2/canvas/workflows/${encodeURIComponent(workflowId.value)}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: currentSite.value, graph: graph.value }),
    });
    saveState.value = "SAVED";
    const index = workflows.value.findIndex((row) => row.workflow_id === response.workflow.workflow_id);
    if (index >= 0) workflows.value.splice(index, 1, response.workflow);
    if (!silent) message.value = "Draft 已保存；仍是 CANVAS_DRAFT_ONLY，不具备生产执行权。";
  } catch (error: any) {
    saveState.value = "ERROR";
    message.value = `Autosave failed: ${error?.message ?? String(error)}`;
  } finally {
    saving.value = false;
  }
}

async function saveVersion() {
  if (!hasWorkflow.value || saving.value) return;
  saving.value = true;
  saveState.value = "SAVING";
  try {
    const response = await p2Fetch<{ ok: boolean; workflow: CanvasWorkflow; version: { version: number; version_id: string } }>(`/api/v2/canvas/workflows/${encodeURIComponent(workflowId.value)}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: currentSite.value, graph: graph.value }),
    });
    saveState.value = "SAVED";
    message.value = `已保存不可覆盖版本 v${String(response.version.version).padStart(3, "0")}。该版本仍不具备生产执行权。`;
    await loadLibrary(response.workflow.workflow_id);
  } catch (error: any) {
    saveState.value = "ERROR";
    message.value = `Save Version failed: ${error?.message ?? String(error)}`;
  } finally {
    saving.value = false;
  }
}

watch(graph, scheduleAutosave, { deep: true });
watch(currentSite, async () => {
  resetEphemeral();
  await Promise.all([refreshShell(), loadLibrary()]);
});

onMounted(async () => {
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  await loadSites();
  await Promise.all([refreshShell(), loadLibrary()]);
  pollTimer = window.setInterval(() => void refreshShell(), 10_000);
});

onUnmounted(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  if (pollTimer) window.clearInterval(pollTimer);
  if (saveTimer) window.clearTimeout(saveTimer);
});
</script>

<template>
  <div class="v2-shell v2f-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand"><div class="v2-brand-mark">VC</div><div><strong>Visual Console</strong><span>V2 · LOCAL FIRST</span></div></div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll">
        <section class="v2-nav-group">
          <h4>生产 PRODUCTION</h4>
          <button class="v2-nav-item" @click="go('/workspace')"><span>Production Pieces</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/production/image')"><span>Image Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/production/scene')"><span>Scene Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item" @click="go('/v2/production/batch')"><span>Batch Generation</span><span class="v2-nav-arrow">›</span></button>
          <button class="v2-nav-item active"><span>Creation Canvas</span><span class="v2-nav-arrow">›</span></button>
        </section>
        <section class="v2-nav-group"><h4>任务 JOBS</h4><button class="v2-nav-item" @click="go('/v2/jobs')"><span>任务队列</span><b>{{ summary?.system.queue_depth ?? 0 }}</b></button><button class="v2-nav-item" @click="go('/v2/jobs/history')"><span>任务历史</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/jobs/failed')"><span>失败 / 重试</span><b>{{ summary?.generation.failed ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>质量 QUALITY</h4><button class="v2-nav-item" @click="go('/qa')"><span>Human Visual Gate</span><b>{{ summary?.qa.pending ?? 0 }}</b></button></section>
        <section class="v2-nav-group"><h4>资产 ASSETS</h4><button class="v2-nav-item" @click="go('/v2/assets')"><span>Piece Assets</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/prompts')"><span>Prompt Library</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>证据 EVIDENCE</h4><button class="v2-nav-item" @click="go('/assets')"><span>Archive</span><span class="v2-nav-arrow">›</span></button></section>
        <section class="v2-nav-group"><h4>系统 SYSTEM</h4><button class="v2-nav-item" @click="go('/v2/system')"><span>ComfyUI / Local Engines</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/models')"><span>Model Registry</span><span class="v2-nav-arrow">›</span></button><button class="v2-nav-item" @click="go('/v2/workflows')"><span>Workflow Registry</span><span class="v2-nav-arrow">›</span></button></section>
      </div>
      <div class="v2-sidebar-footer"><label>Site Profile</label><select v-model="currentSite"><option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option></select><div class="v2-runtime-mini"><span><i :class="{ online: Boolean(summary) }"></i> Core API</span><span><i :class="{ online: comfyOnline }"></i> ComfyUI</span></div></div>
    </aside>

    <main class="v2-main">
      <header class="v2-monitor">
        <div class="v2-today"><span>TODAY</span><b>{{ summary?.day_key ?? '—' }}</b></div>
        <div class="v2-monitor-group"><strong>生成</strong><span>待生成 <b>{{ summary?.generation.queued ?? 0 }}</b></span><span class="warm">生成中 <b>{{ summary?.generation.running ?? 0 }}</b></span><span class="good">已完成 <b>{{ summary?.generation.completed ?? 0 }}</b></span><span class="bad">失败 <b>{{ summary?.generation.failed ?? 0 }}</b></span></div>
        <div class="v2-monitor-group"><strong>QA</strong><span>待审核 <b>{{ summary?.qa.pending ?? 0 }}</b></span><span class="good">通过 <b>{{ summary?.qa.passed ?? 0 }}</b></span><span class="bad">拒绝 <b>{{ summary?.qa.rejected ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact"><strong>归档</strong><span>Staging <b>{{ summary?.archive.staging ?? 0 }}</b></span><span>待归档 <b>{{ summary?.archive.ready ?? 0 }}</b></span><span class="good">今日归档 <b>{{ summary?.archive.archived ?? 0 }}</b></span></div>
        <div class="v2-monitor-group compact system"><strong>系统</strong><span :class="engineHealth?.overall === 'READY' ? 'good' : 'bad'">● {{ engineHealth?.overall ?? 'UNKNOWN' }}</span><span>{{ summary?.system.worker === 'BUSY' ? 'Worker 忙碌' : 'Worker 空闲' }}</span><span>Queue <b>{{ summary?.system.queue_depth ?? 0 }}</b></span></div>
        <div class="v2-cloud-pill"><span>CLOUD COST</span><b>未启用</b></div>
      </header>

      <div class="v2-toolbar">
        <div class="v2-tabs"><button @click="go('/v2')">首页</button><button @click="go('/workspace')">Production Pieces</button><button class="active">Creation Canvas <span>×</span></button><button @click="go('/v2/jobs')">任务队列</button><button @click="go('/qa')">Human Visual Gate</button></div>
        <div class="v2-search-wrap"><div class="v2-search"><span>⌕</span><input :value="workflowId || graph.title" readonly placeholder="Canvas Workflow"/><kbd>V2-F</kbd></div></div>
      </div>

      <section class="v2f-content">
        <div class="v2f-head">
          <div><span class="v2-eyebrow">V2-F · CREATION CANVAS</span><h1>Creation Canvas</h1><p>Visual Production Orchestrator · Draft-only graph · 不复制 ComfyUI，不绕过现有生产真值。</p></div>
          <div class="v2f-head-badges"><span>CANVAS DRAFT ONLY</span><span>LOCAL FIRST</span></div>
        </div>

        <div v-if="message" class="v2f-message">{{ message }}</div>

        <div class="v2f-commandbar">
          <div class="v2f-workflow-select">
            <span>Workflow Library</span>
            <select :value="workflowId" @change="openWorkflow(($event.target as HTMLSelectElement).value)">
              <option value="">未保存的新画布</option>
              <option v-for="row in workflows" :key="row.workflow_id" :value="row.workflow_id">{{ row.title }} · v{{ String(row.current_version).padStart(3, '0') }}</option>
            </select>
            <button class="primary" @click="createWorkflow">＋ 新建工作流</button>
          </div>
          <div class="v2f-command-actions">
            <button :disabled="!canUndo || previewMode" @click="undo">↶ Undo</button>
            <button :disabled="!canRedo || previewMode" @click="redo">↷ Redo</button>
            <button @click="fitCanvas">适配视图</button>
            <button :class="{ active: previewMode }" @click="previewMode = !previewMode">{{ previewMode ? '退出预览' : 'Preview' }}</button>
            <span class="v2f-save-state" :class="saveState.toLowerCase()">{{ saveState }}</span>
            <button :disabled="!hasWorkflow || saving" @click="saveDraft(false)">保存 Draft</button>
            <button class="primary" :disabled="!hasWorkflow || saving" @click="saveVersion">Save Version</button>
          </div>
        </div>

        <div class="v2f-studio" :class="{ preview: previewMode }">
          <aside class="v2f-palette">
            <div class="v2f-panel-title"><div><b>Node Library</b><span>{{ filteredPalette.length }} nodes</span></div><em>DOMAIN</em></div>
            <div class="v2f-family-tabs">
              <button v-for="family in familyOrder" :key="family" :class="{ active: paletteFamily === family }" @click="paletteFamily = family">{{ family }}</button>
            </div>
            <div class="v2f-palette-list">
              <button v-for="entry in filteredPalette" :key="entry.kind" :disabled="!hasWorkflow || previewMode" @click="addNode(entry)">
                <i :data-family="entry.family"></i><div><b>{{ entry.label }}</b><span>{{ entry.description }}</span></div><em>＋</em>
              </button>
            </div>
            <div class="v2f-authority-note"><b>Authority boundary</b><span>Canvas 只保存编排草稿。Generate / Human Gate / Archive Candidate 节点不会自行执行、审核或归档。</span></div>
          </aside>

          <div class="v2f-canvas" @pointerdown="startPan" @wheel="onWheel">
            <div class="v2f-canvas-grid"></div>
            <div class="v2f-world" :style="worldStyle">
              <svg class="v2f-edges" width="2200" height="1200" viewBox="0 0 2200 1200">
                <path v-for="row in graph.edges" :key="row.id" :d="edgePath(row)" />
              </svg>
              <article
                v-for="row in graph.nodes"
                :key="row.id"
                class="v2f-node"
                :class="[`family-${row.family.toLowerCase()}`, { selected: selectedNodeId === row.id, connecting: connectSourceId === row.id }]"
                :style="{ left: `${row.x}px`, top: `${row.y}px` }"
                @pointerdown="startNodeDrag($event, row.id)"
                @click.stop="selectedNodeId = row.id"
              >
                <button class="v2f-port input" title="Connect input" @pointerdown.stop @click="finishConnect($event, row.id)"></button>
                <div class="v2f-node-kicker"><span>{{ row.family }}</span><em>{{ row.kind.replaceAll('_', ' ') }}</em></div>
                <strong>{{ row.label }}</strong>
                <small>{{ row.family === 'EXECUTION' ? 'Intent only · no auto-run' : row.family === 'REVIEW' ? 'No self-approval' : row.family === 'OUTPUT' ? 'Candidate only' : 'Domain context' }}</small>
                <button class="v2f-port output" title="Connect output" @pointerdown.stop @click="beginConnect($event, row.id)"></button>
              </article>
            </div>

            <div v-if="!graph.nodes.length" class="v2f-empty">
              <div class="v2f-empty-mark">◇</div>
              <h2>{{ hasWorkflow ? '从 Node Library 开始编排' : '创建第一个 Canvas Workflow' }}</h2>
              <p>{{ hasWorkflow ? '添加 Exact Piece、Prompt、Workflow、Review 与 Output 节点。' : '新建工作流后会载入一条安全的示例编排；它只是 Draft，不会执行生产任务。' }}</p>
              <button v-if="!hasWorkflow" class="primary" @click.stop="createWorkflow">＋ 新建工作流</button>
            </div>

            <div class="v2f-viewport-status"><span>{{ Math.round(graph.viewport.zoom * 100) }}%</span><span>{{ graph.nodes.length }} nodes</span><span>{{ graph.edges.length }} edges</span><span v-if="connectSourceId">选择目标端口以连接</span></div>
          </div>

          <aside class="v2f-inspector">
            <div class="v2f-panel-title"><div><b>Inspector</b><span>Selected node</span></div><em>{{ selectedNode?.family ?? 'NONE' }}</em></div>
            <template v-if="selectedNode">
              <div class="v2f-inspector-block"><label>Node Type</label><div class="v2f-readonly"><b>{{ selectedNode.kind.replaceAll('_', ' ') }}</b><span>{{ selectedNode.family }}</span></div></div>
              <div class="v2f-inspector-block"><label>Display Label</label><input :value="selectedNode.label" :disabled="previewMode" @input="updateSelectedLabel(($event.target as HTMLInputElement).value)"/></div>
              <div class="v2f-inspector-block"><label>Operator Note</label><textarea :value="String(selectedNode.config.note ?? '')" :disabled="previewMode" placeholder="仅保存编排说明，不写入 Manifest / Job / Archive truth。" @input="updateSelectedNote(($event.target as HTMLTextAreaElement).value)"></textarea></div>
              <div class="v2f-truth-card"><span>Authority</span><b>CANVAS_DRAFT_ONLY</b><p>此节点不能改变 Workflow Registry、QA Gate 或 formal Archive。</p></div>
              <button class="v2f-danger" :disabled="previewMode" @click="removeSelectedNode">删除节点</button>
            </template>
            <div v-else class="v2f-inspector-empty"><div>◎</div><b>未选择节点</b><span>点击画布节点查看业务级属性；不会暴露原始 ComfyUI graph 参数。</span></div>

            <div class="v2f-version-card"><span>Workflow Version</span><strong>v{{ String(workflows.find(row => row.workflow_id === workflowId)?.current_version ?? 0).padStart(3, '0') }}</strong><small>{{ workflowId ? workflowId : 'Not persisted' }}</small></div>
          </aside>
        </div>
      </section>
    </main>
  </div>
</template>
