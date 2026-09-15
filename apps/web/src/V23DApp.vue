<script setup lang="ts">
const steps = [
  ["01", "采集", "受控多视角拍摄"],
  ["02", "画面质检", "剔除模糊、强反光和支撑不稳定的画面"],
  ["03", "仅木材遮罩", "确保重建输入只包含当前产品件"],
  ["04", "三维重建", "通过可替换的重建引擎适配器执行"],
  ["05", "网格 / 纹理清理", "修复用于网页展示的几何与纹理"],
  ["06", "尺寸标定", "将模型比例绑定到当前产品件的实测尺寸"],
  ["07", "GLB / 网页模型", "导出可供 PDP 使用的派生资产"],
  ["08", "3D 质检", "技术 / 人工 Gate 与执行成功相互独立"],
  ["09", "归档", "发布前登记已批准的资产血缘"],
] as const;

function go(path: string) {
  window.location.assign(path);
}
</script>

<template>
  <div class="v2-shell">
    <aside class="v2-sidebar">
      <div class="v2-brand">
        <div class="v2-brand-mark">VC</div>
        <div><strong>视觉生产控制台</strong><span>V2 · 本地优先</span></div>
      </div>
      <button class="v2-dashboard-link active-soft" @click="go('/v2')"><span class="v2-nav-icon">⌂</span><span>首页</span></button>
      <div class="v2-nav-scroll"></div>
      <div class="v2-sidebar-footer">
        <div class="v2-runtime-mini"><span><i></i> 3D 工作流</span><span>未注册</span></div>
      </div>
    </aside>

    <main class="v2-main">
      <div class="v2-toolbar">
        <div class="v2-tabs"><button @click="go('/v2')">首页</button><button class="active">3D 模型 <span>×</span></button></div>
      </div>

      <section class="v2-content p2-three-d-content">
        <div class="v2-page-head">
          <div>
            <span class="v2-eyebrow">3D 模型管线 · P3-B 准备阶段</span>
            <h1>3D 模型</h1>
            <p>3D 是同一套产品件 / 任务 / QA / 素材 / 归档真值之下的并行管线，不是 PDP 发布的前置条件。</p>
          </div>
          <div class="v2-head-actions"><span class="v2-preview-badge">非阻塞增强</span></div>
        </div>

        <div class="p2-three-d-banner">
          <div>
            <strong>当前尚未注册生产级 3D 工作流。</strong>
            <span>在一个试点 SKU 完成采集、重建、尺寸标定和 3D 质检之前，本页面保持不可执行。</span>
          </div>
          <div class="p2-three-d-badges">
            <span>计划中的 MVP</span>
            <span>不阻塞 PDP</span>
            <span>禁止静默回退</span>
          </div>
        </div>

        <div class="p2-three-d-flow">
          <article v-for="step in steps" :key="step[0]" class="p2-three-d-step">
            <small>{{ step[0] }}</small>
            <b>{{ step[1] }}</b>
            <span>{{ step[2] }}</span>
          </article>
        </div>

        <div class="p2-three-d-gate">
          <b>发布边界</b>
          <p>执行成功不能把模型自动提升为正式归档。3D QA 与来源证据必须独立通过；已经批准的 2D 素材仍足以支持 PDP 发布。</p>
        </div>
      </section>
    </main>
  </div>
</template>
