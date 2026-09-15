<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type Asset = {
  asset_id: string;
  item_id: string;
  role: "RAW_SOURCE" | "GENERATED_DERIVATIVE";
  filename?: string;
  workflow_codes: string[];
  qa_state?: string;
  archive_state?: "STAGING" | "ARCHIVE_READY" | "VERIFIED_ARCHIVE" | "REJECTED";
  last_seen_at?: string;
};
type AssetsResponse = { ok: boolean; source: string; completeness: string; assets: Asset[]; total: number };

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const response = ref<AssetsResponse | null>(null);
const loading = ref(true);
const error = ref("");
const filter = ref<"ALL" | "VERIFIED_ARCHIVE" | "ARCHIVE_READY" | "REJECTED">("ALL");

const archived = computed(() => (response.value?.assets ?? []).filter((row) => row.archive_state));
const rows = computed(() => filter.value === "ALL" ? archived.value : archived.value.filter((row) => row.archive_state === filter.value));
const count = (state: string) => archived.value.filter((row) => row.archive_state === state).length;

function go(path: string) { window.location.assign(path); }
async function p2Fetch<T>(path: string): Promise<T> {
  const res = await fetch(`${P2_API}${path}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP_${res.status}`);
  return body as T;
}
async function loadSites() {
  sites.value = await fetch("/api/sites").then((r) => r.json()).catch(() => []);
  if (sites.value.length && !sites.value.some((site) => site.site_id === currentSite.value)) currentSite.value = sites.value[0].site_id;
}
async function refresh() {
  error.value = "";
  loading.value = true;
  try {
    response.value = await p2Fetch<AssetsResponse>(`/api/v2/assets?site_id=${encodeURIComponent(currentSite.value)}&limit=1000`);
  } catch (caught: any) {
    error.value = caught?.message ?? String(caught);
  } finally {
    loading.value = false;
  }
}
watch(currentSite, () => void refresh());
onMounted(async () => { await loadSites(); await refresh(); });
</script>

<template>
  <div class="v2-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand"><div class="v2-brand-mark">VC</div><div><strong>视觉生产控制台</strong><span>V2 · 本地优先</span></div></div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll"></div>
      <div class="v2-sidebar-footer"><label>站点</label><select v-model="currentSite"><option v-for="site in sites" :key="site.site_id" :value="site.site_id">{{ site.display_name_zh || site.display_name }}</option></select></div>
    </aside>
    <main class="v2-main">
      <div class="v2-toolbar"><div class="v2-tabs"><button class="active">归档</button></div></div>
      <section class="v2-content p2-cn-page">
        <div class="v2-page-head">
          <div><span class="v2-eyebrow">资产库</span><h1>归档</h1><p>只读展示当前归档投影。生成成功、审核通过和正式归档仍是三个独立状态。</p></div>
          <div class="v2-head-actions"><button @click="refresh">↻ 刷新</button></div>
        </div>
        <div class="v2-truth-note"><div><b>只读归档视图</b><p>此页不修改正式归档真值，只读取 Canonical Asset Projection；任何写入仍必须经过正式归档流程。</p></div></div>
        <div v-if="error" class="v2-alert"><b>归档数据暂不可用</b><span>{{ error }}</span></div>
        <div class="p2-cn-summary"><button @click="filter='ALL'"><span>全部</span><strong>{{ archived.length }}</strong></button><button @click="filter='VERIFIED_ARCHIVE'"><span>已验证归档</span><strong>{{ count('VERIFIED_ARCHIVE') }}</strong></button><button @click="filter='ARCHIVE_READY'"><span>待归档</span><strong>{{ count('ARCHIVE_READY') }}</strong></button><button @click="filter='REJECTED'"><span>已拒绝</span><strong>{{ count('REJECTED') }}</strong></button></div>
        <div v-if="rows.length" class="p2-archive-table">
          <div class="p2-archive-head"><span>SKU</span><span>文件</span><span>工作流</span><span>QA</span><span>归档状态</span></div>
          <article v-for="asset in rows" :key="asset.asset_id"><b>{{ asset.item_id }}</b><span>{{ asset.filename ?? asset.asset_id }}</span><span>{{ asset.workflow_codes.join(', ') || '—' }}</span><span>{{ asset.qa_state ?? '—' }}</span><strong>{{ asset.archive_state === 'VERIFIED_ARCHIVE' ? '已验证归档' : asset.archive_state === 'ARCHIVE_READY' ? '待归档' : asset.archive_state === 'REJECTED' ? '已拒绝' : '暂存' }}</strong></article>
        </div>
        <div v-else class="v2-empty"><b>{{ loading ? '正在读取归档…' : '当前筛选条件下没有归档记录' }}</b><span>只有产生归档状态的素材才会显示。</span></div>
      </section>
    </main>
  </div>
</template>
