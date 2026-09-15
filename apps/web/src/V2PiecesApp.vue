<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

type Site = { site_id: string; display_name: string; display_name_zh: string };
type Asset = {
  asset_id: string;
  item_id: string;
  role: "RAW_SOURCE" | "GENERATED_DERIVATIVE";
  media_type: string;
  filename?: string;
  qa_state?: string;
  archive_state?: string;
  workflow_codes: string[];
};
type AssetsResponse = { ok: boolean; assets: Asset[]; total: number };

const P2_API = "http://127.0.0.1:4179";
const sites = ref<Site[]>([]);
const currentSite = ref("drift-curio");
const response = ref<AssetsResponse | null>(null);
const loading = ref(true);
const error = ref("");

const pieces = computed(() => {
  const map = new Map<string, { item_id: string; raw: number; generated: number; pending: number; archived: number }>();
  for (const asset of response.value?.assets ?? []) {
    const row = map.get(asset.item_id) ?? { item_id: asset.item_id, raw: 0, generated: 0, pending: 0, archived: 0 };
    if (asset.role === "RAW_SOURCE") row.raw += 1;
    else row.generated += 1;
    if (asset.qa_state === "QA_PENDING") row.pending += 1;
    if (asset.archive_state === "VERIFIED_ARCHIVE") row.archived += 1;
    map.set(asset.item_id, row);
  }
  return [...map.values()].sort((a, b) => a.item_id.localeCompare(b.item_id));
});

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
      <div class="v2-toolbar"><div class="v2-tabs"><button class="active">产品件</button></div></div>
      <section class="v2-content p2-cn-page">
        <div class="v2-page-head">
          <div><span class="v2-eyebrow">生产</span><h1>产品件</h1><p>按 SKU 汇总原始素材、生成素材、待审核与已归档状态。这里是新版控制台入口，不再跳回旧工作台。</p></div>
          <div class="v2-head-actions"><button @click="refresh">↻ 刷新</button><button class="primary" @click="go('/v2/production/image')">创建产品图</button></div>
        </div>
        <div v-if="error" class="v2-alert"><b>产品件数据暂不可用</b><span>{{ error }}</span></div>
        <div class="p2-cn-summary"><article><span>产品件</span><strong>{{ pieces.length }}</strong></article><article><span>素材总数</span><strong>{{ response?.total ?? 0 }}</strong></article><article><span>待审核</span><strong>{{ pieces.reduce((sum,row)=>sum+row.pending,0) }}</strong></article><article><span>已归档</span><strong>{{ pieces.reduce((sum,row)=>sum+row.archived,0) }}</strong></article></div>
        <div v-if="pieces.length" class="p2-piece-grid">
          <article v-for="piece in pieces" :key="piece.item_id" class="p2-piece-card">
            <div><small>SKU</small><h2>{{ piece.item_id }}</h2></div>
            <dl><div><dt>原始素材</dt><dd>{{ piece.raw }}</dd></div><div><dt>生成素材</dt><dd>{{ piece.generated }}</dd></div><div><dt>待审核</dt><dd>{{ piece.pending }}</dd></div><div><dt>已归档</dt><dd>{{ piece.archived }}</dd></div></dl>
            <div class="p2-piece-actions"><button @click="go('/v2/assets')">查看素材</button><button @click="go('/v2/production/image')">创建视觉素材</button></div>
          </article>
        </div>
        <div v-else class="v2-empty"><b>{{ loading ? '正在读取产品件…' : '当前没有产品件' }}</b><span>有素材登记后会自动按 SKU 汇总。</span></div>
      </section>
    </main>
  </div>
</template>
